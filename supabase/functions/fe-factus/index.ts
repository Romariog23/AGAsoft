// Edge Function "fe-factus": puente entre AGAsoft y Factus (proveedor tecnológico autorizado por la DIAN).
// Cada empresa tiene su propia cuenta en Factus. Sus credenciales se guardan en la tabla fe_cuentas, que solo
// lee esta función con la llave de servicio: el navegador nunca las vuelve a ver.
// Acciones:
//   { accion: 'cuenta', empresa_id, ambiente, usuario, clave, client_id, client_secret } → guarda la cuenta y la prueba.
//   { accion: 'probar', empresa_id }                                                   → prueba la cuenta y trae los rangos.
//   { accion: 'enviar', documento_id, tipo, body }                                     → envía un documento emitido.
// Secretos opcionales: FACTUS_URL_PRODUCCION (por defecto https://api.factus.com.co), FACTUS_URL_PRUEBAS,
// FACTUS_CLIENT_ID y FACTUS_CLIENT_SECRET (si Factus te da un client_id único de integrador).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { MUNICIPIOS } from './municipios.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URLS: Record<string, string> = {
  pruebas: (Deno.env.get('FACTUS_URL_PRUEBAS') || 'https://api-sandbox.factus.com.co').replace(/\/+$/, ''),
  produccion: (Deno.env.get('FACTUS_URL_PRODUCCION') || 'https://api.factus.com.co').replace(/\/+$/, ''),
};
const RUTA: Record<string, string> = { FV: '/v2/bills/validate', NC: '/v2/credit-notes/validate', ND: '/v2/debit-notes/validate' };
const BORRAR: Record<string, string> = { FV: '/v2/bills/destroy/reference/', NC: '/v2/credit-notes/reference/', ND: '/v2/debit-notes/reference/' };

type Cuenta = { ambiente: string; usuario: string; clave: string; client_id: string; client_secret: string };

async function token(c: Cuenta) {
  const base = URLS[c.ambiente];
  if (!base) throw new Error('Falta el secreto FACTUS_URL_PRODUCCION en Supabase (la dirección de producción que te da Factus).');
  const f = new URLSearchParams({ grant_type: 'password', client_id: c.client_id || Deno.env.get('FACTUS_CLIENT_ID') || '', client_secret: c.client_secret || Deno.env.get('FACTUS_CLIENT_SECRET') || '', username: c.usuario, password: c.clave });
  const r = await fetch(base + '/oauth/token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: f });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Factus no aceptó las credenciales (HTTP ${r.status}). Revisa el correo, la contraseña, el client_id y el client_secret.`);
  return { base, tk: d.access_token as string };
}
async function factus(t: { base: string; tk: string }, path: string, init: RequestInit = {}) {
  const r = await fetch(t.base + path, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${t.tk}`, ...(init.headers || {}) } });
  const txt = await r.text();
  let data: any; try { data = JSON.parse(txt); } catch { data = { raw: txt.slice(0, 2000) }; }
  return { status: r.status, data };
}
const lista = (d: any): any[] => Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.data?.data) ? d.data.data : [];
// Código DANE del municipio, por nombre (y departamento si hay dos con el mismo nombre). Factus no tiene catálogo en la API v2.
const MUN = MUNICIPIOS.split(';').map(x => x.split('|'));
function municipio(ciudad: string, depto: string) {
  const n = norm(ciudad), d = norm(depto);
  if (!n) return '';
  if (/^\d{5}$/.test(String(ciudad).trim())) return String(ciudad).trim();
  let c = MUN.filter(x => norm(x[1]) === n);
  if (!c.length) c = MUN.filter(x => norm(x[1]).startsWith(n) || n.startsWith(norm(x[1])));
  const m = c.find(x => d && (norm(x[2]) === d || norm(x[2]).startsWith(d) || d.startsWith(norm(x[2])))) || (c.length === 1 || !d ? c[0] : null);
  return m ? m[0] : '';
}
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const digitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
// Sin los archivos en base64: el historial guarda solo lo necesario.
const recortar = (v: any): any => Array.isArray(v) ? v.map(recortar) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && x.length > 4000 ? `(${x.length} caracteres omitidos)` : recortar(x)])) : v;
// Mensajes de error de Factus: vienen en errors (objeto o arreglo), data.errors o message.
function errores(d: any): string[] {
  const out: string[] = [];
  const add = (x: any, k = '') => { if (x == null) return; if (Array.isArray(x)) x.forEach(y => add(y, k)); else if (typeof x === 'object') Object.entries(x).forEach(([kk, y]) => add(y, kk)); else out.push((k && !/^\d+$/.test(k) ? `${k}: ` : '') + String(x)); };
  add(d?.data?.errors); add(d?.errors);
  return [...new Set(out)].slice(0, 30);
}
// Respuesta de validación: Factus la manda en data o dentro de data.credit_note / data.debit_note / data.bill.
// Validado = is_validated en true (en cualquiera de los dos niveles) y con CUFE.
function leerFactus(resp: any) {
  const d0 = resp?.data && typeof resp.data === 'object' ? resp.data : {};
  const de = [d0.credit_note, d0.debit_note, d0.bill].find(v => v && typeof v === 'object') || {};
  const data = { ...d0, ...de, links: { ...(d0.links || {}), ...(de.links || {}) } };
  delete data.credit_note; delete data.debit_note; delete data.bill;
  const cufe = String(data.cufe || data.cude || '');
  const ok = (de.is_validated === true || d0.is_validated === true) && !!cufe;
  return { ok, cufe, numero: String(data.number || ''), pdf: data.links?.public_url || '', data };
}
const esFactura = (r: any) => /factura/i.test(String(r.document ?? '')) || String(r.document) === '21';
const esTipo = (r: any, tipo: string) => tipo === 'FV' ? esFactura(r) : tipo === 'NC' ? /cr[eé]dito/i.test(String(r.document)) || String(r.document) === '22' : /d[eé]bito/i.test(String(r.document)) || String(r.document) === '23';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const auth = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const srv = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: 'Inicia sesión.' }, 401);
    const p = await req.json().catch(() => ({}));
    const leerCuenta = async (eid: string) => { const { data } = await srv.from('fe_cuentas').select('*').eq('empresa_id', eid).maybeSingle(); return data as Cuenta | null; };

    if (p.accion === 'cuenta' || p.accion === 'probar') {
      const eid = p.empresa_id;
      const [{ data: dueno }, { data: admin }] = await Promise.all([sb.rpc('es_dueno', { eid }), sb.rpc('es_admin')]);
      if (!dueno && !admin) return json({ error: 'Solo el dueño de la empresa puede conectar la facturación electrónica.' }, 403);
      const { data: emp } = await srv.from('empresas').select('id, nit, nombre, contabilidad').eq('id', eid).single();
      if (!emp) return json({ error: 'No encontré la empresa.' }, 404);
      if (p.accion === 'cuenta') {
        const prev = await leerCuenta(eid);
        const fila = { empresa_id: eid, proveedor: 'factus', ambiente: p.ambiente === 'produccion' ? 'produccion' : 'pruebas', usuario: String(p.usuario || '').trim(),
          clave: String(p.clave || '') || prev?.clave || '', client_id: String(p.client_id || '').trim() || prev?.client_id || '', client_secret: String(p.client_secret || '') || prev?.client_secret || '', actualizado: new Date().toISOString() };
        if (!fila.usuario || !fila.clave) return json({ error: 'Escribe el correo y la contraseña de la cuenta de Factus.' }, 400);
        const { error } = await srv.from('fe_cuentas').upsert(fila);
        if (error) return json({ error: /fe_cuentas/.test(error.message) ? 'Falta correr en Supabase el archivo supabase/024_factus.sql.' : error.message }, 500);
      }
      const c = await leerCuenta(eid);
      if (!c) return json({ error: 'Primero guarda la cuenta de Factus.' }, 400);
      const conta = emp.contabilidad || {};
      const guardar = async (hab: Record<string, unknown>, habilitada?: boolean) => {
        const nuevo = { ...conta, fe_hab: { proveedor: 'factus', ambiente: c.ambiente, usuario: c.usuario, ...hab, actualizado: new Date().toISOString() }, ...(habilitada ? { fe_habilitada: true, fe_activa: true } : {}) };
        await srv.from('empresas').update({ contabilidad: nuevo }).eq('id', eid);
        return nuevo.fe_hab;
      };
      let t;
      try { t = await token(c); } catch (e) { return json({ hab: await guardar({ estado: 'error', mensaje: (e as Error).message, rangos: [] }) }); }
      const [ce, rg] = await Promise.all([factus(t, '/v2/companies'), factus(t, '/v2/numbering-ranges?filter[is_active]=1')]);
      const co = ce.data?.data || {};
      const nitF = digitos(co.nit ?? co.identification ?? co.company?.nit ?? '');
      const rangos = lista(rg.data).map((r: any) => ({ id: r.id, documento: String(r.document ?? ''), prefijo: String(r.prefix ?? ''), resolucion: String(r.resolution_number ?? ''), desde: r.from, hasta: r.to, actual: r.current, vence: r.end_date || '', activo: r.is_active !== false && !r.is_expired }));
      const empresa_factus = { nit: nitF, nombre: String(co.company ?? co.name ?? co.business_name ?? co.trade_name ?? '') };
      // En producción la cuenta debe ser de la misma empresa (el sandbox de Factus es compartido y usa otra empresa).
      if (c.ambiente === 'produccion' && nitF && nitF !== digitos(emp.nit)) return json({ hab: await guardar({ estado: 'error', mensaje: `La cuenta de Factus es del NIT ${nitF}, no del de esta empresa (${emp.nit}).`, empresa_factus, rangos }) });
      const conFactura = rangos.some(r => r.activo && esFactura({ document: r.documento }));
      if (c.ambiente === 'produccion' && conFactura) {
        const hab = await guardar({ estado: 'aprobado', mensaje: 'Factus confirmó la cuenta de producción con una numeración de facturas activa. La empresa ya puede facturar electrónicamente.', empresa_factus, rangos }, true);
        return json({ hab, habilitada: true });
      }
      const msg = c.ambiente === 'produccion' ? 'La cuenta funciona, pero Factus todavía no tiene una numeración de facturas activa. Cuando Factus termine la habilitación y asocie tu resolución, vuelve a probar.' : 'Conectado al ambiente de pruebas de Factus (compartido). Sirve para ensayar envíos; para facturar de verdad cambia a producción cuando Factus active tu cuenta.';
      return json({ hab: await guardar({ estado: c.ambiente === 'produccion' ? 'pendiente' : 'pruebas', mensaje: msg, empresa_factus, rangos }) });
    }

    if (p.accion === 'enviar') {
      const { data: doc, error } = await sb.from('documentos').select('id, empresa_id, tipo, estado, electronica, numero, prefijo').eq('id', p.documento_id).single();
      if (error || !doc) return json({ error: 'No encontré el documento.' }, 404);
      const { data: puede } = await sb.rpc('puede_editar', { eid: doc.empresa_id });
      if (!puede) return json({ error: 'No tienes permiso para enviar documentos de esta empresa.' }, 403);
      if (!doc.electronica || doc.estado !== 'emitido') return json({ error: 'Solo se envían documentos electrónicos emitidos.' }, 400);
      if (p.tipo !== doc.tipo || !RUTA[doc.tipo]) return json({ error: 'El tipo de documento no coincide.' }, 400);
      const ref = `${doc.tipo}-${doc.prefijo || ''}${doc.numero}`;
      if (p.body?.reference_code !== ref) return json({ error: 'El número del documento no coincide.' }, 400);
      const { data: ya } = await sb.from('fe_envios').select('id').eq('documento_id', doc.id).eq('estado', 'aceptado').limit(1);
      if (ya?.length) return json({ error: 'Este documento ya fue aceptado por la DIAN.' }, 409);
      const c = await leerCuenta(doc.empresa_id);
      if (!c) return json({ error: 'La empresa no tiene cuenta de Factus. Conéctala en Factura electrónica.' }, 400);
      const t = await token(c), body = p.body, avisos: string[] = [];
      // Municipio: Factus pide el código DANE; se busca por nombre (y departamento) en su catálogo.
      const mu = body.customer?._municipio; if (body.customer) delete body.customer._municipio;
      if (mu?.ciudad) {
        const m = municipio(mu.ciudad, mu.departamento);
        if (m) body.customer.municipality_code = m; else avisos.push(`No encontré el municipio ${mu.ciudad} en el catálogo de Factus.`);
      }
      // Rango de numeración: el de Factus con el mismo prefijo; en pruebas, el primero activo del tipo.
      const rangos = lista((await factus(t, '/v2/numbering-ranges?filter[is_active]=1')).data).filter((r: any) => esTipo(r, doc.tipo));
      const rg = rangos.find((r: any) => String(r.prefix || '') === String(doc.prefijo || '')) || (c.ambiente === 'pruebas' ? rangos[0] : null);
      if (rg) body.numbering_range_id = rg.id;
      else if (rangos.length) return json({ error: `En Factus no hay una numeración activa con el prefijo ${doc.prefijo || '(sin prefijo)'}. Pídele a Factus que asocie esa resolución o ajusta el prefijo en Numeraciones.` }, 400);
      // Si un envío anterior quedó marcado como rechazado pero Factus sí lo validó (respuesta anidada), se recupera sin reenviar.
      const { data: previos } = await sb.from('fe_envios').select('respuesta, ambiente').eq('documento_id', doc.id).order('creado_en', { ascending: false }).limit(5);
      const rec = (previos || []).map((e: any) => ({ e, x: leerFactus(e.respuesta) })).find(o => o.x.ok);
      if (rec) {
        const l = { estado: 'aceptado', cufe: rec.x.cufe, mensaje: String(rec.e.respuesta?.message || 'Validado por la DIAN.'), errores: errores(rec.e.respuesta), pdf: rec.x.pdf };
        const fila = { empresa_id: doc.empresa_id, documento_id: doc.id, ambiente: rec.e.ambiente || c.ambiente, ...l, respuesta: { ...rec.e.respuesta, data: rec.x.data } };
        const { data: guardado, error: e2 } = await sb.from('fe_envios').insert(fila).select().single();
        return json({ ...l, avisos, http: 200, numero: rec.x.numero, envio: guardado, error_guardar: e2?.message || null });
      }
      let r = await factus(t, RUTA[doc.tipo], { method: 'POST', body: JSON.stringify(body) });
      // 409: quedó uno sin validar con la misma referencia (un rechazo anterior). Se borra y se crea de nuevo.
      if (r.status === 409) { await factus(t, BORRAR[doc.tipo] + encodeURIComponent(ref), { method: 'DELETE' }); r = await factus(t, RUTA[doc.tipo], { method: 'POST', body: JSON.stringify(body) }); }
      const x = leerFactus(r.data), ok = r.status < 300 && x.ok;
      const l = { estado: ok ? 'aceptado' : r.status < 300 ? 'rechazado' : 'error', cufe: x.cufe, mensaje: String(r.data?.message || (r.status >= 300 ? `Factus respondió ${r.status}` : '')), errores: errores(r.data), pdf: x.pdf };
      if (ok && rg && x.numero !== `${doc.prefijo || ''}${doc.numero}`) avisos.push(`Factus numeró el documento como ${x.numero}.`);
      // respuesta.data queda plana (número, CUFE, links) aunque Factus la mande dentro de credit_note / debit_note / bill.
      const fila = { empresa_id: doc.empresa_id, documento_id: doc.id, ambiente: c.ambiente, ...l, respuesta: recortar(r.data && typeof r.data === 'object' ? { ...r.data, data: x.data } : r.data) };
      const { data: guardado, error: e2 } = await sb.from('fe_envios').insert(fila).select().single();
      return json({ ...l, avisos, http: r.status, numero: x.numero, envio: guardado, error_guardar: e2?.message || null });
    }
    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
