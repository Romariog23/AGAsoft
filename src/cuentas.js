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
