// Informes de ventas, compras y flujos (efectivo, patrimonio y caja). Funciones puras: no tocan la base de datos.
// movs: movimientos contables de contab.movimientos ({ fecha, cuenta, debito, credito, tipo, origen, doc_id, ref }).
import { r2, num, totales, linea, TIPOS } from './calc.js';
import { totalesCompra, TIPOS_COMPRA } from './compras.js';
import { TIPOS_COMP } from './contab.js';

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
  ['clientes', 'Anticipos y otros cobros a deudores'], ['ventas', 'Ventas e ingresos cobrados'], ['proveedores', 'Anticipos y otros pagos a proveedores'],
  ['gastos', 'Gastos y costos pagados'], ['nomina', 'Nómina y seguridad social'], ['impuestos', 'Impuestos'], ['inventario', 'Compras de inventario'],
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
const claveGrupo = m => `${m.origen || 'doc'}|${m.doc_id || m.ref}`;
// Conceptos de un grupo de movimientos (sin caja) en el sentido del efectivo: [{ cat, cuenta, w }] con w > 0.
// El IVA va con el concepto más grande del documento (una venta o compra de contado no se parte en "impuestos").
function conceptos(ms, signo) {
  const ls = ms.filter(m => !esCaja(m.cuenta)).map(m => ({ cat: categoria(m.cuenta), cuenta: m.cuenta.slice(0, 4), w: r2((m.credito - m.debito) * signo) })).filter(x => x.w > 0);
  const por = {};
  for (const x of ls) { const k = x.cat + '|' + x.cuenta; por[k] = por[k] || { cat: x.cat, cuenta: x.cuenta, w: 0 }; por[k].w += x.w; }
  let l = Object.values(por);
  const imp = l.filter(x => x.cat === 'impuestos'), resto = l.filter(x => x.cat !== 'impuestos');
  if (imp.length && resto.length) { const mayor = resto.sort((x, y) => y.w - x.w)[0]; mayor.w += imp.reduce((t, x) => t + x.w, 0); l = resto; }
  return l;
}
// Reparte un valor entre conceptos según su peso; el último toma el redondeo.
function repartir(valor, l, fecha, out) {
  const peso = l.reduce((t, x) => t + x.w, 0); let resto = valor;
  l.forEach((x, i) => { const v = i === l.length - 1 ? r2(resto) : r2(valor * x.w / peso); resto = r2(resto - v); out.push({ fecha, cat: x.cat, cuenta: x.cuenta, valor: v }); });
}
// Efectivo de cada documento por concepto. Un recibo o un egreso que cancela facturas se sigue hasta esas facturas:
// el pago de una factura de proveedor sale como el gasto, costo o activo que se causó en ella (no como "cuentas por
// pagar"), y el cobro de una factura de venta como el ingreso que se facturó.
// enlaces: { claveDelPago: [{ clave: claveDeLaFactura | null, valor }] } (null = anticipo).
function flujosPorDocumento(movs, todos, enlaces = {}) {
  const grupos = {}, causacion = {};
  for (const m of movs) (grupos[claveGrupo(m)] = grupos[claveGrupo(m)] || []).push(m);
  for (const m of todos) (causacion[claveGrupo(m)] = causacion[claveGrupo(m)] || []).push(m);
  const out = [];
  for (const [k, ms] of Object.entries(grupos)) {
    const caja = r2(ms.filter(m => esCaja(m.cuenta)).reduce((t, m) => t + m.debito - m.credito, 0));
    if (!caja) continue;
    const signo = Math.sign(caja), fecha = ms[0].fecha, desde0 = out.length;
    const tercero = ms.find(m => esCaja(m.cuenta) && m.tercero_id)?.tercero_id || ms.find(m => m.tercero_id)?.tercero_id || '';
    const marcar = () => { for (let i = desde0; i < out.length; i++) out[i].tercero_id = tercero; };
    const en = (enlaces[k] || []).filter(e => e.valor > 0);
    if (en.length) {
      const tot = en.reduce((t, e) => t + e.valor, 0); let resto = caja;
      en.forEach((e, i) => {
        const parte = i === en.length - 1 ? r2(resto) : r2(caja * e.valor / tot); resto = r2(resto - parte);
        const l = e.clave && causacion[e.clave] ? conceptos(causacion[e.clave], signo) : [];
        if (l.length) repartir(parte, l, fecha, out); else out.push({ fecha, cat: signo > 0 ? 'clientes' : 'proveedores', cuenta: e.clave ? '' : 'anticipo', valor: parte });
      });
      marcar(); continue;
    }
    const l = conceptos(ms, signo);
    if (l.length) repartir(caja, l, fecha, out); else out.push({ fecha, cat: 'otros', cuenta: '', valor: caja });
    marcar();
  }
  return out;
}
// cols: [{ desde, hasta }]. Por columna: saldo inicial, entradas y salidas por categoría (y por cuenta de 4 dígitos
// en detalle), flujo neto y saldo final.
// tercero: solo los pagos y cobros de ese tercero (el saldo de caja no aplica).
export function flujoCaja(movs, cols, enlaces = {}, tercero = '') {
  const ms = (movs || []).filter(m => m.tipo !== 'CI');
  const flujos = flujosPorDocumento(ms.filter(m => !esSI(m)), ms, enlaces);
  return cols.map(({ desde, hasta }) => {
    const entradas = {}, salidas = {}, detE = {}, detS = {}, terE = {}, terS = {};
    for (const f of flujos) if (enRango(f.fecha, desde, hasta) && (!tercero || f.tercero_id === tercero)) {
      const [tot, det, ter, v] = f.valor > 0 ? [entradas, detE, terE, f.valor] : [salidas, detS, terS, -f.valor];
      sumar(tot, f.cat, v); sumar(det[f.cat] = det[f.cat] || {}, f.cuenta, v);
      const k = f.cat + '|' + f.cuenta; sumar(ter[k] = ter[k] || {}, f.tercero_id || '', v);
    }
    const inicial = r2(saldoCaja(ms, m => m.fecha < desde) + saldoCaja(ms, m => enRango(m.fecha, desde, hasta) && esSI(m)));
    const totE = r2(Object.values(entradas).reduce((t, v) => t + v, 0)), totS = r2(Object.values(salidas).reduce((t, v) => t + v, 0));
    const final = saldoCaja(ms, m => m.fecha <= hasta);
    return { desde, hasta, inicial, entradas, salidas, detalleEntradas: detE, detalleSalidas: detS, tercerosEntradas: terE, tercerosSalidas: terS, totalEntradas: totE, totalSalidas: totS, neto: r2(totE - totS), final, cuadra: Math.abs(r2(inicial + totE - totS - final)) < 0.01 };
  });
}
// Enlaces de pagos a facturas: recibos de caja (aplicaciones) y egresos (aplicaciones a facturas de proveedor y anticipo).
export function enlacesPagos({ documentos = [], aplicaciones = [], compras = [] }) {
  const out = {};
  for (const a of aplicaciones) (out[`doc|${a.recibo_id}`] = out[`doc|${a.recibo_id}`] || []).push({ clave: `doc|${a.factura_id}`, valor: num(a.valor) });
  for (const d of documentos) if (d.tipo === 'RC' && num(d.anticipo) > 0) (out[`doc|${d.id}`] = out[`doc|${d.id}`] || []).push({ clave: null, valor: num(d.anticipo) });
  for (const c of compras) {
    if (c.tipo !== 'CE' || c.estado === 'anulado') continue;
    const l = (c.aplicaciones || []).map(a => ({ clave: `compra|${a.compra_id}`, valor: num(a.valor) }));
    if (num(c.anticipo) > 0) l.push({ clave: null, valor: num(c.anticipo) });
    if (l.length) out[`compra|${c.id}`] = l;
  }
  return out;
}

// Nombre del documento de un movimiento en texto ('FV 12', 'CE 3', 'AI 1'...).
export const etiquetaDoc = m => m.origen === 'nomina' ? m.ref : m.origen === 'compra' ? `${TIPOS_COMPRA[m.tipo]?.corto || m.tipo} ${String(m.ref).replace(/^\w+ /, '')}` : m.origen === 'comp' ? `${TIPOS_COMP[m.tipo]?.corto || m.tipo} ${String(m.ref).replace(/^\w+ /, '')}` : TIPOS[m.tipo] ? `${TIPOS[m.tipo].corto} ${m.ref}` : String(m.ref || '');

// Auxiliar contable general detallado: todos los movimientos del periodo, en orden cronológico por fecha del documento,
// con todas las partidas de cada comprobante juntas (en el orden en que se registraron).
// etiqueta(m) da el nombre del documento ('FV 12', 'CE 3'...) para ordenar los del mismo día.
const natural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export function auxiliarGeneral(movs, desde, hasta, { tercero = '', etiqueta = etiquetaDoc } = {}) {
  const grupos = new Map();
  for (const m of movs) {
    if (!enRango(m.fecha, desde, hasta) || (!m.debito && !m.credito)) continue;
    // Por documento (doc_id): el costo de ventas del inventario queda junto a su factura.
    const k = `${m.fecha}|${m.doc_id || `${m.origen}|${m.ref}`}`;
    let g = grupos.get(k);
    if (!g) grupos.set(k, g = { fecha: m.fecha, documento: etiqueta(m), origen: m.origen, tipo: m.tipo, doc_id: m.doc_id, ref: m.ref, filas: [], debito: 0, credito: 0 });
    g.filas.push(m);
  }
  let out = [...grupos.values()];
  // Con tercero se dejan solo sus partidas, pero el comprobante sigue agrupado.
  if (tercero) out = out.map(g => ({ ...g, filas: g.filas.filter(m => m.tercero_id === tercero) })).filter(g => g.filas.length);
  for (const g of out) { g.debito = r2(g.filas.reduce((s, m) => s + (m.debito || 0), 0)); g.credito = r2(g.filas.reduce((s, m) => s + (m.credito || 0), 0)); }
  out.sort((a, b) => a.fecha.localeCompare(b.fecha) || natural.compare(a.documento, b.documento));
  return { grupos: out, debito: r2(out.reduce((s, g) => s + g.debito, 0)), credito: r2(out.reduce((s, g) => s + g.credito, 0)), partidas: out.reduce((s, g) => s + g.filas.length, 0) };
}

// Hojas de Excel del auxiliar general (las usa el botón Descargar Excel y la copia nocturna).
// nomCta(codigo) → nombre; tercero(id) → { numero, nombre }.
export function hojasAuxiliarGeneral(r, { empresa = {}, desde, hasta, nomCta = () => '', tercero = () => null, generado = '' }) {
  const filas = [['Fecha', 'Documento', 'Cuenta', 'Nombre de la cuenta', 'Identificación', 'Tercero', 'Detalle', 'Débito', 'Crédito']];
  for (const g of r.grupos) for (const m of g.filas) {
    const t = m.tercero_id ? tercero(m.tercero_id) : null;
    filas.push([g.fecha, g.documento, m.cuenta, nomCta(m.cuenta), t?.numero || '', t?.nombre || '', m.detalle || '', r2(m.debito || 0), r2(m.credito || 0)]);
  }
  const tot = filas.length;
  filas.push(['', '', '', '', '', '', 'Sumas iguales', r.debito, r.credito]);
  return [
    { nombre: 'Auxiliar', filas, negritas: [tot], anchos: [11, 14, 11, 34, 15, 32, 40, 16, 16] },
    { nombre: 'Información', encabezado: false, anchos: [24, 50], filas: [['Auxiliar contable general detallado'], ['Empresa', empresa.nombre || ''], ['NIT', empresa.nit || ''], ['Desde', desde || ''], ['Hasta', hasta || ''], ['Comprobantes', String(r.grupos.length)], ['Partidas', String(r.partidas)], ['Total débitos', r.debito], ['Total créditos', r.credito], ['Generado', generado]] },
  ];
}
