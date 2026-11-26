// Conciliación bancaria: el libro auxiliar de una cuenta de bancos frente al extracto del banco.
// - Libro: los movimientos contables de la cuenta (los mismos del libro auxiliar), con una clave estable por documento.
// - Extracto: lo carga el usuario (CSV o Excel, o a mano); más adelante podrá venir de la conexión con el banco.
// - Cruces: grupos de movimientos del libro y del extracto que suman lo mismo. Lo no cruzado explica la diferencia:
//   en libros y no en el banco (consignaciones en tránsito, cheques no cobrados) y en el banco y no en libros (por contabilizar).
// Convención del extracto: débito = sale plata de la cuenta (cargo del banco), crédito = entra plata (abono del banco).
// En libros es al revés: el débito a la cuenta de bancos es plata que entra.
import { parseFecha, parseValor } from './importar.js';

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Cuentas de bancos que se concilian: auxiliares de 1110 (bancos) y 1120 (cuentas de ahorro).
export const esCuentaBanco = c => /^11(10|20)\d{4}$/.test(String(c || ''));

export const inicioMes = p => `${p}-01`;
export function finMes(p) { const [y, m] = p.split('-').map(Number); const d = new Date(Date.UTC(y, m, 0)); return d.toISOString().slice(0, 10); }
export const mesAnterior = p => { const [y, m] = p.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

// Movimientos del libro de una cuenta con clave estable: documento + orden dentro del documento en esa cuenta.
export function movimientosLibro(movs, cuenta) {
  const n = {}, out = [];
  for (const m of movs) {
    if (m.cuenta !== cuenta) continue;
    const base = m.doc_id || `${m.origen}|${m.ref}`;
    const k = `${base}|${n[base] = (n[base] ?? -1) + 1}`;
    out.push({ ...m, key: k, valor: r2((Number(m.debito) || 0) - (Number(m.credito) || 0)) });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.ref).localeCompare(String(b.ref)));
}
export const saldoHasta = (libro, fecha) => r2(libro.filter(m => m.fecha <= fecha).reduce((s, m) => s + m.valor, 0));

// Columnas del extracto: se reconocen por el título (cada banco usa nombres distintos).
const COLS = {
  fecha: ['fecha', 'fechamovimiento', 'fechatransaccion', 'fechaoperacion', 'date', 'dia'],
  descripcion: ['descripcion', 'concepto', 'detalle', 'transaccion', 'movimiento', 'description', 'descripciondelmovimiento'],
  referencia: ['referencia', 'ref', 'documento', 'numerodocumento', 'comprobante', 'referencia1', 'oficina'],
  debito: ['debito', 'debitos', 'retiro', 'retiros', 'cargo', 'cargos', 'egreso', 'egresos', 'salida', 'salidas', 'valordebito'],
  credito: ['credito', 'creditos', 'abono', 'abonos', 'deposito', 'depositos', 'consignacion', 'consignaciones', 'ingreso', 'ingresos', 'entrada', 'entradas', 'valorcredito'],
  valor: ['valor', 'monto', 'importe', 'valortransaccion', 'amount'],
  saldo: ['saldo', 'saldofinal', 'saldodisponible', 'saldototal'],
};
// Lee las filas del archivo del banco. Devuelve { lineas, faltan, errores }.
export function leerExtracto(rows) {
  const hi = rows.findIndex(r => r.some(h => COLS.fecha.includes(norm(h))) && r.some(h => [...COLS.debito, ...COLS.credito, ...COLS.valor].includes(norm(h))));
  if (hi < 0) return { lineas: [], errores: [], faltan: ['Fecha', 'Débito y Crédito (o Valor)'] };
  const head = rows[hi].map(norm), col = {};
  for (const [k, al] of Object.entries(COLS)) { const i = head.findIndex(h => al.includes(h)); if (i >= 0) col[k] = i; }
  const lineas = [], errores = [];
  rows.slice(hi + 1).forEach((r, j) => {
    const v = k => col[k] === undefined ? '' : String(r[col[k]] ?? '').trim();
    if (!r.some(x => String(x ?? '').trim())) return;
    const fecha = parseFecha(v('fecha'));
    let deb = Math.abs(parseValor(v('debito'))), cre = Math.abs(parseValor(v('credito')));
    if (col.valor !== undefined && !deb && !cre) { const x = parseValor(v('valor')); if (x < 0) deb = -x; else cre = x; }
    if (!fecha) { if (deb || cre) errores.push(`Fila ${hi + j + 2}: la fecha "${v('fecha')}" no se entiende.`); return; }
    if (!deb && !cre) return;
    lineas.push({ fecha, descripcion: v('descripcion'), referencia: v('referencia'), debito: r2(deb), credito: r2(cre) });
  });
  return { lineas, errores, faltan: [] };
}
// Valor de una línea del extracto visto desde los libros (+ entra plata a la cuenta).
export const valorBanco = b => r2((Number(b.credito) || 0) - (Number(b.debito) || 0));

const dias = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5);
// Cruces automáticos entre lo pendiente: primero lo contabilizado desde la conciliación (conc = id de la línea del banco),
// luego mismo valor y fecha cercana (la más cercana primero).
export function autoCruzar(libro, banco, maxDias = 5) {
  const out = [], usL = new Set(), usB = new Set();
  for (const m of libro) {
    if (!m.conc) continue;
    const b = banco.find(x => x.id === m.conc && !usB.has(x.id));
    if (b && Math.abs(valorBanco(b) - m.valor) < 0.005) { out.push({ l: [m.key], b: [b.id], auto: true }); usL.add(m.key); usB.add(b.id); }
  }
  const pares = [];
  for (const m of libro) {
    if (usL.has(m.key) || !m.valor) continue;
    for (const b of banco) if (!usB.has(b.id) && Math.abs(valorBanco(b) - m.valor) < 0.005 && dias(m.fecha, b.fecha) <= maxDias) pares.push([dias(m.fecha, b.fecha), m, b]);
  }
  pares.sort((a, b) => a[0] - b[0]);
  for (const [, m, b] of pares) if (!usL.has(m.key) && !usB.has(b.id)) { out.push({ l: [m.key], b: [b.id], auto: true }); usL.add(m.key); usB.add(b.id); }
  return out;
}
// ¿Los movimientos escogidos suman lo mismo en los dos lados?
export const cuadraCruce = (ls, bs) => ls.length > 0 && bs.length > 0 && Math.abs(r2(ls.reduce((s, m) => s + m.valor, 0)) - r2(bs.reduce((s, b) => s + valorBanco(b), 0))) < 0.005;

// Estado de la conciliación de un mes. concs = todas las conciliaciones de la cuenta; actual = la del mes.
// El libro trae lo del mes más lo pendiente de meses anteriores (desde la primera conciliación de la cuenta);
// el extracto, sus líneas más las no cruzadas de conciliaciones anteriores.
export function estadoConciliacion(libroTodo, concs, actual) {
  const p = actual.periodo, ini = inicioMes(p), fin = finMes(p);
  const previas = concs.filter(c => c.periodo < p);
  const desde = previas.length ? inicioMes([...previas].sort((a, b) => a.periodo.localeCompare(b.periodo))[0].periodo) : ini;
  const cruzL = new Set(), cruzB = new Set();
  for (const c of previas) for (const x of c.cruces || []) { x.l.forEach(k => cruzL.add(k)); x.b.forEach(k => cruzB.add(k)); }
  const libro = libroTodo.filter(m => m.fecha <= fin && m.fecha >= desde && (m.fecha >= ini || !cruzL.has(m.key)));
  const banco = [...previas.flatMap(c => (c.extracto || []).filter(b => !cruzB.has(b.id)).map(b => ({ ...b, anterior: c.periodo }))), ...(actual.extracto || [])];
  const cruces = (actual.cruces || []).filter(x => x.l.every(k => libro.some(m => m.key === k)) && x.b.every(k => banco.some(b => b.id === k)));
  const enL = new Set(cruces.flatMap(x => x.l)), enB = new Set(cruces.flatMap(x => x.b));
  const pendL = libro.filter(m => !enL.has(m.key) && m.valor), pendB = banco.filter(b => !enB.has(b.id));
  const saldoLibros = saldoHasta(libroTodo, fin);
  const saldoExtracto = r2(actual.saldo_extracto);
  const transito = r2(pendL.filter(m => m.valor > 0).reduce((s, m) => s + m.valor, 0));
  const noCobrados = r2(-pendL.filter(m => m.valor < 0).reduce((s, m) => s + m.valor, 0));
  const ncBanco = r2(pendB.filter(b => valorBanco(b) > 0).reduce((s, b) => s + valorBanco(b), 0));
  const ndBanco = r2(-pendB.filter(b => valorBanco(b) < 0).reduce((s, b) => s + valorBanco(b), 0));
  const segunBanco = r2(saldoExtracto + transito - noCobrados), segunLibros = r2(saldoLibros + ncBanco - ndBanco);
  return { libro, banco, cruces, enL, enB, pendL, pendB, saldoLibros, saldoExtracto, transito, noCobrados, ncBanco, ndBanco, segunBanco, segunLibros, diferencia: r2(segunBanco - segunLibros) };
}

// Cuenta contrapartida sugerida para una partida del banco, según su descripción (la primera auxiliar que exista).
const SUGERIDAS = [
  [/gmf|4 ?x ?1\.?000|gravamen|cuatro por mil/i, ['53059505', '511595', '530595', '530505']],
  [/iva/i, ['240810', '2408']],
  [/comisi|cuota de manejo|manejo|tarjeta|chequera|transferencia|ach|pse/i, ['530515', '530505']],
  [/interes|rendimiento/i, null],
  [/retenci|rete ?fuente/i, ['135515', '1355']],
];
export function cuentaSugerida(b, cuentas) {
  const aux = cuentas.filter(c => /^\d{8}$/.test(c.codigo) && c.activa !== false).map(c => c.codigo).sort();
  const primera = prefs => { for (const p of prefs) { const c = aux.find(x => x.startsWith(p)); if (c) return c; } return ''; };
  const t = `${b.descripcion} ${b.referencia}`;
  for (const [re, prefs] of SUGERIDAS) if (re.test(t)) return prefs ? primera(prefs) : primera(valorBanco(b) > 0 ? ['421005', '4210'] : ['530520', '5305']);
  return '';
}
// Líneas del comprobante para contabilizar partidas del banco: por cada una, la cuenta de bancos (marcada con la línea del extracto) y su contrapartida.
export function lineasContabilizar(partidas, cuenta, { cuentas = [], tercero = '', terceroDe = () => '' } = {}) {
  const out = [];
  for (const b of partidas) {
    const v = valorBanco(b), det = [b.descripcion, b.referencia].filter(Boolean).join(' · ') || 'Partida del extracto';
    const t = terceroDe(b) || tercero;
    out.push({ cuenta, tercero_id: t, detalle: det, debito: v > 0 ? v : '', credito: v < 0 ? -v : '', conc: b.id });
    out.push({ cuenta: cuentaSugerida(b, cuentas), tercero_id: t, detalle: det, debito: v < 0 ? -v : '', credito: v > 0 ? v : '' });
  }
  return out;
}
