// Informes de impuestos: IVA del período (formulario 300), retenciones practicadas (formulario 350) y certificados de
// retención por tercero. Salen de los documentos (bases y tarifas) y se cruzan con la contabilidad.
// Funciones puras: no tocan la base de datos.
import { r2, num, totales } from './calc.js';
import { totalesCompra } from './compras.js';

const enRango = (f, desde, hasta) => (!desde || f >= desde) && (!hasta || f <= hasta);

// Períodos de la DIAN: mensual (retenciones), bimestral y cuatrimestral (IVA).
export const PERIODOS_IVA = { bimestral: 6, cuatrimestral: 3, mensual: 12 };
export function periodo(anio, tipo, n) {
  const k = 12 / PERIODOS_IVA[tipo], m1 = (n - 1) * k + 1, m2 = n * k;
  const pad = x => String(x).padStart(2, '0');
  const fin = new Date(Date.UTC(anio, m2, 0)).getUTCDate();
  return { desde: `${anio}-${pad(m1)}-01`, hasta: `${anio}-${pad(m2)}-${pad(fin)}` };
}
export const periodoDe = (fecha, tipo) => Math.floor((+fecha.slice(5, 7) - 1) / (12 / PERIODOS_IVA[tipo])) + 1;

function sumarTarifa(mapa, tarifa, base, iva, signo = 1) {
  const k = String(num(tarifa));
  const x = mapa[k] = mapa[k] || { tarifa: num(tarifa), base: 0, iva: 0 };
  x.base = r2(x.base + signo * base); x.iva = r2(x.iva + signo * iva);
}
const ordenar = mapa => Object.values(mapa).filter(x => x.base || x.iva).sort((a, b) => b.tarifa - a.tarifa);

// IVA del período, separado como lo pide el formulario 300: ventas (facturas y notas débito), devoluciones en ventas
// (notas crédito, cuyo IVA se descuenta aparte) y compras. Solo documentos emitidos, sin anulados.
// Compras: facturas de proveedor y documentos soporte vigentes.
export function informeIva({ documentos = [], items = [], compras = [] }, desde, hasta) {
  const itemsDe = {};
  for (const it of items) (itemsDe[it.documento_id] = itemsDe[it.documento_id] || []).push(it);
  const ventas = {}, devol = {}, compr = {};
  let reteivaQueLePracticaron = 0, nVentas = 0, nDevol = 0, nCompras = 0;
  for (const d of documentos) {
    if (d.estado !== 'emitido' || !['FV', 'NC', 'ND'].includes(d.tipo) || !enRango(d.fecha, desde, hasta)) continue;
    const nc = d.tipo === 'NC', t = totales(itemsDe[d.id] || []);
    for (const x of Object.values(t.porTarifa)) sumarTarifa(nc ? devol : ventas, x.tarifa, x.base, x.iva);
    reteivaQueLePracticaron = r2(reteivaQueLePracticaron + (nc ? -1 : 1) * num(d.reteiva));
    if (nc) nDevol++; else nVentas++;
  }
  for (const c of compras) {
    if (!['FC', 'DS'].includes(c.tipo) || c.estado === 'anulado' || !enRango(c.fecha, desde, hasta)) continue;
    for (const l of c.lineas || []) { const base = r2(num(l.base)); sumarTarifa(compr, l.iva_pct, base, r2(base * num(l.iva_pct) / 100)); }
    nCompras++;
  }
  const v = ordenar(ventas), dv = ordenar(devol), c = ordenar(compr);
  const suma = (l, k) => r2(l.reduce((s, x) => s + x[k], 0));
  const generado = suma(v, 'iva'), devoluciones = suma(dv, 'iva'), descontable = suma(c, 'iva');
  const saldo = r2(generado - descontable - devoluciones - reteivaQueLePracticaron);
  return {
    ventas: v, devoluciones: dv, compras: c, nVentas, nDevol, nCompras,
    baseVentas: suma(v, 'base'), baseDevoluciones: suma(dv, 'base'), baseCompras: suma(c, 'base'),
    generado, ivaDevoluciones: devoluciones, descontable, reteivaQueLePracticaron, saldo,
    aPagar: saldo > 0 ? saldo : 0, aFavor: saldo < 0 ? -saldo : 0,
  };
}

export const TIPOS_RETENCION = [
  ['retefuente', 'Retención en la fuente', 'retefuente_pct', '%'],
  ['reteiva', 'Retención de IVA', 'reteiva_pct', '%'],
  ['reteica', 'Retención de ICA', 'reteica_milaje', 'por mil'],
];

// Cada retención practicada en compras (facturas de proveedor y documentos soporte vigentes), una fila por tipo.
export function retencionesDeCompras(compras, desde, hasta, tercero) {
  const out = [];
  for (const c of compras || []) {
    if (!['FC', 'DS'].includes(c.tipo) || c.estado === 'anulado' || !enRango(c.fecha, desde, hasta) || (tercero && c.tercero_id !== tercero)) continue;
    const t = totalesCompra(c.lineas, c);
    for (const [k, , campo] of TIPOS_RETENCION) {
      const valor = t[k]; if (!valor) continue;
      out.push({ compra: c, tipo: k, concepto: c.retenciones?.[k]?.nombre || 'Sin concepto', tarifa: num(c[campo]), base: k === 'reteiva' ? t.iva : t.base, valor, tercero_id: c.tercero_id, fecha: c.fecha });
    }
  }
  return out;
}

// Retenciones practicadas del período agrupadas por tipo y concepto (formulario 350). Se suma la retención de la
// nómina y lo que se haya registrado a mano en las cuentas de retenciones por pagar (comprobantes contables).
export function informeRetenciones(compras, movs, desde, hasta, cuentas = { retefuente: '2365', reteiva: '2367', reteica: '2368' }) {
  const filas = retencionesDeCompras(compras, desde, hasta);
  const grupos = {};
  for (const f of filas) {
    const k = `${f.tipo}|${f.concepto}|${f.tarifa}`;
    const g = grupos[k] = grupos[k] || { tipo: f.tipo, concepto: f.concepto, tarifa: f.tarifa, base: 0, valor: 0, n: 0 };
    g.base = r2(g.base + f.base); g.valor = r2(g.valor + f.valor); g.n++;
  }
  // Movimientos en las cuentas de retención por pagar que no vienen de compras (nómina y comprobantes).
  const otros = {};
  for (const m of movs || []) {
    if (m.origen === 'compra' || !enRango(m.fecha, desde, hasta)) continue;
    const tipo = Object.keys(cuentas).find(t => String(m.cuenta).startsWith(cuentas[t])); if (!tipo) continue;
    const etiqueta = m.origen === 'nomina' ? 'Salarios y pagos laborales (nómina)' : 'Registrado en comprobantes contables';
    const k = `${tipo}|${etiqueta}`;
    const g = otros[k] = otros[k] || { tipo, concepto: etiqueta, tarifa: null, base: null, valor: 0, n: 0 };
    g.valor = r2(g.valor + num(m.credito) - num(m.debito)); g.n++;
  }
  const lista = [...Object.values(grupos), ...Object.values(otros).filter(g => g.valor)];
  const orden = Object.fromEntries(TIPOS_RETENCION.map(([k], i) => [k, i]));
  lista.sort((a, b) => orden[a.tipo] - orden[b.tipo] || b.valor - a.valor);
  const total = t => r2(lista.filter(g => !t || g.tipo === t).reduce((s, g) => s + g.valor, 0));
  return { grupos: lista, retefuente: total('retefuente'), reteiva: total('reteiva'), reteica: total('reteica'), total: total() };
}

// Certificado de retenciones de un proveedor en el período: totales por tipo y concepto.
export function certificado(compras, tercero, desde, hasta) {
  const filas = retencionesDeCompras(compras, desde, hasta, tercero);
  const grupos = {};
  for (const f of filas) {
    const k = `${f.tipo}|${f.concepto}|${f.tarifa}`;
    const g = grupos[k] = grupos[k] || { tipo: f.tipo, concepto: f.concepto, tarifa: f.tarifa, base: 0, valor: 0 };
    g.base = r2(g.base + f.base); g.valor = r2(g.valor + f.valor);
  }
  const lista = Object.values(grupos);
  return { lineas: lista, total: r2(lista.reduce((s, g) => s + g.valor, 0)), porTipo: Object.fromEntries(TIPOS_RETENCION.map(([k]) => [k, lista.filter(g => g.tipo === k)])) };
}

// Terceros con retenciones en el período (para escoger a quién certificar).
export const tercerosConRetencion = (compras, desde, hasta) => [...new Set(retencionesDeCompras(compras, desde, hasta).map(f => f.tercero_id))];

// Anexo del informe de IVA: una fila por documento y tarifa (lo que soporta cada cifra del informe).
// seccion: 'ventas' | 'devoluciones' (notas crédito) | 'compras' | 'reteiva' (la de notas crédito va en negativo).
export function anexoIva({ documentos = [], items = [], compras = [] }, desde, hasta) {
  const itemsDe = {};
  for (const it of items) (itemsDe[it.documento_id] = itemsDe[it.documento_id] || []).push(it);
  const filas = [];
  for (const d of documentos) {
    if (d.estado !== 'emitido' || !['FV', 'NC', 'ND'].includes(d.tipo) || !enRango(d.fecha, desde, hasta)) continue;
    const s = d.tipo === 'NC' ? -1 : 1, t = totales(itemsDe[d.id] || []);
    for (const x of Object.values(t.porTarifa)) if (x.base || x.iva) filas.push({ seccion: s < 0 ? 'devoluciones' : 'ventas', fecha: d.fecha, doc: d, tercero_id: d.tercero_id, base: x.base, tarifa: x.tarifa, valor: x.iva });
    if (num(d.reteiva)) filas.push({ seccion: 'reteiva', fecha: d.fecha, doc: d, tercero_id: d.tercero_id, base: r2(s * num(t.iva)), tarifa: num(d.reteiva_pct), valor: r2(s * num(d.reteiva)) });
  }
  for (const c of compras) {
    if (!['FC', 'DS'].includes(c.tipo) || c.estado === 'anulado' || !enRango(c.fecha, desde, hasta)) continue;
    const por = {};
    for (const l of c.lineas || []) { const base = r2(num(l.base)); sumarTarifa(por, l.iva_pct, base, r2(base * num(l.iva_pct) / 100)); }
    for (const x of Object.values(por)) if (x.base || x.iva) filas.push({ seccion: 'compras', fecha: c.fecha, compra: c, tercero_id: c.tercero_id, base: x.base, tarifa: x.tarifa, valor: x.iva });
  }
  const orden = { ventas: 0, devoluciones: 1, compras: 2, reteiva: 3 };
  return filas.sort((a, b) => orden[a.seccion] - orden[b.seccion] || a.fecha.localeCompare(b.fecha));
}

// Anexo de retenciones practicadas: una fila por documento y tipo de retención, más los movimientos de nómina y
// comprobantes en las cuentas de retención por pagar.
export function anexoRetenciones(compras, movs, desde, hasta, cuentas = { retefuente: '2365', reteiva: '2367', reteica: '2368' }) {
  const filas = retencionesDeCompras(compras, desde, hasta).map(f => ({ ...f, origen: 'compra' }));
  for (const m of movs || []) {
    if (m.origen === 'compra' || !enRango(m.fecha, desde, hasta)) continue;
    const tipo = Object.keys(cuentas).find(t => String(m.cuenta).startsWith(cuentas[t])); if (!tipo) continue;
    const valor = r2(num(m.credito) - num(m.debito)); if (!valor) continue;
    filas.push({ origen: 'mov', mov: m, tipo, concepto: m.detalle || (m.origen === 'nomina' ? 'Nómina' : 'Comprobante contable'), tarifa: null, base: null, valor, tercero_id: m.tercero_id, fecha: m.fecha });
  }
  const orden = Object.fromEntries(TIPOS_RETENCION.map(([k], i) => [k, i]));
  return filas.sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.fecha.localeCompare(b.fecha));
}
