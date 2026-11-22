// Panel del administrador de AGAsoft (/admin): cuentas, planes y uso.
// Entra con su propio login y solo deja pasar al administrador. Los límites de cada plan los hace cumplir la base de datos.
import './style.css';
import { crearStore } from './store.js';

const store = crearStore();
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const money = v => COP.format(Number(v) || 0);
const hoy = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const fFecha = f => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = err ? 'bad' : ''; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, err ? 6000 : 3500); }
const fail = e => toast(e?.message || String(e), true);

/* ---------- Datos: Supabase, o una demostración local para probar el panel ---------- */
function apiNube(sb) {
  const ok = ({ data, error }) => { if (error) throw new Error(/exist|schema|find/i.test(error.message) && /admin_eliminar_cuenta/.test(error.message) ? 'Falta correr en Supabase el archivo supabase/011_eliminar_cuenta.sql.' : /exist|schema|find/i.test(error.message) && /admin_cuentas|planes/.test(error.message) ? 'Falta correr en Supabase el archivo supabase/009_planes.sql.' : error.message); return data; };
  return {
    async cuentas() { return ok(await sb.rpc('admin_cuentas')); },
    async planes() { return ok(await sb.from('planes').select('*').order('orden').order('nombre')); },
    async guardarPlan(p) { const { id, creado_en, ...c } = p; return id ? ok(await sb.from('planes').update(c).eq('id', id)) : ok(await sb.from('planes').insert(c)); },
    async borrarPlan(id) { ok(await sb.from('planes').delete().eq('id', id)); },
    async empresas() { return ok(await sb.from('empresas').select('id, nombre, nit, dv, owner, creado_en').order('nombre')); },
    async cambiarDueno(eid, owner) { ok(await sb.from('empresas').update({ owner }).eq('id', eid)); },
    async setCuenta(id, campos) { ok(await sb.from('perfiles').update(campos).eq('id', id)); },
    async eliminarCuenta(id) { ok(await sb.rpc('admin_eliminar_cuenta', { p_id: id })); },
  };
}
function apiDemo() {
  const KEY = 'agasoft-admin-demo';
  let db; try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { db = null; }
  const id = () => Math.random().toString(36).slice(2);
  if (!db) {
    const planes = [
      { id: 'p1', nombre: 'Básico', precio_mensual: 49900, max_empresas: 1, max_documentos_mes: 100, max_usuarios: 1, descripcion: 'Una contabilidad, hasta 100 documentos al mes.', activo: true, orden: 1 },
      { id: 'p2', nombre: 'Profesional', precio_mensual: 119900, max_empresas: 5, max_documentos_mes: 1000, max_usuarios: 3, descripcion: 'Hasta 5 contabilidades y 3 personas con acceso.', activo: true, orden: 2 },
      { id: 'p3', nombre: 'Contador', precio_mensual: 249900, max_empresas: 30, max_documentos_mes: 5000, max_usuarios: 10, descripcion: 'Para contadores con varias empresas cliente.', activo: true, orden: 3 },
    ];
    const c = (nombre, correo, x) => ({ id: id(), nombre, correo, es_admin: false, aprobado: true, suspendido: false, plan_id: null, plan_vence: null, notas: '', creado_en: new Date().toISOString(), empresas: 0, documentos_mes: 0, usuarios: 0, ultimo_documento: null, prueba_hasta: null, plan_solicitado: null, solicitado_en: null, ...x });
    const dias = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    db = { planes, cuentas: [
      c('Administrador', 'admin@agasoft.co', { es_admin: true, empresas: 3, documentos_mes: 42 }),
      c('Contadores Asociados', 'contador@ejemplo.co', { plan_id: 'p3', plan_vence: '2027-01-31', empresas: 12, documentos_mes: 830, usuarios: 4, ultimo_documento: hoy() }),
      c('Ferretería La 30', 'gerencia@ferre30.co', { plan_id: 'p1', plan_vence: '2026-12-15', empresas: 1, documentos_mes: 97, usuarios: 1, ultimo_documento: hoy() }),
      c('Distribuidora Norte', 'admin@dnorte.co', { plan_id: 'p2', plan_vence: '2026-11-10', empresas: 2, documentos_mes: 120, usuarios: 2 }),
      c('Panadería Doña Rosa', 'rosa@panaderia.co', { prueba_hasta: dias(9), empresas: 1, documentos_mes: 23, ultimo_documento: hoy() }),
      c('Taller El Pistón', 'piston@taller.co', { prueba_hasta: dias(-2), plan_solicitado: 'p1', solicitado_en: new Date().toISOString(), empresas: 1, documentos_mes: 31 }),
      c('Inversiones Caribe', 'info@icaribe.co', { prueba_hasta: dias(-5), empresas: 1, documentos_mes: 4 }),
    ] };
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {} };
  return {
    async cuentas() { return db.cuentas.map(x => ({ ...x })); },
    async planes() { return [...db.planes].sort((a, b) => a.orden - b.orden); },
    async guardarPlan(p) { if (p.id) Object.assign(db.planes.find(x => x.id === p.id), p); else db.planes.push({ ...p, id: id() }); save(); },
    async borrarPlan(pid) { db.planes = db.planes.filter(x => x.id !== pid); save(); },
    async setCuenta(cid, campos) { Object.assign(db.cuentas.find(x => x.id === cid), campos); save(); },
    async eliminarCuenta(cid) { db.cuentas = db.cuentas.filter(x => x.id !== cid); save(); },
    async empresas() {
      if (!db.empresas) { const a = db.cuentas.find(c => c.es_admin), f = db.cuentas.find(c => /ferre/i.test(c.correo)) || db.cuentas[1];
        db.empresas = [{ id: id(), nombre: 'GMAQ S.A.S.', nit: '901234567', dv: '1', owner: a.id }, { id: id(), nombre: 'Comercializadora Ejemplo S.A.S.', nit: '900123456', dv: '8', owner: a.id }, { id: id(), nombre: 'Ferretería La 30', nit: '800765432', dv: '3', owner: f.id }]; save(); }
      return db.empresas.map(x => ({ ...x }));
    },
    async cambiarDueno(eid, owner) { db.empresas.find(x => x.id === eid).owner = owner; save(); },
  };
}
const api = store.mode === 'supabase' ? apiNube(store.sb) : apiDemo();

/* ---------- Entrada ---------- */
async function iniciar() {
  if (store.mode === 'local') return entrar({ nombre: 'Modo demostración' });
  const u = await store.session();
  if (!u) return pedirLogin();
  const p = await store.perfil();
  if (!p?.es_admin || !p?.aprobado || p?.suspendido) { await store.signOut(); return pedirLogin('Esta cuenta no es administradora de AGAsoft.'); }
  entrar(p);
}
function pedirLogin(msg) {
  $('auth').hidden = false; $('app').hidden = true;
  if (msg) { $('eAuth').textContent = msg; $('eAuth').hidden = false; }
}
$('authForm').onsubmit = async ev => {
  ev.preventDefault(); $('eAuth').hidden = true; $('aSubmit').disabled = true;
  try { await store.signIn($('aEmail').value.trim(), $('aPass').value); await iniciar(); }
  catch (e) { $('eAuth').textContent = e.message; $('eAuth').hidden = false; }
  finally { $('aSubmit').disabled = false; }
};
$('salir').onclick = async () => { await store.signOut(); location.reload(); };

let S = { tab: 'cuentas', filtro: '', cuentas: [], planes: [], empresas: [] };
async function entrar(p) {
  $('auth').hidden = true; $('app').hidden = false;
  $('who').textContent = p.nombre || p.correo || '';
  $('salir').hidden = store.mode === 'local';
  await cargar();
}
async function cargar() {
  try { [S.cuentas, S.planes, S.empresas] = await Promise.all([api.cuentas(), api.planes(), api.empresas()]); pintar(); }
  catch (e) { $('main').innerHTML = `<section class="panel"><p class="err">${esc(e.message)}</p></section>`; }
}

/* ---------- Estado y uso de cada cuenta ---------- */
const planDe = c => S.planes.find(p => p.id === c.plan_id);
const pedidoDe = c => c.plan_solicitado && S.planes.find(p => p.id === c.plan_solicitado);
const diasA = f => Math.max(0, Math.round((new Date(f + 'T12:00:00') - new Date(hoy() + 'T12:00:00')) / 864e5));
const en15 = () => new Date(new Date(hoy() + 'T12:00:00').getTime() + 15 * 864e5).toISOString().slice(0, 10);
const enPrueba = c => !!c.prueba_hasta && c.prueba_hasta >= hoy();
// Por aprobar: registros sin aprobar (cuentas antiguas) y pruebas vencidas.
const porAprobar = c => !c.es_admin && (!c.aprobado || (!!c.prueba_hasta && c.prueba_hasta < hoy()));
function estado(c) {
  if (c.es_admin) return ['Administrador', 'el'];
  if (!c.aprobado) return ['Pendiente', 'bad'];
  if (c.suspendido) return ['Suspendida', 'bad'];
  if (c.prueba_hasta) {
    if (c.prueba_hasta >= hoy()) { const n = diasA(c.prueba_hasta); return [n ? `Prueba: ${n} día${n === 1 ? '' : 's'}` : 'Prueba: último día', 'el']; }
    return c.plan_solicitado ? ['Pidió plan', 'bad'] : ['Prueba vencida', 'bad'];
  }
  if (c.plan_vence && c.plan_vence < hoy()) return ['Plan vencido', 'bad'];
  if (!c.plan_id) return ['Sin plan', ''];
  return ['Activa', 'ok'];
}
function uso(v, max) {
  if (max === null || max === undefined) return `<span class="mono">${v}</span> <span class="muted">/ ∞</span>`;
  const pct = max ? Math.min(100, Math.round(v / max * 100)) : 100;
  return `<div class="uso ${pct >= 100 ? 'lleno' : pct >= 80 ? 'casi' : ''}"><span class="mono">${v} / ${max}</span><i style="width:${pct}%"></i></div>`;
}
const sobreLimite = c => { const p = planDe(c); return p && ((p.max_empresas !== null && c.empresas > p.max_empresas) || (p.max_documentos_mes !== null && c.documentos_mes >= p.max_documentos_mes) || (p.max_usuarios !== null && c.usuarios > p.max_usuarios)); };

function pintar() {
  const clientes = S.cuentas.filter(c => !c.es_admin);
  const activas = clientes.filter(c => estado(c)[0] === 'Activa');
  const ingreso = activas.reduce((s, c) => { const p = planDe(c); return s + Number(p?.precio_mensual || 0) * (p?.por_empresa ? Math.max(1, c.empresas || 0) : 1); }, 0);
  const pend = clientes.filter(porAprobar).length, prueba = clientes.filter(enPrueba).length;
  const vencen = clientes.filter(c => c.plan_vence && c.plan_vence >= hoy() && c.plan_vence <= new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10)).length;
  $('main').innerHTML = `${store.mode === 'local' ? '<p class="aviso">Modo demostración: datos de ejemplo guardados solo en este navegador. Con Supabase configurado, aquí ves las cuentas reales.</p>' : ''}
    <header class="vhead"><div><h2>Administración de AGAsoft</h2><p class="sub">Cuentas, planes y uso de cada contabilidad.</p></div></header>
    <section class="kpis">
      <div class="kpi"><span>Cuentas activas</span><b class="mono">${activas.length}</b></div>
      <div class="kpi"><span>Ingreso mensual de los planes</span><b class="mono">${money(ingreso)}</b></div>
      <div class="kpi"><span>En prueba gratis</span><b class="mono">${prueba}</b></div>
      <div class="kpi ${pend ? 'warn' : ''}"><span>Por aprobar</span><b class="mono">${pend}</b></div>
      <div class="kpi ${vencen ? 'warn' : ''}"><span>Planes que vencen en 15 días</span><b class="mono">${vencen}</b></div>
    </section>
    <div class="row tabs" role="tablist"><button class="${S.tab === 'cuentas' ? 'primary' : ''}" data-tab="cuentas">Cuentas</button><button class="${S.tab === 'empresas' ? 'primary' : ''}" data-tab="empresas">Contabilidades</button><button class="${S.tab === 'planes' ? 'primary' : ''}" data-tab="planes">Planes</button></div>
    <section class="panel stack" id="tabC"></section>`;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.filtro = ''; pintar(); });
  S.tab === 'cuentas' ? pintarCuentas() : S.tab === 'empresas' ? pintarEmpresas() : pintarPlanes();
}

function pintarCuentas() {
  const q = S.filtro.toLowerCase();
  const l = S.cuentas.filter(c => !q || `${c.nombre} ${c.correo}`.toLowerCase().includes(q))
    .sort((a, b) => (porAprobar(b) - porAprobar(a)) || (b.es_admin - a.es_admin) || a.nombre.localeCompare(b.nombre));
  $('tabC').innerHTML = `<div class="row filters"><input id="q" type="search" placeholder="Buscar por nombre o correo" value="${esc(S.filtro)}"></div>
    <p class="hint">Cada cuenta es un usuario dueño de sus contabilidades (empresas). Quien se registra en AGAsoft entra de una vez con 15 días de prueba gratis. Al terminar la prueba no puede entrar hasta que escoja un plan y tú lo apruebes aquí.</p>
    <div class="tbl-wrap"><table class="tbl adm"><thead><tr><th>Cuenta</th><th>Plan</th><th>Vence</th><th>Contabilidades</th><th>Documentos del mes</th><th>Personas</th><th>Estado</th><th></th></tr></thead><tbody>
    ${l.map(c => { const p = planDe(c), [est, cls] = estado(c); return `<tr class="${c.suspendido ? 'muted' : ''}">
      <td><b>${esc(c.nombre || '(sin nombre)')}</b><br><small class="muted">${esc(c.correo)}</small>${c.notas ? `<br><small class="muted">${esc(c.notas)}</small>` : ''}</td>
      <td>${c.es_admin ? '—' : p ? `${esc(p.nombre)}<br><small class="muted">${money(p.precio_mensual)}/mes</small>` : c.prueba_hasta ? 'Prueba gratis' : '<span class="muted">Sin plan</span>'}${pedidoDe(c) ? `<br><small><b>Pidió:</b> ${esc(pedidoDe(c).nombre)}</small>` : ''}</td>
      <td>${c.es_admin ? '—' : c.prueba_hasta && !p ? fFecha(c.prueba_hasta) : fFecha(c.plan_vence)}</td>
      <td>${uso(c.empresas, c.es_admin ? null : p?.max_empresas)}</td><td>${uso(c.documentos_mes, c.es_admin ? null : p?.max_documentos_mes)}</td><td>${uso(c.usuarios, c.es_admin ? null : p?.max_usuarios)}</td>
      <td><span class="tag ${cls}">${est}</span>${sobreLimite(c) ? ' <span class="tag bad">En el límite</span>' : ''}</td>
      <td class="r nowrap">${c.es_admin ? '' : `${porAprobar(c) ? `<button class="sm primary" data-ap="${c.id}">Aprobar</button>` : ''}<button class="sm" data-ed="${c.id}">Plan</button>${c.aprobado ? `<button class="sm ghost" data-sus="${c.id}">${c.suspendido ? 'Reactivar' : 'Suspender'}</button>` : ''}<button class="sm ghost bad" data-del="${c.id}">Eliminar</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  $('q').oninput = () => { S.filtro = $('q').value; const pos = $('q').selectionStart; pintarCuentas(); $('q').focus(); $('q').setSelectionRange(pos, pos); };
  $('tabC').onclick = async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const c = S.cuentas.find(x => x.id === (b.dataset.ap || b.dataset.ed || b.dataset.sus || b.dataset.del)); if (!c) return;
    if (b.dataset.del) return formEliminar(c);
    if (b.dataset.ed || b.dataset.ap) return formCuenta(c, !!b.dataset.ap);
    try { await api.setCuenta(c.id, { suspendido: !c.suspendido }); toast(c.suspendido ? 'Cuenta reactivada.' : 'Cuenta suspendida: ya no puede entrar a sus contabilidades.'); await cargar(); } catch (e) { fail(e); }
  };
}

function dialogo(html, onOk) {
  const d = $('dlg'), f = $('dlgForm');
  f.innerHTML = html + '<p class="err" id="dErr" hidden></p><div class="row end"><button type="button" class="ghost" id="dCancel">Cancelar</button><button class="primary" id="dOk">Guardar</button></div>';
  $('dCancel').onclick = () => d.close();
  f.onsubmit = async ev => {
    ev.preventDefault(); $('dOk').disabled = true;
    try { await onOk(new FormData(f)); d.close(); } catch (e) { $('dErr').textContent = e.message; $('dErr').hidden = false; } finally { $('dOk').disabled = false; }
  };
  d.showModal(); return f;
}
function formCuenta(c, aprobar) {
  const sugerido = c.plan_vence || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const sel = c.plan_id || (aprobar && c.plan_solicitado) || '', pedido = pedidoDe(c);
  dialogo(`<h2>${aprobar ? 'Aprobar cuenta' : 'Plan de la cuenta'}</h2><p><b>${esc(c.nombre)}</b> · ${esc(c.correo)}</p>
    ${pedido ? `<p class="okmsg">Pidió el plan ${esc(pedido.nombre)}${c.solicitado_en ? ' el ' + fFecha(c.solicitado_en.slice(0, 10)) : ''}.</p>` : ''}
    ${c.prueba_hasta ? `<p class="hint">Prueba gratis ${c.prueba_hasta < hoy() ? 'vencida el' : 'hasta el'} ${fFecha(c.prueba_hasta)}. Al guardar con un plan, la prueba termina y la cuenta queda con ese plan.</p>` : ''}
    <div><label for="f_plan">Plan</label><select id="f_plan" name="plan_id"><option value="">${c.prueba_hasta ? 'Seguir en prueba gratis' : 'Sin plan (sin límites)'}</option>${S.planes.filter(p => p.activo || p.id === sel).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)} · ${money(p.precio_mensual)}/mes</option>`).join('')}</select></div>
    ${!c.prueba_hasta ? `<label class="check"><input type="checkbox" name="dar_prueba"> Dar prueba gratis de 15 días (hasta el ${fFecha(en15())})</label><p class="hint">Quita el plan y la cuenta usa AGAsoft gratis 15 días. Al terminar escoge su plan y tú lo apruebas.</p>` : ''}
    ${c.prueba_hasta ? `<div><label for="f_prueba">Prueba gratis hasta</label><input id="f_prueba" name="prueba_hasta" type="date" value="${c.prueba_hasta}"><p class="hint">Si sigue en prueba, puedes darle más días aquí.</p></div>` : ''}
    <div><label for="f_vence">Pagado hasta</label><input id="f_vence" name="plan_vence" type="date" value="${c.plan_id || aprobar ? sugerido : (c.plan_vence || '')}"><p class="hint">Después de esta fecha la cuenta puede ver sus datos pero no registrar documentos nuevos. Déjalo vacío si no vence.</p></div>
    <div><label for="f_notas">Notas internas</label><input id="f_notas" name="notas" maxlength="200" value="${esc(c.notas)}" placeholder="Forma de pago, contacto…"></div>`, async fd => {
    const campos = { plan_id: fd.get('plan_id') || null, plan_vence: fd.get('plan_vence') || null, notas: String(fd.get('notas') || '').trim() };
    if (aprobar) campos.aprobado = true;
    if (fd.get('dar_prueba') === 'on') Object.assign(campos, { plan_id: null, plan_vence: null, aprobado: true, prueba_hasta: en15(), plan_solicitado: null, solicitado_en: null });
    else if (c.prueba_hasta) {
      if (campos.plan_id) Object.assign(campos, { prueba_hasta: null, plan_solicitado: null, solicitado_en: null });
      else { campos.prueba_hasta = fd.get('prueba_hasta') || c.prueba_hasta; campos.plan_vence = null; if (aprobar && campos.prueba_hasta < hoy()) throw new Error('Escoge un plan, o dale más días de prueba.'); }
    }
    await api.setCuenta(c.id, campos); toast(campos.prueba_hasta && !c.prueba_hasta ? 'Prueba gratis de 15 días activada.' : aprobar ? 'Cuenta aprobada.' : 'Plan guardado.'); await cargar();
  });
}

function formEliminar(c) {
  const f = dialogo(`<h2>Eliminar cuenta</h2><p><b>${esc(c.nombre)}</b> · ${esc(c.correo)}</p>
    <p class="aviso bad">Se borra la cuenta con sus ${c.empresas} contabilidad(es) y todos sus documentos, terceros y cuentas. No se puede deshacer.</p>
    <p class="hint">Si solo quieres que no entre, usa Suspender: no borra nada y se puede reactivar.</p>
    <div><label for="f_conf">Para confirmar, escribe el correo de la cuenta</label><input id="f_conf" name="conf" autocomplete="off" placeholder="${esc(c.correo)}"></div>`, async fd => {
    if (String(fd.get('conf')).trim().toLowerCase() !== c.correo.toLowerCase()) throw new Error('El correo no coincide.');
    await api.eliminarCuenta(c.id); toast('Cuenta eliminada.'); await cargar();
  });
  f.querySelector('#dOk').textContent = 'Eliminar cuenta'; f.querySelector('#dOk').classList.add('danger-btn');
}

/* ---------- Contabilidades: de quién es cada empresa ---------- */
function pintarEmpresas() {
  const q = S.filtro.toLowerCase(), cta = id => S.cuentas.find(c => c.id === id);
  const l = S.empresas.filter(e => !q || `${e.nombre} ${e.nit} ${cta(e.owner)?.nombre || ''} ${cta(e.owner)?.correo || ''}`.toLowerCase().includes(q));
  $('tabC').innerHTML = `<div class="row filters"><input id="q" type="search" placeholder="Buscar por empresa, NIT o dueño" value="${esc(S.filtro)}"></div>
    <p class="hint">Cada contabilidad pertenece a una cuenta (su dueño), y cuenta en el plan de esa cuenta. Si creaste una empresa para un cliente, pásasela a su cuenta con <b>Cambiar dueño</b>: el cliente primero se registra en AGAsoft.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>NIT</th><th>Dueño</th><th></th></tr></thead><tbody>
    ${l.map(e => { const c = cta(e.owner); return `<tr><td><b>${esc(e.nombre)}</b></td><td class="mono">${esc(e.nit)}${e.dv ? '-' + esc(e.dv) : ''}</td>
      <td>${c ? `${esc(c.nombre || '(sin nombre)')}${c.es_admin ? ' <span class="tag el">Tú</span>' : ''}<br><small class="muted">${esc(c.correo)}</small>` : '<span class="muted">—</span>'}</td>
      <td class="r"><button class="sm" data-own="${e.id}">Cambiar dueño</button></td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No hay contabilidades.</td></tr>'}
    </tbody></table></div>`;
  $('q').oninput = () => { S.filtro = $('q').value; const pos = $('q').selectionStart; pintarEmpresas(); $('q').focus(); $('q').setSelectionRange(pos, pos); };
  $('tabC').querySelectorAll('[data-own]').forEach(b => b.onclick = () => formDueno(S.empresas.find(e => e.id === b.dataset.own)));
}
function formDueno(e) {
  const otras = S.cuentas.filter(c => c.id !== e.owner && !c.suspendido).sort((a, b) => (a.nombre || a.correo).localeCompare(b.nombre || b.correo));
  dialogo(`<h2>Cambiar dueño</h2><p><b>${esc(e.nombre)}</b> · NIT ${esc(e.nit)}</p>
    <div><label for="f_own">Nueva cuenta dueña</label><select id="f_own" name="owner" required><option value="">Escoge la cuenta del cliente</option>${otras.map(c => `<option value="${c.id}">${esc(c.nombre || '(sin nombre)')} · ${esc(c.correo)}</option>`).join('')}</select></div>
    <p class="hint">La empresa pasa con todos sus datos (documentos, terceros, cuentas). El nuevo dueño la ve al volver a entrar, y cuenta en su plan. Tú la sigues viendo como administrador. Las personas a las que se les dio acceso lo conservan.</p>`, async fd => {
    const owner = fd.get('owner'); if (!owner) throw new Error('Escoge la cuenta del cliente.');
    const c = S.cuentas.find(x => x.id === owner), pl = planDe(c), n = S.empresas.filter(x => x.owner === owner).length;
    if (pl && pl.max_empresas !== null && n >= pl.max_empresas) throw new Error(`El plan ${pl.nombre} de esa cuenta permite ${pl.max_empresas} contabilidad(es) y ya tiene ${n}. Cámbiale el plan primero.`);
    await api.cambiarDueno(e.id, owner); toast(`${e.nombre} ahora es de ${c.nombre || c.correo}.`); await cargar();
  });
}

const MODS = [['nomina', 'Nómina'], ['exogena', 'Medios magnéticos'], ['importar', 'Importar plantillas'], ['informes', 'Informes de ventas y cartera'], ['avanzados', 'Informes avanzados y exportar a Excel'], ['consulta', 'Usuarios de solo consulta'], ['inventario', 'Control de inventario'], ['operacion', 'Operación (horas máquina y otros)']];
function pintarPlanes() {
  const usan = id => S.cuentas.filter(c => c.plan_id === id).length;
  const lim = v => v === null || v === undefined ? 'Sin límite' : Number(v).toLocaleString('es-CO');
  $('tabC').innerHTML = `<header class="vhead"><p class="hint">Los límites se aplican al dueño de cada cuenta, sumando todas sus contabilidades. Deja un límite vacío para que no tenga tope.</p><button class="primary" id="nuevoP">Nuevo plan</button></header>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Plan</th><th class="r">Precio mensual</th><th class="r">Contabilidades</th><th class="r">Documentos al mes</th><th class="r">Personas con acceso</th><th class="r">Electrónicos al mes por empresa</th><th class="r">Empleados por empresa</th><th>Módulos</th><th class="r">Cuentas</th><th></th></tr></thead><tbody>
    ${S.planes.map(p => `<tr class="${p.activo ? '' : 'muted'}"><td><b>${esc(p.nombre)}</b>${p.activo ? '' : ' <span class="tag">Inactivo</span>'}<br><small class="muted">${esc(p.descripcion)}</small></td>
      <td class="r mono">${money(p.precio_mensual)}${p.por_empresa ? '<br><small class="muted">por empresa</small>' : ''}</td><td class="r mono">${lim(p.max_empresas)}</td><td class="r mono">${lim(p.max_documentos_mes)}</td><td class="r mono">${lim(p.max_usuarios)}</td><td class="r mono">${lim(p.max_documentos_fe_mes)}</td><td class="r mono">${lim(p.max_empleados)}</td><td><small>${MODS.filter(([k]) => p.modulos?.[k] !== false).map(([, t]) => t).join(', ') || 'Ninguno'}</small></td><td class="r mono">${usan(p.id)}</td>
      <td class="r"><button class="sm" data-ep="${p.id}">Editar</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">No hay planes.</td></tr>'}</tbody></table></div>`;
  $('nuevoP').onclick = () => formPlan({ activo: true, orden: S.planes.length + 1 });
  $('tabC').querySelectorAll('[data-ep]').forEach(b => b.onclick = () => formPlan(S.planes.find(p => p.id === b.dataset.ep)));
}
function formPlan(p) {
  const n = v => v === null || v === undefined ? '' : v;
  const enUso = p.id ? S.cuentas.filter(c => c.plan_id === p.id).length : 0;
  const f = dialogo(`<h2>${p.id ? 'Editar plan' : 'Nuevo plan'}</h2>
    <div class="grid2"><div><label for="p_n">Nombre</label><input id="p_n" name="nombre" required maxlength="40" value="${esc(p.nombre)}"></div>
      <div><label for="p_pr">Precio mensual (COP)</label><input id="p_pr" name="precio_mensual" type="number" min="0" step="100" class="mono" required value="${n(p.precio_mensual)}"></div></div>
    <div class="grid3"><div><label for="p_e">Contabilidades</label><input id="p_e" name="max_empresas" type="number" min="0" class="mono" value="${n(p.max_empresas)}" placeholder="Sin límite"></div>
      <div><label for="p_d">Documentos al mes</label><input id="p_d" name="max_documentos_mes" type="number" min="0" class="mono" value="${n(p.max_documentos_mes)}" placeholder="Sin límite"></div>
      <div><label for="p_u">Personas con acceso</label><input id="p_u" name="max_usuarios" type="number" min="0" class="mono" value="${n(p.max_usuarios)}" placeholder="Sin límite"></div></div>
    <p class="hint">Documentos: facturas, notas y recibos emitidos, compras y comprobantes contables del mes. Personas: a quienes el dueño da acceso, sin contarlo a él.</p>
    <label class="check"><input type="checkbox" name="por_empresa" ${p.por_empresa ? 'checked' : ''}> El precio es por empresa (se cobra por cada contabilidad de la cuenta)</label>
    <div class="grid2"><div><label for="p_fe">Documentos electrónicos al mes, por empresa</label><input id="p_fe" name="max_documentos_fe_mes" type="number" min="0" class="mono" value="${n(p.max_documentos_fe_mes)}" placeholder="Sin límite"></div>
      <div><label for="p_em">Empleados activos, por empresa</label><input id="p_em" name="max_empleados" type="number" min="0" class="mono" value="${n(p.max_empleados)}" placeholder="Sin límite"></div></div>
    <p class="hint">Electrónicos: facturas y notas crédito y débito electrónicas del mes (cuentan también las anuladas). Al llegar al tope no se pueden emitir más ese mes.</p>
    <fieldset class="stack"><legend>Módulos incluidos</legend>${MODS.map(([k, t]) => `<label class="check"><input type="checkbox" name="mod_${k}" ${p.modulos?.[k] !== false ? 'checked' : ''}> ${t}</label>`).join('')}</fieldset>
    <div><label for="p_ds">Descripción</label><input id="p_ds" name="descripcion" maxlength="200" value="${esc(p.descripcion)}"></div>
    <label class="check"><input type="checkbox" name="activo" ${p.activo !== false ? 'checked' : ''}> Activo (se puede asignar a cuentas)</label>
    ${p.id && !enUso ? '<button type="button" class="ghost" id="delP">Borrar este plan</button>' : p.id ? `<p class="hint">${enUso} cuenta(s) usan este plan: para dejar de ofrecerlo, desmárcalo como activo.</p>` : ''}`, async fd => {
    const lim = k => { const v = String(fd.get(k) ?? '').trim(); return v === '' ? null : Math.max(0, Math.round(Number(v))); };
    const row = { nombre: String(fd.get('nombre')).trim(), precio_mensual: Math.max(0, Number(fd.get('precio_mensual')) || 0), max_empresas: lim('max_empresas'), max_documentos_mes: lim('max_documentos_mes'),
      max_usuarios: lim('max_usuarios'), por_empresa: fd.get('por_empresa') === 'on', max_documentos_fe_mes: lim('max_documentos_fe_mes'), max_empleados: lim('max_empleados'),
      modulos: Object.fromEntries(MODS.map(([k]) => [k, fd.get('mod_' + k) === 'on'])), descripcion: String(fd.get('descripcion') || '').trim(), activo: fd.get('activo') === 'on', orden: p.orden ?? S.planes.length + 1 };
    if (!row.nombre) throw new Error('Escribe el nombre del plan.');
    try { await api.guardarPlan(p.id ? { ...row, id: p.id } : row); } catch (e) { throw /por_empresa|max_documentos_fe_mes|max_empleados|modulos/.test(e.message) ? new Error('Falta correr en Supabase el archivo supabase/029_planes_permisos.sql.') : e; }
    toast('Plan guardado.'); await cargar();
  });
  const del = f.querySelector('#delP');
  if (del) del.onclick = async () => { try { await api.borrarPlan(p.id); $('dlg').close(); toast('Plan borrado.'); await cargar(); } catch (e) { fail(e); } };
}

iniciar().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<p class="err" style="padding:16px">No se pudo iniciar el panel: ${esc(e.message)}</p>`); });
