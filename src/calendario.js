// AGA Calendar dentro de AGAsoft: se entra con el usuario de AGA Calendar (su propio Supabase) y se leen sus
// empresas y declaraciones presentadas. Las fechas se calculan con el mismo motor y las mismas reglas del calendario
// (src/calendario/engine.js y rules.js son copia de los del repo aga-calendario: si cambian allá, se copian acá).
import { createClient } from '@supabase/supabase-js';
import { calendar, separarDv, ymd } from './calendario/engine.js';
import { DEFAULT_RULES } from './calendario/rules.js';

const env = k => String(import.meta.env?.[k] || '').trim();
const RAW = env('VITE_CALENDARIO_URL').replace(/\/+$/, '');
const URL_ = !RAW ? '' : RAW.includes('://') ? RAW : RAW.includes('.') ? 'https://' + RAW : `https://${RAW}.supabase.co`;
const KEY = env('VITE_CALENDARIO_KEY');
export const URL_APP_CALENDARIO = env('VITE_CALENDARIO_APP');
export const calendarioConfigurado = () => !!(URL_ && KEY);

let sb = null;
const cliente = () => {
  if (!calendarioConfigurado()) throw new Error('AGA Calendar todavía no está conectado a AGAsoft.');
  // Sesión aparte de la de AGAsoft (otra clave de almacenamiento), para no cruzar los dos usuarios.
  return sb || (sb = createClient(URL_, KEY, { auth: { storageKey: 'agasoft-calendario-auth', persistSession: true, autoRefreshToken: true } }));
};

export async function sesionCalendario() {
  if (!calendarioConfigurado()) return null;
  const { data } = await cliente().auth.getSession();
  return data.session?.user || null;
}
export async function entrarCalendario(correo, clave) {
  const { data, error } = await cliente().auth.signInWithPassword({ email: correo, password: clave });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Correo o contraseña de AGA Calendar incorrectos.' : error.message);
  return data.user;
}
export async function salirCalendario() { if (sb) await sb.auth.signOut(); cache = null; }

// Reglas guardadas de una versión anterior a la oficial se ignoran (igual que en AGA Calendar).
function reglasDe(json) {
  if (!json || (json.version || 0) < DEFAULT_RULES.version) return DEFAULT_RULES;
  const out = { ...json, obligaciones: [...(json.obligaciones || [])] };
  if (!out.obligaciones.some(o => o.opcional)) out.obligaciones = out.obligaciones.filter(o => o.id !== 'exogena').concat(DEFAULT_RULES.obligaciones.filter(o => o.opcional));
  if (!Array.isArray(out.municipios)) out.municipios = DEFAULT_RULES.municipios;
  if (!out.obligaciones.some(o => o.iva === 'cuatrimestral')) out.obligaciones.push(...DEFAULT_RULES.obligaciones.filter(o => o.iva === 'cuatrimestral'));
  return out;
}
const aEmpresa = r => ({ id: r.id, owner: r.owner, nombre: r.nombre, ...(separarDv(r.nit) || { nit: r.nit, dv: r.dv }), regimen: r.regimen, extras: r.extras || {},
  responsable: (r.resp_nombre || r.resp_correo) ? { nombre: r.resp_nombre || r.resp_correo, correo: r.resp_correo || '' } : null });

let cache = null;
// Empresas que ve el usuario (las suyas y en las que es responsable; el administrador puede ver todas), aprobaciones y reglas.
export async function cargarCalendario({ forzar = false } = {}) {
  if (cache && !forzar && Date.now() - cache.t < 5 * 60e3) return cache;
  const c = cliente();
  const { data: s } = await c.auth.getSession();
  const user = s.session?.user; if (!user) return null;
  const [e, a, g, p] = await Promise.all([
    c.from('empresas').select('*').order('nombre'),
    c.from('aprobaciones').select('empresa_id,clave,vence,aprobado_por_nombre,aprobado_en'),
    c.from('reglas').select('json').eq('id', 1).maybeSingle(),
    c.from('perfiles').select('nombre,correo,es_admin').eq('id', user.id).maybeSingle(),
  ]);
  if (e.error) throw e.error;
  const correo = String(user.email || '').toLowerCase();
  const empresas = (e.data || []).map(aEmpresa).map(x => ({ ...x, mia: x.owner === user.id, comoResp: String(x.responsable?.correo || '').toLowerCase() === correo }));
  cache = { t: Date.now(), user, perfil: p.data || { correo: user.email, es_admin: false }, empresas, aprob: a.data || [], reglas: reglasDe(g.data?.json) };
  return cache;
}

// Vencimientos de las empresas en un rango de fechas, con su estado: presentada, vencida o por vencer (días que faltan).
// nit: solo la empresa con ese NIT (la que está abierta en AGAsoft). Si varios usuarios la tienen, se prefiere la propia.
export function empresaPorNit(datos, nit) {
  const n = String(nit || '').replace(/\D/g, ''); if (!datos || !n) return null;
  const l = datos.empresas.filter(x => String(x.nit || '').replace(/\D/g, '') === n);
  return l.find(x => x.mia) || l.find(x => x.comoResp) || l[0] || null;
}
export function vencimientos(datos, desde, hasta, { todas = false, nit = null } = {}) {
  if (!datos) return [];
  if (nit !== null) { const e = empresaPorNit(datos, nit); if (!e) return []; datos = { ...datos, empresas: [e] }; todas = true; }
  const pres = new Map(datos.aprob.map(x => [x.empresa_id + '_' + x.clave, x]));
  // También cuenta como presentada la del mismo mes y obligación (las fechas pueden moverse un día si cambian las reglas).
  const mes = new Map(datos.aprob.map(x => { const m = String(x.clave).match(/^(.*)_(\d{4}-\d{2})-\d{2}$/); return [m ? `${x.empresa_id}_${m[1]}_${m[2]}` : '', x]; }));
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const empresas = datos.empresas.filter(x => todas || x.mia || x.comoResp);
  const anios = [...new Set([Number(desde.slice(0, 4)), Number(hasta.slice(0, 4))])];
  const out = [];
  for (const emp of empresas) for (const y of anios) for (const ev of calendar(emp, y, datos.reglas)) {
    const f = ymd(ev.date); if (f < desde || f > hasta) continue;
    const m = ev.clave.match(/^(.*)_(\d{4}-\d{2})-\d{2}$/);
    const ap = pres.get(emp.id + '_' + ev.clave) || (m && mes.get(`${emp.id}_${m[1]}_${m[2]}`)) || null;
    const dias = Math.round((ev.date - hoy) / 864e5);
    out.push({ clave: emp.id + '_' + ev.clave, empresa: emp.nombre, empresa_id: emp.id, nit: emp.nit, obligacion: ev.ob.nombre, formulario: ev.ob.formulario || '', periodo: ev.periodo, fecha: f, dias,
      estado: ap ? 'presentada' : dias < 0 ? 'vencida' : dias <= 7 ? 'pronto' : 'futura', presentada: ap });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.empresa.localeCompare(b.empresa));
}
