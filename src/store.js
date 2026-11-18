// Capa de datos. Dos modos con las mismas funciones:
//  - "supabase": datos en la nube, con usuarios y permisos (producción).
//  - "local": datos solo en este navegador, para probar sin configurar nada (modo demostración).
import { createClient } from '@supabase/supabase-js';

const TABLAS = ['cuentas', 'terceros', 'productos', 'numeraciones', 'documentos', 'items', 'aplicaciones', 'miembros', 'comprobantes', 'compras'];
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

// Facturas y notas normales (no electrónicas) se pueden eliminar aunque estén emitidas. Devuelve el motivo si no se puede.
function motivoNoEliminar(d, documentos, aplicaciones) {
  if (!d) return 'Documento no encontrado.';
  if (!['FV', 'NC', 'ND'].includes(d.tipo)) return 'Los recibos de caja no se eliminan: se anulan.';
  if (d.electronica && d.estado !== 'borrador') return 'Las facturas y notas electrónicas no se eliminan: se corrigen con una nota.';
  if (d.tipo === 'FV') {
    if (documentos.some(x => x.ref_id === d.id && x.estado !== 'borrador')) return 'La factura tiene notas crédito o débito. Elimínalas primero.';
    const rc = new Set(documentos.filter(x => x.tipo === 'RC' && x.estado === 'emitido').map(x => x.id));
    if (aplicaciones.some(a => a.factura_id === d.id && rc.has(a.recibo_id))) return 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.';
  }
  return '';
}
function revisarEliminar(d, documentos, aplicaciones) { const m = motivoNoEliminar(d, documentos, aplicaciones); if (m) throw new Error(m); }

/* ---------- Modo local ---------- */
function localStore() {
  const KEY = 'agasoft-demo-v1';
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { db = null; }
  if (!db) db = { empresas: [], ...Object.fromEntries(TABLAS.map(t => [t, []])) };
  for (const t of ['empresas', ...TABLAS]) db[t] = db[t] || [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* sin almacenamiento: queda en memoria */ } };
  const user = { id: 'demo', email: 'demo@agasoft.local' };
  const api = {
    mode: 'local',
    async session() { return user; },
    async perfil() { return { id: 'demo', nombre: 'Modo demostración', es_admin: true, aprobado: true }; },
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
      persist();
    },
    async saveDoc(doc, items, apl) {
      const prev = doc.id && db.documentos.find(d => d.id === doc.id);
      if (prev && prev.estado !== 'borrador') throw new Error('Solo se pueden modificar borradores.');
      const d = await api.save('documentos', { ...doc, estado: 'borrador' });
      db.items = db.items.filter(r => r.documento_id !== d.id).concat(items.map((it, i) => ({ ...it, id: uid(), documento_id: d.id, empresa_id: d.empresa_id, orden: i })));
      db.aplicaciones = db.aplicaciones.filter(r => r.recibo_id !== d.id).concat((apl || []).map(a => ({ ...a, id: uid(), recibo_id: d.id, empresa_id: d.empresa_id })));
      persist(); return d;
    },
    async emitir(id) {
      const d = db.documentos.find(x => x.id === id);
      if (!d || d.estado !== 'borrador') throw new Error('El documento ya no es un borrador.');
      if (d.tipo === 'NC' || d.tipo === 'ND') d.electronica = !!db.documentos.find(x => x.id === d.ref_id)?.electronica;
      if (d.tipo === 'RC') d.electronica = false;
      const n = numeracionPara(d, db.numeraciones);
      d.prefijo = n.prefijo || ''; d.numero = Number(n.siguiente); d.numeracion_id = n.id; d.estado = 'emitido'; d.emitido_en = ahora();
      n.siguiente = Number(n.siguiente) + 1;
      persist(); return { ...d };
    },
    async anular(id, motivo) {
      const d = db.documentos.find(x => x.id === id);
      if (!d || d.tipo !== 'RC' || d.estado !== 'emitido') throw new Error('Solo se pueden anular recibos de caja emitidos.');
      d.estado = 'anulado'; d.anulado_motivo = motivo; d.anulado_en = ahora(); persist(); return { ...d };
    },
    async eliminar(id) {
      const d = db.documentos.find(x => x.id === id);
      revisarEliminar(d, db.documentos, db.aplicaciones);
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
    borrarDemo() { try { localStorage.removeItem(KEY); } catch (_) {} },
  };
  return api;
}

/* ---------- Modo Supabase ---------- */
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
    async signUp(email, password, nombre) { ok(await sb.auth.signUp({ email, password, options: { data: { nombre } } })); },
    async signOut() { await sb.auth.signOut(); },
    async listEmpresas() { return ok(await sb.from('empresas').select('*').order('nombre')); },
    async loadEmpresa(eid) { const r = await Promise.all(TABLAS.map(t => ['comprobantes', 'compras'].includes(t) ? todo(t, 'empresa_id', eid).catch(() => []) : todo(t, 'empresa_id', eid))); return Object.fromEntries(TABLAS.map((t, i) => [t, r[i]])); },
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
  return url && key ? supabaseStore(url, key) : localStore();
}

export { crearStore, numeracionPara, motivoNoEliminar };
