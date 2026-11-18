// Compras y gastos: factura de proveedor (FC), documento soporte (DS) y comprobante de egreso (CE).
// Funciones puras: totales, contabilización y cuentas por pagar.
import { r2, num } from './calc.js';
import { a8, esAuxiliar, parametrosDe } from './puc.js';

const TIPOS_COMPRA = {
  FC: { nombre: 'Factura de proveedor', corto: 'Fact. prov.', plural: 'Facturas de proveedor', nuevo: 'Nueva factura de proveedor' },
  DS: { nombre: 'Documento soporte', corto: 'Doc. soporte', plural: 'Documentos soporte', nuevo: 'Nuevo documento soporte' },
  CE: { nombre: 'Comprobante de egreso', corto: 'Egreso', plural: 'Comprobantes de egreso', nuevo: 'Nuevo comprobante de egreso' },
};

// Totales de una factura de proveedor o documento soporte. Las retenciones son las que la empresa le practica al proveedor.
function totalesCompra(lineas, ret = {}) {
  const ls = (lineas || []).map(l => { const base = r2(num(l.base)), iva = r2(base * num(l.iva_pct) / 100); return { base, iva }; });
  const base = r2(ls.reduce((s, l) => s + l.base, 0)), iva = r2(ls.reduce((s, l) => s + l.iva, 0));
  const retefuente = r2(base * num(ret.retefuente_pct) / 100), reteiva = r2(iva * num(ret.reteiva_pct) / 100), reteica = r2(base * num(ret.reteica_milaje) / 1000);
  const total = r2(base + iva);
  return { base, iva, retefuente, reteiva, reteica, total, neto: r2(total - retefuente - reteiva - reteica) };
}
const totalEgreso = c => r2((c.aplicaciones || []).reduce((s, a) => s + num(a.valor), 0) + num(c.anticipo));

const numCompra = c => `${c.tipo} ${c.numero}`;
function asientoCompra(c, param) {
  if (!c || c.estado === 'anulado') return [];
  const P = parametrosDe(param), ref = numCompra(c), out = [];
  const mov = (cuenta, debito, credito, detalle) => { debito = r2(debito); credito = r2(credito); if (debito || credito) out.push({ fecha: c.fecha, doc_id: c.id, tipo: c.tipo, ref, origen: 'compra', cuenta: a8(cuenta), tercero_id: c.tercero_id || null, detalle, debito, credito }); };
  const nom = TIPOS_COMPRA[c.tipo].nombre;
  if (c.tipo === 'CE') {
    for (const a of c.aplicaciones || []) mov(P.proveedores, num(a.valor), 0, `Pago ${a.ref || 'factura'}`.trim());
    mov(P.anticipos_prov, num(c.anticipo), 0, 'Anticipo a proveedor');
    mov(c.cuenta_pago || P.bancos, 0, totalEgreso(c), `${nom} ${c.numero}`);
    return out;
  }
  const t = totalesCompra(c.lineas, c);
  const det = `${nom} ${c.num_proveedor || c.numero}`;
  for (const l of c.lineas || []) mov(l.cuenta, num(l.base), 0, l.descripcion || det);
  mov(P.iva_descontable, t.iva, 0, 'IVA descontable');
  mov(c.cuenta_retefuente || P.retefuente_pagar, 0, t.retefuente, 'Retención en la fuente practicada');
  mov(P.reteiva_pagar, 0, t.reteiva, 'ReteIVA practicado');
  mov(P.reteica_pagar, 0, t.reteica, 'ReteICA practicado');
  mov(P.proveedores, 0, t.neto, det);
  // Redondeo: la diferencia de centavos va a la primera línea.
  const dif = r2(out.reduce((s, m) => s + m.debito - m.credito, 0));
  if (dif && Math.abs(dif) < 1 && out.length) { const m = out[0]; m.debito = r2(m.debito - dif); }
  return out;
}

// Saldo por pagar de cada factura de proveedor o documento soporte.
function cuentasPorPagar(compras, hoy) {
  const pagos = {};
  for (const e of compras.filter(x => x.tipo === 'CE' && x.estado !== 'anulado')) for (const a of e.aplicaciones || []) pagos[a.compra_id] = r2((pagos[a.compra_id] || 0) + num(a.valor));
  return compras.filter(x => (x.tipo === 'FC' || x.tipo === 'DS') && x.estado !== 'anulado').map(f => {
    const neto = num(f.neto ?? totalesCompra(f.lineas, f).neto), pagado = pagos[f.id] || 0, saldo = r2(neto - pagado);
    const diasVencida = f.vence && hoy && f.vence < hoy ? Math.round((new Date(hoy + 'T12:00:00') - new Date(f.vence + 'T12:00:00')) / 864e5) : 0;
    return { compra: f, neto, pagado, saldo, diasVencida };
  });
}

function erroresCompra(c, cuentas) {
  const idx = Object.fromEntries((cuentas || []).map(x => [x.codigo, x])), out = [];
  if (!c.tercero_id) out.push('Escoge el proveedor.');
  if (!c.fecha) out.push('Escribe la fecha.');
  const cta = (cod, que) => { if (!esAuxiliar(cod)) out.push(`${que}: la cuenta ${cod || '(vacía)'} no es auxiliar de 8 dígitos.`); else if (!idx[cod]) out.push(`${que}: la cuenta ${cod} no existe en el plan de cuentas.`); };
  if (c.tipo === 'CE') {
    if (totalEgreso(c) <= 0) out.push('Escribe cuánto se paga a cada factura o el anticipo.');
    if ((c.aplicaciones || []).some(a => num(a.valor) < 0) || num(c.anticipo) < 0) out.push('Los valores no pueden ser negativos.');
    cta(c.cuenta_pago, 'Cuenta de pago');
    return out;
  }
  if (c.tipo === 'FC' && !String(c.num_proveedor || '').trim()) out.push('Escribe el número de la factura del proveedor.');
  const ls = c.lineas || [];
  if (!ls.length) out.push('Agrega al menos una línea.');
  ls.forEach((l, i) => { cta(l.cuenta, `Línea ${i + 1}`); if (num(l.base) <= 0) out.push(`Línea ${i + 1}: el valor debe ser mayor que cero.`); });
  if (num(c.retefuente_pct) && c.cuenta_retefuente) cta(c.cuenta_retefuente, 'Cuenta de retención');
  return out;
}

export { TIPOS_COMPRA, totalesCompra, totalEgreso, asientoCompra, cuentasPorPagar, erroresCompra, numCompra };
