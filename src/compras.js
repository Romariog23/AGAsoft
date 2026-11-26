// Compras y gastos: factura de proveedor (FC), documento soporte (DS), nota de ajuste al DS (NA) y comprobante de egreso (CE).
// Funciones puras: totales, contabilización y cuentas por pagar.
import { r2, num } from './calc.js';
import { a8, esAuxiliar, parametrosDe } from './puc.js';
import { cuentaIva } from './impuestos.js';
import { esLineaProducto, erroresLineaProducto } from './inventario.js';
import { primeraDist, distPonderada } from './centros.js';

const TIPOS_COMPRA = {
  FC: { nombre: 'Factura de proveedor', corto: 'Fact. prov.', plural: 'Facturas de proveedor', nuevo: 'Nueva factura de proveedor' },
  DS: { nombre: 'Documento soporte', corto: 'Doc. soporte', plural: 'Documentos soporte', nuevo: 'Nuevo documento soporte' },
  CE: { nombre: 'Comprobante de egreso', corto: 'Egreso', plural: 'Comprobantes de egreso', nuevo: 'Nuevo comprobante de egreso' },
  NA: { nombre: 'Nota de ajuste al documento soporte', corto: 'Nota ajuste DS', plural: 'Notas de ajuste a documentos soporte', nuevo: 'Nueva nota de ajuste al documento soporte' },
};
// Conceptos DIAN de la nota de ajuste al documento soporte.
const CONCEPTOS_NA = [['1', 'Devolución parcial de los bienes o no aceptación parcial del servicio'], ['2', 'Anulación del documento soporte'], ['3', 'Rebaja o descuento parcial o total'], ['4', 'Ajuste de precio'], ['5', 'Otros']];

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
// Centro de costo de cada línea de compra: el suyo, el del producto o el general del documento.
const distLineaCompra = (l, c, prods) => primeraDist(l.cc, l.producto_id ? prods?.[l.producto_id]?.cc : null, c.cc);
// Centro general de una compra: el escogido o el de sus líneas según su valor (para proveedores, IVA y retenciones).
function distCompra(c, productos) {
  if (primeraDist(c.cc).length) return primeraDist(c.cc);
  const prods = Object.fromEntries((productos || []).map(p => [p.id, p]));
  return distPonderada((c.lineas || []).map(l => ({ dist: distLineaCompra(l, c, prods), valor: num(l.base) })));
}
// ctx: { compras, productos } para los centros de costo.
function asientoCompra(c, param, tarifas, ctx = {}) {
  if (!c || c.estado === 'anulado') return [];
  const P = parametrosDe(param), ref = numCompra(c), out = [];
  const prods = Object.fromEntries((ctx.productos || []).map(p => [p.id, p]));
  let dist = c.tipo === 'CE' ? [] : distCompra(c, ctx.productos);
  const mov = (cuenta, debito, credito, detalle, dd = dist) => { debito = r2(debito); credito = r2(credito); if (debito || credito) out.push({ fecha: c.fecha, doc_id: c.id, tipo: c.tipo, ref, origen: 'compra', cuenta: a8(cuenta), tercero_id: c.tercero_id || null, detalle, debito, credito, ...(dd?.length ? { _dist: dd } : {}) }); };
  const nom = TIPOS_COMPRA[c.tipo].nombre;
  if (c.tipo === 'CE') {
    // Cada pago sigue el centro de la factura que paga (o el del egreso, si lo tiene).
    const comps = Object.fromEntries((ctx.compras || []).map(x => [x.id, x]));
    const distA = a => primeraDist(c.cc, comps[a.compra_id] ? distCompra(comps[a.compra_id], ctx.productos) : []);
    dist = primeraDist(c.cc, distPonderada((c.aplicaciones || []).map(a => ({ dist: distA(a), valor: a.valor }))));
    // Cada aplicación paga una factura (a proveedores) o un saldo de nómina (a su cuenta: salarios, aportes, prestaciones).
    // Sin cuenta propia, a la de proveedores con que se causó la factura pagada.
    for (const a of c.aplicaciones || []) mov(String(a.cuenta || '').trim() || (a.compra_id && ctx.cfgDe ? ctx.cfgDe(a.compra_id).param : P).proveedores, num(a.valor), 0, `Pago ${a.ref || 'factura'}`.trim(), distA(a));
    mov(P.anticipos_prov, num(c.anticipo), 0, 'Anticipo a proveedor');
    mov(c.cuenta_pago || P.bancos, 0, totalEgreso(c), `${nom} ${c.numero}`);
    return out;
  }
  // Nota de ajuste: el mismo asiento de un documento soporte, al revés (disminuye el gasto o el inventario y lo que se debe).
  if (c.tipo === 'NA') return asientoCompra({ ...c, tipo: 'DS' }, param, tarifas, ctx).map(m => ({ ...m, tipo: 'NA', ref, detalle: m.detalle.replace(TIPOS_COMPRA.DS.nombre, nom), debito: m.credito, credito: m.debito }));
  const t = totalesCompra(c.lineas, c);
  const det = `${nom} ${c.num_proveedor || c.numero}`;
  for (const l of c.lineas || []) mov(l.cuenta, num(l.base), 0, l.descripcion || det, distLineaCompra(l, c, prods));
  // IVA de cada línea a la cuenta de su tarifa (o la de los parámetros).
  const ivaPor = {};
  for (const l of c.lineas || []) { const ci = cuentaIva(tarifas, l.iva_pct, 'compra', P); ivaPor[ci] = r2((ivaPor[ci] || 0) + r2(r2(num(l.base)) * num(l.iva_pct) / 100)); }
  for (const [ci, v] of Object.entries(ivaPor)) mov(ci, v, 0, 'IVA descontable');
  // Retenciones que practica la empresa: la cuenta del concepto escogido (naturaleza crédito).
  const R = c.retenciones || {};
  const ret = (k, defecto, valor, nom) => { const r = R[k], cta = String(r?.cuenta || '').trim() || defecto, n = r?.nombre ? `${nom} · ${r.nombre}` : nom;
    if ((r?.naturaleza || 'C') === 'C') mov(cta, 0, valor, n); else mov(cta, valor, 0, n); };
  ret('retefuente', c.cuenta_retefuente || P.retefuente_pagar, t.retefuente, 'Retención en la fuente practicada');
  ret('reteiva', P.reteiva_pagar, t.reteiva, 'ReteIVA practicado');
  ret('reteica', P.reteica_pagar, t.reteica, 'ReteICA practicado');
  mov(String(c.cuenta_pago || '').trim() || P.proveedores, 0, t.neto, det);
  // Redondeo: la diferencia de centavos va a la primera línea.
  const dif = r2(out.reduce((s, m) => s + m.debito - m.credito, 0));
  if (dif && Math.abs(dif) < 1 && out.length) { const m = out[0]; m.debito = r2(m.debito - dif); }
  return out;
}

// Saldo por pagar de cada factura de proveedor o documento soporte.
function cuentasPorPagar(compras, hoy) {
  const pagos = {};
  for (const e of compras.filter(x => x.tipo === 'CE' && x.estado !== 'anulado')) for (const a of e.aplicaciones || []) pagos[a.compra_id] = r2((pagos[a.compra_id] || 0) + num(a.valor));
  // Las notas de ajuste a crédito disminuyen el saldo de su documento soporte.
  for (const n of compras.filter(x => x.tipo === 'NA' && x.estado !== 'anulado' && x.ref_id && !String(x.cuenta_pago || '').trim())) pagos[n.ref_id] = r2((pagos[n.ref_id] || 0) + num(n.neto ?? totalesCompra(n.lineas, n).neto));
  return compras.filter(x => (x.tipo === 'FC' || x.tipo === 'DS') && x.estado !== 'anulado' && !String(x.cuenta_pago || '').trim()).map(f => {
    const neto = num(f.neto ?? totalesCompra(f.lineas, f).neto), pagado = pagos[f.id] || 0, saldo = r2(neto - pagado);
    const diasVencida = f.vence && hoy && f.vence < hoy ? Math.round((new Date(hoy + 'T12:00:00') - new Date(f.vence + 'T12:00:00')) / 864e5) : 0;
    return { compra: f, neto, pagado, saldo, diasVencida };
  });
}

function erroresCompra(c, cuentas, productos) {
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
  if (c.tipo === 'NA') { if (!c.ref_id) out.push('Escoge el documento soporte que ajusta la nota.'); if (!CONCEPTOS_NA.some(x => x[0] === String(c.concepto))) out.push('Escoge el concepto de la nota de ajuste.'); }
  const ls = c.lineas || [];
  if (!ls.length) out.push('Agrega al menos una línea.');
  ls.forEach((l, i) => {
    if (esLineaProducto(l)) { out.push(...erroresLineaProducto(l, i, productos)); cta(l.cuenta, `Línea ${i + 1} (cuenta de la bodega)`); return; }
    cta(l.cuenta, `Línea ${i + 1}`); if (num(l.base) <= 0) out.push(`Línea ${i + 1}: el valor debe ser mayor que cero.`);
  });
  if (num(c.retefuente_pct) && c.cuenta_retefuente) cta(c.cuenta_retefuente, 'Cuenta de retención');
  return out;
}

// Valor que todavía se puede ajustar de un documento soporte (total menos sus notas de ajuste vigentes).
const ajustableDS = (ds, compras, sinId) => r2(num(ds.total) - (compras || []).filter(n => n.tipo === 'NA' && n.ref_id === ds.id && n.estado !== 'anulado' && n.id !== sinId).reduce((s, n) => s + num(n.total), 0));

export { CONCEPTOS_NA, ajustableDS, distCompra, distLineaCompra, TIPOS_COMPRA, totalesCompra, totalEgreso, asientoCompra, cuentasPorPagar, erroresCompra, numCompra };
