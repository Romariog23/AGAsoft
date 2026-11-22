// Informes de ventas, compras y flujos (efectivo, patrimonio y caja). Funciones puras: no tocan la base de datos.
// movs: movimientos contables de contab.movimientos ({ fecha, cuenta, debito, credito, tipo, origen, doc_id, ref }).
import { r2, num, totales, linea } from './calc.js';
import { totalesCompra } from './compras.js';

const enRango = (f, desde, hasta) => (!desde || f >= desde) && (!hasta || f <= hasta);
const sumar = (o, k, v) => { o[k] = r2((o[k] || 0) + v); };

/* ---------- Ventas ---------- */
// Libro de ventas: cada factura, nota crédito y nota débito emitida del período (las notas crédito restan).
export function libroVentas({ documentos = [], items = [] }, desde, hasta) {
  const itemsDe = {};
  for (const it of items) (itemsDe[it.documento_id] = itemsDe[it.documento_id] || []).push(it);
  const filas = [];
  for (const d of documentos) {
    if (d.estado !== 'emitido' || !['FV', 'NC', 'ND'].includes(d.tipo) || !enRango(d.fecha, desde, hasta)) continue;
    const s = d.tipo === 'NC' ? -1 : 1, t = totales(itemsDe[d.id] || [], d);
    filas.push({ doc: d, fecha: d.fecha, tipo: d.tipo, tercero_id: d.tercero_id, signo: s,
      base: r2(s * t.base), iva: r2(s * t.iva), retenciones: r2(s * (t.retefuente + t.reteiva + t.reteica)), total: r2(s * t.total), neto: r2(s * t.neto) });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.doc.numero).localeCompare(String(b.doc.numero), undefined, { numeric: true }));
  const tot = k => r2(filas.reduce((x, f) => x + f[k], 0));
  return { filas, base: tot('base'), iva: tot('iva'), retenciones: tot('retenciones'), total: tot('total'), neto: tot('neto') };
}

// Ventas netas por cliente (facturas + notas débito − notas crédito), de mayor a menor, con su participación.
export function ventasPorCliente(data, desde, hasta) {
  const lv = libroVentas(data, desde, hasta), g = {};
  for (const f of lv.filas) {
    const x = g[f.tercero_id] = g[f.tercero_id] || { tercero_id: f.tercero_id, facturas: 0, notas: 0, base: 0, iva: 0, total: 0 };
    if (f.tipo === 'NC') x.notas++; else x.facturas++;
    x.base = r2(x.base + f.base); x.iva = r2(x.iva + f.iva); x.total = r2(x.total + f.total);
  }
  const filas = Object.values(g).filter(x => x.base || x.total).sort((a, b) => b.base - a.base);
  return { filas: filas.map(x => ({ ...x, pct: lv.base ? r2(x.base / lv.base * 100) : 0 })), base: lv.base, iva: lv.iva, total: lv.total };
}

// Ventas por producto o servicio: cantidad y valor antes de IVA (las notas crédito restan).
// Las líneas sin producto se agrupan por su descripción.
export function ventasPorProducto({ documentos = [], items = [] }, desde, hasta) {
  const docs = Object.fromEntries(documentos.filter(d => d.estado === 'emitido' && ['FV', 'NC', 'ND'].includes(d.tipo) && enRango(d.fecha, desde, hasta)).map(d => [d.id, d]));
  const g = {};
  for (const it of items) {
    const d = docs[it.documento_id]; if (!d) continue;
    const s = d.tipo === 'NC' ? -1 : 1, l = linea(it), k = it.producto_id || 'd:' + String(it.descripcion || '').trim().toLowerCase();
    const x = g[k] = g[k] || { producto_id: it.producto_id || null, descripcion: it.descripcion || '', cantidad: 0, base: 0, iva: 0, docs: new Set() };
    x.cantidad = r2(x.cantidad + s * num(it.cantidad)); x.base = r2(x.base + s * l.base); x.iva = r2(x.iva + s * l.iva); x.docs.add(d.id);
  }
  const filas = Object.values(g).map(({ docs: ds, ...x }) => ({ ...x, documentos: ds.size })).filter(x => x.base || x.cantidad).sort((a, b) => b.base - a.base);
  const base = r2(filas.reduce((s, x) => s + x.base, 0));
  return { filas: filas.map(x => ({ ...x, pct: base ? r2(x.base / base * 100) : 0 })), base, iva: r2(filas.reduce((s, x) => s + x.iva, 0)) };
}

/* ---------- Compras ---------- */
// Libro de compras: facturas de proveedor y documentos soporte vigentes del período.
export function libroCompras(compras, desde, hasta) {
  const filas = [];
  for (const c of compras || []) {
    if (!['FC', 'DS'].includes(c.tipo) || c.estado === 'anulado' || !enRango(c.fecha, desde, hasta)) continue;
    const t = totalesCompra(c.lineas, c);
    filas.push({ compra: c, fecha: c.fecha, tipo: c.tipo, tercero_id: c.tercero_id, base: t.base, iva: t.iva, retenciones: r2(t.retefuente + t.reteiva + t.reteica), total: t.total, neto: t.neto });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || num(a.compra.numero) - num(b.compra.numero));
  const tot = k => r2(filas.reduce((x, f) => x + f[k], 0));
  return { filas, base: tot('base'), iva: tot('iva'), retenciones: tot('retenciones'), total: tot('total'), neto: tot('neto') };
}

// Compras por proveedor, de mayor a menor, con su participación.
export function comprasPorProveedor(compras, desde, hasta) {
  const lc = libroCompras(compras, desde, hasta), g = {};
  for (const f of lc.filas) {
    const x = g[f.tercero_id] = g[f.tercero_id] || { tercero_id: f.tercero_id, documentos: 0, base: 0, iva: 0, retenciones: 0, total: 0, neto: 0 };
    x.documentos++;
    for (const k of ['base', 'iva', 'retenciones', 'total', 'neto']) x[k] = r2(x[k] + f[k]);
  }
  const filas = Object.values(g).sort((a, b) => b.base - a.base);
  return { filas: filas.map(x => ({ ...x, pct: lc.base ? r2(x.base / lc.base * 100) : 0 })), base: lc.base, iva: lc.iva, retenciones: lc.retenciones, total: lc.total, neto: lc.neto };
}

/* ---------- Estado de flujos de efectivo (método indirecto) ---------- */
// El cierre contable (CI) no mueve efectivo y los saldos iniciales (SI) son el punto de partida, no un flujo.
const esSI = m => m.origen === 'comp' && m.tipo === 'SI';
const esCaja = c => c.startsWith('11');
// Partidas que no son efectivo: depreciaciones, amortizaciones y deterioro (se suman a la utilidad).
const AJUSTES = /^(1592|1597|1598|1599|1399|1499|1698|1699|1299)/;
function actividad(c) {
  if (AJUSTES.test(c)) return 'ajustes';
  if (/^2360/.test(c)) return 'financiacion'; // dividendos por pagar
  if (/^(13|14|17|2[2-9])/.test(c)) return 'operacion';
  if (/^(12|15|16|18|19)/.test(c)) return 'inversion';
  if (/^(21|3)/.test(c)) return 'financiacion';
  return 'operacion';
}
const saldoCaja = (movs, f) => r2(movs.filter(f).filter(m => esCaja(m.cuenta)).reduce((s, m) => s + m.debito - m.credito, 0));

// nombre(codigo4) → nombre de la cuenta para las filas. Devuelve las secciones y la conciliación con el efectivo.
export function flujoEfectivo(movs, desde, hasta, nombre = c => c) {
  const ms = (movs || []).filter(m => m.tipo !== 'CI');
  const per = ms.filter(m => enRango(m.fecha, desde, hasta) && !esSI(m));
  let utilidad = 0; const por = {};
  for (const m of per) {
    const s = m.debito - m.credito;
    if (/^[4-7]/.test(m.cuenta)) { utilidad -= s; continue; }
    if (esCaja(m.cuenta)) continue;
    const k = m.cuenta.slice(0, 4), a = actividad(m.cuenta);
    sumar(por[a] = por[a] || {}, k, -s);
  }
  utilidad = r2(utilidad);
  const lineas = a => Object.entries(por[a] || {}).filter(([, v]) => v).sort(([x], [y]) => x.localeCompare(y)).map(([codigo, valor]) => ({ codigo, nombre: nombre(codigo), valor }));
  const tot = l => r2(l.reduce((s, x) => s + x.valor, 0));
  const ajustes = lineas('ajustes'), capital = lineas('operacion'), inversion = lineas('inversion'), financiacion = lineas('financiacion');
  const operacion = r2(utilidad + tot(ajustes) + tot(capital));
  const neto = r2(operacion + tot(inversion) + tot(financiacion));
  const inicial = r2(saldoCaja(ms, m => desde && m.fecha < desde) + saldoCaja(ms, m => enRango(m.fecha, desde, hasta) && esSI(m)));
  const final = saldoCaja(ms, m => !hasta || m.fecha <= hasta);
  return { utilidad, ajustes, capital, operacion, inversion, totalInversion: tot(inversion), financiacion, totalFinanciacion: tot(financiacion), neto, inicial, final, cuadra: Math.abs(r2(inicial + neto - final)) < 0.01 };
}

/* ---------- Estado de cambios en el patrimonio ---------- */
// Una fila por cuenta del patrimonio (4 dígitos): saldo inicial, aumentos, disminuciones y saldo final.
// El resultado que aún no se ha cerrado contra la 36 va en su propia fila, para que el total cuadre con el balance.
export function cambiosPatrimonio(movs, desde, hasta, nombre = c => c) {
  const ms = (movs || []).filter(m => !hasta || m.fecha <= hasta);
  const ini = m => (desde && m.fecha < desde) || (esSI(m) && enRango(m.fecha, desde, hasta));
  const filas = {}, fila = k => filas[k] = filas[k] || { codigo: k, nombre: k === 'sin' ? 'Resultado del ejercicio sin cerrar' : nombre(k), inicial: 0, aumentos: 0, disminuciones: 0 };
  for (const m of ms) {
    const pyg = /^[4-7]/.test(m.cuenta);
    if (!pyg && !m.cuenta.startsWith('3')) continue;
    const x = fila(pyg ? 'sin' : m.cuenta.slice(0, 4)), v = m.credito - m.debito;
    if (ini(m)) x.inicial = r2(x.inicial + v);
    else if (pyg) { if (v >= 0) x.aumentos = r2(x.aumentos + v); else x.disminuciones = r2(x.disminuciones - v); }
    else { x.aumentos = r2(x.aumentos + num(m.credito)); x.disminuciones = r2(x.disminuciones + num(m.debito)); }
  }
  // El resultado sin cerrar se muestra neto: lo que aumentó o disminuyó en el período.
  if (filas.sin) { const n = r2(filas.sin.aumentos - filas.sin.disminuciones); filas.sin.aumentos = n > 0 ? n : 0; filas.sin.disminuciones = n < 0 ? -n : 0; }
  const lista = Object.values(filas).map(x => ({ ...x, final: r2(x.inicial + x.aumentos - x.disminuciones) })).filter(x => x.inicial || x.aumentos || x.disminuciones)
    .sort((a, b) => (a.codigo === 'sin') - (b.codigo === 'sin') || a.codigo.localeCompare(b.codigo));
  const t = k => r2(lista.reduce((s, x) => s + x[k], 0));
  return { filas: lista, inicial: t('inicial'), aumentos: t('aumentos'), disminuciones: t('disminuciones'), final: t('final') };
}

/* ---------- Flujo de caja (método directo, por mes) ---------- */
// Categoría de la contrapartida de un movimiento de caja o bancos.
export const CATEGORIAS_CAJA = [
  ['clientes', 'Cobros a clientes y deudores'], ['ventas', 'Ventas e ingresos de contado'], ['proveedores', 'Pagos a proveedores y cuentas por pagar'],
  ['gastos', 'Gastos y costos de contado'], ['nomina', 'Nómina y seguridad social'], ['impuestos', 'Impuestos'], ['inventario', 'Inventarios'],
  ['activos', 'Inversiones y activos fijos'], ['prestamos', 'Préstamos y obligaciones financieras'], ['socios', 'Socios: aportes y distribuciones'], ['otros', 'Otros'],
];
function categoria(c) {
  if (/^13/.test(c)) return 'clientes';
  if (/^4/.test(c)) return 'ventas';
  if (/^(25|2370|2380)/.test(c)) return 'nomina';
  if (/^(24|236[5-8])/.test(c)) return 'impuestos';
  if (/^(2360|3)/.test(c)) return 'socios';
  if (/^2[23]/.test(c)) return 'proveedores';
  if (/^[567]/.test(c)) return 'gastos';
  if (/^14/.test(c)) return 'inventario';
  if (/^(12|15|16|18)/.test(c)) return 'activos';
  if (/^21/.test(c)) return 'prestamos';
  return 'otros';
}
// Reparte el efectivo de cada documento entre sus contrapartidas del mismo sentido. El IVA de una venta o compra
// de contado va con la venta o la compra, no a impuestos.
function flujosPorDocumento(movs) {
  const grupos = {};
  for (const m of movs) (grupos[`${m.origen || 'doc'}|${m.doc_id || m.ref}`] = grupos[`${m.origen || 'doc'}|${m.doc_id || m.ref}`] || []).push(m);
  const out = [];
  for (const ms of Object.values(grupos)) {
    const caja = r2(ms.filter(m => esCaja(m.cuenta)).reduce((s, m) => s + m.debito - m.credito, 0));
    if (!caja) continue;
    const otras = ms.filter(m => !esCaja(m.cuenta)).map(m => ({ c: categoria(m.cuenta), w: r2(m.credito - m.debito) })).filter(x => Math.sign(x.w) === Math.sign(caja));
    const peso = otras.reduce((s, x) => s + Math.abs(x.w), 0);
    if (!peso) { out.push({ fecha: ms[0].fecha, cat: 'otros', valor: caja }); continue; }
    const porCat = {};
    for (const x of otras) porCat[x.c] = (porCat[x.c] || 0) + Math.abs(x.w);
    if (porCat.impuestos && Object.keys(porCat).length > 1) {
      const mayor = Object.entries(porCat).filter(([k]) => k !== 'impuestos').sort((a, b) => b[1] - a[1])[0][0];
      porCat[mayor] += porCat.impuestos; delete porCat.impuestos;
    }
    let resto = caja; const cats = Object.entries(porCat);
    cats.forEach(([k, w], i) => { const v = i === cats.length - 1 ? r2(resto) : r2(caja * w / peso); resto = r2(resto - v); out.push({ fecha: ms[0].fecha, cat: k, valor: v }); });
  }
  return out;
}
// cols: [{ desde, hasta }]. Por columna: saldo inicial, entradas y salidas por categoría, flujo neto y saldo final.
export function flujoCaja(movs, cols) {
  const ms = (movs || []).filter(m => m.tipo !== 'CI');
  const flujos = flujosPorDocumento(ms.filter(m => !esSI(m)));
  return cols.map(({ desde, hasta }) => {
    const entradas = {}, salidas = {};
    for (const f of flujos) if (enRango(f.fecha, desde, hasta)) { if (f.valor > 0) sumar(entradas, f.cat, f.valor); else sumar(salidas, f.cat, -f.valor); }
    const inicial = r2(saldoCaja(ms, m => m.fecha < desde) + saldoCaja(ms, m => enRango(m.fecha, desde, hasta) && esSI(m)));
    const totE = r2(Object.values(entradas).reduce((s, v) => s + v, 0)), totS = r2(Object.values(salidas).reduce((s, v) => s + v, 0));
    const final = saldoCaja(ms, m => m.fecha <= hasta);
    return { desde, hasta, inicial, entradas, salidas, totalEntradas: totE, totalSalidas: totS, neto: r2(totE - totS), final, cuadra: Math.abs(r2(inicial + totE - totS - final)) < 0.01 };
  });
}
