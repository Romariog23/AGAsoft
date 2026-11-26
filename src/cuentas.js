// Cuentas protegidas: lo ya registrado no cambia cuando se cambia la configuración.
// - Versiones: al cambiar las cuentas de los parámetros o de las tarifas de IVA se guarda cómo estaban
//   (contabilidad.versiones_cta = [{ hasta, cfg }]). Cada documento se contabiliza con la configuración
//   vigente cuando se creó (las notas, con la de su factura), así que editarlo después no lo cambia.
// - Inactivar: una cuenta inactiva no se ofrece para registros nuevos, pero sus saldos siguen igual.
// - Trasladar: pasa todos los movimientos de una cuenta a otra (reescribe la historia), en los documentos y en la configuración.
import { PARAMETROS, parametrosDe } from './puc.js';
import { tarifasIva } from './impuestos.js';

// Lo que cambia la contabilización de los documentos ya guardados.
export const CLAVES_VERSION = [...Object.keys(PARAMETROS), 'tarifas_iva'];
const foto = contab => {
  const P = parametrosDe(contab);
  return { ...Object.fromEntries(Object.keys(PARAMETROS).map(k => [k, P[k]])), tarifas_iva: tarifasIva(contab) };
};

// Contabilidad nueva con la versión anterior guardada, si cambió algo que afecta los asientos.
export function conVersion(antes = {}, nuevo = {}, ahora = new Date().toISOString()) {
  const a = foto(antes), n = foto(nuevo);
  if (JSON.stringify(a) === JSON.stringify(n)) return nuevo;
  return { ...nuevo, versiones_cta: [...(antes.versiones_cta || []), { hasta: ahora, cfg: a }] };
}

// Función momento → { param, tarifas } con la configuración vigente en ese momento (creado_en del documento).
export function versionador(contab = {}, actual = null) {
  const vs = [...(contab?.versiones_cta || [])].sort((a, b) => a.hasta.localeCompare(b.hasta));
  const hoy = actual || { param: parametrosDe(contab), tarifas: tarifasIva(contab) };
  if (!vs.length) return () => hoy;
  const cache = new Map();
  return momento => {
    if (!momento) return hoy;
    const i = vs.findIndex(v => String(momento) < v.hasta);
    if (i < 0) return hoy;
    if (!cache.has(i)) { const c = { ...contab, ...vs[i].cfg }; cache.set(i, { param: parametrosDe(c), tarifas: tarifasIva(c) }); }
    return cache.get(i);
  };
}

// ¿La cuenta (o una de sus cuentas padre) está inactiva?
export const inactiva = (codigo, idx) => { for (let n = String(codigo).length; n > 0; n -= n > 2 ? 2 : 1) if (idx[String(codigo).slice(0, n)]?.activa === false) return true; return false; };

// Dónde usa la configuración una cuenta (para no inactivarla mientras los documentos nuevos la necesiten).
export function usosCuenta(codigo, { contab = {}, productos = [], bodegas = [], retenciones = [], formas = [] } = {}) {
  const out = [], P = parametrosDe(contab);
  for (const [k, [, nombre]] of Object.entries(PARAMETROS)) if (P[k] === codigo) out.push(`Parámetro: ${nombre}`);
  for (const t of tarifasIva(contab)) if (t.cuenta_venta === codigo || t.cuenta_compra === codigo) out.push(`Tarifa de IVA: ${t.nombre}`);
  for (const p of productos) if (p.activo !== false && [p.cuenta_ingreso, p.cuenta_devolucion, p.cuenta_costo].includes(codigo)) out.push(`Producto: ${p.nombre}`);
  for (const b of bodegas) if (b.cuenta === codigo) out.push(`Bodega: ${b.nombre}`);
  for (const r of retenciones) if (r.cuenta === codigo) out.push(`Retención: ${r.nombre}`);
  for (const f of formas) if (f.cuenta === codigo) out.push(`Forma de pago: ${f.nombre}`);
  return out;
}

// Cambia la cuenta a por b en cualquier valor (texto exacto) dentro de objetos y listas.
export function reemplazar(v, a, b) {
  if (v === a) return b;
  if (Array.isArray(v)) return v.map(x => reemplazar(x, a, b));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reemplazar(x, a, b)]));
  return v;
}
// Columnas con cuentas de cada tabla (lo mismo que hace trasladar_cuenta en la base).
export const CAMPOS_CUENTA = {
  items: ['cuenta'],
  documentos: ['cuenta_pago', 'retenciones'],
  compras: ['lineas', 'aplicaciones', 'cuenta_pago', 'cuenta_retefuente', 'retenciones'],
  comprobantes: ['lineas'],
  nominas: ['lineas', 'cuenta_neto'],
  inventario_docs: ['cuenta_contra'],
  productos: ['cuenta_ingreso', 'cuenta_devolucion', 'cuenta_costo'],
  bodegas: ['cuenta'],
};
// Traslado en datos locales (modo demostración). Devuelve cuántos registros cambiaron.
export function trasladarLocal(db, eid, a, b) {
  let n = 0;
  for (const [t, campos] of Object.entries(CAMPOS_CUENTA)) for (const r of db[t] || []) {
    if (r.empresa_id !== eid || ((t === 'compras' || t === 'comprobantes' || t === 'nominas') && r.estado === 'anulado')) continue;
    let cambio = false;
    for (const c of campos) { const v = reemplazar(r[c], a, b); if (JSON.stringify(v) !== JSON.stringify(r[c])) { r[c] = v; cambio = true; } }
    if (cambio) n++;
  }
  const e = (db.empresas || []).find(x => x.id === eid);
  if (e) e.contabilidad = reemplazar(e.contabilidad || {}, a, b);
  return n;
}

// Cuentas con cartera: sus movimientos se siguen por tercero y documento cruce (cartera, CxP, edades).
// Cada cuenta puede marcarse (cartera: true/false); si no, hereda de su cuenta padre y, al final, de las de siempre.
export const CARTERA_DEFECTO = ['1305', '1330', '2205'];
export function manejaCartera(codigo, idx = {}) {
  const c = String(codigo || '');
  for (let n = c.length; n > 0; n -= n > 2 ? 2 : 1) { const v = idx[c.slice(0, n)]?.cartera; if (v === true || v === false) return v; }
  return CARTERA_DEFECTO.some(p => c.startsWith(p));
}
const natDe = (codigo, idx) => { const c = String(codigo); for (let n = c.length; n > 0; n -= n > 2 ? 2 : 1) if (idx[c.slice(0, n)]?.naturaleza) return idx[c.slice(0, n)].naturaleza; return /^[1567]/.test(c) ? 'D' : 'C'; };

// Saldos por documento cruce que dejan los comprobantes (saldos iniciales y comprobantes manuales) en cuentas con cartera.
// lado 'cobrar' = cuentas débito (clientes, anticipos); 'pagar' = cuentas crédito (proveedores).
export function carteraComprobantes(comprobantes = [], idx = {}, lado = 'cobrar', hoy = new Date().toISOString().slice(0, 10)) {
  const g = new Map(), nat = lado === 'cobrar' ? 'D' : 'C';
  for (const c of comprobantes) {
    if (c.estado === 'anulado') continue;
    for (const l of c.lineas || []) {
      const cuenta = String(l.cuenta || '');
      if (!manejaCartera(cuenta, idx) || natDe(cuenta, idx) !== nat) continue;
      const d = Number(l.debito) || 0, k = Number(l.credito) || 0; if (!d && !k) continue;
      const cruce = String(l.cruce || '').trim(), key = `${l.tercero_id || ''}|${cuenta}|${cruce}`;
      const x = g.get(key) || { tercero_id: l.tercero_id || null, cuenta, cruce, fecha: c.fecha, vence: '', comp_id: c.id, valor: 0, abonos: 0 };
      const sube = nat === 'D' ? d - k : k - d;
      if (sube > 0) { x.valor += sube; if (!x.vence && l.vence) x.vence = l.vence; if (c.fecha < x.fecha || !x.valor) { x.fecha = c.fecha; x.comp_id = c.id; } }
      else x.abonos += -sube;
      g.set(key, x);
    }
  }
  return [...g.values()].map(x => {
    const valor = Math.round(x.valor * 100) / 100, abonos = Math.round(x.abonos * 100) / 100, vence = x.vence || x.fecha;
    const dias = Math.round((new Date(hoy + 'T12:00:00') - new Date(vence + 'T12:00:00')) / 864e5);
    return { ...x, valor, abonos, vence, saldo: Math.round((valor - abonos) * 100) / 100, dias };
  });
}
