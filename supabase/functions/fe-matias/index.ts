// Edge Function "fe-matias": puente entre AGAsoft y MATIAS API (facturación electrónica DIAN).
// El token de MATIAS vive en los secretos de Supabase (MATIAS_URL, MATIAS_TOKEN) y nunca llega al navegador.
// Acciones:
//   { accion: 'probar' }                               → solo administrador: prueba el token y muestra los catálogos.
//   { accion: 'enviar', documento_id, ruta, body }     → envía un documento emitido y guarda el resultado en fe_envios.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const RUTAS = ['/invoice', '/notes/credit', '/notes/debit'];
const TIPO_RUTA: Record<string, string> = { FV: '/invoice', NC: '/notes/credit', ND: '/notes/debit' };

const MATIAS_URL = (Deno.env.get('MATIAS_URL') || '').replace(/\/+$/, '');
const MATIAS_TOKEN = Deno.env.get('MATIAS_TOKEN') || '';
const ambiente = MATIAS_URL.includes('sandbox') ? 'pruebas' : 'produccion';

async function matias(path: string, init: RequestInit = {}, clientUuid = '') {
  const u = new URL(MATIAS_URL + path);
  if (clientUuid) u.searchParams.set('client_uuid', clientUuid);
  const r = await fetch(u, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${MATIAS_TOKEN}`, ...(init.headers || {}) } });
  const txt = await r.text();
  let data: any; try { data = JSON.parse(txt); } catch { data = { raw: txt.slice(0, 2000) }; }
  return { status: r.status, data };
}

// Los catálogos pueden venir como arreglo o dentro de data / dataRecords.data / records.
const lista = (d: any): any[] => Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.dataRecords?.data) ? d.dataRecords.data : Array.isArray(d?.dataRecords) ? d.dataRecords : Array.isArray(d?.records) ? d.records : Array.isArray(d?.data?.data) ? d.data.data : [];
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cache: Record<string, any[]> = {};
async function catalogo(path: string) { if (!cache[path]) cache[path] = lista((await matias(path)).data); return cache[path]; }

async function resolverIds(body: any) {
  const c = body?.customer; if (!c?._dian) return [];
  const avisos: string[] = [], d = c._dian; delete c._dian;
  const docs = await catalogo('/identity-documents');
  const td = docs.find(x => [x.code, x.codigo, x.dian_code, x.code_dian].map(String).includes(String(d.identity_document)));
  if (td) c.identity_document_id = td.id; else avisos.push(`No encontré el tipo de documento ${d.identity_document} en el catálogo de MATIAS.`);
  if (d.city) {
    const ciudades = await catalogo('/cities');
    const n = norm(d.city), dep = norm(d.department);
    const cand = ciudades.filter(x => norm(x.name ?? x.nombre ?? x.city_name) === n);
    const ci = cand.find(x => !dep || [x.department?.name, x.department_name, x.departamento, x.state?.name].some(v => norm(v) === dep)) || cand[0];
    if (ci) { c.city_id = ci.id; if (!body.customer.postal_code && (ci.postal_code || ci.zip)) c.postal_code = String(ci.postal_code || ci.zip); }
    else avisos.push(`No encontré el municipio ${d.city} en el catálogo de MATIAS.`);
  }
  return avisos;
}

// Sin los archivos en base64 (XML, ZIP): el historial guarda solo lo necesario.
const recortar = (v: any): any => Array.isArray(v) ? v.map(recortar) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && x.length > 4000 ? `(${x.length} caracteres omitidos)` : recortar(x)])) : v;
function leer(r: any) {
  const res = r?.response || r?.ResponseDian || {};
  const ok = String(res.IsValid ?? r?.IsValid ?? '').toLowerCase() === 'true' && String(res.StatusCode ?? r?.StatusCode ?? '') === '00';
  const errores = [].concat(res.ErrorMessage?.string || res.ErrorMessage || r?.errors || []).flat().map((x: any) => typeof x === 'string' ? x : JSON.stringify(x)).filter(Boolean);
  return { estado: ok ? 'aceptado' : 'rechazado', cufe: res.XmlDocumentKey || r?.XmlDocumentKey || '', mensaje: String(res.StatusDescription || res.StatusMessage || r?.message || ''), errores, pdf: r?.pdf?.url || r?.pdf?.path || '' };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (!MATIAS_URL || !MATIAS_TOKEN) return json({ error: 'Faltan los secretos MATIAS_URL y MATIAS_TOKEN en Supabase (Edge Functions → Secrets).' }, 500);
    const auth = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: 'Inicia sesión.' }, 401);
    const p = await req.json().catch(() => ({}));

    if (p.accion === 'probar') {
      const { data: admin } = await sb.rpc('es_admin');
      if (!admin) return json({ error: 'Solo el administrador puede probar la conexión.' }, 403);
      const yo = await matias('/auth/user');
      const muestra: Record<string, unknown> = {};
      for (const path of ['/identity-documents', '/cities', '/payment-means', '/tax-level', '/accounting-regime', '/correction-notes']) {
        const r = await matias(path); const l = lista(r.data);
        muestra[path] = { http: r.status, total: l.length, ejemplos: l.slice(0, path === '/cities' ? 3 : 12), ...(l.length ? {} : { respuesta: r.data }) };
      }
      return json({ ambiente, conexion: yo.status === 200 ? 'ok' : 'error', http: yo.status, cuenta: yo.data, catalogos: muestra });
    }

    if (p.accion === 'enviar') {
      const { data: doc, error } = await sb.from('documentos').select('id, empresa_id, tipo, estado, electronica, numero, prefijo').eq('id', p.documento_id).single();
      if (error || !doc) return json({ error: 'No encontré el documento.' }, 404);
      const { data: puede } = await sb.rpc('puede_editar', { eid: doc.empresa_id });
      if (!puede) return json({ error: 'No tienes permiso para enviar documentos de esta empresa.' }, 403);
      if (!doc.electronica || doc.estado !== 'emitido') return json({ error: 'Solo se envían documentos electrónicos emitidos.' }, 400);
      if (p.ruta !== TIPO_RUTA[doc.tipo] || !RUTAS.includes(p.ruta)) return json({ error: 'El tipo de documento no coincide.' }, 400);
      if (Number(p.body?.document_number) !== Number(doc.numero) || String(p.body?.prefix || '') !== String(doc.prefijo || '')) return json({ error: 'El número del documento no coincide.' }, 400);
      const { data: ya } = await sb.from('fe_envios').select('id').eq('documento_id', doc.id).eq('estado', 'aceptado').limit(1);
      if (ya?.length) return json({ error: 'Este documento ya fue aceptado por la DIAN.' }, 409);
      const { data: emp } = await sb.from('empresas').select('fe_client_uuid').eq('id', doc.empresa_id).single();
      const avisos = await resolverIds(p.body);
      const r = await matias(p.ruta, { method: 'POST', body: JSON.stringify(p.body) }, emp?.fe_client_uuid || '');
      const l = r.status === 200 || r.status === 201 ? leer(r.data) : { estado: 'error', cufe: '', mensaje: `MATIAS respondió ${r.status}`, errores: [].concat(r.data?.errors ? Object.values(r.data.errors).flat() as any : r.data?.message || []).map(String), pdf: '' };
      const fila = { empresa_id: doc.empresa_id, documento_id: doc.id, ambiente, ...l, respuesta: recortar(r.data) };
      const { data: guardado, error: e2 } = await sb.from('fe_envios').insert(fila).select().single();
      return json({ ...l, avisos, http: r.status, envio: guardado, error_guardar: e2?.message || null });
    }
    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
