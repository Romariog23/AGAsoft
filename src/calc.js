// Cálculos puros de AGAsoft: NIT, totales de documentos, retenciones, cartera y valor en letras.
// No depende del navegador, así que se prueba con `npm test`.

const r2 = n => Math.round((Number(n) || 0) * 100 + Number.EPSILON * 100) / 100;
const num = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let t = String(v ?? '').replace(/[\s$]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.'); // formato colombiano 1.234,50
  const n = Number(t); return Number.isFinite(n) ? n : 0;
};

/* ---------- NIT y dígito de verificación (DIAN) ---------- */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
function dvOf(nit) {
  const d = String(nit).replace(/\D/g, '');
  let s = 0;
  for (let i = 0; i < d.length; i++) s += Number(d[d.length - 1 - i]) * PESOS[i];
  const r = s % 11;
  return r > 1 ? 11 - r : r;
}
// Acepta "900.123.456-7", "900123456" o "9001234567" (si el último dígito cuadra como DV).
function parseNit(raw) {
  const t = String(raw ?? '').trim();
  const m = t.replace(/[.\s]/g, '').match(/^(\d{5,15})(?:-(\d))?$/);
  if (!m) return { error: 'Escribe solo números, con o sin guion antes del dígito de verificación.' };
  let base = m[1];
  if (m[2] === undefined && /^[89]\d{9}$/.test(base) && dvOf(base.slice(0, 9)) === Number(base[9])) return { nit: base.slice(0, 9), dv: Number(base[9]) };
  const dv = dvOf(base);
  if (m[2] !== undefined && Number(m[2]) !== dv) return { error: `El dígito de verificación no coincide: para ${fmtNit(base)} debería ser ${dv}.` };
  return { nit: base, dv };
}
const fmtNit = n => String(n ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* ---------- Totales ---------- */
// Línea: cantidad × precio, menos descuento %, más IVA %.
function linea(it) {
  const cant = num(it.cantidad), precio = num(it.precio), dpct = num(it.descuento_pct), ipct = num(it.iva_pct);
  const bruto = r2(cant * precio);
  const descuento = r2(bruto * dpct / 100);
  const base = r2(bruto - descuento);
  const iva = r2(base * ipct / 100);
  return { bruto, descuento, base, iva, total: r2(base + iva) };
}

// Documento: suma de líneas, IVA por tarifa y retenciones que practica el cliente.
// ret = { retefuente_pct, reteiva_pct (sobre el IVA), reteica_milaje (por mil sobre la base) }
function totales(items, ret = {}) {
  let bruto = 0, descuento = 0, base = 0, iva = 0;
  const porTarifa = {};
  for (const it of items || []) {
    const l = linea(it);
    bruto += l.bruto; descuento += l.descuento; base += l.base; iva += l.iva;
    const k = String(num(it.iva_pct));
    porTarifa[k] = porTarifa[k] || { tarifa: num(it.iva_pct), base: 0, iva: 0 };
    porTarifa[k].base = r2(porTarifa[k].base + l.base);
    porTarifa[k].iva = r2(porTarifa[k].iva + l.iva);
  }
  bruto = r2(bruto); descuento = r2(descuento); base = r2(base); iva = r2(iva);
  const retefuente = r2(base * num(ret.retefuente_pct) / 100);
  const reteiva = r2(iva * num(ret.reteiva_pct) / 100);
  const reteica = r2(base * num(ret.reteica_milaje) / 1000);
  const total = r2(base + iva);
  const neto = r2(total - retefuente - reteiva - reteica);
  return { bruto, descuento, base, iva, porTarifa: Object.values(porTarifa).sort((a, b) => a.tarifa - b.tarifa), retefuente, reteiva, reteica, total, neto };
}

/* ---------- Cartera ---------- */
// Saldo de cada factura emitida: neto − notas crédito + notas débito − pagos de recibos.
// docs: todos los documentos de la empresa; apl: aplicaciones de recibos [{recibo_id, factura_id, valor}]
function cartera(docs, apl, hoy = new Date()) {
  const vivos = docs.filter(d => d.estado === 'emitido');
  const byId = Object.fromEntries(vivos.map(d => [d.id, d]));
  const res = {};
  for (const f of vivos.filter(d => d.tipo === 'FV' && !String(d.cuenta_pago || '').trim())) res[f.id] = { factura: f, neto: num(f.neto), nc: 0, nd: 0, pagos: 0 };
  for (const d of vivos) {
    if ((d.tipo === 'NC' || d.tipo === 'ND') && res[d.ref_id]) res[d.ref_id][d.tipo === 'NC' ? 'nc' : 'nd'] += num(d.neto);
  }
  for (const a of apl || []) if (byId[a.recibo_id] && res[a.factura_id]) res[a.factura_id].pagos += num(a.valor);
  const t0 = new Date(hoy); t0.setHours(0, 0, 0, 0);
  return Object.values(res).map(x => {
    const saldo = r2(x.neto - x.nc + x.nd - x.pagos);
    const v = x.factura.vence ? new Date(x.factura.vence + 'T00:00:00') : null;
    const dias = v ? Math.floor((t0 - v) / 864e5) : 0;
    return { ...x, nc: r2(x.nc), nd: r2(x.nd), pagos: r2(x.pagos), saldo, diasVencida: saldo > 0 && dias > 0 ? dias : 0 };
  });
}
// Lo ya acreditado a una factura con notas crédito emitidas (para no acreditar más de lo facturado).
function acreditado(docs, facturaId, exceptoId) {
  return r2(docs.filter(d => d.tipo === 'NC' && d.estado === 'emitido' && d.ref_id === facturaId && d.id !== exceptoId).reduce((s, d) => s + num(d.total), 0));
}

/* ---------- Valor en letras (pesos colombianos) ---------- */
const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
function cientos(n) {
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100), r = n % 100;
  const dec = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : '');
  return [C[c], dec].filter(Boolean).join(' ');
}
function enLetras(valor) {
  const v = Math.abs(r2(valor));
  let ent = Math.floor(v);
  const cent = Math.round((v - ent) * 100);
  if (ent === 0) return 'CERO PESOS' + (cent ? ` CON ${cent}/100` : '') + ' M/CTE';
  const partes = [];
  const mm = Math.floor(ent / 1e6), resto = ent % 1e6;
  if (mm) partes.push(mm === 1 ? 'UN MILLÓN' : (mm >= 1000 ? enMiles(mm) : cientos(mm)) + ' MILLONES');
  const miles = Math.floor(resto / 1000), uni = resto % 1000;
  if (miles) partes.push(miles === 1 ? 'MIL' : cientos(miles) + ' MIL');
  if (uni) partes.push(cientos(uni));
  const de = !resto && mm ? ' DE' : '';
  return partes.join(' ') + de + ' PESOS' + (cent ? ` CON ${cent}/100` : '') + ' M/CTE';
}
function enMiles(n) { const m = Math.floor(n / 1000), u = n % 1000; return [m === 1 ? 'MIL' : cientos(m) + ' MIL', u ? cientos(u) : ''].filter(Boolean).join(' '); }

/* ---------- Catálogos DIAN ---------- */
const TIPOS = {
  FV: { nombre: 'Factura de venta', corto: 'Factura', plural: 'Facturas' },
  NC: { nombre: 'Nota crédito', corto: 'Nota crédito', plural: 'Notas crédito' },
  ND: { nombre: 'Nota débito', corto: 'Nota débito', plural: 'Notas débito' },
  RC: { nombre: 'Recibo de caja', corto: 'Recibo', plural: 'Recibos de caja' },
};
// Conceptos de corrección (Anexo técnico de facturación electrónica, tabla 13.2.4/13.2.5).
const CONCEPTOS_NC = [
  ['1', 'Devolución de parte de los bienes; no aceptación de partes del servicio'],
  ['2', 'Anulación de la factura electrónica'],
  ['3', 'Rebaja o descuento parcial o total'],
  ['4', 'Ajuste de precio'],
  ['5', 'Descuento comercial por pronto pago'],
  ['6', 'Descuento comercial por volumen de ventas'],
];
const CONCEPTOS_ND = [['1', 'Intereses'], ['2', 'Gastos por cobrar'], ['3', 'Cambio del valor'], ['4', 'Otros']];
const TIPOS_ID = [['31', 'NIT'], ['13', 'Cédula de ciudadanía'], ['22', 'Cédula de extranjería'], ['41', 'Pasaporte'], ['12', 'Tarjeta de identidad'], ['42', 'Documento de identificación extranjero'], ['47', 'PEP'], ['48', 'PPT']];
// Abreviaturas para mostrar junto al número (CC 1.020.304.050).
const SIGLA_ID = { '31': 'NIT', '13': 'CC', '22': 'CE', '41': 'PA', '12': 'TI', '42': 'DIE', '47': 'PEP', '48': 'PPT' };
const FORMAS_PAGO = [['contado', 'Contado'], ['credito', 'Crédito']];
const MEDIOS_PAGO = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['consignacion', 'Consignación'], ['tarjeta', 'Tarjeta'], ['cheque', 'Cheque']];

export { r2, num, dvOf, parseNit, fmtNit, linea, totales, cartera, acreditado, enLetras, TIPOS, CONCEPTOS_NC, CONCEPTOS_ND, TIPOS_ID, SIGLA_ID, FORMAS_PAGO, MEDIOS_PAGO };
