import './style.css';
import { crearStore, numeracionPara } from './store.js';
import { r2, num, parseNit, dvOf, fmtNit, linea, totales, cartera, acreditado, enLetras, TIPOS, CONCEPTOS_NC, CONCEPTOS_ND, TIPOS_ID, FORMAS_PAGO, MEDIOS_PAGO } from './calc.js';
import { datosEjemplo } from './ejemplo.js';
import { planInicial, RUBROS, RUBRO, PARAMETROS, parametrosPorDefecto, nivelDe } from './puc.js';
import { asiento, movimientos, balancePrueba, libroAuxiliar, estadoResultados, situacionFinanciera, rubroDe } from './contab.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COP0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const COP2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = v => { const n = r2(num(v)); return (Number.isInteger(n) ? COP0 : COP2).format(n); };
const hoy = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + Number(n || 0)); return d.toISOString().slice(0, 10); };
const fFecha = f => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const opts = (list, sel) => list.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('');
const REGIMENES = [['ordinario', 'Régimen ordinario'], ['simple', 'Régimen Simple de Tributación (RST)'], ['especial', 'Régimen tributario especial'], ['no_responsable', 'No responsable de IVA']];

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});

const store = crearStore();
const S = { user: null, perfil: null, empresas: [], eid: null, d: null };
const emp = () => S.empresas.find(e => e.id === S.eid) || null;
const terc = id => S.d?.terceros.find(t => t.id === id);
const docById = id => S.d?.documentos.find(d => d.id === id);
const itemsDe = id => (S.d?.items || []).filter(i => i.documento_id === id).sort((a, b) => a.orden - b.orden);
const aplDe = id => (S.d?.aplicaciones || []).filter(a => a.recibo_id === id);
const numDoc = d => d.numero ? `${d.prefijo || ''}${d.prefijo ? ' ' : ''}${d.numero}` : 'Borrador';
const nomDoc = d => `${TIPOS[d.tipo].corto} ${numDoc(d)}`;
const docId = t => t ? `${TIPOS_ID.find(x => x[0] === t.tipo_id)?.[1] === 'NIT' ? 'NIT' : (TIPOS_ID.find(x => x[0] === t.tipo_id)?.[1] || '')} ${fmtNit(t.numero)}${t.dv != null && t.tipo_id === '31' ? '-' + t.dv : ''}` : '';

function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.className = err ? 'bad' : ''; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, err ? 6000 : 3500); }
const fail = e => toast(e?.message || String(e), true);

/* ---------- Inicio de sesión ---------- */
let registro = false;
$('aToggle').onclick = () => {
  registro = !registro;
  $('fNombre').hidden = !registro;
  $('aSubmit').textContent = registro ? 'Solicitar acceso' : 'Entrar';
  $('aToggle').textContent = registro ? 'Ya tengo cuenta: entrar' : 'No tengo cuenta: solicitar acceso';
  $('authSub').textContent = registro ? 'Crea tu cuenta. El administrador debe aprobarla antes de que puedas usar AGAsoft.' : 'Entra con tu correo y tu clave.';
  $('aPass').autocomplete = registro ? 'new-password' : 'current-password';
  $('eAuth').hidden = $('okAuth').hidden = true;
};
$('authForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const email = $('aEmail').value.trim(), pass = $('aPass').value, nombre = $('aNombre').value.trim();
  const err = m => { $('eAuth').textContent = m; $('eAuth').hidden = false; };
  $('eAuth').hidden = $('okAuth').hidden = true;
  if (!/^\S+@\S+\.\S+$/.test(email)) return err('Escribe un correo válido.');
  if (pass.length < 8) return err('La clave debe tener al menos 8 caracteres.');
  if (registro && !nombre) return err('Escribe tu nombre.');
  $('aSubmit').disabled = true;
  try {
    if (registro) { await store.signUp(email, pass, nombre); $('okAuth').textContent = 'Listo. Cuando el administrador apruebe tu cuenta, entra con este correo y esta clave.'; $('okAuth').hidden = false; }
    else { await store.signIn(email, pass); await iniciar(); }
  } catch (e) { err(e.message); } finally { $('aSubmit').disabled = false; }
});
$('salir').onclick = async () => { await store.signOut(); if (store.mode === 'local') return toast('En modo demostración no hay sesión que cerrar.'); location.hash = ''; location.reload(); };

async function iniciar() {
  S.user = await store.session();
  if (!S.user) { $('auth').hidden = false; $('app').hidden = true; return; }
  S.perfil = await store.perfil();
  if (!S.perfil?.aprobado) {
    $('auth').hidden = false; $('app').hidden = true;
    $('authSub').textContent = 'Tu cuenta está pendiente de aprobación. Cuando el administrador la apruebe, vuelve a entrar.';
    await store.signOut(); return;
  }
  $('auth').hidden = true; $('app').hidden = false;
  $('demoTag').hidden = store.mode !== 'local';
  $('salir').hidden = store.mode === 'local';
  $('who').textContent = store.mode === 'local' ? '' : (S.perfil?.nombre || S.user.email);
  S.empresas = await store.listEmpresas();
  let guardada = null; try { guardada = localStorage.getItem('agasoft-empresa'); } catch (_) {}
  S.eid = S.empresas.find(e => e.id === guardada)?.id || S.empresas[0]?.id || null;
  await cargarEmpresa();
  route();
}
async function cargarEmpresa() {
  S.d = S.eid ? await store.loadEmpresa(S.eid) : null;
  if (S.d && !S.d.cuentas.length) {
    try { await store.saveMany('cuentas', planInicial().map(c => ({ ...c, empresa_id: S.eid }))); S.d.cuentas = (await store.loadEmpresa(S.eid)).cuentas; } catch (_) { /* sin permiso para crear el plan */ }
  }
  $('empSel').innerHTML = S.empresas.map(e => `<option value="${e.id}" ${e.id === S.eid ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('') + '<option value="__nueva">+ Nueva empresa</option>';
  $('empSel').hidden = !S.empresas.length;
}
async function recargar() { S.empresas = await store.listEmpresas(); await cargarEmpresa(); }
$('empSel').onchange = async () => {
  const v = $('empSel').value;
  if (v === '__nueva') { $('empSel').value = S.eid || ''; return formEmpresa(); }
  S.eid = v; try { localStorage.setItem('agasoft-empresa', v); } catch (_) {}
  await cargarEmpresa(); location.hash = '#/inicio'; route();
};
$('menuBtn').onclick = () => { const o = document.body.classList.toggle('nav-open'); $('menuBtn').setAttribute('aria-expanded', o); };

/* ---------- Navegación ---------- */
const MENU = [
  ['inicio', 'Inicio'],
  ['-', 'Ventas'], ['FV', 'Facturas'], ['NC', 'Notas crédito'], ['ND', 'Notas débito'], ['RC', 'Recibos de caja'], ['cartera', 'Cartera'],
  ['-', 'Contabilidad'], ['esf', 'Situación financiera'], ['er', 'Estado de resultados'], ['balance', 'Balance de prueba'], ['auxiliar', 'Libro auxiliar'], ['puc', 'Plan de cuentas PUC y NIIF'],
  ['-', 'Datos'], ['clientes', 'Clientes'], ['productos', 'Productos y servicios'], ['numeraciones', 'Numeraciones'], ['empresa', 'Empresa'],
];
function renderNav(actual) {
  const items = [...MENU];
  if (store.mode === 'supabase' && S.perfil?.es_admin) items.push(['-', 'Administración'], ['usuarios', 'Usuarios']);
  $('nav').innerHTML = items.map(([k, t]) => k === '-' ? `<h3>${t}</h3>` : `<a href="#/${k}" ${k === actual ? 'aria-current="page"' : ''}>${t}</a>`).join('');
}
window.addEventListener('hashchange', route);
function route() {
  document.body.classList.remove('nav-open');
  const [ruta, qs = ''] = location.hash.split('?');
  const [, v = 'inicio', arg] = ruta.split('/');
  const q = new URLSearchParams(qs);
  renderNav(['nuevo', 'doc', 'editar'].includes(v) ? (arg && TIPOS[arg] ? arg : docById(arg)?.tipo) : v);
  const m = $('main');
  document.body.classList.remove('onboarding');
  if (!S.eid && v !== 'usuarios') return sinEmpresa(m);
  try {
    if (v === 'inicio') return vInicio(m);
    if (TIPOS[v]) return vLista(m, v);
    if (v === 'nuevo') return vEditor(m, { tipo: arg, ref: q.get('ref'), tercero: q.get('tercero') });
    if (v === 'editar') return vEditor(m, { id: arg });
    if (v === 'doc') return vDoc(m, arg);
    if (v === 'cartera') return vCartera(m);
    if (v === 'clientes') return vClientes(m);
    if (v === 'productos') return vProductos(m);
    if (v === 'numeraciones') return vNumeraciones(m);
    if (v === 'empresa') return vEmpresa(m);
    if (v === 'usuarios') return vUsuarios(m);
    if (v === 'puc') return vPuc(m);
    if (v === 'balance') return vBalance(m);
    if (v === 'auxiliar') return vAuxiliar(m, q);
    if (v === 'esf') return vEsf(m);
    if (v === 'er') return vEr(m);
    vInicio(m);
  } catch (e) { fail(e); }
}

// Primer ingreso: antes de entrar al software se piden los datos de la empresa y su resolución de facturación.
function sinEmpresa(m) {
  document.body.classList.add('onboarding');
  m.innerHTML = `<section class="onb stack">
    <div class="onb-steps"><span class="on">1. Datos de la empresa</span><span>2. Resolución de facturación</span></div>
    <h2>Bienvenido a AGAsoft${S.perfil?.nombre ? ', ' + esc(S.perfil.nombre.split(' ')[0]) : ''}</h2>
    <p class="sub">Antes de empezar, registra la empresa tal como aparece en el RUT. Estos datos salen en las facturas y en los informes.</p>
    <form id="onbF" class="panel stack" novalidate>${camposEmpresa()}<p class="err" id="onbErr" hidden></p>
      <div class="row end"><button class="primary" id="onbOk">Guardar y continuar</button></div></form>
    ${store.mode === 'local' ? '<p class="hint">Modo demostración: lo que registres se guarda solo en este navegador. <button type="button" class="ghost sm" id="ejemplo">Mejor, cargar una empresa de ejemplo</button></p>' : ''}
  </section>`;
  const f = $('onbF'); activarNit(f);
  f.onsubmit = async ev => {
    ev.preventDefault(); $('onbErr').hidden = true; const btn = $('onbOk'); btn.disabled = true;
    try { await guardarEmpresa(new FormData(f)); pasoResolucion(m); }
    catch (e) { $('onbErr').textContent = e.message; $('onbErr').hidden = false; }
    finally { btn.disabled = false; }
  };
  if ($('ejemplo')) $('ejemplo').onclick = cargarEjemplo;
}
function pasoResolucion(m) {
  document.body.classList.add('onboarding');
  const y = hoy();
  m.innerHTML = `<section class="onb stack">
    <div class="onb-steps"><span class="done">1. Datos de la empresa</span><span class="on">2. Resolución de facturación</span></div>
    <h2>Resolución de facturación de la DIAN</h2>
    <p class="sub">Copia los datos de la resolución que autoriza la numeración de tus facturas. Si todavía no la tienes, puedes hacerlo después en <b>Numeraciones</b>.</p>
    <form id="resF" class="panel stack" novalidate>
      <div class="grid2">${campo('prefijo', 'Prefijo', 'FE', 'maxlength="4" class="mono"')}${campo('resolucion', 'Número de resolución', '', 'required class="mono" inputmode="numeric" placeholder="18764000000000"')}</div>
      <div class="grid3">${campo('fecha_resolucion', 'Fecha de la resolución', '', 'type="date"')}${campo('vigencia_desde', 'Vigente desde', '', 'type="date"')}${campo('vigencia_hasta', 'Vigente hasta', '', 'type="date"')}</div>
      <div class="grid3">${campo('desde', 'Rango desde', 1, 'type="number" min="1" class="mono"')}${campo('hasta', 'Rango hasta', '', 'type="number" min="1" class="mono" required')}${campo('siguiente', 'Siguiente factura a emitir', 1, 'type="number" min="1" class="mono"')}</div>
      <p class="hint">Si ya facturabas en otro programa (Alegra, World Office…), pon en "Siguiente factura" el número que sigue a la última que emitiste.</p>
      <p class="err" id="resErr" hidden></p>
      <div class="row end"><button type="button" class="ghost" id="despues">Lo hago después</button><button class="primary" id="resOk">Guardar y entrar</button></div></form>
  </section>`;
  const entrar = msg => { document.body.classList.remove('onboarding'); toast(msg); location.hash = '#/inicio'; route(); };
  $('despues').onclick = () => entrar('Empresa lista. Registra la resolución en Numeraciones antes de facturar.');
  $('resF').onsubmit = async ev => {
    ev.preventDefault(); $('resErr').hidden = true;
    const fd = new FormData($('resF'));
    const row = { empresa_id: S.eid, tipo: 'FV', prefijo: String(fd.get('prefijo')).trim().toUpperCase(), resolucion: String(fd.get('resolucion')).trim(), fecha_resolucion: fd.get('fecha_resolucion') || null,
      vigencia_desde: fd.get('vigencia_desde') || null, vigencia_hasta: fd.get('vigencia_hasta') || null, desde: Math.round(num(fd.get('desde'))) || 1, hasta: Math.round(num(fd.get('hasta'))), siguiente: Math.round(num(fd.get('siguiente'))) || 1, activa: true };
    const err = !/^[A-Z0-9]{0,4}$/.test(row.prefijo) ? 'El prefijo lleva máximo 4 letras o números.' : !row.resolucion ? 'Escribe el número de la resolución.' : row.hasta < row.desde ? 'Revisa el rango: "hasta" debe ser mayor que "desde".'
      : row.siguiente < row.desde || row.siguiente > row.hasta ? 'La siguiente factura debe estar dentro del rango.' : row.vigencia_desde && row.vigencia_hasta && row.vigencia_hasta < row.vigencia_desde ? 'La vigencia termina antes de empezar.' : '';
    if (err) { $('resErr').textContent = err; $('resErr').hidden = false; return; }
    const btn = $('resOk'); btn.disabled = true;
    try { await store.save('numeraciones', row); await cargarEmpresa(); entrar('Todo listo. Ya puedes crear clientes, productos y facturas.'); }
    catch (e) { $('resErr').textContent = e.message; $('resErr').hidden = false; } finally { btn.disabled = false; }
  };
  void y;
}
async function cargarEjemplo() {
  try {
    const { empresa, terceros, productos, numeraciones } = datosEjemplo(hoy());
    const e = await store.save('empresas', empresa);
    for (const t of terceros) await store.save('terceros', { ...t, empresa_id: e.id });
    for (const p of productos) await store.save('productos', { ...p, empresa_id: e.id });
    for (const n of numeraciones) await store.save('numeraciones', { ...n, empresa_id: e.id });
    S.eid = e.id; await recargar(); location.hash = '#/inicio'; route();
    toast('Empresa de ejemplo creada con clientes, productos y numeraciones.');
  } catch (e) { fail(e); }
}

/* ---------- Diálogo genérico ---------- */
function dialogo(html, onSubmit, { ancho } = {}) {
  const dlg = $('dlg'), f = $('dlgForm');
  dlg.className = ancho ? 'wide' : '';
  f.innerHTML = html + `<p class="err" id="dlgErr" hidden></p>`;
  f.onsubmit = async ev => {
    const btn = ev.submitter;
    if (btn?.value === 'cancel') return;
    ev.preventDefault();
    $('dlgErr').hidden = true;
    try { btn && (btn.disabled = true); const r = await onSubmit(new FormData(f), btn?.value); if (r !== false) dlg.close(); }
    catch (e) { $('dlgErr').textContent = e.message || e; $('dlgErr').hidden = false; }
    finally { btn && (btn.disabled = false); }
  };
  dlg.showModal();
  f.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  return f;
}
const pie = (txt = 'Guardar') => `<div class="row end"><button value="cancel" formnovalidate class="ghost">Cancelar</button><button value="ok" class="primary">${txt}</button></div>`;
function confirmar(titulo, texto, boton = 'Confirmar') {
  return new Promise(res => {
    const dlg = $('dlg');
    dialogo(`<h2>${esc(titulo)}</h2><p>${texto}</p>${pie(boton)}`, () => res(true));
    dlg.addEventListener('close', () => res(false), { once: true });
  });
}
const campo = (k, label, val, extra = '') => `<div><label for="f_${k}">${label}</label><input id="f_${k}" name="${k}" value="${esc(val ?? '')}" ${extra}></div>`;
const campoSel = (k, label, list, val) => `<div><label for="f_${k}">${label}</label><select id="f_${k}" name="${k}">${opts(list, val)}</select></div>`;
const check = (k, label, val) => `<label class="check"><input type="checkbox" name="${k}" ${val ? 'checked' : ''}> ${label}</label>`;

/* ---------- Empresa ---------- */
function camposEmpresa(e = {}) {
  return `${campo('nombre', 'Razón social o nombre', e.nombre, 'required maxlength="200"')}
    <div class="grid2">${campo('nit', 'NIT', e.nit ? `${e.nit}-${e.dv}` : '', 'required inputmode="numeric" class="mono" placeholder="900123456-8"')}
    ${campoSel('tipo_persona', 'Tipo de persona', [['juridica', 'Persona jurídica'], ['natural', 'Persona natural']], e.tipo_persona)}</div>
    <p class="hint" id="nitHint"></p>
    <div class="grid2">${campoSel('regimen', 'Régimen', REGIMENES, e.regimen)}
    ${campo('actividad', 'Actividad económica (CIIU)', e.actividad, 'maxlength="60" inputmode="numeric" placeholder="6920"')}</div>
    ${check('responsable_iva', 'Es responsable de IVA (cobra IVA en sus facturas)', e.id ? e.responsable_iva : true)}
    ${campo('responsabilidades', 'Responsabilidades fiscales (casilla 53 del RUT)', e.responsabilidades, 'placeholder="O-13, O-15, R-99-PN"')}
    <div class="grid2">${campo('direccion', 'Dirección', e.direccion)}${campo('ciudad', 'Ciudad', e.ciudad)}</div>
    <div class="grid2">${campo('telefono', 'Teléfono', e.telefono, 'type="tel"')}${campo('correo', 'Correo de facturación', e.correo, 'type="email"')}</div>
    <div><label for="f_pie">Texto al pie de las facturas (opcional)</label><textarea id="f_pie" name="pie_factura" rows="2" maxlength="600">${esc(e.pie_factura)}</textarea></div>`;
}
function activarNit(f) {
  const n = f.querySelector('[name=nit]'), h = f.querySelector('#nitHint');
  n.oninput = () => { const p = parseNit(n.value); h.textContent = !n.value.trim() ? '' : p.error || `Dígito de verificación: ${p.dv}`; h.className = p.error && n.value.trim() ? 'err' : 'hint'; };
  n.oninput();
}
async function guardarEmpresa(fd, e = {}) {
  const nit = parseNit(fd.get('nit'));
  if (nit.error) throw new Error(nit.error);
  const row = { nombre: fd.get('nombre').trim(), nit: nit.nit, dv: nit.dv, tipo_persona: fd.get('tipo_persona'), regimen: fd.get('regimen'), actividad: fd.get('actividad').trim(),
    responsable_iva: fd.get('responsable_iva') === 'on', responsabilidades: fd.get('responsabilidades').trim(), direccion: fd.get('direccion').trim(),
    ciudad: fd.get('ciudad').trim(), telefono: fd.get('telefono').trim(), correo: fd.get('correo').trim(), pie_factura: fd.get('pie_factura').trim() };
  if (!row.nombre) throw new Error('Escribe el nombre de la empresa.');
  if (!row.direccion || !row.ciudad) throw new Error('Escribe la dirección y la ciudad: salen en las facturas.');
  const g = await store.save('empresas', e.id ? { ...row, id: e.id } : row);
  if (!e.id) {
    // Numeraciones internas listas para notas y recibos; la de facturas la pone el usuario con su resolución DIAN.
    for (const [tipo, prefijo] of [['NC', 'NC'], ['ND', 'ND'], ['RC', 'RC']]) await store.save('numeraciones', { empresa_id: g.id, tipo, prefijo, desde: 1, hasta: 999999999, siguiente: 1, activa: true, resolucion: '' });
  }
  S.eid = g.id; try { localStorage.setItem('agasoft-empresa', g.id); } catch (_) {}
  await recargar();
  return g;
}
function formEmpresa(e = {}) {
  const f = dialogo(`<h2>${e.id ? 'Datos de la empresa' : 'Nueva empresa'}</h2>${camposEmpresa(e)}${pie(e.id ? 'Guardar' : 'Crear empresa')}`, async fd => {
    await guardarEmpresa(fd, e);
    toast(e.id ? 'Datos guardados.' : 'Empresa creada. Ahora registra la numeración de facturas.');
    location.hash = e.id ? '#/empresa' : '#/numeraciones'; route();
  }, { ancho: true });
  activarNit(f);
}
function vEmpresa(m) {
  const e = emp();
  m.innerHTML = `<header class="vhead"><h2>Empresa</h2><button class="primary" id="edit">Editar datos</button></header>
  <section class="panel">
    <dl class="kv">
      <dt>Nombre</dt><dd>${esc(e.nombre)}</dd>
      <dt>NIT</dt><dd class="mono">${fmtNit(e.nit)}-${e.dv}</dd>
      <dt>Régimen</dt><dd>${esc(REGIMENES.find(r => r[0] === e.regimen)?.[1] || e.regimen)}</dd>
      <dt>IVA</dt><dd>${e.responsable_iva ? 'Responsable de IVA' : 'No responsable de IVA'}</dd>
      <dt>Responsabilidades</dt><dd>${esc(e.responsabilidades) || '—'}</dd>
      <dt>Dirección</dt><dd>${esc([e.direccion, e.ciudad].filter(Boolean).join(', ')) || '—'}</dd>
      <dt>Contacto</dt><dd>${esc([e.telefono, e.correo].filter(Boolean).join(' · ')) || '—'}</dd>
    </dl>
  </section>
  ${store.mode === 'supabase' ? `<section class="panel stack"><header class="vhead"><h3>Personas con acceso</h3><button id="addM">Dar acceso</button></header>
    <p class="hint">Un <b>responsable</b> puede crear y emitir documentos. <b>Consulta</b> solo puede verlos.</p>
    <table class="tbl"><tbody>${S.d.miembros.map(x => `<tr><td>${esc(x.correo)}</td><td>${x.rol === 'consulta' ? 'Consulta' : 'Responsable'}</td><td class="r"><button class="ghost" data-delm="${x.id}">Quitar</button></td></tr>`).join('') || '<tr><td class="muted">Solo tú tienes acceso.</td></tr>'}</tbody></table></section>` : ''}
  <section class="panel stack danger"><h3>Zona de cuidado</h3>
    <div class="row"><button id="delEmp">Borrar esta empresa</button>${store.mode === 'local' ? '<button id="delDemo">Borrar todos los datos de demostración</button>' : ''}</div></section>`;
  $('edit').onclick = () => formEmpresa(e);
  $('delEmp').onclick = async () => {
    if (!await confirmar('Borrar empresa', `Se borrará <b>${esc(e.nombre)}</b> con todos sus clientes, productos y documentos. Esto no se puede deshacer.`, 'Borrar')) return;
    try { await store.remove('empresas', e.id); S.eid = null; await recargar(); S.eid = S.empresas[0]?.id || null; await cargarEmpresa(); location.hash = '#/inicio'; route(); } catch (er) { fail(er); }
  };
  if ($('delDemo')) $('delDemo').onclick = async () => { if (await confirmar('Borrar demostración', 'Se borran todas las empresas y documentos de este navegador.', 'Borrar todo')) { store.borrarDemo(); location.hash = ''; location.reload(); } };
  if ($('addM')) $('addM').onclick = () => dialogo(`<h2>Dar acceso</h2>${campo('correo', 'Correo de la persona', '', 'type="email" required')}
    ${campoSel('rol', 'Permiso', [['responsable', 'Responsable: crea y emite documentos'], ['consulta', 'Consulta: solo ve']], 'responsable')}
    <p class="hint">La persona debe tener cuenta aprobada en AGAsoft con ese mismo correo.</p>${pie('Dar acceso')}`, async fd => {
    await store.save('miembros', { empresa_id: e.id, correo: fd.get('correo').trim().toLowerCase(), rol: fd.get('rol') }); await cargarEmpresa(); route();
  });
  m.querySelectorAll('[data-delm]').forEach(b => b.onclick = async () => { try { await store.remove('miembros', b.dataset.delm); await cargarEmpresa(); route(); } catch (er) { fail(er); } });
}

/* ---------- Inicio ---------- */
function vInicio(m) {
  const e = emp(), d = S.d, mes = hoy().slice(0, 7);
  const em = d.documentos.filter(x => x.estado === 'emitido');
  const delMes = t => em.filter(x => x.tipo === t && x.fecha.startsWith(mes));
  const ventas = r2(delMes('FV').reduce((s, x) => s + num(x.base), 0) - delMes('NC').reduce((s, x) => s + num(x.base), 0) + delMes('ND').reduce((s, x) => s + num(x.base), 0));
  const cart = cartera(d.documentos, d.aplicaciones).filter(c => c.saldo > 0.009);
  const porCobrar = r2(cart.reduce((s, c) => s + c.saldo, 0)), vencido = r2(cart.filter(c => c.diasVencida > 0).reduce((s, c) => s + c.saldo, 0));
  const recaudo = r2(delMes('RC').reduce((s, x) => s + num(x.total), 0));
  const faltan = [];
  if (!d.numeraciones.some(n => n.tipo === 'FV' && n.activa)) faltan.push(['numeraciones', 'Registra la resolución de numeración de facturas.']);
  if (!d.terceros.length) faltan.push(['clientes', 'Crea tu primer cliente.']);
  if (!d.productos.length) faltan.push(['productos', 'Crea tus productos o servicios.']);
  const ult = [...d.documentos].sort((a, b) => (b.creado_en || '').localeCompare(a.creado_en || '')).slice(0, 8);
  m.innerHTML = `<header class="vhead"><div><h2>${esc(e.nombre)}</h2><p class="sub mono">NIT ${fmtNit(e.nit)}-${e.dv}</p></div>
    <div class="row"><a class="btn primary" href="#/nuevo/FV">Nueva factura</a><a class="btn" href="#/nuevo/RC">Nuevo recibo</a></div></header>
  ${faltan.length ? `<section class="panel stack callout"><h3>Para empezar a facturar</h3><ol class="steps-list">${faltan.map(([k, t]) => `<li><a href="#/${k}">${t}</a></li>`).join('')}</ol></section>` : ''}
  <section class="kpis">
    <div class="kpi"><span>Ventas del mes (sin IVA)</span><b class="mono">${money(ventas)}</b></div>
    <div class="kpi"><span>Recaudo del mes</span><b class="mono">${money(recaudo)}</b></div>
    <div class="kpi"><span>Cartera por cobrar</span><b class="mono">${money(porCobrar)}</b></div>
    <div class="kpi ${vencido > 0 ? 'warn' : ''}"><span>Cartera vencida</span><b class="mono">${money(vencido)}</b></div>
  </section>
  <section class="panel stack"><h3>Últimos documentos</h3>${tablaDocs(ult, true) || '<p class="muted">Todavía no hay documentos.</p>'}</section>`;
}

/* ---------- Listas de documentos ---------- */
function estadoTag(d) {
  if (d.estado === 'borrador') return '<span class="tag">Borrador</span>';
  if (d.estado === 'anulado') return '<span class="tag bad">Anulado</span>';
  return '<span class="tag ok">Emitido</span>';
}
function tablaDocs(list, conTipo) {
  if (!list.length) return '';
  const cart = Object.fromEntries(cartera(S.d.documentos, S.d.aplicaciones).map(c => [c.factura.id, c]));
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${conTipo ? '<th>Documento</th>' : '<th>Número</th>'}<th>Fecha</th><th>Cliente</th><th class="r">Total</th>${!conTipo && list[0]?.tipo === 'FV' ? '<th class="r">Saldo</th>' : ''}<th>Estado</th></tr></thead><tbody>
    ${list.map(d => { const c = cart[d.id]; return `<tr class="click" data-go="#/${d.estado === 'borrador' ? 'editar' : 'doc'}/${d.id}">
      <td class="mono"><a href="#/${d.estado === 'borrador' ? 'editar' : 'doc'}/${d.id}">${conTipo ? esc(nomDoc(d)) : esc(numDoc(d))}</a></td><td>${fFecha(d.fecha)}</td><td>${esc(terc(d.tercero_id)?.nombre || '')}</td>
      <td class="r mono">${money(d.tipo === 'RC' ? d.total : d.neto)}</td>${!conTipo && d.tipo === 'FV' ? `<td class="r mono">${c ? (c.saldo > 0.009 ? money(c.saldo) + (c.diasVencida ? ` <span class="tag bad">${c.diasVencida} d</span>` : '') : '<span class="tag ok">Pagada</span>') : '—'}</td>` : ''}<td>${estadoTag(d)}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}
document.addEventListener('click', ev => { const tr = ev.target.closest('tr[data-go]'); if (tr && !ev.target.closest('a,button')) location.hash = tr.dataset.go; });

function vLista(m, tipo) {
  const T = TIPOS[tipo];
  let q = '', est = '';
  m.innerHTML = `<header class="vhead"><h2>${T.plural}</h2><a class="btn primary" href="#/nuevo/${tipo}">Nueva ${T.corto.toLowerCase().replace('recibo', 'recibo de caja')}</a></header>
    <div class="row filters"><input id="q" type="search" placeholder="Buscar por número o cliente"><select id="est" aria-label="Estado"><option value="">Todos</option><option value="borrador">Borradores</option><option value="emitido">Emitidos</option>${tipo === 'RC' ? '<option value="anulado">Anulados</option>' : ''}</select></div>
    ${tipo === 'NC' || tipo === 'ND' ? `<p class="hint">Las notas se crean desde la factura que corrigen. También puedes crear una aquí y escoger la factura.</p>` : ''}
    <section class="panel" id="lst"></section>`;
  const pintar = () => {
    const l = S.d.documentos.filter(d => d.tipo === tipo && (!est || d.estado === est) && (!q || `${numDoc(d)} ${terc(d.tercero_id)?.nombre} ${terc(d.tercero_id)?.numero}`.toLowerCase().includes(q)))
      .sort((a, b) => (b.fecha + String(b.numero ?? 9e15).padStart(16, '0')).localeCompare(a.fecha + String(a.numero ?? 9e15).padStart(16, '0')));
    $('lst').innerHTML = tablaDocs(l) || `<p class="muted">No hay ${T.plural.toLowerCase()}${q || est ? ' con ese filtro' : ' todavía'}.</p>`;
  };
  $('q').oninput = () => { q = $('q').value.trim().toLowerCase(); pintar(); };
  $('est').onchange = () => { est = $('est').value; pintar(); };
  pintar();
}

/* ---------- Editor de documentos ---------- */
function facturasCliente(tid) { return S.d.documentos.filter(d => d.tipo === 'FV' && d.estado === 'emitido' && (!tid || d.tercero_id === tid)); }
function nuevoItem(p) { return { producto_id: p?.id || '', codigo: p?.codigo || '', descripcion: p?.nombre || '', unidad: p?.unidad || 'UND', cantidad: 1, precio: num(p?.precio), descuento_pct: 0, iva_pct: emp().responsable_iva ? num(p?.iva_pct ?? 19) : 0 }; }
function retDe(t) { return t ? { retefuente_pct: num(t.retefuente_pct), reteiva_pct: num(t.reteiva_pct), reteica_milaje: num(t.reteica_milaje) } : { retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0 }; }

function vEditor(m, { id, tipo, ref, tercero }) {
  let doc, items, apl;
  if (id) {
    const d = docById(id);
    if (!d) { m.innerHTML = '<p>No se encontró el documento.</p>'; return; }
    if (d.estado !== 'borrador') { location.replace('#/doc/' + id); return; }
    doc = { ...d }; items = itemsDe(id).map(i => ({ ...i })); apl = aplDe(id).map(a => ({ ...a })); tipo = d.tipo;
  } else {
    if (!TIPOS[tipo]) { location.replace('#/inicio'); return; }
    const f = ref && docById(ref);
    const t = terc(f?.tercero_id || tercero);
    doc = { empresa_id: S.eid, tipo, fecha: hoy(), tercero_id: t?.id || '', forma_pago: t?.plazo_dias > 0 ? 'credito' : 'contado', vence: t?.plazo_dias > 0 ? sumarDias(hoy(), t.plazo_dias) : '', medio_pago: 'transferencia', ref_id: f?.tipo === 'FV' && (tipo === 'NC' || tipo === 'ND') ? f.id : '', concepto: tipo === 'NC' ? '1' : tipo === 'ND' ? '4' : '', observaciones: '', anticipo: 0, ...retDe(t) };
    if (f && tipo !== 'RC') Object.assign(doc, { retefuente_pct: num(f.retefuente_pct), reteiva_pct: num(f.reteiva_pct), reteica_milaje: num(f.reteica_milaje) });
    items = tipo === 'NC' && f ? itemsDe(f.id).map(i => ({ ...i, id: undefined, documento_id: undefined })) : tipo === 'RC' ? [] : [nuevoItem()];
    apl = tipo === 'RC' && f ? [{ factura_id: f.id, valor: Math.max(0, saldoDe(f.id)) }] : [];
  }
  const T = TIPOS[tipo], esNota = tipo === 'NC' || tipo === 'ND', esRC = tipo === 'RC';
  const clientes = [...S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre));
  m.innerHTML = `<header class="vhead"><div><h2>${id ? 'Editar' : 'Nueva'} ${T.nombre.toLowerCase()}</h2><p class="sub">Borrador: puedes cambiarlo hasta que lo emitas.</p></div></header>
  <form id="ed" class="stack" novalidate>
    <section class="panel grid-doc">
      <div class="span2"><label for="cli">Cliente</label>
        <div class="row nowrap"><select id="cli" required><option value="">Escoge el cliente…</option>${clientes.map(t => `<option value="${t.id}" ${t.id === doc.tercero_id ? 'selected' : ''}>${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`).join('')}</select>
        <button type="button" id="newCli" title="Crear cliente">+ Nuevo</button></div></div>
      <div><label for="fecha">Fecha</label><input id="fecha" type="date" value="${doc.fecha}" required></div>
      ${tipo === 'FV' ? `<div><label for="fp">Forma de pago</label><select id="fp">${opts(FORMAS_PAGO, doc.forma_pago)}</select></div>
        <div id="wVence"><label for="vence">Vence</label><input id="vence" type="date" value="${doc.vence || ''}"></div>` : ''}
      ${tipo === 'FV' || esRC ? `<div><label for="mp">Medio de pago</label><select id="mp">${opts(MEDIOS_PAGO, doc.medio_pago)}</select></div>` : ''}
      ${esNota ? `<div class="span2"><label for="ref">Factura que corrige</label><select id="ref" required></select></div>
        <div class="span2"><label for="con">Concepto de la ${T.corto.toLowerCase()}</label><select id="con">${opts(tipo === 'NC' ? CONCEPTOS_NC : CONCEPTOS_ND, doc.concepto)}</select></div>` : ''}
    </section>
    ${esRC ? `<section class="panel stack"><h3>Facturas que paga</h3><div id="aplW"></div>
      <div class="grid2"><div><label for="ant">Anticipo o pago sin factura</label><input id="ant" type="number" min="0" step="0.01" class="mono" value="${num(doc.anticipo) || ''}"></div></div></section>` :
    `<section class="panel stack"><div class="vhead"><h3>Productos o servicios</h3>${esNota && doc.concepto === '2' ? '' : '<button type="button" id="addIt">+ Agregar línea</button>'}</div>
      <datalist id="prods">${S.d.productos.filter(p => p.activo !== false).map(p => `<option value="${esc(p.codigo)}">${esc(p.nombre)} · ${money(p.precio)}</option>`).join('')}</datalist>
      <div class="tbl-wrap"><table class="tbl items"><thead><tr><th>Código</th><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio unit.</th><th class="r">Desc. %</th><th class="r">IVA %</th><th class="r">Total</th><th></th></tr></thead><tbody id="its"></tbody></table></div>
      ${!emp().responsable_iva ? '<p class="hint">La empresa no es responsable de IVA, por eso el IVA va en 0.</p>' : ''}</section>`}
    <section class="panel grid-doc">
      <div class="span2 c-obs"><label for="obs">Observaciones</label><textarea id="obs" rows="3" maxlength="1000">${esc(doc.observaciones)}</textarea></div>
      ${esRC ? '' : `<div class="span2 ret"><h3>Retenciones que practica el cliente</h3><div class="grid3">
        <div><label for="rf">Retefuente %</label><input id="rf" type="number" min="0" max="100" step="0.001" class="mono" value="${num(doc.retefuente_pct) || ''}"></div>
        <div><label for="ri">ReteIVA % (del IVA)</label><input id="ri" type="number" min="0" max="100" step="0.001" class="mono" value="${num(doc.reteiva_pct) || ''}"></div>
        <div><label for="rica">ReteICA (por mil)</label><input id="rica" type="number" min="0" max="100" step="0.001" class="mono" value="${num(doc.reteica_milaje) || ''}"></div></div></div>`}
      <div class="span2 totbox" id="tot"></div>
    </section>
    <p class="err" id="edErr" hidden></p>
    <div class="row end sticky-actions">
      ${id ? '<button type="button" class="ghost" id="delB">Borrar borrador</button>' : ''}<span class="spacer"></span>
      <a class="btn ghost" href="#/${tipo}">Cancelar</a>
      <button type="button" id="saveB">Guardar borrador</button>
      <button type="submit" class="primary" id="emitB">Emitir</button>
    </div>
  </form>`;

  const leerCab = () => {
    doc.tercero_id = $('cli').value; doc.fecha = $('fecha').value;
    if ($('fp')) { doc.forma_pago = $('fp').value; doc.vence = doc.forma_pago === 'credito' ? $('vence').value : doc.fecha; }
    if ($('mp')) doc.medio_pago = $('mp').value;
    if ($('ref')) { doc.ref_id = $('ref').value; doc.concepto = $('con').value; }
    doc.observaciones = $('obs').value;
    if ($('rf')) Object.assign(doc, { retefuente_pct: num($('rf').value), reteiva_pct: num($('ri').value), reteica_milaje: num($('rica').value) });
    if ($('ant')) doc.anticipo = num($('ant').value);
  };
  const calcular = () => {
    leerCab();
    if (esRC) {
      const t = r2(apl.reduce((s, a) => s + num(a.valor), 0) + num(doc.anticipo));
      Object.assign(doc, { bruto: t, descuento: 0, base: t, iva: 0, retefuente: 0, reteiva: 0, reteica: 0, total: t, neto: t });
      $('tot').innerHTML = `<dl class="tot"><dt>Total recibido</dt><dd class="big mono">${money(t)}</dd></dl><p class="hint letras">${enLetras(t)}</p>`;
      return;
    }
    const t = totales(items, doc);
    Object.assign(doc, { bruto: t.bruto, descuento: t.descuento, base: t.base, iva: t.iva, retefuente: t.retefuente, reteiva: t.reteiva, reteica: t.reteica, total: t.total, neto: t.neto });
    $('tot').innerHTML = `<dl class="tot">
      <dt>Subtotal</dt><dd class="mono">${money(t.bruto)}</dd>
      ${t.descuento ? `<dt>Descuentos</dt><dd class="mono">−${money(t.descuento)}</dd>` : ''}
      <dt>Base gravable</dt><dd class="mono">${money(t.base)}</dd>
      ${t.porTarifa.filter(x => x.tarifa > 0).map(x => `<dt>IVA ${x.tarifa}%</dt><dd class="mono">${money(x.iva)}</dd>`).join('')}
      <dt class="strong">Total</dt><dd class="mono strong">${money(t.total)}</dd>
      ${t.retefuente ? `<dt>Retefuente</dt><dd class="mono">−${money(t.retefuente)}</dd>` : ''}
      ${t.reteiva ? `<dt>ReteIVA</dt><dd class="mono">−${money(t.reteiva)}</dd>` : ''}
      ${t.reteica ? `<dt>ReteICA</dt><dd class="mono">−${money(t.reteica)}</dd>` : ''}
      ${t.neto !== t.total ? `<dt class="strong">Neto a pagar</dt><dd class="mono big">${money(t.neto)}</dd>` : ''}
    </dl><p class="hint letras">${enLetras(t.neto)}</p>`;
    items.forEach((it, i) => { const c = m.querySelector(`[data-lt="${i}"]`); if (c) c.textContent = money(linea(it).total); });
  };
  const pintarItems = () => {
    if (esRC) return;
    const bloqueado = esNota && doc.concepto === '2';
    $('its').innerHTML = items.map((it, i) => `<tr data-i="${i}">
      <td data-l="Código"><input data-k="codigo" list="prods" value="${esc(it.codigo)}" class="mono w-cod" aria-label="Código" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="Descripción" class="c-desc"><input data-k="descripcion" value="${esc(it.descripcion)}" aria-label="Descripción" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="Cantidad"><input data-k="cantidad" type="number" step="any" min="0" value="${it.cantidad}" class="r mono w-num" aria-label="Cantidad" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="Precio unit."><input data-k="precio" type="number" step="0.01" min="0" value="${it.precio}" class="r mono w-val" aria-label="Precio unitario" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="Desc. %"><input data-k="descuento_pct" type="number" step="0.01" min="0" max="100" value="${num(it.descuento_pct) || ''}" class="r mono w-num" aria-label="Descuento %" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="IVA %"><select data-k="iva_pct" class="w-num" aria-label="IVA %" ${bloqueado || !emp().responsable_iva ? 'disabled' : ''}>${opts([['0', '0'], ['5', '5'], ['19', '19']], String(num(it.iva_pct)))}</select></td>
      <td class="r mono c-tot" data-l="Total" data-lt="${i}">${money(linea(it).total)}</td>
      <td class="c-del">${bloqueado ? '' : `<button type="button" class="ghost" data-del="${i}" aria-label="Quitar línea">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sin líneas.</td></tr>';
    if ($('addIt')) $('addIt').hidden = bloqueado;
  };
  const pintarApl = () => {
    if (!esRC) return;
    const tid = $('cli').value;
    const pend = cartera(S.d.documentos, S.d.aplicaciones.filter(a => a.recibo_id !== doc.id)).filter(c => c.factura.tercero_id === tid && (c.saldo > 0.009 || apl.some(a => a.factura_id === c.factura.id)));
    apl = apl.filter(a => pend.some(c => c.factura.id === a.factura_id));
    $('aplW').innerHTML = !tid ? '<p class="muted">Escoge el cliente para ver sus facturas pendientes.</p>' : !pend.length ? '<p class="muted">Este cliente no tiene facturas pendientes. Puedes registrar el valor como anticipo.</p>' :
      `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Factura</th><th>Fecha</th><th>Vence</th><th class="r">Saldo</th><th class="r">Valor que paga</th></tr></thead><tbody>
      ${pend.map(c => { const a = apl.find(x => x.factura_id === c.factura.id); return `<tr><td class="mono">${esc(numDoc(c.factura))}</td><td>${fFecha(c.factura.fecha)}</td><td>${fFecha(c.factura.vence)}${c.diasVencida ? ` <span class="tag bad">${c.diasVencida} d</span>` : ''}</td><td class="r mono">${money(c.saldo)}</td>
        <td class="r"><div class="row nowrap end"><button type="button" class="ghost sm" data-todo="${c.factura.id}" data-saldo="${c.saldo}">Todo</button><input type="number" min="0" step="0.01" class="r mono w-val" data-apl="${c.factura.id}" data-max="${c.saldo}" value="${a ? num(a.valor) : ''}" aria-label="Valor que paga"></div></td></tr>`; }).join('')}
      </tbody></table></div>`;
  };
  const pintarRef = () => {
    if (!$('ref')) return;
    const fs = facturasCliente($('cli').value || null);
    $('ref').innerHTML = `<option value="">Escoge la factura…</option>` + fs.map(f => `<option value="${f.id}" ${f.id === doc.ref_id ? 'selected' : ''}>${esc(numDoc(f))} · ${fFecha(f.fecha)} · ${money(f.total)}${$('cli').value ? '' : ' · ' + esc(terc(f.tercero_id)?.nombre)}</option>`).join('');
  };

  // Eventos
  const form = $('ed');
  $('cli').onchange = () => {
    const t = terc($('cli').value);
    if (!id && t && !esRC && !doc.ref_id) { Object.assign(doc, retDe(t)); $('rf').value = num(t.retefuente_pct) || ''; $('ri').value = num(t.reteiva_pct) || ''; $('rica').value = num(t.reteica_milaje) || ''; }
    if ($('fp') && t) { $('fp').value = t.plazo_dias > 0 ? 'credito' : 'contado'; $('vence').value = t.plazo_dias > 0 ? sumarDias($('fecha').value, t.plazo_dias) : ''; $('wVence').hidden = $('fp').value !== 'credito'; }
    if ($('ref') && doc.ref_id && docById(doc.ref_id)?.tercero_id !== $('cli').value) doc.ref_id = '';
    pintarRef(); pintarApl(); calcular();
  };
  $('newCli').onclick = () => formTercero({}, async t => { await cargarEmpresa(); const sel = $('cli'); sel.insertAdjacentHTML('beforeend', `<option value="${t.id}">${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`); sel.value = t.id; sel.onchange(); });
  if ($('fp')) { $('wVence').hidden = $('fp').value !== 'credito'; $('fp').onchange = () => { $('wVence').hidden = $('fp').value !== 'credito'; const t = terc($('cli').value); if ($('fp').value === 'credito' && !$('vence').value) $('vence').value = sumarDias($('fecha').value, t?.plazo_dias || 30); calcular(); }; }
  if ($('ref')) {
    $('ref').onchange = () => {
      const f = docById($('ref').value); doc.ref_id = f?.id || '';
      if (f) {
        if (!$('cli').value) { $('cli').value = f.tercero_id; }
        Object.assign(doc, { retefuente_pct: num(f.retefuente_pct), reteiva_pct: num(f.reteiva_pct), reteica_milaje: num(f.reteica_milaje) });
        $('rf').value = num(f.retefuente_pct) || ''; $('ri').value = num(f.reteiva_pct) || ''; $('rica').value = num(f.reteica_milaje) || '';
        if (tipo === 'NC') items = itemsDe(f.id).map(i => ({ ...i, id: undefined, documento_id: undefined }));
        pintarRef(); pintarItems();
      }
      calcular();
    };
    $('con').onchange = () => {
      doc.concepto = $('con').value;
      const f = docById(doc.ref_id);
      if (tipo === 'NC' && doc.concepto === '2' && f) items = itemsDe(f.id).map(i => ({ ...i, id: undefined, documento_id: undefined }));
      pintarItems(); calcular();
      m.querySelector('.vhead #addIt')?.toggleAttribute('hidden', doc.concepto === '2');
    };
  }
  form.addEventListener('input', ev => {
    const el = ev.target;
    const tr = el.closest('tr[data-i]');
    if (tr && el.dataset.k) {
      const it = items[Number(tr.dataset.i)];
      const k = el.dataset.k;
      it[k] = ['cantidad', 'precio', 'descuento_pct', 'iva_pct'].includes(k) ? el.value : el.value;
      if (k === 'codigo') {
        const p = S.d.productos.find(x => x.codigo.toLowerCase() === el.value.trim().toLowerCase());
        if (p) { Object.assign(it, nuevoItem(p), { cantidad: it.cantidad || 1 }); pintarItems(); m.querySelector(`tr[data-i="${tr.dataset.i}"] [data-k=cantidad]`)?.focus(); }
      }
    }
    if (el.dataset.apl) {
      const fid = el.dataset.apl; const v = num(el.value);
      apl = apl.filter(a => a.factura_id !== fid); if (v > 0) apl.push({ factura_id: fid, valor: v });
    }
    calcular();
  });
  form.addEventListener('change', ev => { if (ev.target.dataset.k === 'iva_pct') { items[Number(ev.target.closest('tr').dataset.i)].iva_pct = ev.target.value; calcular(); } });
  form.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.del !== undefined) { items.splice(Number(b.dataset.del), 1); pintarItems(); calcular(); }
    if (b.dataset.todo) { const inp = m.querySelector(`[data-apl="${b.dataset.todo}"]`); inp.value = num(b.dataset.saldo); inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  if ($('addIt')) $('addIt').onclick = () => { items.push(nuevoItem()); pintarItems(); calcular(); m.querySelector(`tr[data-i="${items.length - 1}"] [data-k=codigo]`)?.focus(); };
  $('fecha').onchange = () => { const t = terc($('cli').value); if ($('fp')?.value === 'credito' && t?.plazo_dias) $('vence').value = sumarDias($('fecha').value, t.plazo_dias); calcular(); };

  const errEd = msg => { $('edErr').textContent = msg; $('edErr').hidden = !msg; if (msg) $('edErr').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const limpiarItems = () => items.filter(it => String(it.descripcion).trim() || num(it.precio)).map(({ id: _i, documento_id: _d, empresa_id: _e, ...it }) => ({ ...it, cantidad: num(it.cantidad), precio: num(it.precio), descuento_pct: num(it.descuento_pct), iva_pct: num(it.iva_pct) }));
  const guardar = async () => {
    calcular();
    if (!doc.tercero_id) throw new Error('Escoge el cliente.');
    if (!doc.fecha) throw new Error('Escribe la fecha.');
    const its = esRC ? [] : limpiarItems();
    for (const it of its) {
      if (!String(it.descripcion).trim()) throw new Error('Cada línea necesita una descripción.');
      if (num(it.cantidad) <= 0) throw new Error(`La cantidad de "${it.descripcion}" debe ser mayor que cero.`);
      if (num(it.precio) < 0) throw new Error(`El precio de "${it.descripcion}" no puede ser negativo.`);
    }
    const { id: _id, ...campos } = doc;
    const g = await store.saveDoc({ ...campos, id: doc.id || id || undefined, empresa_id: S.eid, tipo }, its, esRC ? apl.map(a => ({ factura_id: a.factura_id, valor: num(a.valor) })) : []);
    doc.id = g.id; id = g.id;
    await cargarEmpresa();
    return g;
  };
  const validarEmision = () => {
    const its = limpiarItems();
    if (!esRC && !its.length) return 'Agrega al menos una línea.';
    if (!esRC && doc.total <= 0) return 'El total debe ser mayor que cero.';
    if (tipo === 'FV' && doc.forma_pago === 'credito' && (!doc.vence || doc.vence < doc.fecha)) return 'Escribe la fecha de vencimiento (igual o después de la fecha de la factura).';
    if (esNota) {
      const f = docById(doc.ref_id);
      if (!f) return 'Escoge la factura que corrige la nota.';
      if (f.tercero_id !== doc.tercero_id) return 'La nota debe ser del mismo cliente de la factura.';
      if (doc.fecha < f.fecha) return 'La nota no puede tener fecha anterior a la factura.';
      if (tipo === 'NC') { const disp = r2(num(f.total) - acreditado(S.d.documentos, f.id, doc.id)); if (doc.total > disp + 0.001) return `La nota crédito (${money(doc.total)}) supera lo pendiente por acreditar de la factura (${money(disp)}).`; }
    }
    if (esRC) {
      if (doc.total <= 0) return 'Escribe el valor que paga en al menos una factura, o un anticipo.';
      const c = Object.fromEntries(cartera(S.d.documentos, S.d.aplicaciones.filter(a => a.recibo_id !== doc.id)).map(x => [x.factura.id, x]));
      for (const a of apl) if (num(a.valor) > (c[a.factura_id]?.saldo ?? 0) + 0.001) return `El pago a la factura ${numDoc(c[a.factura_id]?.factura || {})} supera su saldo (${money(c[a.factura_id]?.saldo)}).`;
    }
    try { numeracionPara({ ...doc, empresa_id: S.eid, tipo }, S.d.numeraciones); } catch (e) { return e.message; }
    return '';
  };
  $('saveB').onclick = async () => { errEd(''); $('saveB').disabled = true; try { const g = await guardar(); toast('Borrador guardado.'); history.replaceState(null, '', '#/editar/' + g.id); } catch (e) { errEd(e.message); } finally { $('saveB').disabled = false; } };
  form.onsubmit = async ev => {
    ev.preventDefault(); errEd('');
    calcular();
    if (!doc.tercero_id) return errEd('Escoge el cliente.');
    const msg = validarEmision(); if (msg) return errEd(msg);
    const n = S.d.numeraciones.find(x => x.tipo === tipo && x.activa);
    if (!await confirmar(`Emitir ${T.nombre.toLowerCase()}`, `Quedará con el número <b class="mono">${esc(n.prefijo || '')} ${n.siguiente}</b> por <b>${money(esRC ? doc.total : doc.neto)}</b> a nombre de <b>${esc(terc(doc.tercero_id)?.nombre)}</b>.<br>Después de emitida no se puede modificar${tipo === 'RC' ? ', solo anular' : '; se corrige con una nota'}.`, 'Emitir')) return;
    $('emitB').disabled = true;
    try { const g = await guardar(); const e = await store.emitir(g.id); await cargarEmpresa(); toast(`${nomDoc(e)} ${tipo === 'RC' ? 'emitido' : 'emitida'}.`); location.hash = '#/doc/' + e.id; }
    catch (e) { errEd(e.message); } finally { $('emitB').disabled = false; }
  };
  if ($('delB')) $('delB').onclick = async () => { if (!await confirmar('Borrar borrador', 'El borrador se elimina.', 'Borrar')) return; try { await store.remove('documentos', id); await cargarEmpresa(); location.hash = '#/' + tipo; } catch (e) { fail(e); } };

  pintarRef(); pintarItems(); pintarApl(); calcular();
}
function saldoDe(fid) { return cartera(S.d.documentos, S.d.aplicaciones).find(c => c.factura.id === fid)?.saldo ?? 0; }

/* ---------- Ver documento emitido (representación gráfica) ---------- */
function representacion(d) {
  const e = emp(), t = terc(d.tercero_id) || {}, its = itemsDe(d.id), T = TIPOS[d.tipo];
  const n = S.d.numeraciones.find(x => x.id === d.numeracion_id);
  const f = (d.tipo === 'NC' || d.tipo === 'ND') && d.ref_id && docById(d.ref_id);
  const tot = d.tipo === 'RC' ? null : totales(its, d);
  const conc = d.tipo === 'NC' ? CONCEPTOS_NC : CONCEPTOS_ND;
  return `<article class="rep">
    ${d.tipo !== 'RC' ? '<p class="aviso">Documento de prueba: no ha sido transmitido ni validado por la DIAN. No es válido como factura electrónica.</p>' : ''}
    ${d.estado === 'anulado' ? `<p class="aviso bad">ANULADO${d.anulado_motivo ? ': ' + esc(d.anulado_motivo) : ''}</p>` : ''}
    <header class="rep-head">
      <div><h2>${esc(e.nombre)}</h2><p>NIT ${fmtNit(e.nit)}-${e.dv} · ${esc(REGIMENES.find(r => r[0] === e.regimen)?.[1] || '')}${e.responsable_iva ? ' · Responsable de IVA' : ' · No responsable de IVA'}</p>
        <p>${esc([e.direccion, e.ciudad].filter(Boolean).join(', '))}${e.telefono ? ' · Tel. ' + esc(e.telefono) : ''}${e.correo ? ' · ' + esc(e.correo) : ''}</p>
        ${e.responsabilidades ? `<p>Responsabilidades: ${esc(e.responsabilidades)}</p>` : ''}${e.actividad ? `<p>Actividad económica: ${esc(e.actividad)}</p>` : ''}</div>
      <div class="rep-num"><span>${esc(T.nombre.toUpperCase())}</span><b class="mono">${esc(numDoc(d))}</b></div>
    </header>
    ${d.tipo === 'FV' && n?.resolucion ? `<p class="rep-small">Resolución DIAN No. ${esc(n.resolucion)}${n.fecha_resolucion ? ' del ' + fFecha(n.fecha_resolucion) : ''}. Numeración autorizada ${esc(n.prefijo)} ${n.desde} a ${esc(n.prefijo)} ${n.hasta}${n.vigencia_hasta ? ', vigente hasta ' + fFecha(n.vigencia_hasta) : ''}.</p>` : ''}
    <section class="rep-grid">
      <div><h3>${d.tipo === 'RC' ? 'Recibimos de' : 'Adquiriente'}</h3><p><b>${esc(t.nombre)}</b><br>${esc(docId(t))}<br>${esc([t.direccion, t.ciudad].filter(Boolean).join(', '))}${t.telefono ? '<br>Tel. ' + esc(t.telefono) : ''}${t.correo ? '<br>' + esc(t.correo) : ''}</p></div>
      <div><dl class="kv">
        <dt>Fecha</dt><dd>${fFecha(d.fecha)}</dd>
        ${d.tipo === 'FV' ? `<dt>Forma de pago</dt><dd>${d.forma_pago === 'credito' ? 'Crédito' : 'Contado'}</dd>${d.forma_pago === 'credito' ? `<dt>Vence</dt><dd>${fFecha(d.vence)}</dd>` : ''}` : ''}
        ${d.tipo === 'FV' || d.tipo === 'RC' ? `<dt>Medio de pago</dt><dd>${esc(MEDIOS_PAGO.find(x => x[0] === d.medio_pago)?.[1] || '')}</dd>` : ''}
        ${f ? `<dt>Factura afectada</dt><dd class="mono">${esc(numDoc(f))} del ${fFecha(f.fecha)}</dd><dt>Concepto</dt><dd>${esc(conc.find(c => c[0] === d.concepto)?.[1] || '')}</dd>` : ''}
      </dl></div>
    </section>
    ${d.tipo === 'RC' ? `<p class="rep-suma">La suma de <b>${enLetras(d.total)}</b> (<span class="mono">${money(d.total)}</span>)</p>
      <table class="tbl"><thead><tr><th>Concepto</th><th class="r">Valor</th></tr></thead><tbody>
      ${aplDe(d.id).map(a => { const fa = docById(a.factura_id); return `<tr><td>Abono a factura <span class="mono">${esc(fa ? numDoc(fa) : '')}</span></td><td class="r mono">${money(a.valor)}</td></tr>`; }).join('')}
      ${num(d.anticipo) ? `<tr><td>Anticipo</td><td class="r mono">${money(d.anticipo)}</td></tr>` : ''}
      <tr class="strong"><td>Total</td><td class="r mono">${money(d.total)}</td></tr></tbody></table>` :
    `<table class="tbl rep-items"><thead><tr><th>#</th><th>Código</th><th>Descripción</th><th class="r">Cant.</th><th class="r">Vr. unitario</th><th class="r">Desc.</th><th class="r">IVA</th><th class="r">Total</th></tr></thead><tbody>
      ${its.map((it, i) => { const l = linea(it); return `<tr><td>${i + 1}</td><td class="mono">${esc(it.codigo)}</td><td>${esc(it.descripcion)}</td><td class="r mono">${num(it.cantidad).toLocaleString('es-CO')}</td><td class="r mono">${money(it.precio)}</td><td class="r mono">${l.descuento ? money(l.descuento) : ''}</td><td class="r mono">${num(it.iva_pct)}%</td><td class="r mono">${money(l.total)}</td></tr>`; }).join('')}
    </tbody></table>
    <section class="rep-tot"><p class="letras">Son: ${enLetras(tot.neto)}</p><dl class="tot">
      <dt>Subtotal</dt><dd class="mono">${money(tot.bruto)}</dd>${tot.descuento ? `<dt>Descuentos</dt><dd class="mono">−${money(tot.descuento)}</dd>` : ''}
      <dt>Base gravable</dt><dd class="mono">${money(tot.base)}</dd>
      ${tot.porTarifa.filter(x => x.tarifa > 0).map(x => `<dt>IVA ${x.tarifa}% sobre ${money(x.base)}</dt><dd class="mono">${money(x.iva)}</dd>`).join('')}
      <dt class="strong">Total</dt><dd class="mono strong">${money(tot.total)}</dd>
      ${tot.retefuente ? `<dt>Retefuente ${num(d.retefuente_pct)}%</dt><dd class="mono">−${money(tot.retefuente)}</dd>` : ''}
      ${tot.reteiva ? `<dt>ReteIVA ${num(d.reteiva_pct)}%</dt><dd class="mono">−${money(tot.reteiva)}</dd>` : ''}
      ${tot.reteica ? `<dt>ReteICA ${num(d.reteica_milaje)}‰</dt><dd class="mono">−${money(tot.reteica)}</dd>` : ''}
      ${tot.neto !== tot.total ? `<dt class="strong">Neto a pagar</dt><dd class="mono strong">${money(tot.neto)}</dd>` : ''}</dl></section>`}
    ${d.observaciones ? `<p class="rep-obs"><b>Observaciones:</b> ${esc(d.observaciones)}</p>` : ''}
    ${d.tipo === 'RC' ? '<div class="firmas"><span>Elaboró</span><span>Recibí conforme</span></div>' : ''}
    ${d.tipo === 'FV' && e.pie_factura ? `<p class="rep-small">${esc(e.pie_factura)}</p>` : ''}
    <p class="rep-small">Elaborado con AGAsoft.</p>
  </article>`;
}
function vDoc(m, id) {
  const d = docById(id);
  if (!d) { m.innerHTML = '<p>No se encontró el documento.</p>'; return; }
  if (d.estado === 'borrador') { location.replace('#/editar/' + id); return; }
  const c = d.tipo === 'FV' ? cartera(S.d.documentos, S.d.aplicaciones).find(x => x.factura.id === id) : null;
  const rel = S.d.documentos.filter(x => x.estado !== 'borrador' && (x.ref_id === id || S.d.aplicaciones.some(a => a.recibo_id === x.id && a.factura_id === id)));
  m.innerHTML = `<header class="vhead noprint"><div><a class="back" href="#/${d.tipo}">← ${TIPOS[d.tipo].plural}</a><h2>${esc(nomDoc(d))}</h2></div>
    <div class="row">${d.tipo === 'FV' && d.estado === 'emitido' ? `${c?.saldo > 0.009 ? `<a class="btn" href="#/nuevo/RC?ref=${id}">Recibir pago</a>` : ''}<a class="btn" href="#/nuevo/NC?ref=${id}">Nota crédito</a><a class="btn" href="#/nuevo/ND?ref=${id}">Nota débito</a>` : ''}
    ${d.tipo === 'RC' && d.estado === 'emitido' ? '<button id="anular">Anular</button>' : ''}
    <button class="primary" id="imprimir">Imprimir o PDF</button></div></header>
    ${c ? `<section class="kpis noprint"><div class="kpi"><span>Neto factura</span><b class="mono">${money(c.neto)}</b></div><div class="kpi"><span>Notas crédito</span><b class="mono">${money(c.nc)}</b></div><div class="kpi"><span>Pagos</span><b class="mono">${money(c.pagos)}</b></div><div class="kpi ${c.saldo > 0.009 && c.diasVencida ? 'warn' : ''}"><span>Saldo${c.diasVencida && c.saldo > 0.009 ? ` · vencida ${c.diasVencida} días` : ''}</span><b class="mono">${money(c.saldo)}</b></div></section>` : ''}
    <section class="panel">${representacion(d)}</section>
    ${d.estado === 'emitido' ? `<section class="panel stack noprint"><h3>Contabilización</h3>${tablaAsiento(asiento(d, ctxContable()))}</section>` : ''}
    ${rel.length ? `<section class="panel stack noprint"><h3>Documentos relacionados</h3>${tablaDocs(rel, true)}</section>` : ''}`;
  $('imprimir').onclick = () => imprimir(d);
  if ($('anular')) $('anular').onclick = () => dialogo(`<h2>Anular ${esc(nomDoc(d))}</h2><p>Los pagos de este recibo dejan de aplicarse a las facturas.</p>
    <div><label for="f_mot">Motivo</label><input id="f_mot" name="motivo" required maxlength="200"></div>${pie('Anular recibo')}`, async fd => {
    const mot = fd.get('motivo').trim(); if (!mot) throw new Error('Escribe el motivo.');
    await store.anular(d.id, mot); await cargarEmpresa(); toast('Recibo anulado.'); route();
  });
}
function imprimir(d) {
  $('print').innerHTML = representacion(d);
  const t = document.title; document.title = `${nomDoc(d)} - ${emp().nombre}`;
  window.print(); document.title = t;
}

/* ---------- Cartera ---------- */
function vCartera(m) {
  const c = cartera(S.d.documentos, S.d.aplicaciones).filter(x => x.saldo > 0.009);
  const porCli = {};
  for (const x of c) { const k = x.factura.tercero_id; (porCli[k] = porCli[k] || { t: terc(k), l: [], b: [0, 0, 0, 0, 0] }).l.push(x); const dv = x.diasVencida; porCli[k].b[dv <= 0 ? 0 : dv <= 30 ? 1 : dv <= 60 ? 2 : dv <= 90 ? 3 : 4] += x.saldo; }
  const filas = Object.values(porCli).sort((a, b) => b.b.reduce((s, v) => s + v, 0) - a.b.reduce((s, v) => s + v, 0));
  const tot = [0, 0, 0, 0, 0]; filas.forEach(f => f.b.forEach((v, i) => tot[i] += v));
  const H = ['Por vencer', '1–30 días', '31–60', '61–90', 'Más de 90'];
  m.innerHTML = `<header class="vhead"><h2>Cartera</h2><button id="csv">Descargar CSV</button></header>
  <section class="kpis">${H.map((h, i) => `<div class="kpi ${i >= 2 && tot[i] > 0 ? 'warn' : ''}"><span>${h}</span><b class="mono">${money(tot[i])}</b></div>`).join('')}</section>
  <section class="panel">${filas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th>${H.map(h => `<th class="r">${h}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>
    ${filas.map(f => `<tr class="grp"><td><b>${esc(f.t?.nombre)}</b><br><span class="muted mono">${esc(docId(f.t))}</span></td>${f.b.map(v => `<td class="r mono">${v ? money(v) : ''}</td>`).join('')}<td class="r mono strong">${money(f.b.reduce((s, v) => s + v, 0))}</td></tr>
      ${f.l.map(x => `<tr class="click sub-row" data-go="#/doc/${x.factura.id}"><td><a class="mono" href="#/doc/${x.factura.id}">${esc(numDoc(x.factura))}</a> · vence ${fFecha(x.factura.vence)}</td><td colspan="5" class="muted">${x.diasVencida ? `${x.diasVencida} días vencida` : 'Al día'}</td><td class="r mono">${money(x.saldo)}</td></tr>`).join('')}`).join('')}
    </tbody></table></div>` : '<p class="muted">No hay facturas pendientes de pago.</p>'}</section>`;
  $('csv').onclick = () => {
    const rows = [['Cliente', 'Identificación', 'Factura', 'Fecha', 'Vence', 'Días vencida', 'Saldo']].concat(c.map(x => { const t = terc(x.factura.tercero_id); return [t?.nombre, t?.numero, numDoc(x.factura), x.factura.fecha, x.factura.vence || '', x.diasVencida, String(x.saldo).replace('.', ',')]; }));
    descargar(`cartera-${emp().nit}-${hoy()}.csv`, '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  };
}
function descargar(nombre, texto) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

/* ---------- Clientes ---------- */
function formTercero(t = {}, despues) {
  const f = dialogo(`<h2>${t.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
    <div class="grid2">${campoSel('tipo_id', 'Tipo de documento', TIPOS_ID, t.tipo_id || '31')}${campo('numero', 'Número', t.numero ? (t.tipo_id === '31' ? `${t.numero}-${t.dv}` : t.numero) : '', 'required class="mono" inputmode="numeric"')}</div>
    <p class="hint" id="numHint"></p>
    ${campo('nombre', 'Nombre o razón social', t.nombre, 'required maxlength="200"')}
    <div class="grid2">${campo('direccion', 'Dirección', t.direccion)}${campo('ciudad', 'Ciudad', t.ciudad)}</div>
    <div class="grid2">${campo('telefono', 'Teléfono', t.telefono, 'type="tel"')}${campo('correo', 'Correo para enviar facturas', t.correo, 'type="email"')}</div>
    <div class="grid2">${campo('plazo_dias', 'Plazo de pago (días, 0 = contado)', t.plazo_dias ?? 0, 'type="number" min="0" max="365"')}<div class="checkcell">${check('responsable_iva', 'Responsable de IVA', t.responsable_iva)}</div></div>
    <fieldset><legend>Retenciones que este cliente le practica a la empresa</legend><div class="grid3">
      ${campo('retefuente_pct', 'Retefuente %', num(t.retefuente_pct) || '', 'type="number" min="0" max="100" step="0.001"')}
      ${campo('reteiva_pct', 'ReteIVA % (del IVA)', num(t.reteiva_pct) || '', 'type="number" min="0" max="100" step="0.001"')}
      ${campo('reteica_milaje', 'ReteICA por mil', num(t.reteica_milaje) || '', 'type="number" min="0" max="100" step="0.001"')}</div>
      <p class="hint">Se proponen en cada factura a este cliente y se pueden cambiar.</p></fieldset>
    ${pie()}`, async fd => {
    const tipo = fd.get('tipo_id'); let numero = String(fd.get('numero')).trim(), dv = null;
    if (tipo === '31') { const p = parseNit(numero); if (p.error) throw new Error(p.error); numero = p.nit; dv = p.dv; }
    else { numero = numero.replace(/[.\s]/g, ''); if (!/^[0-9A-Za-z-]{3,20}$/.test(numero)) throw new Error('Revisa el número de documento.'); }
    const nombre = String(fd.get('nombre')).trim(); if (!nombre) throw new Error('Escribe el nombre del cliente.');
    if (S.d.terceros.some(x => x.id !== t.id && x.tipo_id === tipo && x.numero === numero)) throw new Error('Ya existe un cliente con ese documento.');
    const row = { empresa_id: S.eid, tipo_id: tipo, numero, dv, nombre, direccion: fd.get('direccion').trim(), ciudad: fd.get('ciudad').trim(), telefono: fd.get('telefono').trim(), correo: fd.get('correo').trim(),
      plazo_dias: Math.max(0, Math.round(num(fd.get('plazo_dias')))), responsable_iva: fd.get('responsable_iva') === 'on', retefuente_pct: num(fd.get('retefuente_pct')), reteiva_pct: num(fd.get('reteiva_pct')), reteica_milaje: num(fd.get('reteica_milaje')) };
    const g = await store.save('terceros', t.id ? { ...row, id: t.id } : row);
    toast('Cliente guardado.');
    if (despues) await despues(g); else { await cargarEmpresa(); route(); }
  }, { ancho: true });
  const tsel = f.querySelector('[name=tipo_id]'), n = f.querySelector('[name=numero]'), h = $('numHint');
  const ver = () => { if (tsel.value !== '31' || !n.value.trim()) { h.textContent = ''; return; } const p = parseNit(n.value); h.textContent = p.error || `Dígito de verificación: ${p.dv}`; h.className = p.error ? 'err' : 'hint'; };
  n.oninput = ver; tsel.onchange = ver; ver();
}
function vClientes(m) {
  let q = '';
  m.innerHTML = `<header class="vhead"><h2>Clientes</h2><div class="row"><button id="imp">Importar CSV</button><button class="primary" id="nuevo">Nuevo cliente</button></div></header>
    <div class="row filters"><input id="q" type="search" placeholder="Buscar por nombre o documento"></div><section class="panel" id="lst"></section>`;
  const cart = cartera(S.d.documentos, S.d.aplicaciones);
  const pintar = () => {
    const l = S.d.terceros.filter(t => !q || `${t.nombre} ${t.numero}`.toLowerCase().includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    $('lst').innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Documento</th><th>Ciudad</th><th class="r">Saldo</th><th></th></tr></thead><tbody>
      ${l.map(t => { const s = r2(cart.filter(c => c.factura.tercero_id === t.id).reduce((a, c) => a + c.saldo, 0)); return `<tr><td>${esc(t.nombre)}</td><td class="mono">${esc(docId(t))}</td><td>${esc(t.ciudad)}</td><td class="r mono">${s > 0.009 ? money(s) : ''}</td>
        <td class="r nowrap"><a class="btn ghost sm" href="#/nuevo/FV?tercero=${t.id}">Facturar</a><button class="ghost sm" data-ed="${t.id}">Editar</button></td></tr>`; }).join('')}</tbody></table></div>` : `<p class="muted">${q ? 'Ningún cliente coincide.' : 'Todavía no hay clientes.'}</p>`;
  };
  $('q').oninput = () => { q = $('q').value.trim().toLowerCase(); pintar(); };
  $('nuevo').onclick = () => formTercero();
  $('lst').onclick = ev => { const b = ev.target.closest('[data-ed]'); if (b) formTercero(terc(b.dataset.ed)); };
  $('imp').onclick = () => importarCSV('clientes');
  pintar();
}

/* ---------- Productos ---------- */
function formProducto(p = {}) {
  dialogo(`<h2>${p.id ? 'Editar producto o servicio' : 'Nuevo producto o servicio'}</h2>
    <div class="grid2">${campo('codigo', 'Código', p.codigo, 'required maxlength="30" class="mono"')}${campo('unidad', 'Unidad', p.unidad || 'UND', 'maxlength="10"')}</div>
    ${campo('nombre', 'Nombre', p.nombre, 'required maxlength="200"')}
    <div class="grid2">${campo('precio', 'Precio de venta (sin IVA)', p.precio ?? '', 'type="number" min="0" step="0.01" class="mono"')}${campoSel('iva_pct', 'IVA', [['19', '19%'], ['5', '5%'], ['0', 'Excluido o exento (0%)']], String(num(p.iva_pct ?? 19)))}</div>
    <div><label for="f_cta">Cuenta de ingreso</label><select id="f_cta" name="cuenta_ingreso"><option value="">La de la empresa (${esc(param().ingresos)})</option>${S.d.cuentas.filter(c => /^4[12]/.test(c.codigo) && c.codigo.length >= 6).map(c => `<option value="${c.codigo}" ${c.codigo === p.cuenta_ingreso ? 'selected' : ''}>${c.codigo} ${esc(c.nombre)}</option>`).join('')}</select></div>
    ${p.id ? check('activo', 'Activo (aparece al facturar)', p.activo !== false) : ''}
    ${pie()}`, async fd => {
    const codigo = String(fd.get('codigo')).trim(), nombre = String(fd.get('nombre')).trim();
    if (!codigo || !nombre) throw new Error('Escribe el código y el nombre.');
    if (S.d.productos.some(x => x.id !== p.id && x.codigo.toLowerCase() === codigo.toLowerCase())) throw new Error('Ya existe un producto con ese código.');
    const row = { empresa_id: S.eid, codigo, nombre, unidad: String(fd.get('unidad')).trim() || 'UND', precio: num(fd.get('precio')), iva_pct: num(fd.get('iva_pct')), cuenta_ingreso: fd.get('cuenta_ingreso') || '', activo: p.id ? fd.get('activo') === 'on' : true };
    await store.save('productos', p.id ? { ...row, id: p.id } : row); await cargarEmpresa(); toast('Guardado.'); route();
  });
}
function vProductos(m) {
  m.innerHTML = `<header class="vhead"><h2>Productos y servicios</h2><div class="row"><button id="imp">Importar CSV</button><button class="primary" id="nuevo">Nuevo</button></div></header>
    <section class="panel">${S.d.productos.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Código</th><th>Nombre</th><th>Unidad</th><th class="r">Precio</th><th class="r">IVA</th><th></th></tr></thead><tbody>
    ${[...S.d.productos].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(p => `<tr class="${p.activo === false ? 'muted' : ''}"><td class="mono">${esc(p.codigo)}</td><td>${esc(p.nombre)}${p.activo === false ? ' <span class="tag">Inactivo</span>' : ''}</td><td>${esc(p.unidad)}</td><td class="r mono">${money(p.precio)}</td><td class="r mono">${num(p.iva_pct)}%</td><td class="r"><button class="ghost sm" data-ed="${p.id}">Editar</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Todavía no hay productos ni servicios.</p>'}</section>`;
  $('nuevo').onclick = () => formProducto();
  $('imp').onclick = () => importarCSV('productos');
  m.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => formProducto(S.d.productos.find(p => p.id === b.dataset.ed)));
}

/* ---------- Importar CSV (Excel > Guardar como CSV) ---------- */
function parseCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"' && txt[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const COLS = {
  clientes: { nombre: ['nombre', 'razonsocial', 'nombrerazonsocial', 'cliente', 'tercero'], numero: ['nit', 'numero', 'identificacion', 'documento', 'cedula', 'numeroidentificacion'], tipo_id: ['tipo', 'tipodocumento', 'tipoidentificacion'], direccion: ['direccion'], ciudad: ['ciudad', 'municipio'], telefono: ['telefono', 'celular', 'telefono1'], correo: ['correo', 'email', 'correoelectronico', 'emailfacturacion'] },
  productos: { codigo: ['codigo', 'referencia', 'sku', 'item'], nombre: ['nombre', 'descripcion', 'producto', 'servicio'], precio: ['precio', 'preciodeventa', 'precioventa', 'valor', 'preciounitario', 'precio1'], iva_pct: ['iva', 'ivapct', 'impuesto', 'tarifaiva', 'porcentajeiva'], unidad: ['unidad', 'unidaddemedida', 'um'] },
};
function importarCSV(cual) {
  const ej = cual === 'clientes' ? 'Nombre;NIT;Dirección;Ciudad;Teléfono;Correo' : 'Código;Nombre;Precio;IVA;Unidad';
  const f = dialogo(`<h2>Importar ${cual}</h2><p>En Excel (o al exportar desde Alegra o World Office) guarda la hoja como <b>CSV</b>. La primera fila debe tener los títulos de las columnas, por ejemplo:</p>
    <pre class="mono">${ej}</pre><input type="file" name="archivo" accept=".csv,text/csv" required><div id="impPrev"></div>${pie('Importar')}`, async () => {
    const r = f._filas; if (!r?.length) throw new Error('Escoge un archivo con datos.');
    let ok = 0, err = [];
    for (const [i, x] of r.entries()) {
      try {
        if (cual === 'clientes') {
          let numero = String(x.numero || '').replace(/[.\s]/g, ''), dv = null, tipo = /cc|cedula|13/i.test(x.tipo_id || '') ? '13' : '31';
          if (tipo === '31') { const p = parseNit(numero); if (p.error) { if (/^\d{5,15}$/.test(numero.split('-')[0])) { tipo = '13'; numero = numero.split('-')[0]; } else throw new Error(p.error); } else { numero = p.nit; dv = p.dv; } }
          if (!x.nombre?.trim() || !numero) throw new Error('falta nombre o número');
          if (S.d.terceros.some(t => t.numero === numero)) throw new Error('ya existe');
          const g = await store.save('terceros', { empresa_id: S.eid, tipo_id: tipo, numero, dv, nombre: x.nombre.trim(), direccion: x.direccion || '', ciudad: x.ciudad || '', telefono: x.telefono || '', correo: x.correo || '', plazo_dias: 0, responsable_iva: false, retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0 });
          S.d.terceros.push(g);
        } else {
          if (!x.codigo?.trim() || !x.nombre?.trim()) throw new Error('falta código o nombre');
          if (S.d.productos.some(p => p.codigo.toLowerCase() === x.codigo.trim().toLowerCase())) throw new Error('ya existe');
          const iva = num(String(x.iva_pct || '19').replace('%', ''));
          const g = await store.save('productos', { empresa_id: S.eid, codigo: x.codigo.trim(), nombre: x.nombre.trim(), precio: num(x.precio), iva_pct: [0, 5, 19].includes(iva) ? iva : iva < 1 ? r2(iva * 100) : 19, unidad: x.unidad || 'UND', activo: true });
          S.d.productos.push(g);
        }
        ok++;
      } catch (e) { err.push(`Fila ${i + 2}: ${e.message}`); }
    }
    await cargarEmpresa(); route();
    toast(`${ok} importados.${err.length ? ` ${err.length} con problemas: ${err.slice(0, 3).join('; ')}${err.length > 3 ? '…' : ''}` : ''}`, err.length > 0);
  });
  f.querySelector('[name=archivo]').onchange = async ev => {
    const file = ev.target.files[0]; if (!file) return;
    let txt = await file.text(); if (txt.includes(String.fromCharCode(0xfffd))) txt = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
    const rows = parseCSV(txt); const head = rows[0].map(norm); const map = {};
    for (const [k, alias] of Object.entries(COLS[cual])) { const i = head.findIndex(h => alias.includes(h)); if (i >= 0) map[k] = i; }
    f._filas = rows.slice(1).map(r => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, (r[i] || '').trim()])));
    const req = cual === 'clientes' ? ['nombre', 'numero'] : ['codigo', 'nombre'];
    const falta = req.filter(k => map[k] === undefined);
    $('impPrev').innerHTML = falta.length ? `<p class="err">No encontré la columna de ${falta.join(' y ')}. Revisa los títulos de la primera fila.</p>` : `<p class="hint">${f._filas.length} filas listas. Columnas reconocidas: ${Object.keys(map).join(', ')}.</p>`;
    if (falta.length) f._filas = null;
  };
}

/* ---------- Numeraciones ---------- */
function formNumeracion(n = {}) {
  const usada = n.id && S.d.documentos.some(d => d.numeracion_id === n.id);
  const f = dialogo(`<h2>${n.id ? 'Editar numeración' : 'Nueva numeración'}</h2>
    <div class="grid2">${campoSel('tipo', 'Documento', Object.entries(TIPOS).map(([k, v]) => [k, v.nombre]), n.tipo || 'FV')}${campo('prefijo', 'Prefijo', n.prefijo, 'maxlength="4" class="mono" pattern="[A-Za-z0-9]{0,4}" placeholder="FE"')}</div>
    <div id="wRes" class="stack"><div class="grid2">${campo('resolucion', 'Número de resolución DIAN', n.resolucion, 'class="mono" inputmode="numeric"')}${campo('fecha_resolucion', 'Fecha de la resolución', n.fecha_resolucion, 'type="date"')}</div>
    <div class="grid2">${campo('vigencia_desde', 'Vigente desde', n.vigencia_desde, 'type="date"')}${campo('vigencia_hasta', 'Vigente hasta', n.vigencia_hasta, 'type="date"')}</div></div>
    <div class="grid3">${campo('desde', 'Desde', n.desde ?? 1, 'type="number" min="1" required class="mono"')}${campo('hasta', 'Hasta', n.hasta ?? '', 'type="number" min="1" required class="mono"')}${campo('siguiente', 'Siguiente número', n.siguiente ?? 1, 'type="number" min="1" required class="mono"')}</div>
    <p class="hint">Si ya venías facturando en otro programa, pon en "Siguiente número" el que sigue al último que emitiste.</p>
    ${check('activa', 'Activa (es la que se usa al emitir)', n.id ? n.activa : true)}
    ${usada ? '<p class="hint">Esta numeración ya tiene documentos: solo cambia el rango o la vigencia si la DIAN lo amplió.</p>' : ''}
    ${pie()}`, async fd => {
    const row = { empresa_id: S.eid, tipo: fd.get('tipo'), prefijo: String(fd.get('prefijo')).trim().toUpperCase(), resolucion: String(fd.get('resolucion') || '').trim(), fecha_resolucion: fd.get('fecha_resolucion') || null,
      vigencia_desde: fd.get('vigencia_desde') || null, vigencia_hasta: fd.get('vigencia_hasta') || null, desde: Math.round(num(fd.get('desde'))), hasta: Math.round(num(fd.get('hasta'))), siguiente: Math.round(num(fd.get('siguiente'))), activa: fd.get('activa') === 'on' };
    if (!/^[A-Z0-9]{0,4}$/.test(row.prefijo)) throw new Error('El prefijo lleva máximo 4 letras o números.');
    if (row.desde < 1 || row.hasta < row.desde) throw new Error('Revisa el rango: "Hasta" debe ser mayor o igual que "Desde".');
    if (row.siguiente < row.desde || row.siguiente > row.hasta + 1) throw new Error('El siguiente número debe estar dentro del rango.');
    if (row.tipo === 'FV' && !row.resolucion) throw new Error('Escribe el número de la resolución de facturación de la DIAN.');
    if (row.vigencia_desde && row.vigencia_hasta && row.vigencia_hasta < row.vigencia_desde) throw new Error('La vigencia termina antes de empezar.');
    if (n.id && n.siguiente > row.siguiente && usada) throw new Error(`El siguiente número no puede bajar de ${n.siguiente}: ya hay documentos emitidos.`);
    if (row.activa) for (const o of S.d.numeraciones.filter(x => x.tipo === row.tipo && x.activa && x.id !== n.id)) await store.save('numeraciones', { id: o.id, activa: false });
    await store.save('numeraciones', n.id ? { ...row, id: n.id } : row); await cargarEmpresa(); toast('Numeración guardada.'); route();
  }, { ancho: true });
  const t = f.querySelector('[name=tipo]'); const sync = () => { $('wRes').hidden = t.value !== 'FV'; }; t.onchange = sync; sync();
  if (usada) t.disabled = true, f.querySelector('[name=prefijo]').readOnly = true;
  if (usada) f.insertAdjacentHTML('afterbegin', `<input type="hidden" name="tipo" value="${n.tipo}">`);
}
function vNumeraciones(m) {
  const l = [...S.d.numeraciones].sort((a, b) => Object.keys(TIPOS).indexOf(a.tipo) - Object.keys(TIPOS).indexOf(b.tipo) || (b.activa - a.activa));
  m.innerHTML = `<header class="vhead"><h2>Numeraciones</h2><button class="primary" id="nuevo">Nueva numeración</button></header>
    <p class="sub">La factura usa el prefijo y el rango de tu resolución DIAN. Las notas y los recibos llevan su propio consecutivo.</p>
    <section class="panel">${l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Documento</th><th>Prefijo</th><th>Resolución</th><th class="r">Rango</th><th class="r">Siguiente</th><th>Vigencia</th><th></th></tr></thead><tbody>
    ${l.map(n => { const quedan = Number(n.hasta) - Number(n.siguiente) + 1; const vence = n.vigencia_hasta && n.vigencia_hasta < sumarDias(hoy(), 30); return `<tr class="${n.activa ? '' : 'muted'}"><td>${TIPOS[n.tipo].nombre} ${n.activa ? '<span class="tag ok">Activa</span>' : '<span class="tag">Inactiva</span>'}</td><td class="mono">${esc(n.prefijo) || '—'}</td><td class="mono">${esc(n.resolucion) || '—'}</td>
      <td class="r mono">${n.desde} – ${Number(n.hasta) >= 999999999 ? 'sin límite' : n.hasta}</td><td class="r mono">${n.siguiente}${n.tipo === 'FV' && quedan <= 50 ? ` <span class="tag bad">quedan ${Math.max(0, quedan)}</span>` : ''}</td>
      <td>${n.vigencia_hasta ? `hasta ${fFecha(n.vigencia_hasta)}${vence ? ' <span class="tag bad">por vencer</span>' : ''}` : '—'}</td><td class="r"><button class="ghost sm" data-ed="${n.id}">Editar</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="muted">No hay numeraciones.</p>'}</section>`;
  $('nuevo').onclick = () => formNumeracion();
  m.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => formNumeracion(S.d.numeraciones.find(n => n.id === b.dataset.ed)));
}

/* ---------- Usuarios (administrador) ---------- */
async function vUsuarios(m) {
  if (!S.perfil?.es_admin) { m.innerHTML = '<p>Solo el administrador ve esta sección.</p>'; return; }
  m.innerHTML = '<header class="vhead"><h2>Usuarios</h2></header><section class="panel" id="lst"><p class="muted">Cargando…</p></section>';
  try {
    const l = await store.listPerfiles();
    $('lst').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${l.map(p => `<tr><td>${esc(p.nombre)}${p.es_admin ? ' <span class="tag">Admin</span>' : ''}</td><td>${esc(p.correo)}</td><td>${p.aprobado ? '<span class="tag ok">Aprobado</span>' : '<span class="tag bad">Pendiente</span>'}</td>
      <td class="r">${p.id === S.user.id ? '' : `<button class="sm ${p.aprobado ? 'ghost' : 'primary'}" data-ap="${p.id}" data-v="${!p.aprobado}">${p.aprobado ? 'Quitar acceso' : 'Aprobar'}</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    $('lst').onclick = async ev => { const b = ev.target.closest('[data-ap]'); if (!b) return; try { await store.setPerfil(b.dataset.ap, { aprobado: b.dataset.v === 'true' }); vUsuarios(m); } catch (e) { fail(e); } };
  } catch (e) { $('lst').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

/* ---------- Contabilidad ---------- */
const param = () => ({ ...parametrosPorDefecto(), ...(emp()?.contabilidad || {}) });
const ctxContable = () => ({ items: S.d.items, aplicaciones: S.d.aplicaciones, productos: S.d.productos, param: param(), docs: S.d.documentos });
const movs = () => movimientos({ ...S.d, param: param() });
const idxCuentas = () => Object.fromEntries(S.d.cuentas.map(c => [c.codigo, c]));
const nomCta = cod => idxCuentas()[cod]?.nombre || '(no está en el plan)';
const F = { desde: hoy().slice(0, 4) + '-01-01', hasta: hoy() };
const linkDoc = m => `<a class="mono" href="#/doc/${m.doc_id}">${esc(TIPOS[m.tipo].corto)} ${esc(m.ref)}</a>`;
const valor = v => v ? money(v) : '';
function tablaAsiento(ms) {
  if (!ms.length) return '<p class="muted">Este documento no genera movimientos.</p>';
  const d = ms.reduce((s, m) => s + m.debito, 0), c = ms.reduce((s, m) => s + m.credito, 0);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cuenta</th><th>Nombre</th><th>Tercero</th><th>Detalle</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead><tbody>
    ${ms.map(m => `<tr><td class="mono"><a href="#/auxiliar?cuenta=${m.cuenta}">${m.cuenta}</a></td><td>${esc(nomCta(m.cuenta))}</td><td>${esc(m.tercero_id ? terc(m.tercero_id)?.nombre : '')}</td><td>${esc(m.detalle)}</td><td class="r mono">${valor(m.debito)}</td><td class="r mono">${valor(m.credito)}</td></tr>`).join('')}
    <tr class="strong"><td colspan="4">Sumas iguales</td><td class="r mono">${money(d)}</td><td class="r mono">${money(c)}</td></tr></tbody></table></div>`;
}
function filtroFechas(id, conDesde, onChange) {
  setTimeout(() => {
    const box = $(id); if (!box) return;
    box.querySelectorAll('input[type=date]').forEach(i => i.onchange = () => { F[i.name] = i.value; onChange(); });
    box.querySelectorAll('[data-per]').forEach(b => b.onclick = () => {
      const h = hoy(), y = h.slice(0, 4), mth = h.slice(0, 7);
      const per = { mes: [mth + '-01', h], ano: [y + '-01-01', h], anterior: [(y - 1) + '-01-01', (y - 1) + '-12-31'] }[b.dataset.per];
      [F.desde, F.hasta] = per; box.querySelector('[name=desde]') && (box.querySelector('[name=desde]').value = F.desde); box.querySelector('[name=hasta]').value = F.hasta; onChange();
    });
  });
  return `<div class="row filters" id="${id}">${conDesde ? `<div><label for="${id}d">Desde</label><input id="${id}d" type="date" name="desde" value="${F.desde}"></div>` : ''}
    <div><label for="${id}h">${conDesde ? 'Hasta' : 'Fecha de corte'}</label><input id="${id}h" type="date" name="hasta" value="${F.hasta}"></div>
    <div class="row per">${conDesde ? '<button type="button" class="sm" data-per="mes">Este mes</button>' : ''}<button type="button" class="sm" data-per="ano">Este año</button><button type="button" class="sm" data-per="anterior">Año anterior</button></div></div>`;
}
const cabInforme = (titulo, sub) => `<header class="rep-head inf-head"><div><h2>${esc(emp().nombre)}</h2><p>NIT ${fmtNit(emp().nit)}-${emp().dv}</p></div><div class="rep-num"><span>${esc(titulo.toUpperCase())}</span><b class="inf-per">${sub}</b></div></header>`;

function vPuc(m) {
  let q = '', soloMov = false;
  const P = param();
  m.innerHTML = `<header class="vhead"><div><h2>Plan de cuentas PUC y NIIF</h2><p class="sub">PUC para comerciantes (Decreto 2650 de 1993). Cada cuenta se homologa a un rubro de los estados financieros NIIF para Pymes.</p></div><button class="primary" id="nueva">Nueva cuenta auxiliar</button></header>
  <details class="panel"><summary><b>Cuentas de la contabilización automática</b> <span class="muted">· a dónde van facturas, notas y recibos</span></summary>
    <form id="parF" class="grid2 par">${Object.entries(PARAMETROS).map(([k, [, label]]) => `<div><label for="par_${k}">${label}</label><input id="par_${k}" name="${k}" list="ctasAux" class="mono" value="${esc(P[k])}"><p class="hint" data-n="${k}">${esc(nomCta(P[k]))}</p></div>`).join('')}
      <div class="row end span-all"><button class="primary">Guardar cuentas</button></div></form>
    <datalist id="ctasAux">${S.d.cuentas.filter(c => c.codigo.length >= 6).map(c => `<option value="${c.codigo}">${esc(c.nombre)}</option>`).join('')}</datalist></details>
  <div class="row filters"><input id="q" type="search" placeholder="Buscar por código o nombre"><label class="check"><input type="checkbox" id="sm"> Solo cuentas con movimiento</label></div>
  <section class="panel" id="lst"></section>`;
  const conMov = new Set(movs().flatMap(x => [1, 2, 4, 6, 8].map(n => x.cuenta.slice(0, n))));
  const pintar = () => {
    const idx = idxCuentas();
    const l = [...S.d.cuentas].filter(c => (!q || c.codigo.startsWith(q) || c.nombre.toLowerCase().includes(q)) && (!soloMov || conMov.has(c.codigo))).sort((a, b) => a.codigo.localeCompare(b.codigo));
    $('lst').innerHTML = `<div class="tbl-wrap"><table class="tbl puc"><thead><tr><th>Código</th><th>Nombre</th><th>Nat.</th><th>Rubro NIIF</th><th>Código NIIF</th><th></th></tr></thead><tbody>
      ${l.slice(0, 600).map(c => { const r = rubroDe(c.codigo, idx); const propio = !!c.niif_rubro; return `<tr class="lv${c.codigo.length}"><td class="mono">${c.codigo}</td><td>${esc(c.nombre)}</td><td>${c.naturaleza === 'D' ? 'Débito' : 'Crédito'}</td>
        <td class="${propio ? '' : 'muted'}">${r ? esc(RUBRO[r]?.nombre) : '—'}${r && RUBRO[r]?.estado !== '—' ? ` <span class="tag">${RUBRO[r].estado}</span>` : ''}</td><td class="mono">${esc(c.niif_codigo)}</td>
        <td class="r nowrap">${conMov.has(c.codigo) ? `<a class="btn ghost sm" href="#/auxiliar?cuenta=${c.codigo}">Auxiliar</a>` : ''}<button class="ghost sm" data-ed="${c.id}">Editar</button></td></tr>`; }).join('')}
      </tbody></table></div>${l.length > 600 ? '<p class="hint">Se muestran las primeras 600 cuentas. Usa el buscador.</p>' : ''}`;
  };
  $('q').oninput = () => { q = $('q').value.trim().toLowerCase(); pintar(); };
  $('sm').onchange = () => { soloMov = $('sm').checked; pintar(); };
  $('lst').onclick = ev => { const b = ev.target.closest('[data-ed]'); if (b) formCuenta(S.d.cuentas.find(c => c.id === b.dataset.ed)); };
  $('nueva').onclick = () => formCuenta();
  $('parF').oninput = ev => { const k = ev.target.name; const h = m.querySelector(`[data-n="${k}"]`); if (h) h.textContent = nomCta(ev.target.value.trim()); };
  $('parF').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData($('parF')); const idx = idxCuentas(); const nuevo = {};
    for (const k of Object.keys(PARAMETROS)) { const v = String(fd.get(k)).trim(); if (!idx[v]) return toast(`La cuenta ${v} no existe en el plan. Créala primero.`, true); nuevo[k] = v; }
    try { await store.save('empresas', { id: S.eid, contabilidad: nuevo }); await recargar(); toast('Cuentas guardadas. Los informes ya usan estas cuentas.'); } catch (e) { fail(e); }
  };
  pintar();
}
function formCuenta(c = {}) {
  const nueva = !c.id;
  const usada = c.codigo && movs().some(x => x.cuenta.startsWith(c.codigo));
  const f = dialogo(`<h2>${nueva ? 'Nueva cuenta' : `Cuenta ${esc(c.codigo)}`}</h2>
    ${nueva ? `${campo('codigo', 'Código', '', 'required inputmode="numeric" class="mono" pattern="[0-9]{6,12}" placeholder="11100501"')}<p class="hint" id="ctaPadre">Debe empezar por una cuenta que ya exista. Ej.: 111005 + 01 para una cuenta bancaria.</p>` : ''}
    ${campo('nombre', 'Nombre', c.nombre, 'required maxlength="120"')}
    <div class="grid2">${campoSel('naturaleza', 'Naturaleza', [['D', 'Débito'], ['C', 'Crédito']], c.naturaleza || 'D')}
    ${campo('niif_codigo', 'Código en el plan NIIF (opcional)', c.niif_codigo, 'class="mono" maxlength="20"')}</div>
    <div><label for="f_rub">Rubro NIIF (línea del estado financiero)</label><select id="f_rub" name="niif_rubro"><option value="">Igual que la cuenta padre</option>
      ${['ESF', 'ER', '—'].map(e => `<optgroup label="${e === 'ESF' ? 'Estado de situación financiera' : e === 'ER' ? 'Estado de resultados' : 'Otros'}">${RUBROS.filter(r => r.estado === e).map(r => `<option value="${r.id}" ${r.id === c.niif_rubro ? 'selected' : ''}>${esc(r.seccion)} · ${esc(r.nombre)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    ${!nueva && !usada && c.codigo.length > 4 ? '<div class="row"><button value="del" class="ghost">Borrar cuenta</button></div>' : ''}
    ${pie()}`, async (fd, btn) => {
    if (btn === 'del') { await store.remove('cuentas', c.id); await cargarEmpresa(); toast('Cuenta borrada.'); route(); return; }
    const row = { empresa_id: S.eid, nombre: String(fd.get('nombre')).trim(), naturaleza: fd.get('naturaleza'), niif_rubro: fd.get('niif_rubro') || null, niif_codigo: String(fd.get('niif_codigo') || '').trim() };
    if (!row.nombre) throw new Error('Escribe el nombre de la cuenta.');
    if (nueva) {
      const cod = String(fd.get('codigo')).trim();
      if (!/^\d{6,12}$/.test(cod) || cod.length % 2) throw new Error('El código lleva 6, 8, 10 o 12 dígitos.');
      if (idxCuentas()[cod]) throw new Error('Ya existe una cuenta con ese código.');
      if (!idxCuentas()[cod.slice(0, cod.length - 2)]) throw new Error(`Primero debe existir la cuenta ${cod.slice(0, cod.length - 2)}.`);
      row.codigo = cod; row.activa = true;
    }
    await store.save('cuentas', nueva ? row : { ...row, id: c.id }); await cargarEmpresa(); toast('Cuenta guardada.'); route();
  });
  if (nueva) {
    const i = f.querySelector('[name=codigo]');
    i.oninput = () => { const cod = i.value.trim(); const p = idxCuentas()[cod.slice(0, cod.length - 2)]; $('ctaPadre').textContent = cod.length >= 6 ? (p ? `Queda dentro de ${p.codigo} ${p.nombre}.` : `No existe la cuenta ${cod.slice(0, cod.length - 2)}.`) : 'Debe empezar por una cuenta que ya exista.'; if (p) f.querySelector('[name=naturaleza]').value = p.naturaleza; };
  }
}

function vBalance(m) {
  let nivel = '4';
  m.innerHTML = `<header class="vhead"><h2>Balance de prueba</h2><button id="csv">Descargar CSV</button></header>
    ${filtroFechas('fb', true, () => pintar())}
    <div class="row filters"><label for="niv">Nivel</label><select id="niv">${opts([['1', 'Clase'], ['2', 'Grupo'], ['4', 'Cuenta'], ['6', 'Subcuenta'], ['99', 'Auxiliar (todo)']], nivel)}</select></div>
    <section class="panel" id="out"></section>`;
  let b;
  const pintar = () => {
    b = balancePrueba(movs(), S.d.cuentas, F.desde, F.hasta);
    const l = b.filas.filter(f => f.codigo.length <= Number(nivel));
    $('out').innerHTML = cabInforme('Balance de prueba', `${fFecha(F.desde)} a ${fFecha(F.hasta)}`) + (l.length ? `<div class="tbl-wrap"><table class="tbl bal"><thead><tr><th>Código</th><th>Cuenta</th><th class="r">Saldo anterior</th><th class="r">Débitos</th><th class="r">Créditos</th><th class="r">Saldo final</th></tr></thead><tbody>
      ${l.map(f => `<tr class="lv${f.codigo.length} click" data-go="#/auxiliar?cuenta=${f.codigo}"><td class="mono">${f.codigo}</td><td>${esc(f.nombre)}</td><td class="r mono">${valor(f.inicial)}</td><td class="r mono">${valor(f.debito)}</td><td class="r mono">${valor(f.credito)}</td><td class="r mono">${valor(f.final)}</td></tr>`).join('')}
      <tr class="strong"><td colspan="3">Sumas iguales</td><td class="r mono">${money(b.debitos)}</td><td class="r mono">${money(b.creditos)}</td><td></td></tr></tbody></table></div>
      ${Math.abs(b.debitos - b.creditos) > 0.009 ? '<p class="err">Los débitos y créditos no cuadran. Revisa las cuentas de la contabilización.</p>' : ''}<p class="hint">Saldos según la naturaleza de cada cuenta. Toca una fila para ver su libro auxiliar.</p>` : '<p class="muted">No hay movimientos en este periodo. Los movimientos salen de las facturas, notas y recibos emitidos.</p>');
  };
  $('niv').onchange = () => { nivel = $('niv').value; pintar(); };
  $('csv').onclick = () => descargar(`balance-${emp().nit}-${F.hasta}.csv`, '﻿' + [['Código', 'Cuenta', 'Saldo anterior', 'Débitos', 'Créditos', 'Saldo final']].concat(b.filas.filter(f => f.codigo.length <= Number(nivel)).map(f => [f.codigo, f.nombre, f.inicial, f.debito, f.credito, f.final].map(v => typeof v === 'number' ? String(v).replace('.', ',') : v))).map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  pintar();
}

function vAuxiliar(m, q) {
  let cuenta = q.get('cuenta') || param().clientes, tercero = '';
  const conMov = [...new Set(movs().map(x => x.cuenta))].sort();
  m.innerHTML = `<header class="vhead"><h2>Libro auxiliar</h2></header>
    <div class="row filters"><div class="grow"><label for="cta">Cuenta</label><input id="cta" list="ctasAll" class="mono" value="${esc(cuenta)}"></div>
      <div class="grow"><label for="ter">Tercero</label><select id="ter"><option value="">Todos</option>${[...S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select></div></div>
    <datalist id="ctasAll">${S.d.cuentas.filter(c => conMov.some(x => x.startsWith(c.codigo))).map(c => `<option value="${c.codigo}">${esc(c.nombre)}</option>`).join('')}</datalist>
    ${filtroFechas('fa', true, () => pintar())}
    <section class="panel" id="out"></section>`;
  const pintar = () => {
    const a = libroAuxiliar(movs(), S.d.cuentas, cuenta, F.desde, F.hasta, tercero);
    $('out').innerHTML = cabInforme('Libro auxiliar', `${esc(cuenta)} ${esc(nomCta(cuenta))}<br><small>${fFecha(F.desde)} a ${fFecha(F.hasta)}</small>`) + `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Documento</th>${cuenta.length < 6 ? '<th>Cuenta</th>' : ''}<th>Tercero</th><th>Detalle</th><th class="r">Débito</th><th class="r">Crédito</th><th class="r">Saldo</th></tr></thead><tbody>
      <tr class="muted"><td colspan="${cuenta.length < 6 ? 7 : 6}">Saldo anterior</td><td class="r mono">${money(a.inicial)}</td></tr>
      ${a.filas.map(x => `<tr><td class="nowrap">${fFecha(x.fecha)}</td><td>${linkDoc(x)}</td>${cuenta.length < 6 ? `<td class="mono">${x.cuenta}</td>` : ''}<td>${esc(x.tercero_id ? terc(x.tercero_id)?.nombre : '')}</td><td>${esc(x.detalle)}</td><td class="r mono">${valor(x.debito)}</td><td class="r mono">${valor(x.credito)}</td><td class="r mono">${money(x.saldo)}</td></tr>`).join('') || `<tr><td colspan="8" class="muted">Sin movimientos en el periodo.</td></tr>`}
      <tr class="strong"><td colspan="${cuenta.length < 6 ? 5 : 4}">Totales</td><td class="r mono">${money(a.debitos)}</td><td class="r mono">${money(a.creditos)}</td><td class="r mono">${money(a.final)}</td></tr></tbody></table></div>`;
  };
  $('cta').onchange = () => { cuenta = $('cta').value.trim().split(' ')[0]; history.replaceState(null, '', '#/auxiliar?cuenta=' + cuenta); pintar(); };
  $('ter').onchange = () => { tercero = $('ter').value; pintar(); };
  pintar();
}

function lineaInforme(x) {
  return x.cuentas?.length ? `<details class="inf-l"><summary><span>${esc(x.nombre)}</span><span class="mono">${money(x.valor)}</span></summary>
    ${x.cuentas.map(c => `<a class="inf-c" href="#/auxiliar?cuenta=${c.codigo}"><span><span class="mono">${c.codigo}</span> ${esc(c.nombre)}</span><span class="mono">${money(c.valor)}</span></a>`).join('')}</details>`
    : `<div class="inf-l plain"><span>${esc(x.nombre)}</span><span class="mono">${money(x.valor)}</span></div>`;
}
function vEsf(m) {
  m.innerHTML = `<header class="vhead"><h2>Estado de situación financiera</h2></header>${filtroFechas('fe', false, () => pintar())}<section class="panel" id="out"></section>`;
  const pintar = () => {
    const e = situacionFinanciera(movs(), S.d.cuentas, F.hasta);
    $('out').innerHTML = cabInforme('Estado de situación financiera', `A ${fFecha(F.hasta)}`) + `<p class="rep-small">Bajo NIIF para Pymes (Decreto 2420 de 2015, Grupo 2). Cifras en pesos colombianos. Toca un rubro para ver las cuentas del PUC que lo forman.</p>
      <div class="inf">${e.grupos.map(g => `<section class="inf-g"><h3>${g.titulo}</h3>${g.secciones.map(sx => sx.lineas.length ? `${sx.titulo ? `<h4>${sx.titulo}</h4>` : ''}${sx.lineas.map(lineaInforme).join('')}<div class="inf-l sub"><span>Total ${(sx.titulo || g.titulo).toLowerCase()}</span><span class="mono">${money(sx.lineas.reduce((s, x) => s + x.valor, 0))}</span></div>` : '').join('') || '<p class="muted">Sin saldos.</p>'}
        <div class="inf-l tot"><span>Total ${g.titulo.toLowerCase()}</span><span class="mono">${money(g.total)}</span></div></section>`).join('')}
        <div class="inf-l tot big"><span>Total pasivo y patrimonio</span><span class="mono">${money(e.pasivo + e.patrimonio)}</span></div></div>
      ${e.cuadra ? '<p class="okmsg">El activo es igual al pasivo más el patrimonio.</p>' : `<p class="err">No cuadra: diferencia de ${money(e.activo - e.pasivo - e.patrimonio)}. Revisa la homologación de las cuentas.</p>`}
      <p class="hint">El resultado del ejercicio incluye los ingresos, costos y gastos que aún no se han cerrado contra la cuenta 36.</p>`;
  };
  pintar();
}
function vEr(m) {
  m.innerHTML = `<header class="vhead"><h2>Estado de resultados</h2></header>${filtroFechas('fr', true, () => pintar())}<section class="panel" id="out"></section>`;
  const pintar = () => {
    const r = estadoResultados(movs(), S.d.cuentas, F.desde, F.hasta);
    $('out').innerHTML = cabInforme('Estado de resultados', `Del ${fFecha(F.desde)} al ${fFecha(F.hasta)}`) + `<p class="rep-small">Bajo NIIF para Pymes, gastos clasificados por función. Cifras en pesos colombianos.</p>
      <div class="inf">${r.secciones.map(sx => sx.total ? `<div class="inf-l tot ${sx.final ? 'big' : ''}"><span>${sx.total}</span><span class="mono">${money(sx.valor)}</span></div>`
        : sx.lineas.length ? `<h4>${sx.titulo}${sx.resta ? ' <span class="muted">(menos)</span>' : ''}</h4>${sx.lineas.map(lineaInforme).join('')}` : '').join('')}</div>`;
  };
  pintar();
}

iniciar().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<p class="err" style="padding:16px">No se pudo iniciar AGAsoft: ${esc(e.message)}</p>`); });
void dvOf;
