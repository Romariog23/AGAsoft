// Capa de datos. Dos modos con las mismas funciones:
//  - "supabase": datos en la nube, con usuarios y permisos (producción).
//  - "local": datos solo en este navegador, para probar sin configurar nada (modo demostración).
import { createClient } from '@supabase/supabase-js';
import { PLANES_DEMO } from './planes.js';
import { datosDemo, hoyLocal } from './demo.js';

const TABLAS = ['cuentas', 'terceros', 'productos', 'numeraciones', 'documentos', 'items', 'aplicaciones', 'miembros', 'comprobantes', 'compras', 'empleados', 'nominas', 'fe_envios', 'bodegas', 'inventario_docs', 'centros_costo', 'op_tipos', 'op_elementos', 'op_tarifas', 'op_registros', 'op_cortes'];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const ahora = () => new Date().toISOString();

/* ---------- Reglas de emisión compartidas ---------- */
// Devuelve la numeración que usará el documento o lanza un error con el motivo.
function numeracionPara(doc, numeraciones) {
  // La factura usa la numeración de su clase (electrónica o normal); notas y recibos prefieren la de su clase.
  const el = !!doc.electronica;
  const act = numeraciones.filter(x => x.empresa_id === doc.empresa_id && x.tipo === doc.tipo && x.activa);
  const n = act.find(x => !!x.electronica === el) || (doc.tipo !== 'FV' ? act[0] : null);
  if (!n) throw new Error(doc.tipo === 'FV' ? (el ? 'No hay una numeración activa de factura electrónica. Créala en Numeraciones con la resolución DIAN.' : 'No hay una numeración activa de factura normal (no electrónica). Créala en Numeraciones.')
    : 'No hay una numeración activa para este tipo de documento. Créala en Numeraciones.');
  if (Number(n.siguiente) > Number(n.hasta)) throw new Error(`Se agotó el rango de numeración ${n.prefijo || ''} (hasta ${n.hasta}).`);
  if (n.vigencia_hasta && doc.fecha > n.vigencia_hasta) throw new Error(`La numeración ${n.prefijo || ''} venció el ${n.vigencia_hasta}.`);
  if (n.vigencia_desde && doc.fecha < n.vigencia_desde) throw new Error(`La numeración ${n.prefijo || ''} rige desde el ${n.vigencia_desde}.`);
  return n;
}

// Un envío cuenta como validado por la DIAN si quedó aceptado o si su respuesta trae CUFE validado (también anidado en credit_note / debit_note / bill).
function envioValidado(e) {
  if (!e) return false;
  if (e.estado === 'aceptado' || String(e.cufe || '')) return true;
  const d = e.respuesta?.data || {};
  return [d, d.credit_note, d.debit_note, d.bill].some(x => x && x.is_validated === true);
}
// Facturas, notas y recibos se pueden eliminar aunque estén emitidos, salvo los electrónicos que la DIAN ya validó. Devuelve el motivo si no se puede.
function motivoNoEliminar(d, documentos, aplicaciones, envios = []) {
  if (!d) return 'Documento no encontrado.';
  if (!['FV', 'NC', 'ND', 'RC'].includes(d.tipo)) return 'Este documento no se puede eliminar.';
  if (d.electronica && d.estado !== 'borrador' && envios.some(e => e.documento_id === d.id && envioValidado(e))) return 'Este documento ya fue validado por la DIAN: no se elimina, se corrige con una nota.';
  if (d.tipo === 'FV') {
    if (documentos.some(x => x.ref_id === d.id && x.estado !== 'borrador')) return 'La factura tiene notas crédito o débito. Elimínalas primero.';
    const rc = new Set(documentos.filter(x => x.tipo === 'RC' && x.estado === 'emitido').map(x => x.id));
    if (aplicaciones.some(a => a.factura_id === d.id && rc.has(a.recibo_id))) return 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.';
  }
  return '';
}
function revisarEliminar(d, documentos, aplicaciones, envios) { const m = motivoNoEliminar(d, documentos, aplicaciones, envios); if (m) throw new Error(m); }

/* ---------- Modo local ---------- */
// publico = enlace www.agasoft.co/demo: arranca con la empresa de demostración ya diligenciada y vuelve a ella cada día.
function localStore({ publico = false } = {}) {
  const KEY = publico ? 'agasoft-demo-publico' : 'agasoft-demo-v1';
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { db = null; }
  if (publico && (!db || db._dia !== hoyLocal())) { db = datosDemo(hoyLocal()); db._dia = hoyLocal(); }
  if (!db) db = { empresas: [], ...Object.fromEntries(TABLAS.map(t => [t, []])) };
  for (const t of ['empresas', ...TABLAS]) db[t] = db[t] || [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* sin almacenamiento: queda en memoria */ } };
  const user = { id: 'demo', email: 'demo@agasoft.local' };
  if (publico) persist();
  const api = {
    mode: 'local',
    publico,
    async session() { return user; },
    async perfil() { return { id: 'demo', nombre: 'Modo demostración', es_admin: true, aprobado: true }; },
    async fe() { throw new Error('El envío a la DIAN funciona con la cuenta en línea, no en el modo demostración.'); },
    async signOut() {},
    async listEmpresas() { return db.empresas.map(e => ({ ...e })); },
    async loadEmpresa(eid) { return Object.fromEntries(TABLAS.map(t => [t, db[t].filter(r => r.empresa_id === eid).map(r => ({ ...r }))])); },
    async save(t, row) {
      const list = db[t];
      if (row.id) { const i = list.findIndex(r => r.id === row.id); if (i >= 0) { list[i] = { ...list[i], ...row }; persist(); return { ...list[i] }; } }
      const nuevo = { creado_en: ahora(), ...row, id: row.id || uid() };
      if (t === 'empresas') nuevo.owner = user.id;
      list.push(nuevo); persist(); return { ...nuevo };
    },
    async saveMany(t, rows) { for (const r of rows) db[t].push({ creado_en: ahora(), ...r, id: uid() }); persist(); },
    async remove(t, id) {
      db[t] = db[t].filter(r => r.id !== id);
      if (t === 'documentos') { db.items = db.items.filter(r => r.documento_id !== id); db.aplicaciones = db.aplicaciones.filter(r => r.recibo_id !== id); }
      if (t === 'empresas') for (const k of TABLAS) db[k] = db[k].filter(r => r.empresa_id !== id);
      if (t === 'op_tipos') for (const k of ['op_elementos', 'op_tarifas', 'op_registros', 'op_cortes']) db[k] = db[k].filter(r => r.tipo_id !== id);
      persist();
    },
    async saveDoc(doc, items, apl) {
      const prev = doc.id && db.documentos.find(d => d.id === doc.id);
      if (prev && prev.estado === 'anulado') throw new Error('El documento está anulado.');
      if (prev && prev.estado === 'emitido' && prev.electronica && (db.fe_envios || []).some(e => e.documento_id === prev.id && e.estado === 'aceptado')) throw new Error('Este documento ya fue aceptado por la DIAN: no se modifica, se corrige con una nota.');
      const d = await api.save('documentos', prev && prev.estado === 'emitido' ? { ...doc, tipo: prev.tipo, electronica: !!prev.electronica, estado: 'emitido', prefijo: prev.prefijo, numero: prev.numero, numeracion_id: prev.numeracion_id } : { ...doc, estado: 'borrador' });
      db.items = db.items.filter(r => r.documento_id !== d.id).concat(items.map((it, i) => ({ ...it, id: uid(), documento_id: d.id, empresa_id: d.empresa_id, orden: i })));
      db.aplicaciones = db.aplicaciones.filter(r => r.recibo_id !== d.id).concat((apl || []).map(a => ({ ...a, id: uid(), recibo_id: d.id, empresa_id: d.empresa_id })));
      persist(); return d;
    },
    async emitir(id) {
      const d = db.documentos.find(x => x.id === id);
      if (!d || d.estado !== 'borrador') throw new Error('El documento ya no es un borrador.');
      if (d.tipo === 'NC' || d.tipo === 'ND') d.electronica = !!db.documentos.find(x => x.id === d.ref_id)?.electronica;
      if (d.tipo === 'RC') d.electronica = false;
      // Sin numeración para un documento que no es electrónico: se crea una desde el 1.
      if (!d.electronica && !db.numeraciones.some(x => x.empresa_id === d.empresa_id && x.tipo === d.tipo && x.activa && (d.tipo !== 'FV' || !x.electronica)))
        db.numeraciones.push({ id: uid(), empresa_id: d.empresa_id, tipo: d.tipo, prefijo: d.tipo === 'FV' ? 'FN' : d.tipo, desde: 1, hasta: 999999999, siguiente: 1, activa: true, electronica: false, resolucion: '', creado_en: ahora() });
      const n = numeracionPara(d, db.numeraciones);
      d.prefijo = n.prefijo || ''; d.numero = Number(n.siguiente); d.numeracion_id = n.id; d.estado = 'emitido'; d.emitido_en = ahora();
      n.siguiente = Number(n.siguiente) + 1;
      persist(); return { ...d };
    },
    async anular(id, motivo) {
      const d = db.documentos.find(x => x.id === id);
      if (!d || d.estado !== 'emitido') throw new Error('Solo se anulan documentos guardados.');
      if (d.electronica && d.tipo !== 'RC') throw new Error('Los documentos electrónicos no se anulan: se corrigen con una nota.');
      if (d.tipo === 'FV' && db.documentos.some(x => x.ref_id === id && x.estado === 'emitido')) throw new Error('La factura tiene notas crédito o débito. Anúlalas primero.');
      if (d.tipo === 'FV' && db.aplicaciones.some(a => a.factura_id === id && db.documentos.find(r => r.id === a.recibo_id)?.estado === 'emitido')) throw new Error('La factura tiene pagos. Anula primero los recibos de caja que la pagan.');
      d.estado = 'anulado'; d.anulado_motivo = motivo; d.anulado_en = ahora(); persist(); return { ...d };
    },
    async eliminar(id) {
      const d = db.documentos.find(x => x.id === id);
      revisarEliminar(d, db.documentos, db.aplicaciones, db.fe_envios || []);
      db.fe_envios = (db.fe_envios || []).filter(e => e.documento_id !== id);
      if (d.tipo === 'FV') {
        for (const b of db.documentos.filter(x => x.ref_id === id && x.estado === 'borrador')) await api.remove('documentos', b.id);
        db.aplicaciones = db.aplicaciones.filter(a => a.factura_id !== id);
      }
      const n = db.numeraciones.find(x => x.id === d.numeracion_id);
      if (n && Number(n.siguiente) === Number(d.numero) + 1 && Number(d.numero) >= Number(n.desde)) n.siguiente = Number(d.numero);
      await api.remove('documentos', id);
    },
    async importarDoc(doc, items) {
      if (db.documentos.some(x => x.empresa_id === doc.empresa_id && x.tipo === 'FV' && (x.prefijo || '') === (doc.prefijo || '') && Number(x.numero) === Number(doc.numero))) throw new Error(`La factura ${doc.prefijo || ''} ${doc.numero} ya existe.`);
      const d = await api.save('documentos', { ...doc, estado: 'emitido', emitido_en: ahora() });
      db.items.push(...items.map((it, i) => ({ ...it, id: uid(), documento_id: d.id, empresa_id: d.empresa_id, orden: i })));
      persist(); return d;
    },
    async listPerfiles() { return []; },
    async setPerfil() {},
    async guardarTema() {},
    async planesActivos() { return PLANES_DEMO; },
    async miPlan() { return null; },
    // Notificaciones leídas (en la demostración se reinician con los datos).
    async leidas() { return { ...(db.notif_leidas || {}) }; },
    async marcarLeidas(claves) { db.notif_leidas = db.notif_leidas || {}; const t = ahora(); for (const c of claves) db.notif_leidas[c] = t; persist(); },
    borrarDemo() { try { localStorage.removeItem(KEY); } catch (_) {} },
  };
  return api;
}

/* ---------- Modo Supabase ---------- */
const leidasLocal = () => { try { return JSON.parse(localStorage.getItem('agasoft-notif-leidas') || '{}'); } catch (_) { return {}; } };
function guardarLeidasLocal(claves, t) { const l = leidasLocal(); for (const c of claves) l[c] = t; try { localStorage.setItem('agasoft-notif-leidas', JSON.stringify(l)); } catch (_) { /* sin almacenamiento */ } }
function supabaseStore(url, key) {
  const sb = createClient(url, key);
  const ok = ({ data, error }) => { if (error) throw new Error(traducir(error.message)); return data; };
  // Supabase entrega máximo 1000 filas por consulta: se pide por páginas.
  async function todo(t, col, val) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = ok(await sb.from(t).select('*').eq(col, val).range(from, from + 999));
      out.push(...rows); if (rows.length < 1000) return out;
    }
  }
  const api = {
    mode: 'supabase', sb,
    async session() { const { data } = await sb.auth.getSession(); return data.session?.user || null; },
    async perfil() { const u = await api.session(); if (!u) return null; return ok(await sb.from('perfiles').select('*').eq('id', u.id).maybeSingle()); },
    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signUp(email, password, nombre) { return ok(await sb.auth.signUp({ email, password, options: { data: { nombre } } })); },
    async signOut() { await sb.auth.signOut(); },
    async listEmpresas() { return ok(await sb.from('empresas').select('*').order('nombre')); },
    async loadEmpresa(eid) { const r = await Promise.all(TABLAS.map(t => ['comprobantes', 'compras', 'empleados', 'nominas', 'fe_envios', 'bodegas', 'inventario_docs', 'centros_costo', 'op_tipos', 'op_elementos', 'op_tarifas', 'op_registros', 'op_cortes'].includes(t) ? todo(t, 'empresa_id', eid).catch(() => []) : todo(t, 'empresa_id', eid))); return Object.fromEntries(TABLAS.map((t, i) => [t, r[i]])); },
    async save(t, row) {
      const { id, creado_en, owner, ...campos } = row;
      if (id) return ok(await sb.from(t).update(campos).eq('id', id).select().single());
      return ok(await sb.from(t).insert(campos).select().single());
    },
    async saveMany(t, rows) { for (let i = 0; i < rows.length; i += 500) ok(await sb.from(t).insert(rows.slice(i, i + 500))); },
    async remove(t, id) {
      if (t === 'documentos') { ok(await sb.rpc('borrar_borrador', { p_id: id })); return; }
      ok(await sb.from(t).delete().eq('id', id));
    },
    async saveDoc(doc, items, apl) {
      const id = ok(await sb.rpc('guardar_documento', { p_doc: doc, p_items: items, p_apl: apl || [] }));
      return ok(await sb.from('documentos').select('*').eq('id', id).single());
    },
    async emitir(id) { ok(await sb.rpc('emitir_documento', { p_id: id })); return ok(await sb.from('documentos').select('*').eq('id', id).single()); },
    async anular(id, motivo) { ok(await sb.rpc('anular_recibo', { p_id: id, p_motivo: motivo })); return ok(await sb.from('documentos').select('*').eq('id', id).single()); },
    async eliminar(id) { ok(await sb.rpc('eliminar_documento', { p_id: id })); },
    async importarDoc(doc, items) { return ok(await sb.rpc('importar_documento', { p_doc: doc, p_items: items })); },
    async miPlan() { return ok(await sb.rpc('mi_plan')); },
    // Notificaciones leídas por el usuario. Sin la tabla (falta 031_notificaciones.sql) se guardan en este navegador.
    async leidas() {
      const loc = leidasLocal();
      const { data, error } = await sb.from('notificaciones_leidas').select('clave,leida_en');
      if (error) return loc;
      return { ...loc, ...Object.fromEntries((data || []).map(x => [x.clave, x.leida_en])) };
    },
    async marcarLeidas(claves) {
      const t = ahora(); guardarLeidasLocal(claves, t);
      if (claves.length) await sb.from('notificaciones_leidas').upsert(claves.map(clave => ({ clave, leida_en: t })), { onConflict: 'user_id,clave' });
    },
    // Facturación electrónica: la función de Supabase "fe-factus" habla con Factus con la cuenta de cada empresa.
    async fe(accion, datos = {}) {
      const { data, error } = await sb.functions.invoke('fe-factus', { body: { accion, ...datos } });
      if (error) { let m = error.message; try { const b = await error.context?.json?.(); if (b?.error) m = b.error; } catch (_) {} throw new Error(/Failed to send|not found|404/i.test(m) ? 'La función fe-factus no está desplegada en Supabase.' : m); }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    async planesActivos() { return ok(await sb.from('planes').select('*').eq('activo', true).order('orden').order('nombre')); },
    async guardarTema(t) { ok(await sb.rpc('guardar_tema', { p_tema: t })); },
    async solicitarPlan(id) { ok(await sb.rpc('solicitar_plan', { p_plan: id })); },
    async listPerfiles() { return ok(await sb.from('perfiles').select('*').order('creado_en', { ascending: false })); },
    async setPerfil(id, campos) { ok(await sb.from('perfiles').update(campos).eq('id', id)); },
  };
  return api;
}

const MSG = {
  'Invalid login credentials': 'Correo o clave incorrectos.',
  'Email not confirmed': 'Falta confirmar el correo: abre el enlace que te llegó al registrarte, o pídele al administrador que lo confirme.',
  'User already registered': 'Ese correo ya tiene cuenta. Entra con tu clave.',
  'duplicate key value violates unique constraint': 'Ya existe un registro con ese número.',
  'new row violates row-level security policy': 'No tienes permiso para hacer eso en esta empresa.',
  'Password should be at least 6 characters': 'La clave debe tener al menos 8 caracteres.',
};
function traducir(m) { for (const [k, v] of Object.entries(MSG)) if (String(m).includes(k)) return v; return m; }

function crearStore() {
  const raw = String(import.meta.env?.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const url = !raw ? '' : raw.includes('://') ? raw : raw.includes('.') ? 'https://' + raw : `https://${raw}.supabase.co`;
  const key = String(import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();
  // www.agasoft.co/demo abre siempre la demostración (datos solo en el navegador), aunque haya Supabase.
  const demo = typeof location !== 'undefined' && /^\/demo\/?$/.test(location.pathname);
  return url && key && !demo ? supabaseStore(url, key) : localStore({ publico: demo });
}

export { crearStore, numeracionPara, motivoNoEliminar, envioValidado };
