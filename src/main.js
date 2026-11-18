import './style.css';
import { crearStore, numeracionPara, motivoNoEliminar } from './store.js';
import { r2, num, parseNit, dvOf, fmtNit, linea, totales, cartera, acreditado, enLetras, TIPOS, CONCEPTOS_NC, CONCEPTOS_ND, TIPOS_ID, FORMAS_PAGO, MEDIOS_PAGO } from './calc.js';
import { datosEjemplo } from './ejemplo.js';
import { TIPOS_COMPRA, totalesCompra, totalEgreso, asientoCompra, cuentasPorPagar, erroresCompra } from './compras.js';
import { COLOMBIA } from './colombia.js';
import { formasPago, formaDe } from './formas.js';
import { nombreTercero, personaDe, PARTES } from './nombres.js';
import { FORMATOS, CATALOGO, CALCULOS, calculoDe, formato, csvFormato, reglasExogena, reglaDe, nombreConcepto } from './exogena.js';
import { AREAS, CONTRATOS, RIESGOS, PERIODOS, CONCEPTOS as CONCEPTOS_NOM, CONCEPTO, NOVEDADES, CUENTA_NETO, paramNomina, cuentaGasto, liquidar, totalesNomina, asientoNomina, cuentasFaltantes, cuentasDeNomina, porPagarLaboral, entidadesFaltantes } from './nomina.js';
import { TIPOS_RET, conceptosRet, tarifasIva, tarifaAplicada, fotoRet, naturalezaRet } from './impuestos.js';
import { COLORES, MODOS, leerTema, guardarLocal, aplicarTema, normalizar } from './tema.js';
import { PLANTILLAS, csvPlantilla, leerFilas, prepararTerceros, prepararVentas, prepararCompras, parseValor } from './importar.js';
import { planInicial, completarPlan, a8, esAuxiliar, parametrosDe, RUBROS, RUBRO, PARAMETROS, nivelDe } from './puc.js';
import { cierreAnual, auxiliarRango, saldosPorTercero, asiento, asientoComprobante, erroresComprobante, TIPOS_COMP, movimientos, balancePrueba, libroAuxiliar, estadoResultados, situacionFinanciera, rubroDe } from './contab.js';

aplicarTema(leerTema());
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
  $('aSubmit').textContent = registro ? 'Empezar prueba gratis' : 'Entrar';
  $('aToggle').textContent = registro ? 'Ya tengo cuenta: entrar' : 'No tengo cuenta: prueba gratis 15 días';
  $('authSub').textContent = registro ? 'Crea tu cuenta y usa AGAsoft gratis durante 15 días. Al terminar escoges tu plan.' : 'Entra con tu correo y tu clave.';
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
    if (registro) {
      const r = await store.signUp(email, pass, nombre);
      if (r?.session) return await iniciar();
      $('okAuth').textContent = 'Listo: tienes 15 días gratis. Si te llegó un correo de confirmación, ábrelo; luego entra con este correo y esta clave.'; $('okAuth').hidden = false;
    }
    else { await store.signIn(email, pass); await iniciar(); }
  } catch (e) { err(e.message); } finally { $('aSubmit').disabled = false; }
});
$('salir').onclick = async () => { await store.signOut(); if (store.mode === 'local') return toast('En modo demostración no hay sesión que cerrar.'); location.hash = ''; location.reload(); };

async function iniciar() {
  S.user = await store.session();
  if (!S.user) { $('auth').hidden = false; $('app').hidden = true; return; }
  S.perfil = await store.perfil();
  if (S.perfil?.tema?.color) { const t = normalizar(S.perfil.tema); guardarLocal(t); aplicarTema(t); }
  if (S.perfil?.suspendido) {
    $('auth').hidden = false; $('app').hidden = true;
    $('authSub').textContent = 'Tu cuenta está suspendida. Comunícate con AGAsoft para reactivarla.';
    await store.signOut(); return;
  }
  if (!S.perfil?.aprobado) {
    $('auth').hidden = false; $('app').hidden = true;
    $('authSub').textContent = 'Tu cuenta está pendiente de aprobación. Cuando el administrador la apruebe, vuelve a entrar.';
    await store.signOut(); return;
  }
  if (S.perfil.prueba_hasta && S.perfil.prueba_hasta < hoy()) return finPrueba();
  const dp = diasPrueba(S.perfil.prueba_hasta);
  $('pruebaTag').hidden = dp === null;
  if (dp !== null) { $('pruebaTag').textContent = dp ? `Prueba gratis: ${dp} día${dp === 1 ? '' : 's'}` : 'Prueba gratis: último día'; $('pruebaTag').classList.toggle('bad', dp <= 3); }
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
// Prueba gratis: días que le quedan (null si la cuenta no está en prueba).
function diasPrueba(f) { return f ? Math.max(0, Math.round((new Date(f + 'T12:00:00') - new Date(hoy() + 'T12:00:00')) / 864e5)) : null; }
function opcionesPlan(planes, sel) {
  return `<div class="planes-op" role="radiogroup" aria-label="Planes">${planes.map(p => `<label class="plan-op"><input type="radio" name="plan" value="${p.id}" ${p.id === sel ? 'checked' : ''}>
    <span><b>${esc(p.nombre)}</b> · <span class="mono">${money(p.precio_mensual)}</span> al mes<br><small class="muted">${esc(p.descripcion)}</small></span></label>`).join('') || '<p class="muted">No hay planes disponibles. Comunícate con AGAsoft.</p>'}</div>`;
}
async function pedirPlan(cont) {
  const id = cont.querySelector('input[name=plan]:checked')?.value;
  if (!id) throw new Error('Escoge un plan.');
  await store.solicitarPlan(id);
}
// Prueba vencida: la cuenta no entra a sus datos hasta que escoja un plan y el administrador lo apruebe.
async function finPrueba() {
  $('auth').hidden = false; $('app').hidden = true; $('authForm').hidden = true;
  let card = $('planCard');
  if (!card) { card = document.createElement('section'); card.id = 'planCard'; card.className = 'auth-card panel stack'; $('auth').append(card); }
  let x = null, planes = [];
  try { [x, planes] = await Promise.all([store.miPlan(), store.planesActivos()]); } catch (e) { fail(e); }
  const pedido = x?.plan_solicitado;
  card.innerHTML = `<div class="brand"><span class="mark" aria-hidden="true">AGA</span><h1>AGAsoft</h1></div>
    <h2>Tu prueba gratis terminó</h2>
    <p class="sub">Tus 15 días gratis terminaron el ${fFecha(S.perfil.prueba_hasta)}. Tus datos siguen guardados: escoge un plan y, cuando AGAsoft lo apruebe, sigues trabajando donde ibas.</p>
    ${pedido ? `<p class="okmsg">Pediste el plan <b>${esc(pedido.nombre)}</b>. Cuando esté aprobado, vuelve a entrar.</p>` : ''}
    ${opcionesPlan(planes, pedido?.id)}
    <p class="err" id="ePlan" hidden></p>
    <button class="primary" id="pedirP">${pedido ? 'Cambiar el plan pedido' : 'Pedir este plan'}</button>
    <button class="ghost" id="salirP">Salir</button>`;
  $('salirP').onclick = async () => { await store.signOut(); location.reload(); };
  $('pedirP').onclick = async () => {
    $('pedirP').disabled = true; $('ePlan').hidden = true;
    try { await pedirPlan(card); S.perfil = await store.perfil(); await finPrueba(); toast('Plan pedido. AGAsoft lo revisa y lo aprueba.'); }
    catch (e) { $('ePlan').textContent = e.message; $('ePlan').hidden = false; $('pedirP').disabled = false; }
  };
}
// Apariencia: color principal y modo claro/oscuro de cada usuario.
function pintarApariencia() {
  const box = $('apariencia'); if (!box) return;
  const t = leerTema();
  box.innerHTML = `<h3>Apariencia</h3><p class="sub">Escoge el color de tu AGAsoft. Lo ves solo tú, en cualquier equipo donde entres.</p>
    <div class="colores" role="group" aria-label="Color">${COLORES.map(c => `<button type="button" class="color-op" data-color="${c.id}" aria-pressed="${c.id === t.color}"><i style="background:${c.claro}"></i>${esc(c.nombre)}</button>`).join('')}</div>
    <div class="grid2"><div><label for="temaModo">Modo</label><select id="temaModo">${MODOS.map(([v, n]) => `<option value="${v}" ${v === t.modo ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>`;
  const cambiar = async campos => {
    const nuevo = normalizar({ ...leerTema(), ...campos });
    guardarLocal(nuevo); aplicarTema(nuevo); pintarApariencia();
    if (S.perfil) S.perfil.tema = nuevo;
    try { await store.guardarTema(nuevo); } catch (_) { /* falta 013_tema.sql: queda guardado en este navegador */ }
  };
  box.querySelectorAll('[data-color]').forEach(b => b.onclick = () => cambiar({ color: b.dataset.color }));
  $('temaModo').onchange = () => cambiar({ modo: $('temaModo').value });
}
async function cargarMiPlan() {
  const box = $('miPlan'); if (!box) return;
  try {
    const [x, planes] = await Promise.all([store.miPlan(), store.planesActivos()]);
    if (!$('miPlan')) return;
    box.innerHTML = tuPlan(x, planes);
    if ($('pedirP')) $('pedirP').onclick = async () => {
      try { await pedirPlan(box); toast('Plan pedido. AGAsoft lo revisa y lo aprueba.'); cargarMiPlan(); } catch (e) { fail(e); }
    };
  } catch (_) { box.hidden = true; }
}
async function cargarEmpresa() {
  S.d = S.eid ? await store.loadEmpresa(S.eid) : null;
  if (S.d && !S.d.cuentas.length) {
    try { await store.saveMany('cuentas', planInicial().map(c => ({ ...c, empresa_id: S.eid }))); S.d.cuentas = (await store.loadEmpresa(S.eid)).cuentas; } catch (_) { /* sin permiso para crear el plan */ }
  }
  // Empresas creadas antes de las auxiliares de 8 dígitos: se completan las subcuentas y auxiliares que falten.
  if (S.d && S.d.cuentas.length) {
    const faltan = completarPlan(S.d.cuentas);
    if (faltan.length) try { await store.saveMany('cuentas', faltan.map(c => ({ ...c, empresa_id: S.eid }))); S.d.cuentas = (await store.loadEmpresa(S.eid)).cuentas; } catch (_) { /* sin permiso para crear cuentas */ }
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
  ['-', 'Compras y gastos'], ['compras/FC', 'Facturas de proveedor'], ['compras/DS', 'Documentos soporte'], ['compras/CE', 'Comprobantes de egreso'], ['cxp', 'Cuentas por pagar'],
  ['-', 'Nómina'], ['nomina', 'Liquidaciones de nómina'], ['empleados', 'Empleados'], ['nominacfg', 'Configuración de nómina'],
  ['-', 'Contabilidad'], ['comprobantes', 'Comprobantes contables'], ['esf', 'Situación financiera'], ['er', 'Estado de resultados'], ['balance', 'Balance de prueba'], ['auxiliar', 'Libro auxiliar'], ['cierre', 'Cierre contable'],
  ['-', 'Datos'], ['clientes', 'Clientes'], ['proveedores', 'Proveedores'], ['productos', 'Productos y servicios'],
  ['-', 'Importar plantillas'], ['importar', 'Cómo importar'], ['importar/terceros', 'Plantilla de terceros'], ['importar/ventas', 'Plantilla de facturas de venta'], ['importar/compras', 'Plantilla de compras'],
  ['-', 'Impuestos'], ['retenciones', 'Conceptos de retención'], ['tarifasiva', 'Tarifas de IVA'], ['exogena', 'Medios magnéticos'], ['exogenacfg', 'Configurar medios magnéticos'],
  ['-', 'Configuración'], ['config', 'Empresa y facturación'], ['numeraciones', 'Numeraciones'], ['formaspago', 'Formas de pago'], ['puc', 'Plan de cuentas PUC y NIIF'], ['usuarios', 'Usuarios'],
];
function renderNav(actual) {
  const items = [...MENU];
  // Grupos desplegables: queda abierto el del módulo actual y los que la persona dejó abiertos.
  let abiertos = []; try { abiertos = JSON.parse(localStorage.getItem('agasoft-menu') || '[]'); } catch (_) {}
  const grupos = []; let g = null;
  for (const [k, t] of items) { if (k === '-') grupos.push(g = { t, l: [] }); else if (g) g.l.push([k, t]); else grupos.push({ l: [[k, t]] }); }
  $('nav').innerHTML = grupos.map(x => {
    const links = x.l.map(([k, t]) => `<a href="#/${k}" ${k === actual ? 'aria-current="page"' : ''}>${t}</a>`).join('');
    if (!x.t) return links;
    const open = x.l.some(([k]) => k === actual) || abiertos.includes(x.t);
    return `<details class="nav-g" data-g="${x.t}" ${open ? 'open' : ''}><summary>${x.t}</summary>${links}</details>`;
  }).join('');
  $('nav').querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => {
    const l = [...$('nav').querySelectorAll('details[open]')].map(x => x.dataset.g);
    try { localStorage.setItem('agasoft-menu', JSON.stringify(l)); } catch (_) {}
  }));
}
window.addEventListener('hashchange', route);
function route() {
  document.body.classList.remove('nav-open');
  const [ruta, qs = ''] = location.hash.split('?');
  const [, v = 'inicio', arg] = ruta.split('/');
  const q = new URLSearchParams(qs);
  renderNav(['nominanueva', 'nominaeditar', 'nominadoc'].includes(v) ? 'nomina' : ['nuevo', 'doc', 'editar'].includes(v) ? (arg && TIPOS[arg] ? arg : docById(arg)?.tipo) : ['comp', 'compnuevo', 'compeditar'].includes(v) ? 'comprobantes' : v === 'compras' || (v === 'importar' && arg) ? v + '/' + arg : ['compra', 'compraeditar'].includes(v) ? 'compras/' + (compraById(arg)?.tipo || 'FC') : v === 'compranueva' ? 'compras/' + (q.get('tipo') || 'FC') : v);
  const m = $('main');
  document.body.classList.remove('onboarding');
  if (!S.eid && v !== 'usuarios') return sinEmpresa(m);
  try {
    if (v === 'inicio') return vInicio(m);
    if (TIPOS[v]) return vLista(m, v);
    if (v === 'nuevo') return vEditor(m, { tipo: arg, ref: q.get('ref'), tercero: q.get('tercero'), clase: q.get('clase') });
    if (v === 'editar') return vEditor(m, { id: arg });
    if (v === 'doc') return vDoc(m, arg);
    if (v === 'cartera') return vCartera(m);
    if (v === 'clientes') return vClientes(m);
    if (v === 'productos') return vProductos(m);
    if (v === 'numeraciones') return vNumeraciones(m);
    if (v === 'formaspago') return vFormasPago(m);
    if (v === 'retenciones') return vRetenciones(m);
    if (v === 'tarifasiva') return vTarifasIva(m);
    if (v === 'cierre') return vCierre(m);
    if (v === 'exogena') return vExogena(m);
    if (v === 'empleados') return vEmpleados(m);
    if (v === 'nomina') return vNominas(m);
    if (v === 'nominanueva') return vNominaEditor(m);
    if (v === 'nominaeditar') return vNominaEditor(m, arg);
    if (v === 'nominadoc') return vNominaDoc(m, arg);
    if (v === 'nominacfg') return vNominaCfg(m);
    if (v === 'exogenacfg') return vExogenaCfg(m, q.get('f'));
    if (v === 'empresa' || v === 'config') return vEmpresa(m);
    if (v === 'usuarios') return vUsuarios(m);
    if (v === 'puc') return vPuc(m);
    if (v === 'comprobantes') return vComprobantes(m);
    if (v === 'compras') return vCompras(m, arg);
    if (v === 'compra') return vCompra(m, arg);
    if (v === 'compranueva') return vCompraEditor(m, { tipo: q.get('tipo'), tercero: q.get('tercero'), ref: q.get('ref') });
    if (v === 'compraeditar') return vCompraEditor(m, { id: arg });
    if (v === 'cxp') return vCxp(m);
    if (v === 'proveedores') return vProveedores(m);
    if (v === 'importar') return vImportar(m, arg);
    if (v === 'comp') return vComp(m, arg);
    if (v === 'compnuevo') return vCompEditor(m, { tipo: q.get('tipo') });
    if (v === 'compeditar') return vCompEditor(m, { id: arg });
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
    <h2>Te damos la bienvenida a AGAsoft${store.mode !== 'local' && S.perfil?.nombre ? ', ' + esc(S.perfil.nombre.split(' ')[0]) : ''}</h2>
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
      vigencia_desde: fd.get('vigencia_desde') || null, vigencia_hasta: fd.get('vigencia_hasta') || null, desde: Math.round(num(fd.get('desde'))) || 1, hasta: Math.round(num(fd.get('hasta'))), siguiente: Math.round(num(fd.get('siguiente'))) || 1, activa: true, electronica: true };
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
const ordenar = l => [...l].sort((a, b) => a.localeCompare(b, 'es'));
const DEPTOS = ordenar(Object.keys(COLOMBIA));
const ubic = x => [x.direccion, x.ciudad, x.departamento && x.departamento !== x.ciudad ? x.departamento : ''].filter(Boolean).join(', ');
// Departamento y municipio de Colombia en listas desplegables; el municipio depende del departamento.
function campoUbicacion(x = {}) {
  let dep = x.departamento || DEPTOS.find(d => COLOMBIA[d].includes(x.ciudad)) || '';
  const munis = dep ? ordenar(COLOMBIA[dep] || []) : [];
  if (x.ciudad && dep && !munis.includes(x.ciudad)) munis.unshift(x.ciudad);
  setTimeout(() => {
    const d = document.querySelector('[data-depto]'), c = document.querySelector('[data-muni]');
    if (!d || !c) return;
    d.onchange = () => { const l = ordenar(COLOMBIA[d.value] || []); c.innerHTML = `<option value="">${d.value ? 'Escoge el municipio…' : 'Primero el departamento'}</option>` + l.map(m => `<option>${esc(m)}</option>`).join(''); c.disabled = !d.value; if (l.length === 1) c.value = l[0]; };
  });
  return `<div class="grid2"><div><label for="f_depto">Departamento</label><select id="f_depto" name="departamento" data-depto><option value="">Escoge el departamento…</option>${DEPTOS.map(d => `<option ${d === dep ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
    <div><label for="f_muni">Municipio</label><select id="f_muni" name="ciudad" data-muni ${dep ? '' : 'disabled'}><option value="">${dep ? 'Escoge el municipio…' : 'Primero el departamento'}</option>${munis.map(m => `<option ${m === x.ciudad ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div></div>`;
}
// NIT con su dígito de verificación al lado, calculado mientras se escribe.
const campoNit = (k, label, val, dv) => `<div><label for="f_${k}">${label}</label><div class="nitrow"><input id="f_${k}" name="${k}" value="${esc(val ?? '')}" required inputmode="numeric" class="mono" placeholder="900123456" autocomplete="off">
  <span class="dvsep" aria-hidden="true">-</span><input class="mono dvbox" data-dv value="${dv ?? ''}" readonly tabindex="-1" aria-label="Dígito de verificación" title="Dígito de verificación (automático)"></div><p class="err" data-nerr hidden></p></div>`;
function ligarDv(input, esNit) {
  const box = input.parentElement.querySelector('[data-dv]'), err = input.closest('div:not(.nitrow)').querySelector('[data-nerr]');
  const ver = () => {
    const activo = esNit(); box.hidden = input.parentElement.querySelector('.dvsep').hidden = !activo;
    const v = input.value.trim(); err.hidden = true;
    if (!activo || !v) { box.value = ''; return; }
    const digitos = v.replace(/[^\d]/g, '');
    if (!/^\d{5,15}$/.test(digitos.split('-')[0])) { box.value = ''; return; }
    const p = parseNit(v.includes('-') ? v : digitos);
    if (p.error) { box.value = ''; err.textContent = p.error; err.hidden = false; return; }
    box.value = p.dv;
    if (p.nit !== digitos && !v.includes('-')) { input.value = p.nit; } // si pegaron el NIT con el DV pegado, se separa
  };
  input.oninput = ver; ver();
  return ver;
}
const check = (k, label, val) => `<label class="check"><input type="checkbox" name="${k}" ${val ? 'checked' : ''}> ${label}</label>`;

/* ---------- Empresa ---------- */
function camposEmpresa(e = {}) {
  return `${campo('nombre', 'Razón social o nombre', e.nombre, 'required maxlength="200"')}
    <div class="grid2">${campoNit('nit', 'NIT', e.nit, e.dv)}
    ${campoSel('tipo_persona', 'Tipo de persona', [['juridica', 'Persona jurídica'], ['natural', 'Persona natural']], e.tipo_persona)}</div>
    <div class="grid2">${campoSel('regimen', 'Régimen', REGIMENES, e.regimen)}
    ${campo('actividad', 'Actividad económica (CIIU)', e.actividad, 'maxlength="60" inputmode="numeric" placeholder="6920"')}</div>
    ${check('responsable_iva', 'Es responsable de IVA (cobra IVA en sus facturas)', e.id ? e.responsable_iva : true)}
    ${campo('direccion', 'Dirección', e.direccion)}
    ${campoUbicacion(e)}
    <div class="grid2">${campo('telefono', 'Teléfono', e.telefono, 'type="tel"')}${campo('correo', 'Correo de facturación', e.correo, 'type="email"')}</div>
    <div><label for="f_pie">Texto al pie de las facturas (opcional)</label><textarea id="f_pie" name="pie_factura" rows="2" maxlength="600">${esc(e.pie_factura)}</textarea></div>`;
}
function activarNit(f) {
  ligarDv(f.querySelector('[name=nit]'), () => true);
}
async function guardarEmpresa(fd, e = {}) {
  const nit = parseNit(fd.get('nit'));
  if (nit.error) throw new Error(nit.error);
  const row = { nombre: fd.get('nombre').trim(), nit: nit.nit, dv: nit.dv, tipo_persona: fd.get('tipo_persona'), regimen: fd.get('regimen'), actividad: fd.get('actividad').trim(),
    responsable_iva: fd.get('responsable_iva') === 'on', direccion: fd.get('direccion').trim(),
    departamento: fd.get('departamento') || '', ciudad: fd.get('ciudad') || '', telefono: fd.get('telefono').trim(), correo: fd.get('correo').trim(), pie_factura: fd.get('pie_factura').trim() };
  if (!row.nombre) throw new Error('Escribe el nombre de la empresa.');
  if (!row.direccion || !row.ciudad) throw new Error('Escribe la dirección y escoge el departamento y el municipio: salen en las facturas.');
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
    location.hash = e.id ? '#/config' : '#/numeraciones'; route();
  }, { ancho: true });
  activarNit(f);
}
function vEmpresa(m) {
  const e = emp();
  const res = S.d.numeraciones.find(n => n.tipo === 'FV' && n.activa && n.electronica);
  const resN = S.d.numeraciones.find(n => n.tipo === 'FV' && n.activa && !n.electronica);
  m.innerHTML = `<header class="vhead"><div><h2>Configuración</h2><p class="sub">Datos de la empresa, resolución de facturación y ajustes contables.</p></div></header>
  <section class="panel stack"><header class="vhead"><h3>Datos de la empresa</h3><button class="primary" id="edit">Modificar</button></header>
    <dl class="kv">
      <dt>Nombre</dt><dd>${esc(e.nombre)}</dd>
      <dt>NIT</dt><dd class="mono">${fmtNit(e.nit)}-${e.dv}</dd>
      <dt>Régimen</dt><dd>${esc(REGIMENES.find(r => r[0] === e.regimen)?.[1] || e.regimen)}</dd>
      <dt>IVA</dt><dd>${e.responsable_iva ? 'Responsable de IVA' : 'No responsable de IVA'}</dd>
      <dt>Dirección</dt><dd>${esc(ubic(e)) || '—'}</dd>
      <dt>Contacto</dt><dd>${esc([e.telefono, e.correo].filter(Boolean).join(' · ')) || '—'}</dd>
    </dl>
  </section>
  <section class="panel stack"><header class="vhead"><h3>Resolución de facturación DIAN</h3><button class="primary" id="editRes">${res ? 'Modificar' : 'Registrar'}</button></header>
    ${res ? `<dl class="kv"><dt>Resolución</dt><dd class="mono">${esc(res.resolucion)}${res.fecha_resolucion ? ' del ' + fFecha(res.fecha_resolucion) : ''}</dd>
      <dt>Prefijo y rango</dt><dd class="mono">${esc(res.prefijo) || '—'} ${res.desde} a ${res.hasta}</dd><dt>Siguiente factura</dt><dd class="mono">${esc(res.prefijo)} ${res.siguiente}</dd>
      <dt>Vigencia</dt><dd>${res.vigencia_hasta ? `${res.vigencia_desde ? fFecha(res.vigencia_desde) + ' a ' : 'hasta '}${fFecha(res.vigencia_hasta)}` : '—'}</dd></dl>`
      : '<p class="muted">Todavía no has registrado la resolución. Sin ella no se pueden emitir facturas.</p>'}
    <p class="hint">Cuando la DIAN te dé una resolución nueva, regístrala aquí y queda como la activa. Las notas y los recibos se manejan en <a href="#/numeraciones">Numeraciones</a>.</p></section>
  <section class="panel stack"><header class="vhead"><h3>Factura normal (no electrónica)</h3><button id="editResN">${resN ? 'Modificar' : 'Crear'}</button></header>
    ${resN ? `<dl class="kv"><dt>Prefijo</dt><dd class="mono">${esc(resN.prefijo) || '—'}</dd><dt>Siguiente factura</dt><dd class="mono">${esc(resN.prefijo)} ${resN.siguiente}</dd></dl>` : '<p class="muted">Sin numeración de facturas normales.</p>'}
    <p class="hint">Las facturas normales no se reportan a la DIAN: se contabilizan al guardar y se pueden editar o anular.</p></section>
  ${store.mode === 'supabase' && !S.perfil?.es_admin ? '<section class="panel stack" id="miPlan"><h3>Tu plan</h3><p class="muted">Cargando…</p></section>' : ''}
  <section class="panel stack" id="apariencia"></section>
  <section class="panel stack"><h3>Contabilidad</h3><p class="sub">Cuentas del PUC, homologación NIIF y cuentas a las que van facturas, notas y recibos.</p><div class="row"><a class="btn" href="#/puc">Abrir plan de cuentas</a></div></section>
  <section class="panel stack danger"><h3>Zona de cuidado</h3>
    <div class="row"><button id="delEmp">Borrar esta empresa</button>${store.mode === 'local' ? '<button id="delDemo">Borrar todos los datos de demostración</button>' : ''}</div></section>`;
  $('edit').onclick = () => formEmpresa(e);
  cargarMiPlan();
  pintarApariencia();
  $('editRes').onclick = () => res ? formNumeracion(res) : formNumeracion({ tipo: 'FV', prefijo: 'FE', electronica: true });
  $('editResN').onclick = () => resN ? formNumeracion(resN) : formNumeracion({ tipo: 'FV', prefijo: 'FN', electronica: false, hasta: 999999999 });
  $('delEmp').onclick = async () => {
    if (!await confirmar('Borrar empresa', `Se borrará <b>${esc(e.nombre)}</b> con todos sus clientes, productos y documentos. Esto no se puede deshacer.`, 'Borrar')) return;
    try { await store.remove('empresas', e.id); S.eid = null; await recargar(); S.eid = S.empresas[0]?.id || null; await cargarEmpresa(); location.hash = '#/inicio'; route(); } catch (er) { fail(er); }
  };
  if ($('delDemo')) $('delDemo').onclick = async () => { if (await confirmar('Borrar demostración', 'Se borran todas las empresas y documentos de este navegador.', 'Borrar todo')) { store.borrarDemo(); location.hash = ''; location.reload(); } };
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
  const c = d.tipo === 'RC' ? '' : ' ' + claseTag(d);
  if (d.estado === 'borrador') return '<span class="tag">Borrador</span>' + c;
  if (d.estado === 'anulado') return '<span class="tag bad">Anulado</span>';
  return '<span class="tag ok">Emitido</span>' + c;
}
const claseTag = d => d.electronica ? '<span class="tag el">Electrónica</span>' : '<span class="tag">Normal</span>';
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
  m.innerHTML = `<header class="vhead"><h2>${T.plural}</h2>${tipo === 'FV' ? '<div class="row"><a class="btn" href="#/nuevo/FV?clase=normal">Nueva factura normal</a><a class="btn primary" href="#/nuevo/FV?clase=electronica">Nueva factura electrónica</a></div>'
    : `<a class="btn primary" href="#/nuevo/${tipo}">Nueva ${T.corto.toLowerCase().replace('recibo', 'recibo de caja')}</a>`}</header>
    <div class="row filters"><input id="q" type="search" placeholder="Buscar por número o cliente"><select id="est" aria-label="Estado"><option value="">Todos</option><option value="borrador">Borradores</option><option value="emitido">Emitidos</option><option value="anulado">Anulados</option></select></div>
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
// Retenciones con concepto (Impuestos › Conceptos de retención): cada tipo tiene un selector de concepto y su porcentaje.
const RET_PCT = { retefuente: 'retefuente_pct', reteiva: 'reteiva_pct', reteica: 'reteica_milaje' };
const conceptos = (uso, tipo) => conceptosRet(emp()?.contabilidad, param(), uso, tipo);
const conceptoSel = (uso, tipo, idSel) => conceptos(uso, tipo).find(c => c.id === $(idSel)?.value) || null;
// Concepto que corresponde a un documento: el que tiene guardado o, si no, el de la misma tarifa.
const conceptoDoc = (uso, tipo, doc) => { const g = doc.retenciones?.[tipo]?.concepto, cs = conceptos(uso, tipo), v = num(doc[RET_PCT[tipo]]);
  return (g && cs.find(c => c.id === g)) || (v ? cs.find(c => num(c.tarifa) === v) : null) || null; };
function campoRet(uso, tipo, ids, doc) {
  const T = TIPOS_RET[tipo], sel = conceptoDoc(uso, tipo, doc);
  return `<div><label for="${ids[0]}">${T.corto} <a class="hint" href="#/retenciones">Conceptos</a></label>
    <select id="${ids[0]}" data-retc="${tipo}"><option value="">Sin concepto (escribe el ${T.unidad === '%' ? 'porcentaje' : 'valor por mil'})</option>${conceptos(uso, tipo).map(c => `<option value="${c.id}" ${c.id === sel?.id ? 'selected' : ''}>${esc(c.nombre)} · ${num(c.tarifa)}${T.unidad === '%' ? '%' : '‰'}${num(c.base_minima) ? ` · base mín. ${money(c.base_minima)}` : ''}</option>`).join('')}</select>
    <input id="${ids[1]}" type="number" min="0" max="100" step="0.001" class="mono" aria-label="${T.corto} ${T.unidad}" value="${num(doc[RET_PCT[tipo]]) || ''}"><p class="hint" id="${ids[0]}H"></p></div>`;
}
// Conecta los selectores: al escoger un concepto pone su tarifa (o 0 si la base no llega a la base mínima).
function ligarRet(uso, mapa, base) {
  for (const [tipo, [idS, idP]] of Object.entries(mapa)) if ($(idS)) $(idS).onchange = () => { const c = conceptoSel(uso, tipo, idS); if (c) { $(idP).value = tarifaAplicada(c, base()) || ''; } $(idP).dispatchEvent(new Event('input', { bubbles: true })); };
}
// Antes de calcular: respeta la base mínima de cada concepto y devuelve la foto de los conceptos para guardar en el documento.
function leerRet(uso, mapa, base) {
  const out = {};
  for (const [tipo, [idS, idP]] of Object.entries(mapa)) {
    const c = $(idS) && conceptoSel(uso, tipo, idS); if (!c) { if ($(idS + 'H')) $(idS + 'H').textContent = ''; continue; }
    if (num(c.base_minima) > 0) { const t = tarifaAplicada(c, base); if (num($(idP).value) !== t) $(idP).value = t || ''; $(idS + 'H').textContent = t ? '' : `No aplica: la base es menor que ${money(c.base_minima)}.`; }
    out[tipo] = fotoRet(c);
  }
  return out;
}
// Cuando cambia el cliente o proveedor: pone el concepto que coincide con la tarifa propuesta.
function syncRet(uso, mapa) { for (const [tipo, [idS, idP]] of Object.entries(mapa)) if ($(idS)) { const v = num($(idP).value), c = v ? conceptos(uso, tipo).find(x => num(x.tarifa) === v) : null; $(idS).value = c?.id || ''; } }
const optsIva = actual => { const ts = tarifasIva(emp()?.contabilidad); const v = String(num(actual)); return (ts.some(t => String(num(t.tarifa)) === v) ? '' : `<option value="${v}" selected>${v}</option>`) + ts.map(t => `<option value="${num(t.tarifa)}" ${String(num(t.tarifa)) === v ? 'selected' : ''}>${num(t.tarifa)}</option>`).join(''); };
function retDe(t) { return t ? { retefuente_pct: num(t.retefuente_pct), reteiva_pct: num(t.reteiva_pct), reteica_milaje: num(t.reteica_milaje) } : { retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0 }; }

function vEditor(m, { id, tipo, ref, tercero, clase }) {
  let doc, items, apl;
  if (id) {
    const d = docById(id);
    if (!d) { m.innerHTML = '<p>No se encontró el documento.</p>'; return; }
    if (d.estado !== 'borrador' && (d.estado !== 'emitido' || d.electronica)) { location.replace('#/doc/' + id); return; }
    doc = { ...d }; items = itemsDe(id).map(i => ({ ...i })); apl = aplDe(id).map(a => ({ ...a })); tipo = d.tipo;
  } else {
    if (!TIPOS[tipo]) { location.replace('#/inicio'); return; }
    const f = ref && docById(ref);
    const t = terc(f?.tercero_id || tercero);
    doc = { empresa_id: S.eid, tipo, fecha: hoy(), tercero_id: t?.id || '', forma_pago: t?.plazo_dias > 0 ? 'credito' : 'contado', vence: t?.plazo_dias > 0 ? sumarDias(hoy(), t.plazo_dias) : '', medio_pago: 'transferencia', ref_id: f?.tipo === 'FV' && (tipo === 'NC' || tipo === 'ND') ? f.id : '', concepto: tipo === 'NC' ? '1' : tipo === 'ND' ? '4' : '', observaciones: '', anticipo: 0, ...retDe(t) };
    // Clase de la factura: la que se pidió; si no, normal salvo que solo exista numeración electrónica. Las notas heredan la de su factura.
    const numFV = el => S.d.numeraciones.some(x => x.tipo === 'FV' && x.activa && !!x.electronica === el);
    doc.electronica = tipo === 'FV' ? (clase ? clase === 'electronica' : !numFV(false) && numFV(true)) : (tipo === 'NC' || tipo === 'ND') ? !!f?.electronica : false;
    if (f && tipo !== 'RC') Object.assign(doc, { retefuente_pct: num(f.retefuente_pct), reteiva_pct: num(f.reteiva_pct), reteica_milaje: num(f.reteica_milaje) });
    items = tipo === 'NC' && f ? itemsDe(f.id).map(i => ({ ...i, id: undefined, documento_id: undefined })) : tipo === 'RC' ? [] : [nuevoItem()];
    apl = tipo === 'RC' && f ? [{ factura_id: f.id, valor: Math.max(0, saldoDe(f.id)) }] : [];
  }
  const T = TIPOS[tipo], esNota = tipo === 'NC' || tipo === 'ND', esRC = tipo === 'RC';
  const RET_V = { retefuente: ['rfC', 'rf'], reteiva: ['riC', 'ri'], reteica: ['ricaC', 'rica'] };
  // Documento ya guardado (no electrónico) que el dueño está editando: conserva su número.
  const editando = !!id && doc.estado === 'emitido';
  // Solo los electrónicos tienen borrador y se emiten; los demás contabilizan al guardar.
  const esElec = () => tipo === 'FV' ? !!doc.electronica : esNota ? !!docById(($('ref') && $('ref').value) || doc.ref_id)?.electronica : false;
  const clientes = [...S.d.terceros].filter(t => t.es_cliente !== false || t.id === doc.tercero_id).sort((a, b) => a.nombre.localeCompare(b.nombre));
  m.innerHTML = `<header class="vhead"><div><h2>${editando ? `Editar ${esc(nomDoc(doc))}` : `${id ? 'Editar' : 'Nueva'} ${T.nombre.toLowerCase()}`}${tipo === 'FV' && !editando ? ` <span id="claseTag">${claseTag(doc)}</span>` : ''}</h2><p class="sub" id="edSub"></p></div></header>
  <form id="ed" class="stack" novalidate>
    <section class="panel grid-doc">
      <div class="span2"><label for="cli">Cliente</label>
        <div class="row nowrap"><select id="cli" required><option value="">Escoge el cliente…</option>${clientes.map(t => `<option value="${t.id}" ${t.id === doc.tercero_id ? 'selected' : ''}>${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`).join('')}</select>
        <button type="button" id="newCli" title="Crear cliente">+ Nuevo</button></div></div>
      <div><label for="fecha">Fecha</label><input id="fecha" type="date" value="${doc.fecha}" required></div>
      ${tipo === 'FV' ? `<div><label for="clase">Clase de factura</label><select id="clase" ${editando ? 'disabled' : ''}>${opts([['normal', 'Normal (no electrónica)'], ['electronica', 'Electrónica (DIAN)']], doc.electronica ? 'electronica' : 'normal')}</select></div>` : ''}
      ${tipo === 'FV' ? `<div><label for="fp">Forma de pago <a class="hint" href="#/formaspago">Configurar</a></label><select id="fp">${fVenta().map(f => `<option value="${f.id}" ${f.id === formaDe(fVenta(), doc.forma_pago === 'credito', doc.cuenta_pago).id ? 'selected' : ''}>${esc(f.nombre)}${f.credito ? '' : ` · ${esc(f.cuenta)}`}</option>`).join('')}</select></div>
        <div id="wVence"><label for="vence">Vence</label><input id="vence" type="date" value="${doc.vence || ''}"></div>` : ''}
      ${esRC ? `<div><label for="rfp">Forma de pago <a class="hint" href="#/formaspago">Configurar</a></label><select id="rfp">${optsContado(fVenta(), doc.cuenta_pago || (doc.id ? (doc.medio_pago === 'efectivo' ? param().caja : param().bancos) : ''))}</select></div>` : ''}
      ${tipo === 'FV' || esRC ? `<div id="wMp"><label for="mp">Medio de pago</label><select id="mp">${opts(MEDIOS_PAGO, doc.medio_pago)}</select></div>` : ''}
      ${esNota ? `<div class="span2"><label for="ref">Factura que corrige</label><select id="ref" required></select></div>
        <div class="span2"><label for="con">Concepto de la ${T.corto.toLowerCase()}</label><select id="con">${opts(tipo === 'NC' ? CONCEPTOS_NC : CONCEPTOS_ND, doc.concepto)}</select></div>` : ''}
    </section>
    ${esRC ? `<section class="panel stack"><h3>Facturas que paga</h3><div id="aplW"></div>
      <div class="grid2"><div><label for="ant">Anticipo o pago sin factura</label><input id="ant" type="number" min="0" step="0.01" class="mono" value="${num(doc.anticipo) || ''}"></div></div></section>` :
    `<section class="panel stack"><div class="vhead"><h3>Productos o servicios</h3>${esNota && doc.concepto === '2' ? '' : '<button type="button" id="addIt">+ Agregar línea</button>'}</div>
      <datalist id="prods">${S.d.productos.filter(p => p.activo !== false).map(p => `<option value="${esc(p.codigo)}">${esc(p.nombre)} · ${money(p.precio)}</option>`).join('')}</datalist>
      <datalist id="prodsN">${S.d.productos.filter(p => p.activo !== false).map(p => `<option value="${esc(p.nombre)}">${esc(p.codigo)} · ${money(p.precio)}</option>`).join('')}</datalist>
      <div class="tbl-wrap"><table class="tbl items"><thead><tr><th>Código</th><th>Descripción</th><th>Cuenta</th><th class="r">Cant.</th><th class="r">Precio unit.</th><th class="r">Desc. %</th><th class="r">IVA %</th><th class="r">Total</th><th></th></tr></thead><tbody id="its"></tbody></table></div>
      <datalist id="ctasIt">${optsLista(cuentasAux())}</datalist>
      ${!emp().responsable_iva ? '<p class="hint">La empresa no es responsable de IVA, por eso el IVA va en 0.</p>' : ''}</section>`}
    <section class="panel grid-doc">
      <div class="span2 c-obs"><label for="obs">Observaciones</label><textarea id="obs" rows="3" maxlength="1000">${esc(doc.observaciones)}</textarea></div>
      ${esRC ? '' : `<div class="span2 ret"><h3>Retenciones que practica el cliente</h3><div class="grid3">
        ${campoRet('venta', 'retefuente', ['rfC', 'rf'], doc)}${campoRet('venta', 'reteiva', ['riC', 'ri'], doc)}${campoRet('venta', 'reteica', ['ricaC', 'rica'], doc)}</div></div>`}
      <div class="span2 totbox" id="tot"></div>
    </section>
    <section class="panel stack"><div class="vhead"><h3>Contabilización</h3><span class="hint" id="asiHint"></span></div><div id="asi"></div></section>
    <p class="err" id="edErr" hidden></p>
    <div class="row end sticky-actions">
      ${id && !editando ? '<button type="button" class="ghost" id="delB">Borrar borrador</button>' : ''}<span class="spacer"></span>
      <a class="btn ghost" href="${editando ? '#/doc/' + id : '#/' + tipo}">Cancelar</a>
      <button type="button" id="saveB">Guardar borrador</button>
      <button type="submit" class="primary" id="emitB">Emitir</button>
    </div>
  </form>`;

  const leerCab = () => {
    doc.tercero_id = $('cli').value; doc.fecha = $('fecha').value;
    if ($('clase')) doc.electronica = $('clase').value === 'electronica';
    if ($('fp')) { const f = fVenta().find(x => x.id === $('fp').value) || fVenta()[0]; doc.forma_pago = f.credito ? 'credito' : 'contado'; doc.cuenta_pago = f.credito ? '' : f.cuenta; doc.vence = doc.forma_pago === 'credito' ? $('vence').value : doc.fecha; }
    if ($('mp')) doc.medio_pago = $('mp').value;
    if ($('rfp')) doc.cuenta_pago = $('rfp').value;
    if ($('ref')) { doc.ref_id = $('ref').value; doc.concepto = $('con').value; }
    doc.observaciones = $('obs').value;
    if ($('rf')) { doc.retenciones = leerRet('venta', RET_V, r2(items.reduce((s2, it) => s2 + linea(it).base, 0))); Object.assign(doc, { retefuente_pct: num($('rf').value), reteiva_pct: num($('ri').value), reteica_milaje: num($('rica').value) }); }
    if ($('ant')) doc.anticipo = num($('ant').value);
  };
  // Cuenta que usará la línea si no se escoge otra: la del producto o la de la empresa.
  const ctaDefecto = it => {
    const P = param(), pr = S.d.productos.find(p => p.id === it.producto_id) || {};
    if (tipo === 'NC') return a8(pr.cuenta_devolucion || P.devoluciones);
    return a8(pr.cuenta_ingreso || (tipo === 'ND' && doc.concepto === '1' ? P.intereses : P.ingresos));
  };
  // Cuadro de la contabilización mientras se edita el borrador.
  const vistaAsiento = () => {
    const box = $('asi'); if (!box) return;
    if (!doc.tercero_id) { box.innerHTML = '<p class="muted">Escoge el cliente para ver la contabilización.</p>'; return; }
    const tmp = { ...doc, id: '__tmp', tipo, estado: 'emitido', prefijo: '', numero: 'borrador' };
    const its = (esRC ? [] : items).map(it => ({ ...it, cuenta: a8(String(it.cuenta || '').trim().split(' ')[0]), documento_id: '__tmp' }));
    const ap = (apl || []).map(a => ({ ...a, recibo_id: '__tmp' }));
    box.innerHTML = tablaAsiento(asiento(tmp, { items: its, aplicaciones: ap, productos: S.d.productos, param: param(), docs: S.d.documentos, tarifas: tarifasIva(emp()?.contabilidad) }));
  };
  const calcular = () => {
    leerCab();
    if (esRC) {
      const t = r2(apl.reduce((s, a) => s + num(a.valor), 0) + num(doc.anticipo));
      Object.assign(doc, { bruto: t, descuento: 0, base: t, iva: 0, retefuente: 0, reteiva: 0, reteica: 0, total: t, neto: t });
      $('tot').innerHTML = `<dl class="tot"><dt>Total recibido</dt><dd class="big mono">${money(t)}</dd></dl><p class="hint letras">${enLetras(t)}</p>`;
      vistaAsiento(); return;
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
    vistaAsiento();
  };
  const pintarItems = () => {
    if (esRC) return;
    const bloqueado = esNota && doc.concepto === '2';
    $('its').innerHTML = items.map((it, i) => `<tr data-i="${i}">
      <td data-l="Código"><input data-k="codigo" list="prods" value="${esc(it.codigo)}" class="mono w-cod" aria-label="Código" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="Descripción" class="c-desc"><input data-k="descripcion" list="prodsN" autocomplete="off" value="${esc(it.descripcion)}" aria-label="Descripción" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="Cuenta"><input data-k="cuenta" list="ctasIt" autocomplete="off" value="${esc(it.cuenta || '')}" placeholder="${esc(ctaDefecto(it))}" class="mono w-cta" aria-label="Cuenta contable" title="${esc(it.cuenta ? nomCta(it.cuenta) : 'Cuenta por defecto: ' + ctaDefecto(it) + ' ' + nomCta(ctaDefecto(it)))}"></td>
      <td data-l="Cantidad"><input data-k="cantidad" type="number" step="any" min="0" value="${it.cantidad}" class="r mono w-num" aria-label="Cantidad" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="Precio unit."><input data-k="precio" type="number" step="0.01" min="0" value="${it.precio}" class="r mono w-val" aria-label="Precio unitario" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="Desc. %"><input data-k="descuento_pct" type="number" step="0.01" min="0" max="100" value="${num(it.descuento_pct) || ''}" class="r mono w-num" aria-label="Descuento %" ${bloqueado ? 'readonly' : ''}></td>
      <td data-l="IVA %"><select data-k="iva_pct" class="w-num" aria-label="IVA %" ${bloqueado || !emp().responsable_iva ? 'disabled' : ''}>${optsIva(it.iva_pct)}</select></td>
      <td class="r mono c-tot" data-l="Total" data-lt="${i}">${money(linea(it).total)}</td>
      <td class="c-del">${bloqueado ? '' : `<button type="button" class="ghost" data-del="${i}" aria-label="Quitar línea">✕</button>`}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Sin líneas.</td></tr>';
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

  // Electrónico: borrador y Emitir. Los demás: un solo botón Guardar que contabiliza.
  const pintarBotones = () => {
    const el = esElec() && !editando;
    $('saveB').hidden = !el; $('emitB').textContent = el ? 'Emitir' : 'Guardar';
    $('edSub').textContent = editando ? 'Al guardar se actualiza la contabilización. El número no cambia.' : el ? 'Borrador: puedes cambiarlo hasta que lo emitas.' : 'Al guardar queda con número y contabilizado. Después se puede editar o anular.';
    $('asiHint').textContent = el ? 'Vista previa. Se registra al emitir.' : 'Vista previa. Se registra al guardar.';
  };

  // Eventos
  const form = $('ed');
  $('cli').onchange = () => {
    const t = terc($('cli').value);
    if (!id && t && !esRC && !doc.ref_id) { Object.assign(doc, retDe(t)); $('rf').value = num(t.retefuente_pct) || ''; $('ri').value = num(t.reteiva_pct) || ''; $('rica').value = num(t.reteica_milaje) || ''; syncRet('venta', RET_V); }
    if ($('fp') && t) { $('fp').value = formaDe(fVenta(), t.plazo_dias > 0, t.plazo_dias > 0 ? '' : (fVenta().find(f => !f.credito)?.cuenta || '')).id; $('vence').value = t.plazo_dias > 0 ? sumarDias($('fecha').value, t.plazo_dias) : ''; $('wVence').hidden = !esCredFP(); if ($('wMp')) $('wMp').hidden = esCredFP(); }
    if ($('ref') && doc.ref_id && docById(doc.ref_id)?.tercero_id !== $('cli').value) doc.ref_id = '';
    pintarRef(); pintarApl(); calcular();
  };
  $('newCli').onclick = () => formTercero({}, async t => { await cargarEmpresa(); const sel = $('cli'); sel.insertAdjacentHTML('beforeend', `<option value="${t.id}">${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`); sel.value = t.id; sel.onchange(); });
  // A crédito no hay medio de pago: se paga después con el recibo de caja.
  const verMp = () => { if ($('fp') && $('wMp')) $('wMp').hidden = esCredFP(); };
  if ($('fp')) { $('wVence').hidden = !esCredFP(); verMp(); $('fp').onchange = () => { $('wVence').hidden = !esCredFP(); verMp(); const t = terc($('cli').value); if (esCredFP() && !$('vence').value) $('vence').value = sumarDias($('fecha').value, t?.plazo_dias || 30); calcular(); }; }
  if ($('ref')) {
    $('ref').onchange = () => {
      const f = docById($('ref').value); doc.ref_id = f?.id || '';
      if (f) {
        if (!$('cli').value) { $('cli').value = f.tercero_id; }
        Object.assign(doc, { retefuente_pct: num(f.retefuente_pct), reteiva_pct: num(f.reteiva_pct), reteica_milaje: num(f.reteica_milaje) });
        $('rf').value = num(f.retefuente_pct) || ''; $('ri').value = num(f.reteiva_pct) || ''; $('rica').value = num(f.reteica_milaje) || ''; syncRet('venta', RET_V);
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
      if (k === 'codigo' || k === 'descripcion') {
        const v = el.value.trim().toLowerCase();
        const p = S.d.productos.find(x => x.activo !== false && (k === 'codigo' ? x.codigo : x.nombre).toLowerCase() === v);
        if (p && k === 'descripcion' && it.producto_id === p.id) { calcular(); return; }
        if (p) { Object.assign(it, nuevoItem(p), { cantidad: it.cantidad || 1 }); it.cuenta = ctaDefecto(it); pintarItems(); m.querySelector(`tr[data-i="${tr.dataset.i}"] [data-k=cantidad]`)?.focus(); }
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
  $('fecha').onchange = () => { const t = terc($('cli').value); if ($('fp') && esCredFP() && t?.plazo_dias) $('vence').value = sumarDias($('fecha').value, t.plazo_dias); calcular(); };

  const errEd = msg => { $('edErr').textContent = msg; $('edErr').hidden = !msg; if (msg) $('edErr').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  const limpiarItems = () => items.filter(it => String(it.descripcion).trim() || num(it.precio)).map(({ id: _i, documento_id: _d, empresa_id: _e, ...it }) => ({ ...it, cuenta: String(it.cuenta || '').trim().split(' ')[0], cantidad: num(it.cantidad), precio: num(it.precio), descuento_pct: num(it.descuento_pct), iva_pct: num(it.iva_pct) }));
  const guardar = async () => {
    calcular();
    if (!doc.tercero_id) throw new Error('Escoge el cliente.');
    if (!doc.fecha) throw new Error('Escribe la fecha.');
    const its = esRC ? [] : limpiarItems();
    for (const it of its) {
      if (!String(it.descripcion).trim()) throw new Error('Cada línea necesita una descripción.');
      if (num(it.cantidad) <= 0) throw new Error(`La cantidad de "${it.descripcion}" debe ser mayor que cero.`);
      if (num(it.precio) < 0) throw new Error(`El precio de "${it.descripcion}" no puede ser negativo.`);
      if (it.cuenta) {
        if (!esAuxiliar(it.cuenta)) throw new Error(`La cuenta ${it.cuenta} de "${it.descripcion}" no es auxiliar: escoge una cuenta de 8 dígitos.`);
        if (!idxCuentas()[it.cuenta]) throw new Error(`La cuenta ${it.cuenta} de "${it.descripcion}" no existe en el plan de cuentas.`);
      }
    }
    const { id: _id, ...campos } = doc;
    // Fechas y referencias vacías van como null: la base de datos no acepta texto vacío en esos campos.
    const g = await store.saveDoc({ ...campos, vence: campos.vence || null, ref_id: campos.ref_id || null, id: doc.id || id || undefined, empresa_id: S.eid, tipo }, its, esRC ? apl.map(a => ({ factura_id: a.factura_id, valor: num(a.valor) })) : []);
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
    // Los que no son electrónicos crean su numeración solos si falta.
    if (esElec()) try { numeracionPara({ ...doc, empresa_id: S.eid, tipo }, S.d.numeraciones); } catch (e) { return e.message; }
    return '';
  };
  if ($('clase')) $('clase').onchange = () => { doc.electronica = $('clase').value === 'electronica'; $('claseTag').innerHTML = claseTag(doc); pintarBotones(); };
  if ($('ref')) $('ref').addEventListener('change', pintarBotones);
  $('saveB').onclick = async () => { errEd(''); $('saveB').disabled = true; try { const g = await guardar(); toast('Borrador guardado.'); history.replaceState(null, '', '#/editar/' + g.id); } catch (e) { errEd(e.message); } finally { $('saveB').disabled = false; } };
  form.onsubmit = async ev => {
    ev.preventDefault(); errEd('');
    calcular();
    if (!doc.tercero_id) return errEd('Escoge el cliente.');
    const msg = validarEmision(); if (msg) return errEd(msg);
    if (esNota) doc.electronica = !!docById(doc.ref_id)?.electronica;
    if (editando) {
      $('emitB').disabled = true;
      try { const g = await guardar(); toast(`Cambios guardados: ${nomDoc(g)}.`); location.hash = '#/doc/' + g.id; } catch (e) { errEd(e.message); } finally { $('emitB').disabled = false; }
      return;
    }
    if (!esElec()) {
      $('emitB').disabled = true;
      const nuevo = !id; let g = null;
      try { g = await guardar(); const e = await store.emitir(g.id); await cargarEmpresa(); toast(`Guardado y contabilizado: ${nomDoc(e)}.`); location.hash = '#/doc/' + e.id; }
      catch (e) {
        // Si no pudo tomar el consecutivo, no deja un borrador suelto.
        if (nuevo && g) { try { await store.remove('documentos', g.id); await cargarEmpresa(); } catch (_) {} doc.id = undefined; id = undefined; }
        errEd(e.message);
      } finally { $('emitB').disabled = false; }
      return;
    }
    const n = numeracionPara({ ...doc, empresa_id: S.eid, tipo }, S.d.numeraciones);
    if (!await confirmar(`Emitir ${T.nombre.toLowerCase()}${tipo === 'FV' ? (doc.electronica ? ' electrónica' : ' normal') : ''}`, `Quedará con el número <b class="mono">${esc(n.prefijo || '')} ${n.siguiente}</b> por <b>${money(esRC ? doc.total : doc.neto)}</b> a nombre de <b>${esc(terc(doc.tercero_id)?.nombre)}</b>.<br>Después de emitida no se puede modificar: se corrige con una nota.`, 'Emitir')) return;
    $('emitB').disabled = true;
    try { const g = await guardar(); const e = await store.emitir(g.id); await cargarEmpresa(); toast(`${nomDoc(e)} ${tipo === 'RC' ? 'emitido' : 'emitida'}.`); location.hash = '#/doc/' + e.id; }
    catch (e) { errEd(e.message); } finally { $('emitB').disabled = false; }
  };
  if ($('delB')) $('delB').onclick = async () => { if (!await confirmar('Borrar borrador', 'El borrador se elimina.', 'Borrar')) return; try { await store.remove('documentos', id); await cargarEmpresa(); location.hash = '#/' + tipo; } catch (e) { fail(e); } };

  ligarRet('venta', RET_V, () => r2(items.reduce((s2, it) => s2 + linea(it).base, 0)));
  pintarRef(); pintarItems(); pintarApl(); calcular(); pintarBotones();
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
    ${d.tipo !== 'RC' && d.electronica ? '<p class="aviso">Factura electrónica pendiente de transmitir a la DIAN: todavía no ha sido validada.</p>' : ''}
    ${d.estado === 'anulado' ? `<p class="aviso bad">ANULADO${d.anulado_motivo ? ': ' + esc(d.anulado_motivo) : ''}</p>` : ''}
    <header class="rep-head">
      <div><h2>${esc(e.nombre)}</h2><p>NIT ${fmtNit(e.nit)}-${e.dv} · ${esc(REGIMENES.find(r => r[0] === e.regimen)?.[1] || '')}${e.responsable_iva ? ' · Responsable de IVA' : ' · No responsable de IVA'}</p>
        <p>${esc(ubic(e))}${e.telefono ? ' · Tel. ' + esc(e.telefono) : ''}${e.correo ? ' · ' + esc(e.correo) : ''}</p>
${e.actividad ? `<p>Actividad económica: ${esc(e.actividad)}</p>` : ''}</div>
      <div class="rep-num"><span>${esc(T.nombre.toUpperCase())}${d.tipo === 'FV' && d.electronica ? ' ELECTRÓNICA' : ''}</span><b class="mono">${esc(numDoc(d))}</b></div>
    </header>
    ${d.tipo === 'FV' && n?.resolucion ? `<p class="rep-small">Resolución DIAN No. ${esc(n.resolucion)}${n.fecha_resolucion ? ' del ' + fFecha(n.fecha_resolucion) : ''}. Numeración autorizada ${esc(n.prefijo)} ${n.desde} a ${esc(n.prefijo)} ${n.hasta}${n.vigencia_hasta ? ', vigente hasta ' + fFecha(n.vigencia_hasta) : ''}.</p>` : ''}
    <section class="rep-grid">
      <div><h3>${d.tipo === 'RC' ? 'Recibimos de' : 'Adquiriente'}</h3><p><b>${esc(t.nombre)}</b><br>${esc(docId(t))}<br>${esc(ubic(t))}${t.telefono ? '<br>Tel. ' + esc(t.telefono) : ''}${t.correo ? '<br>' + esc(t.correo) : ''}</p></div>
      <div><dl class="kv">
        <dt>Fecha</dt><dd>${fFecha(d.fecha)}</dd>
        ${d.tipo === 'FV' ? `<dt>Forma de pago</dt><dd>${esc(nomForma(fVenta(), d.forma_pago === 'credito', d.cuenta_pago))}</dd>${d.forma_pago === 'credito' ? `<dt>Vence</dt><dd>${fFecha(d.vence)}</dd>` : ''}` : ''}
        ${d.tipo === 'RC' ? `<dt>Forma de pago</dt><dd>${esc(nomForma(fVenta(), false, d.cuenta_pago || (d.medio_pago === 'efectivo' ? param().caja : param().bancos)))}</dd>` : ''}
        ${(d.tipo === 'FV' && d.forma_pago !== 'credito') || d.tipo === 'RC' ? `<dt>Medio de pago</dt><dd>${esc(MEDIOS_PAGO.find(x => x[0] === d.medio_pago)?.[1] || '')}</dd>` : ''}
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
    ${d.estado === 'emitido' && !d.electronica ? `<a class="btn" href="#/editar/${id}">Editar</a>` : ''}
    ${d.estado === 'emitido' && !d.electronica ? '<button id="anular">Anular</button>' : ''}
    <button class="primary" id="imprimir">Imprimir o PDF</button></div></header>
    ${c ? `<section class="kpis noprint"><div class="kpi"><span>Neto factura</span><b class="mono">${money(c.neto)}</b></div><div class="kpi"><span>Notas crédito</span><b class="mono">${money(c.nc)}</b></div><div class="kpi"><span>Pagos</span><b class="mono">${money(c.pagos)}</b></div><div class="kpi ${c.saldo > 0.009 && c.diasVencida ? 'warn' : ''}"><span>Saldo${c.diasVencida && c.saldo > 0.009 ? ` · vencida ${c.diasVencida} días` : ''}</span><b class="mono">${money(c.saldo)}</b></div></section>` : ''}
    <section class="panel">${representacion(d)}</section>
    ${d.estado === 'emitido' ? `<section class="panel stack noprint"><h3>Contabilización</h3>${tablaAsiento(asiento(d, ctxContable()))}</section>` : ''}
    ${rel.length ? `<section class="panel stack noprint"><h3>Documentos relacionados</h3>${tablaDocs(rel, true)}</section>` : ''}`;
  $('imprimir').onclick = () => imprimir(d);
  if ($('eliminar')) $('eliminar').onclick = async () => {
    const motivo = motivoNoEliminar(d, S.d.documentos, S.d.aplicaciones);
    if (motivo) return fail(new Error(motivo));
    if (!await confirmar(`Eliminar ${esc(nomDoc(d))}`, `Se borra ${d.tipo === 'FV' ? 'la factura' : 'la nota'} con su contabilización. No es electrónica, así que no se reportó a la DIAN.<br>Si es el último número de su consecutivo, ese número se vuelve a usar. Esto no se puede deshacer.`, 'Eliminar')) return;
    try { await store.eliminar(d.id); await cargarEmpresa(); toast(`${nomDoc(d)} eliminada.`); location.hash = '#/' + d.tipo; } catch (e) { fail(e); }
  };
  if ($('anular')) $('anular').onclick = () => dialogo(`<h2>Anular ${esc(nomDoc(d))}</h2><p>${d.tipo === 'RC' ? 'Los pagos de este recibo dejan de aplicarse a las facturas.' : 'Su contabilización deja de sumar en los informes.'} El número no se vuelve a usar.</p>
    <div><label for="f_mot">Motivo</label><input id="f_mot" name="motivo" required maxlength="200"></div>${pie('Anular')}`, async fd => {
    const mot = fd.get('motivo').trim(); if (!mot) throw new Error('Escribe el motivo.');
    await store.anular(d.id, mot); await cargarEmpresa(); toast(`Anulado: ${nomDoc(d)}.`); route();
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
// Partes del nombre de un tercero viejo que solo tenía el nombre completo.
function partesDe(t) {
  if (t.primer_nombre || t.primer_apellido || !t.nombre) return t;
  const w = String(t.nombre).trim().split(/\s+/);
  const [n1, n2, a1, a2] = w.length >= 4 ? [w[0], w[1], w[2], w.slice(3).join(' ')] : w.length === 3 ? [w[0], '', w[1], w[2]] : [w[0], '', w[1] || '', ''];
  return { ...t, primer_nombre: n1, segundo_nombre: n2, primer_apellido: a1, segundo_apellido: a2 };
}
function formTercero(t = {}, despues, modo = 'cliente') {
  const prov = modo === 'proveedor', empl = modo === 'empleado';
  const quien = prov ? 'proveedor' : empl ? 'empleado' : 'cliente';
  const esProv = t.id ? !!t.es_proveedor : prov, esCli = t.id ? t.es_cliente !== false : !prov && !empl;
  const f = dialogo(`<h2>${t.id ? `Editar ${quien}` : `Nuevo ${quien}`}</h2>
    <div class="grid2">${campoSel('tipo_id', 'Tipo de documento', TIPOS_ID, t.tipo_id || '31')}${campoNit('numero', 'Número', t.numero, t.dv)}</div>
    ${campoSel('tipo_persona', 'Tipo de persona', [['juridica', 'Persona jurídica'], ['natural', 'Persona natural']], t.tipo_persona || personaDe('', t, t.tipo_id || '31'))}
    <div data-p="juridica">${campo('razon_social', 'Razón social', t.razon_social || (t.tipo_persona !== 'natural' ? t.nombre : '') || '', 'maxlength="200"')}</div>
    <div data-p="natural" class="grid2">${(pn => `${campo('primer_nombre', 'Primer nombre', pn.primer_nombre || '', 'maxlength="60"')}${campo('segundo_nombre', 'Segundo nombre', pn.segundo_nombre || '', 'maxlength="60"')}
      ${campo('primer_apellido', 'Primer apellido', pn.primer_apellido || '', 'maxlength="60"')}${campo('segundo_apellido', 'Segundo apellido', pn.segundo_apellido || '', 'maxlength="60"')}`)(t.tipo_persona === 'natural' || (t.id && t.tipo_id !== '31') ? partesDe(t) : t)}</div>
    ${campo('direccion', 'Dirección', t.direccion)}
    ${campoUbicacion(t)}
    <div class="grid2">${campo('telefono', 'Teléfono', t.telefono, 'type="tel"')}${campo('correo', 'Correo para enviar facturas', t.correo, 'type="email"')}</div>
    <div class="grid2" ${empl ? 'hidden' : ''}>${campo('plazo_dias', 'Plazo de pago (días, 0 = contado)', t.plazo_dias ?? 0, 'type="number" min="0" max="365"')}<div class="checkcell">${check('responsable_iva', 'Responsable de IVA', t.responsable_iva)}</div></div>
    <div class="row" ${empl ? 'hidden' : ''}>${check('es_cliente', 'Es cliente', esCli)}${check('es_proveedor', 'Es proveedor', esProv)}</div>
    <fieldset data-fs="cli"><legend>Retenciones que este cliente le practica a la empresa</legend><div class="grid3">
      ${campo('retefuente_pct', 'Retefuente %', num(t.retefuente_pct) || '', 'type="number" min="0" max="100" step="0.001"')}
      ${campo('reteiva_pct', 'ReteIVA % (del IVA)', num(t.reteiva_pct) || '', 'type="number" min="0" max="100" step="0.001"')}
      ${campo('reteica_milaje', 'ReteICA por mil', num(t.reteica_milaje) || '', 'type="number" min="0" max="100" step="0.001"')}</div>
      <p class="hint">Se proponen en cada factura a este cliente y se pueden cambiar.</p></fieldset>
    <fieldset data-fs="prov"><legend>Retenciones que la empresa le practica a este proveedor</legend><div class="grid3">
      ${campo('ret_compra_fuente_pct', 'Retefuente %', num(t.ret_compra_fuente_pct) || '', 'type="number" min="0" max="100" step="0.001"')}
      ${campo('ret_compra_iva_pct', 'ReteIVA % (del IVA)', num(t.ret_compra_iva_pct) || '', 'type="number" min="0" max="100" step="0.001"')}
      ${campo('ret_compra_ica_milaje', 'ReteICA por mil', num(t.ret_compra_ica_milaje) || '', 'type="number" min="0" max="100" step="0.001"')}</div>
      <p class="hint">Se proponen en cada factura de este proveedor y se pueden cambiar.</p></fieldset>
    ${pie()}`, async fd => {
    const tipo = fd.get('tipo_id'); let numero = String(fd.get('numero')).trim(), dv = null;
    if (tipo === '31') { const p = parseNit(numero); if (p.error) throw new Error(p.error); numero = p.nit; dv = p.dv; }
    else { numero = numero.replace(/[.\s]/g, ''); if (!/^[0-9A-Za-z-]{3,20}$/.test(numero)) throw new Error('Revisa el número de documento.'); }
    const nom = nombreTercero(Object.fromEntries(['tipo_persona', 'razon_social', ...PARTES].map(k => [k, fd.get(k) || ''])), tipo);
    if (nom.error) throw new Error(nom.error.charAt(0).toUpperCase() + nom.error.slice(1) + '.');
    if (!empl && fd.get('es_cliente') !== 'on' && fd.get('es_proveedor') !== 'on') throw new Error('Marca si es cliente, proveedor o ambos.');
    if (S.d.terceros.some(x => x.id !== t.id && x.tipo_id === tipo && x.numero === numero)) throw new Error('Ya existe un tercero con ese documento (búscalo en Clientes o Proveedores).');
    const row = { empresa_id: S.eid, tipo_id: tipo, numero, dv, ...nom, direccion: fd.get('direccion').trim(), departamento: fd.get('departamento') || '', ciudad: fd.get('ciudad') || '', telefono: fd.get('telefono').trim(), correo: fd.get('correo').trim(),
      plazo_dias: Math.max(0, Math.round(num(fd.get('plazo_dias')))), responsable_iva: fd.get('responsable_iva') === 'on', retefuente_pct: num(fd.get('retefuente_pct')), reteiva_pct: num(fd.get('reteiva_pct')), reteica_milaje: num(fd.get('reteica_milaje')),
      es_cliente: fd.get('es_cliente') === 'on', es_proveedor: fd.get('es_proveedor') === 'on', ret_compra_fuente_pct: num(fd.get('ret_compra_fuente_pct')), ret_compra_iva_pct: num(fd.get('ret_compra_iva_pct')), ret_compra_ica_milaje: num(fd.get('ret_compra_ica_milaje')) };
    const g = await store.save('terceros', t.id ? { ...row, id: t.id } : row);
    toast(prov ? 'Proveedor guardado.' : empl ? 'Persona guardada.' : 'Cliente guardado.');
    if (despues) await despues(g); else { await cargarEmpresa(); route(); }
  }, { ancho: true });
  const sync = () => { f.querySelector('[data-fs=cli]').hidden = !f.querySelector('[name=es_cliente]').checked; f.querySelector('[data-fs=prov]').hidden = !f.querySelector('[name=es_proveedor]').checked; };
  f.querySelectorAll('[name=es_cliente],[name=es_proveedor]').forEach(x => x.onchange = sync); sync();
  const psel = f.querySelector('[name=tipo_persona]');
  const verP = () => f.querySelectorAll('[data-p]').forEach(x => { x.hidden = x.dataset.p !== psel.value; });
  psel.onchange = verP; verP();
  const tsel = f.querySelector('[name=tipo_id]');
  const ver = ligarDv(f.querySelector('[name=numero]'), () => tsel.value === '31');
  tsel.onchange = () => { ver(); if (!t.id) { psel.value = tsel.value === '31' ? 'juridica' : 'natural'; verP(); } };
}
function vClientes(m) {
  let q = '';
  m.innerHTML = `<header class="vhead"><h2>Clientes</h2><div class="row"><button id="imp">Importar CSV</button><button class="primary" id="nuevo">Nuevo cliente</button></div></header>
    <div class="row filters"><input id="q" type="search" placeholder="Buscar por nombre o documento"></div><section class="panel" id="lst"></section>`;
  const cart = cartera(S.d.documentos, S.d.aplicaciones);
  const pintar = () => {
    const l = S.d.terceros.filter(t => t.es_cliente !== false).filter(t => !q || `${t.nombre} ${t.numero}`.toLowerCase().includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre));
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
// Lista de cuentas auxiliares (8 dígitos) que empiezan como indica el patrón.
const selCuenta = (name, etiqueta, patron, valor, defecto) => `<div><label for="f_${name}">${etiqueta}</label><select id="f_${name}" name="${name}"><option value="">La de la empresa (${esc(defecto)})</option>${cuentasAux().filter(c => patron.test(c.codigo)).map(c => `<option value="${c.codigo}" ${c.codigo === a8(valor) ? 'selected' : ''}>${c.codigo} ${esc(c.nombre)}</option>`).join('')}</select></div>`;
function formProducto(p = {}) {
  dialogo(`<h2>${p.id ? 'Editar producto o servicio' : 'Nuevo producto o servicio'}</h2>
    <div class="grid2">${campo('codigo', 'Código', p.codigo, 'required maxlength="30" class="mono"')}${campo('unidad', 'Unidad', p.unidad || 'UND', 'maxlength="10"')}</div>
    ${campo('nombre', 'Nombre', p.nombre, 'required maxlength="200"')}
    <div class="grid2">${campo('precio', 'Precio de venta (sin IVA)', p.precio ?? '', 'type="number" min="0" step="0.01" class="mono"')}${campoSel('iva_pct', 'Tarifa de IVA', tarifasIva(emp()?.contabilidad).map(t => [String(num(t.tarifa)), t.nombre]), String(num(p.iva_pct ?? 19)))}</div>
    <h3>Contabilización</h3>
    <div class="grid2">${selCuenta('cuenta_ingreso', 'Cuenta en factura y nota débito', /^4[12]/, p.cuenta_ingreso, param().ingresos)}${selCuenta('cuenta_devolucion', 'Cuenta en nota crédito y devolución', /^4/, p.cuenta_devolucion, param().devoluciones)}</div>
    <p class="hint">Si las dejas en "La de la empresa", se usan las de "Cuentas de la contabilización automática" en el plan de cuentas.</p>
    ${p.id ? check('activo', 'Activo (aparece al facturar)', p.activo !== false) : ''}
    ${pie()}`, async fd => {
    const codigo = String(fd.get('codigo')).trim(), nombre = String(fd.get('nombre')).trim();
    if (!codigo || !nombre) throw new Error('Escribe el código y el nombre.');
    if (S.d.productos.some(x => x.id !== p.id && x.codigo.toLowerCase() === codigo.toLowerCase())) throw new Error('Ya existe un producto con ese código.');
    const row = { empresa_id: S.eid, codigo, nombre, unidad: String(fd.get('unidad')).trim() || 'UND', precio: num(fd.get('precio')), iva_pct: num(fd.get('iva_pct')), cuenta_ingreso: fd.get('cuenta_ingreso') || '', cuenta_devolucion: fd.get('cuenta_devolucion') || '', activo: p.id ? fd.get('activo') === 'on' : true };
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
    <div id="wEl">${check('electronica', 'Factura electrónica (con resolución DIAN)', n.id ? !!n.electronica : n.electronica ?? true)}<p class="hint">Desmárcala para la numeración de facturas normales (no electrónicas), que se pueden editar o anular.</p></div>
    <div id="wRes" class="stack"><div class="grid2">${campo('resolucion', 'Número de resolución DIAN', n.resolucion, 'class="mono" inputmode="numeric"')}${campo('fecha_resolucion', 'Fecha de la resolución', n.fecha_resolucion, 'type="date"')}</div>
    <div class="grid2">${campo('vigencia_desde', 'Vigente desde', n.vigencia_desde, 'type="date"')}${campo('vigencia_hasta', 'Vigente hasta', n.vigencia_hasta, 'type="date"')}</div></div>
    <div class="grid3">${campo('desde', 'Desde', n.desde ?? 1, 'type="number" min="1" required class="mono"')}${campo('hasta', 'Hasta', n.hasta ?? '', 'type="number" min="1" required class="mono"')}${campo('siguiente', 'Siguiente número', n.siguiente ?? 1, 'type="number" min="1" required class="mono"')}</div>
    <p class="hint">Si ya venías facturando en otro programa, pon en "Siguiente número" el que sigue al último que emitiste.</p>
    ${check('activa', 'Activa (es la que se usa al emitir)', n.id ? n.activa : true)}
    ${usada ? '<p class="hint">Esta numeración ya tiene documentos: solo cambia el rango o la vigencia si la DIAN lo amplió.</p>' : ''}
    ${pie()}`, async fd => {
    const row = { empresa_id: S.eid, tipo: fd.get('tipo'), prefijo: String(fd.get('prefijo')).trim().toUpperCase(), resolucion: String(fd.get('resolucion') || '').trim(), fecha_resolucion: fd.get('fecha_resolucion') || null,
      vigencia_desde: fd.get('vigencia_desde') || null, vigencia_hasta: fd.get('vigencia_hasta') || null, desde: Math.round(num(fd.get('desde'))), hasta: Math.round(num(fd.get('hasta'))), siguiente: Math.round(num(fd.get('siguiente'))), activa: fd.get('activa') === 'on', electronica: fd.get('tipo') === 'FV' && fd.get('electronica') === 'on' };
    if (!/^[A-Z0-9]{0,4}$/.test(row.prefijo)) throw new Error('El prefijo lleva máximo 4 letras o números.');
    if (row.desde < 1 || row.hasta < row.desde) throw new Error('Revisa el rango: "Hasta" debe ser mayor o igual que "Desde".');
    if (row.siguiente < row.desde || row.siguiente > row.hasta + 1) throw new Error('El siguiente número debe estar dentro del rango.');
    if (row.electronica && !row.resolucion) throw new Error('Escribe el número de la resolución de facturación de la DIAN.');
    if (row.tipo === 'FV' && S.d.numeraciones.some(x => x.tipo === 'FV' && x.id !== n.id && !!x.electronica !== row.electronica && (x.prefijo || '') === row.prefijo)) throw new Error('Usa un prefijo distinto al de la otra clase de factura (electrónica o normal), para que los números no se crucen.');
    if (row.vigencia_desde && row.vigencia_hasta && row.vigencia_hasta < row.vigencia_desde) throw new Error('La vigencia termina antes de empezar.');
    if (n.id && n.siguiente > row.siguiente && usada) throw new Error(`El siguiente número no puede bajar de ${n.siguiente}: ya hay documentos emitidos.`);
    if (row.activa) for (const o of S.d.numeraciones.filter(x => x.tipo === row.tipo && !!x.electronica === row.electronica && x.activa && x.id !== n.id)) await store.save('numeraciones', { id: o.id, activa: false });
    await store.save('numeraciones', n.id ? { ...row, id: n.id } : row); await cargarEmpresa(); toast('Numeración guardada.'); route();
  }, { ancho: true });
  const t = f.querySelector('[name=tipo]'), el = f.querySelector('[name=electronica]');
  const sync = () => { $('wEl').hidden = t.value !== 'FV'; $('wRes').hidden = t.value !== 'FV' || !el.checked; }; t.onchange = sync; el.onchange = sync; sync();
  if (usada) el.disabled = true, f.insertAdjacentHTML('afterbegin', n.electronica ? '<input type="hidden" name="electronica" value="on">' : '');
  if (usada) t.disabled = true, f.querySelector('[name=prefijo]').readOnly = true;
  if (usada) f.insertAdjacentHTML('afterbegin', `<input type="hidden" name="tipo" value="${n.tipo}">`);
}
function vNumeraciones(m) {
  const l = [...S.d.numeraciones].sort((a, b) => Object.keys(TIPOS).indexOf(a.tipo) - Object.keys(TIPOS).indexOf(b.tipo) || (b.activa - a.activa));
  m.innerHTML = `<header class="vhead"><h2>Numeraciones</h2><button class="primary" id="nuevo">Nueva numeración</button></header>
    <p class="sub">La factura electrónica usa el prefijo y el rango de tu resolución DIAN. La factura normal (no electrónica) lleva su propio consecutivo con otro prefijo. Las notas y los recibos llevan el suyo.</p>
    <div class="row"><button id="nuevaN">Nueva numeración de factura normal</button></div>
    <section class="panel">${l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Documento</th><th>Prefijo</th><th>Resolución</th><th class="r">Rango</th><th class="r">Siguiente</th><th>Vigencia</th><th></th></tr></thead><tbody>
    ${l.map(n => { const quedan = Number(n.hasta) - Number(n.siguiente) + 1; const vence = n.vigencia_hasta && n.vigencia_hasta < sumarDias(hoy(), 30); return `<tr class="${n.activa ? '' : 'muted'}"><td>${TIPOS[n.tipo].nombre}${n.tipo === 'FV' ? (n.electronica ? ' electrónica' : ' normal') : ''} ${n.activa ? '<span class="tag ok">Activa</span>' : '<span class="tag">Inactiva</span>'}</td><td class="mono">${esc(n.prefijo) || '—'}</td><td class="mono">${esc(n.resolucion) || '—'}</td>
      <td class="r mono">${n.desde} – ${Number(n.hasta) >= 999999999 ? 'sin límite' : n.hasta}</td><td class="r mono">${n.siguiente}${n.tipo === 'FV' && quedan <= 50 ? ` <span class="tag bad">quedan ${Math.max(0, quedan)}</span>` : ''}</td>
      <td>${n.vigencia_hasta ? `hasta ${fFecha(n.vigencia_hasta)}${vence ? ' <span class="tag bad">por vencer</span>' : ''}` : '—'}</td><td class="r"><button class="ghost sm" data-ed="${n.id}">Editar</button></td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="muted">No hay numeraciones.</p>'}</section>`;
  $('nuevo').onclick = () => formNumeracion();
  $('nuevaN').onclick = () => formNumeracion({ tipo: 'FV', prefijo: 'FN', electronica: false, hasta: 999999999 });
  m.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => formNumeracion(S.d.numeraciones.find(n => n.id === b.dataset.ed)));
}

/* ---------- Usuarios (administrador) ---------- */
// Configuración › Usuarios: quién tiene acceso a esta empresa. El administrador de AGAsoft ve además todas las cuentas.
async function vUsuarios(m) {
  const e = emp(), adm = store.mode === 'supabase' && S.perfil?.es_admin;
  m.innerHTML = `<header class="vhead"><div><h2>Usuarios</h2><p class="sub">Personas que pueden entrar a ${esc(e?.nombre || 'esta empresa')}</p></div></header>
  ${store.mode === 'supabase' ? `<section class="panel stack"><header class="vhead"><h3>Personas con acceso</h3><button id="addM">Dar acceso</button></header>
    <p class="hint">Un <b>responsable</b> puede crear y emitir documentos. <b>Consulta</b> solo puede verlos.</p>
    <table class="tbl"><tbody>${S.d.miembros.map(x => `<tr><td>${esc(x.correo)}</td><td>${x.rol === 'consulta' ? 'Consulta' : 'Responsable'}</td><td class="r"><button class="ghost" data-delm="${x.id}">Quitar</button></td></tr>`).join('') || '<tr><td class="muted">Solo tú tienes acceso.</td></tr>'}</tbody></table></section>` : '<section class="panel"><p class="muted">En el modo de demostración no hay usuarios. Al entrar con tu cuenta puedes dar acceso a tu equipo.</p></section>'}
  ${adm ? '<section class="panel stack"><header class="vhead"><h3>Todas las cuentas de AGAsoft</h3><a class="btn primary" href="/admin">Abrir panel de planes y uso</a></header><p class="hint">Solo lo ve el administrador. Los planes, los límites y el uso se manejan en /admin.</p><div id="lst"><p class="muted">Cargando…</p></div></section>' : ''}`;
  if ($('addM')) $('addM').onclick = () => dialogo(`<h2>Dar acceso</h2>${campo('correo', 'Correo de la persona', '', 'type="email" required')}
    ${campoSel('rol', 'Permiso', [['responsable', 'Responsable: crea y emite documentos'], ['consulta', 'Consulta: solo ve']], 'responsable')}
    <p class="hint">La persona debe tener cuenta aprobada en AGAsoft con ese mismo correo.</p>${pie('Dar acceso')}`, async fd => {
    await store.save('miembros', { empresa_id: e.id, correo: fd.get('correo').trim().toLowerCase(), rol: fd.get('rol') }); await cargarEmpresa(); route();
  });
  m.querySelectorAll('[data-delm]').forEach(b => b.onclick = async () => { try { await store.remove('miembros', b.dataset.delm); await cargarEmpresa(); route(); } catch (er) { fail(er); } });
  if (!adm) return;
  try {
    const l = await store.listPerfiles();
    $('lst').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${l.map(p => `<tr><td>${esc(p.nombre)}${p.es_admin ? ' <span class="tag">Admin</span>' : ''}</td><td>${esc(p.correo)}</td><td>${p.aprobado ? '<span class="tag ok">Aprobado</span>' : '<span class="tag bad">Pendiente</span>'}</td>
      <td class="r">${p.id === S.user.id ? '' : `<button class="sm ${p.aprobado ? 'ghost' : 'primary'}" data-ap="${p.id}" data-v="${!p.aprobado}">${p.aprobado ? 'Quitar acceso' : 'Aprobar'}</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    $('lst').onclick = async ev => { const b = ev.target.closest('[data-ap]'); if (!b) return; try { await store.setPerfil(b.dataset.ap, { aprobado: b.dataset.v === 'true' }); vUsuarios(m); } catch (e) { fail(e); } };
  } catch (e) { $('lst').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

/* ---------- Contabilidad ---------- */
const param = () => parametrosDe(emp()?.contabilidad);
const esCredFP = () => !!fVenta().find(f => f.id === $('fp')?.value)?.credito;
const fVenta = () => formasPago(emp()?.contabilidad, param(), 'venta');
const fCompra = () => formasPago(emp()?.contabilidad, param(), 'compra');
const nomForma = (formas, credito, cuenta) => { if (credito) return formas.find(f => f.credito)?.nombre || 'Crédito'; if (!cuenta) return 'Contado (a clientes)'; const f = formas.find(x => !x.credito && x.cuenta === cuenta); return f ? f.nombre : `Contado · ${cuenta} ${nomCta(cuenta)}`; };
// Opciones de las formas de pago de contado (recibos y egresos); conserva la cuenta guardada aunque ya no esté en la lista.
const optsContado = (formas, cuenta) => { const fs = formas.filter(f => !f.credito); const sel = fs.find(f => f.cuenta === cuenta) || (cuenta ? null : fs[0]);
  return (cuenta && !sel ? `<option value="${esc(cuenta)}" selected>${esc(cuenta)} ${esc(nomCta(cuenta))}</option>` : '') + fs.map(f => `<option value="${esc(f.cuenta)}" ${f === sel ? 'selected' : ''}>${esc(f.nombre)} · ${esc(f.cuenta)}</option>`).join(''); };
const ctxContable = () => ({ items: S.d.items, aplicaciones: S.d.aplicaciones, productos: S.d.productos, param: param(), docs: S.d.documentos, tarifas: tarifasIva(emp()?.contabilidad) });
const movs = () => movimientos({ ...S.d, param: param(), tarifas: tarifasIva(emp()?.contabilidad) });
const idxCuentas = () => Object.fromEntries(S.d.cuentas.map(c => [c.codigo, c]));
const nomCta = cod => idxCuentas()[cod]?.nombre || '(no está en el plan)';
const F = { desde: hoy().slice(0, 4) + '-01-01', hasta: hoy() };
const linkDoc = m => m.origen === 'nomina' ? `<a class="mono" href="#/nominadoc/${m.doc_id}">${esc(m.ref)}</a>` : m.origen === 'compra' ? `<a class="mono" href="#/compra/${m.doc_id}">${esc(TIPOS_COMPRA[m.tipo].corto)} ${esc(m.ref.replace(/^\w+ /, ''))}</a>` : m.origen === 'comp' ? `<a class="mono" href="#/comp/${m.doc_id}">${esc(TIPOS_COMP[m.tipo].corto)} ${esc(m.ref.replace(/^\w+ /, ''))}</a>` : `<a class="mono" href="#/doc/${m.doc_id}">${esc(TIPOS[m.tipo].corto)} ${esc(m.ref)}</a>`;
const valor = v => v ? money(v) : '';
function tablaAsiento(ms, nuevas = {}) {
  if (!ms.length) return '<p class="muted">Este documento no genera movimientos.</p>';
  const d = ms.reduce((s, m) => s + m.debito, 0), c = ms.reduce((s, m) => s + m.credito, 0);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cuenta</th><th>Nombre</th><th>Tercero</th><th>Detalle</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead><tbody>
    ${ms.map(m => `<tr><td class="mono"><a href="#/auxiliar?cuenta=${m.cuenta}">${m.cuenta}</a></td><td>${esc(nuevas[m.cuenta] && !idxCuentas()[m.cuenta] ? `${nuevas[m.cuenta]} (se crea al guardar)` : nomCta(m.cuenta))}</td><td>${esc(m.tercero_id ? terc(m.tercero_id)?.nombre : '')}</td><td>${esc(m.detalle)}</td><td class="r mono">${valor(m.debito)}</td><td class="r mono">${valor(m.credito)}</td></tr>`).join('')}
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

// Padre de una cuenta: los niveles son clase (1), grupo (2), cuenta (4), subcuenta (6) y auxiliar (8).
const padreDe = cod => cod.length <= 1 ? '' : cod.length === 2 ? cod[0] : cod.slice(0, cod.length - 2);
let pucAbiertas = null;
function vPuc(m) {
  let q = '', soloMov = false;
  const P = param();
  if (!pucAbiertas) { try { pucAbiertas = new Set(JSON.parse(localStorage.getItem('agasoft-puc') || '[]')); } catch (_) { pucAbiertas = new Set(); } }
  const recordar = () => { try { localStorage.setItem('agasoft-puc', JSON.stringify([...pucAbiertas])); } catch (_) {} };
  m.innerHTML = `<header class="vhead"><div><h2>Plan de cuentas PUC y NIIF</h2><p class="sub">PUC para comerciantes (Decreto 2650 de 1993), por niveles: clase, grupo (2 dígitos), cuenta (4), subcuenta (6) y auxiliar (8). Solo las auxiliares de 8 dígitos reciben movimientos.</p></div><button class="primary" id="nueva">Nueva cuenta</button></header>
  <details class="panel"><summary><b>Cuentas de la contabilización automática</b> <span class="muted">· a dónde van facturas, notas y recibos</span></summary>
    <form id="parF" class="grid2 par">${Object.entries(PARAMETROS).map(([k, [, label]]) => `<div><label for="par_${k}">${label}</label><input id="par_${k}" name="${k}" list="ctasAux" class="mono" autocomplete="off" value="${esc(P[k])}"><p class="hint" data-n="${k}">${esc(nomCta(P[k]))}</p></div>`).join('')}
      <div class="row end span-all"><button class="primary">Guardar cuentas</button></div></form>
    <datalist id="ctasAux">${optsLista(cuentasAux())}</datalist></details>
  <div class="row filters"><input id="q" type="search" placeholder="Buscar por código o nombre"><label class="check"><input type="checkbox" id="sm"> Solo cuentas con movimiento</label>
    <span class="spacer"></span><button class="sm" id="expT">Abrir todo</button><button class="sm" id="conT">Cerrar todo</button></div>
  <section class="panel" id="lst"></section>`;
  const conMov = new Set(movs().flatMap(x => [1, 2, 4, 6, 8].map(n => x.cuenta.slice(0, n))));
  const pintar = () => {
    const idx = idxCuentas();
    const todas = [...S.d.cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo));
    const conHijas = new Set(todas.map(c => padreDe(c.codigo)).filter(Boolean));
    const filtrando = !!q || soloMov;
    // Sin filtro: árbol desplegable (cada cuenta se ve si todas sus cuentas padre están abiertas). Con filtro: lista plana.
    const visible = c => { for (let p = padreDe(c.codigo); p; p = padreDe(p)) if (idx[p] && !pucAbiertas.has(p)) return false; return true; };
    const l = todas.filter(c => filtrando ? (!q || c.codigo.startsWith(q) || c.nombre.toLowerCase().includes(q)) && (!soloMov || conMov.has(c.codigo)) : visible(c));
    $('lst').innerHTML = `<div class="tbl-wrap"><table class="tbl puc"><thead><tr><th>Código</th><th>Nombre</th><th>Nivel</th><th>Nat.</th><th>Rubro NIIF</th><th></th></tr></thead><tbody>
      ${l.slice(0, 800).map(c => { const r = rubroDe(c.codigo, idx); const propio = !!c.niif_rubro; const hijas = conHijas.has(c.codigo); const ab = pucAbiertas.has(c.codigo);
        return `<tr class="lv${c.codigo.length} ${hijas && !filtrando ? 'click' : ''}" ${hijas && !filtrando ? `data-tg="${c.codigo}"` : ''}>
        <td class="mono nowrap">${!filtrando ? `<span class="tg" aria-hidden="true">${hijas ? (ab ? '▾' : '▸') : ''}</span>` : ''}${c.codigo}</td><td>${esc(c.nombre)}</td><td class="muted">${nivelDe(c.codigo)}</td><td>${c.naturaleza === 'D' ? 'Débito' : 'Crédito'}</td>
        <td class="${propio ? '' : 'muted'}">${r ? esc(RUBRO[r]?.nombre) : '—'}${r && RUBRO[r]?.estado !== '—' ? ` <span class="tag">${RUBRO[r].estado}</span>` : ''}</td>
        <td class="r nowrap">${conMov.has(c.codigo) ? `<a class="btn ghost sm" href="#/auxiliar?cuenta=${c.codigo}">Auxiliar</a>` : ''}${c.codigo.length < 8 ? `<button class="ghost sm" data-sub="${c.codigo}" title="Crear una cuenta dentro de ${c.codigo}">+ Crear</button>` : ''}<button class="ghost sm" data-ed="${c.id}">Editar</button></td></tr>`; }).join('')}
      </tbody></table></div>${l.length > 800 ? '<p class="hint">Se muestran las primeras 800 cuentas. Usa el buscador.</p>' : ''}`;
  };
  $('q').oninput = () => { q = $('q').value.trim().toLowerCase(); pintar(); };
  $('sm').onchange = () => { soloMov = $('sm').checked; pintar(); };
  $('expT').onclick = () => { pucAbiertas = new Set(S.d.cuentas.filter(c => c.codigo.length < 8).map(c => c.codigo)); recordar(); pintar(); };
  $('conT').onclick = () => { pucAbiertas = new Set(); recordar(); pintar(); };
  $('lst').onclick = ev => {
    const b = ev.target.closest('[data-ed]'); if (b) return formCuenta(S.d.cuentas.find(c => c.id === b.dataset.ed));
    const sub = ev.target.closest('[data-sub]'); if (sub) return formCuenta({}, sub.dataset.sub);
    const tr = ev.target.closest('[data-tg]'); if (!tr || ev.target.closest('a,button')) return;
    const cod = tr.dataset.tg; if (pucAbiertas.has(cod)) pucAbiertas.delete(cod); else pucAbiertas.add(cod); recordar(); pintar();
  };
  $('nueva').onclick = () => formCuenta();
  $('parF').oninput = ev => { const k = ev.target.name; const h = m.querySelector(`[data-n="${k}"]`); if (h) h.textContent = nomCta(ev.target.value.trim()); };
  $('parF').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData($('parF')); const idx = idxCuentas(); const nuevo = {};
    for (const k of Object.keys(PARAMETROS)) { const v = String(fd.get(k)).trim(); if (!esAuxiliar(v)) return toast(`La cuenta ${v} no es auxiliar: usa una cuenta de 8 dígitos.`, true); if (!idx[v]) return toast(`La cuenta ${v} no existe en el plan. Créala primero.`, true); nuevo[k] = v; }
    try { await store.save('empresas', { id: S.eid, contabilidad: { ...(emp()?.contabilidad || {}), ...nuevo } }); await recargar(); toast('Cuentas guardadas. Los informes ya usan estas cuentas.'); } catch (e) { fail(e); }
  };
  pintar();
}
/* ---------- Formas de pago (ventas y compras) ---------- */
function vFormasPago(m) {
  const P = param(), todas = formasPago(emp()?.contabilidad, P);
  const fila = f => `<tr><td><b>${esc(f.nombre)}</b></td><td>${f.credito ? '<span class="tag">Crédito</span>' : '<span class="tag ok">Contado</span>'}</td>
    <td class="mono">${f.credito ? (f.uso === 'venta' ? P.clientes : P.proveedores) : esc(f.cuenta)} <span class="muted">${esc(nomCta(f.credito ? (f.uso === 'venta' ? P.clientes : P.proveedores) : f.cuenta))}</span></td>
    <td>${f.credito ? (f.uso === 'venta' ? 'Queda en cartera' : 'Queda en cuentas por pagar') : 'Queda pagada'}</td>
    <td class="r nowrap"><button class="sm" data-ef="${f.id}">Editar</button><button class="sm ghost" data-bf="${f.id}">Quitar</button></td></tr>`;
  const tabla = (uso, titulo) => `<section class="panel stack"><header class="vhead"><h3>${titulo}</h3><button class="primary" data-nf="${uso}">Nueva forma de pago</button></header>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Forma de pago</th><th>Tipo</th><th>Cuenta</th><th>Efecto</th><th></th></tr></thead><tbody>
    ${todas.filter(f => f.uso === uso).map(fila).join('') || '<tr><td colspan="5" class="muted">Sin formas de pago.</td></tr>'}</tbody></table></div></section>`;
  m.innerHTML = `<header class="vhead"><div><h2>Formas de pago</h2><p class="sub">Las que aparecen al hacer una factura de venta o de compra, y la cuenta a la que va cada una.</p></div></header>
    ${tabla('venta', 'Facturas de venta')}${tabla('compra', 'Facturas de compra y documentos soporte')}
    <p class="hint">A <b>crédito</b>: usa la cuenta de clientes o de proveedores de la empresa (Plan de cuentas › Cuentas de la empresa) y queda pendiente hasta el recibo o el egreso. De <b>contado</b>: el valor va directo a la cuenta que escojas (caja, bancos, o en compras un pasivo como una tarjeta de crédito) y no queda pendiente.</p>`;
  const guardar = async lista => { await store.save('empresas', { id: S.eid, contabilidad: { ...(emp()?.contabilidad || {}), formas_pago: lista } }); await recargar(); vFormasPago(m); };
  m.querySelectorAll('[data-nf]').forEach(b => b.onclick = () => formFormaPago({ uso: b.dataset.nf, credito: false }, todas, guardar));
  m.querySelectorAll('[data-ef]').forEach(b => b.onclick = () => formFormaPago(todas.find(f => f.id === b.dataset.ef), todas, guardar));
  m.querySelectorAll('[data-bf]').forEach(b => b.onclick = async () => {
    const f = todas.find(x => x.id === b.dataset.bf);
    if (todas.filter(x => x.uso === f.uso).length < 2) return toast('Debe quedar al menos una forma de pago.', true);
    try { await guardar(todas.filter(x => x.id !== f.id)); toast('Forma de pago quitada.'); } catch (e) { fail(e); }
  });
}
function formFormaPago(f, todas, guardar) {
  const ctas = cuentasAux().filter(c => f.uso === 'venta' ? /^1[1-3]/.test(c.codigo) : /^(1[1-3]|2)/.test(c.codigo));
  dialogo(`<h2>${f.id ? 'Editar' : 'Nueva'} forma de pago · ${f.uso === 'venta' ? 'ventas' : 'compras'}</h2>
    <div><label for="ff_n">Nombre</label><input id="ff_n" name="nombre" required maxlength="50" value="${esc(f.nombre || '')}" placeholder="${f.uso === 'venta' ? 'Ej.: Transferencia Bancolombia' : 'Ej.: Tarjeta de crédito empresarial'}"></div>
    <div><label for="ff_t">Tipo</label><select id="ff_t" name="credito">${opts([['no', 'Contado (queda pagada)'], ['si', f.uso === 'venta' ? 'Crédito (queda en cartera)' : 'Crédito (queda en cuentas por pagar)']], f.credito ? 'si' : 'no')}</select></div>
    <div id="ff_w"><label for="ff_c">Cuenta</label><input id="ff_c" name="cuenta" list="ctasFP" class="mono" value="${esc(f.cuenta || '')}" autocomplete="off" placeholder="Código o nombre">
      <datalist id="ctasFP">${optsLista(ctas)}</datalist>
      <p class="hint">${f.uso === 'venta' ? 'Caja, bancos u otra cuenta del activo (11, 12 o 13).' : 'Caja o bancos, o un pasivo (clase 2) como una tarjeta de crédito u obligación financiera.'}</p></div>${pie()}`, async fd => {
    const credito = fd.get('credito') === 'si', nombre = String(fd.get('nombre') || '').trim(), cuenta = String(fd.get('cuenta') || '').trim().split(' ')[0];
    if (!nombre) throw new Error('Escribe el nombre de la forma de pago.');
    if (!credito) {
      if (!esAuxiliar(cuenta)) throw new Error('Escoge una cuenta auxiliar de 8 dígitos.');
      if (!idxCuentas()[cuenta]) throw new Error(`La cuenta ${cuenta} no existe en el plan de cuentas.`);
    }
    const nueva = { id: f.id || `${f.uso[0]}-${Date.now().toString(36)}`, uso: f.uso, nombre, credito, cuenta: credito ? '' : cuenta };
    await guardar(f.id ? todas.map(x => x.id === f.id ? nueva : x) : [...todas, nueva]);
    toast('Forma de pago guardada.');
  });
  const ver = () => { $('ff_w').hidden = $('ff_t').value === 'si'; };
  $('ff_t').onchange = ver; ver();
}
/* ---------- Cierre contable ---------- */
function vCierre(m) {
  const ms = movs(), anios = [...new Set(ms.map(x => x.fecha.slice(0, 4)))].sort().reverse();
  const actual = String(Number(hoy().slice(0, 4)) - (hoy().slice(5) < '12-31' ? 1 : 0));
  let anio = anios.includes(actual) ? actual : anios[0] || actual;
  const P = { util: '36050501', perd: '36100501' };
  const ctas3 = cuentasAux().filter(c => /^3/.test(c.codigo));
  m.innerHTML = `<header class="vhead"><div><h2>Cierre contable</h2><p class="sub">Cancela los ingresos, gastos y costos del año y lleva el resultado a la cuenta de utilidad o de pérdida del ejercicio.</p></div></header>
    <section class="panel stack"><div class="row filters">
      <div><label for="ca">Año que cierra</label><select id="ca">${(anios.length ? anios : [actual]).map(a => `<option ${a === anio ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="grow"><label for="cu">Cuenta de la utilidad</label><input id="cu" list="ctas3" class="mono" value="${P.util}" autocomplete="off"><p class="hint" id="cuN"></p></div>
      <div class="grow"><label for="cp">Cuenta de la pérdida</label><input id="cp" list="ctas3" class="mono" value="${P.perd}" autocomplete="off"><p class="hint" id="cpN"></p></div></div>
      <datalist id="ctas3">${optsLista(ctas3)}</datalist></section>
    <section class="panel stack" id="cOut"></section>`;
  const pintar = () => {
    anio = $('ca').value;
    const cu = $('cu').value.trim().split(' ')[0], cp = $('cp').value.trim().split(' ')[0];
    $('cuN').textContent = nomCta(cu); $('cpN').textContent = nomCta(cp);
    const hecho = comps().find(c => c.tipo === 'CI' && c.estado !== 'anulado' && c.fecha.startsWith(anio));
    const r = cierreAnual(ms, anio, cu, cp);
    $('cOut').innerHTML = `<div class="kpis"><div class="kpi"><span>Ingresos ${anio}</span><b class="mono">${money(r.ingresos)}</b></div><div class="kpi"><span>Gastos y costos</span><b class="mono">${money(r.gastos)}</b></div>
      <div class="kpi ${r.resultado < 0 ? 'warn' : ''}"><span>${r.resultado < 0 ? 'Pérdida' : 'Utilidad'} del ejercicio</span><b class="mono">${money(Math.abs(r.resultado))}</b></div></div>
      ${hecho ? `<p class="aviso">El año ${anio} ya está cerrado con el <a href="#/comp/${hecho.id}">${esc(nomComp(hecho))}</a> del ${fFecha(hecho.fecha)}. Si registras algo más en ${anio}, anula ese cierre y hazlo de nuevo.</p>` : ''}
      ${r.resultado ? `<p>La ${r.resultado < 0 ? 'pérdida' : 'utilidad'} de <b>${money(Math.abs(r.resultado))}</b> se lleva a <b class="mono">${esc(r.resultado < 0 ? cp : cu)}</b> ${esc(nomCta(r.resultado < 0 ? cp : cu))}, con fecha ${fFecha(r.fecha)}.</p>` : ''}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cuenta</th><th>Tercero</th><th class="r">Débito</th><th class="r">Crédito</th></tr></thead><tbody>
      ${r.lineas.map(l => `<tr><td><span class="mono">${l.cuenta}</span> ${esc(nomCta(l.cuenta))}</td><td>${esc(l.tercero_id ? terc(l.tercero_id)?.nombre || '' : '')}</td><td class="r mono">${valor(l.debito)}</td><td class="r mono">${valor(l.credito)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No hay ingresos, gastos ni costos en ese año.</td></tr>'}</tbody></table></div>
      <div class="row end"><button class="primary" id="cGo" ${hecho || r.lineas.length < 2 ? 'disabled' : ''}>Hacer el cierre de ${anio}</button></div>`;
    if ($('cGo')) $('cGo').onclick = async () => {
      for (const [c, q] of [[cu, 'utilidad'], [cp, 'pérdida']]) if (!esAuxiliar(c) || !idxCuentas()[c]) return toast(`La cuenta de la ${q} (${c}) no es auxiliar o no existe en el plan de cuentas.`, true);
      if (!await confirmar(`Cierre contable ${anio}`, `Se crea un comprobante de cierre con fecha ${fFecha(r.fecha)} que deja en cero los ingresos, gastos y costos de ${anio} y lleva la ${r.resultado < 0 ? 'pérdida' : 'utilidad'} de <b>${money(Math.abs(r.resultado))}</b> a ${esc(r.resultado < 0 ? cp : cu)}.<br>Si después hace falta, se anula el comprobante y se cierra de nuevo.`, 'Hacer el cierre')) return;
      try {
        const g = await store.save('comprobantes', { empresa_id: S.eid, tipo: 'CI', numero: siguienteComp('CI'), fecha: r.fecha, descripcion: `Cierre contable ${anio}`, lineas: r.lineas.map(l => ({ ...l, tercero_id: l.tercero_id || '' })), estado: 'contabilizado' });
        await cargarEmpresa(); toast(`Cierre de ${anio} hecho.`); location.hash = '#/comp/' + g.id;
      } catch (e) { fail(e); }
    };
  };
  $('ca').onchange = pintar; $('cu').onchange = pintar; $('cp').onchange = pintar;
  pintar();
}

/* ---------- Nómina ---------- */
const empleados = () => S.d?.empleados || [];
const nominas = () => S.d?.nominas || [];
const empById = id => empleados().find(e => e.id === id);
const nominaById = id => nominas().find(n => n.id === id);
const esEmpleado = tid => empleados().some(e => e.tercero_id === tid);
const pNom = () => paramNomina(emp()?.contabilidad);
const siguienteNomina = () => Math.max(0, ...nominas().map(n => Number(n.numero) || 0)) + 1;
const nomArea = a => (AREAS.find(x => x[0] === a) || AREAS[0])[1];
const finMes = f => { const d = new Date(f.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); };
const faltaTablaNomina = e => /pensionado/.test(e.message) ? 'Falta correr en Supabase el archivo supabase/020_pensionado.sql.' : /empleados|nominas/.test(e.message) && /exist|schema|relation|column/i.test(e.message) ? 'Falta crear las tablas de nómina en Supabase (archivo supabase/019_nomina.sql).' : e.message;
const optsTerceros = (sel, excluir) => `<option value="">—</option>` + [...S.d.terceros].filter(t => t.id !== excluir).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`).join('');

function vEmpleados(m) {
  let q = '', retirados = false;
  m.innerHTML = `<header class="vhead"><div><h2>Empleados</h2><p class="sub">Las personas que se liquidan en la nómina, con su salario, su área y sus entidades de seguridad social.</p></div><button class="primary" id="ne">Nuevo empleado</button></header>
    <div class="row filters"><input id="q" type="search" placeholder="Buscar por nombre, documento o cargo"><label class="check"><input type="checkbox" id="ret"> Ver retirados</label></div>
    <section class="panel" id="lst"></section>`;
  const pintar = () => {
    const l = empleados().filter(e => (retirados || e.activo !== false) && (!q || `${terc(e.tercero_id)?.nombre} ${terc(e.tercero_id)?.numero} ${e.cargo}`.toLowerCase().includes(q)))
      .sort((a, b) => (terc(a.tercero_id)?.nombre || '').localeCompare(terc(b.tercero_id)?.nombre || ''));
    $('lst').innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Documento</th><th>Cargo</th><th>Área</th><th class="r">Salario</th><th>Ingreso</th><th></th></tr></thead><tbody>
      ${l.map(e => { const t = terc(e.tercero_id); return `<tr class="${e.activo === false ? 'muted' : ''}"><td><b>${esc(t?.nombre || '')}</b>${e.activo === false ? ' <span class="tag">Retirado</span>' : ''}</td><td class="mono nowrap">${esc(docId(t))}</td><td>${esc(e.cargo)}</td><td>${nomArea(e.area)}</td>
        <td class="r mono">${money(e.salario)}</td><td class="nowrap">${fFecha(e.fecha_ingreso)}</td><td class="r"><button class="sm" data-ed="${e.id}">Editar</button></td></tr>`; }).join('')}</tbody></table></div>`
      : `<p class="muted">${q ? 'Ningún empleado coincide.' : 'Todavía no hay empleados. Créalos para liquidar la nómina.'}</p>`;
  };
  $('q').oninput = () => { q = $('q').value.trim().toLowerCase(); pintar(); };
  $('ret').onchange = () => { retirados = $('ret').checked; pintar(); };
  $('ne').onclick = () => formEmpleado({});
  $('lst').onclick = ev => { const b = ev.target.closest('[data-ed]'); if (b) formEmpleado(empById(b.dataset.ed)); };
  pintar();
}
function formEmpleado(e) {
  const P = pNom();
  const personas = [...S.d.terceros].filter(t => t.id === e.tercero_id || (t.tipo_id !== '31' && !empleados().some(x => x.tercero_id === t.id && x.id !== e.id))).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const f = dialogo(`<h2>${e.id ? 'Editar empleado' : 'Nuevo empleado'}</h2>
    <div><label for="f_tercero_id">Persona</label><div class="row nowrap"><select id="f_tercero_id" name="tercero_id" required><option value="">Escoge la persona…</option>${personas.map(t => `<option value="${t.id}" ${t.id === e.tercero_id ? 'selected' : ''}>${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`).join('')}</select>
      ${e.id ? '' : '<button type="button" id="nuevaP">+ Nueva persona</button>'}</div><p class="hint">Sus nombres, documento y dirección se toman del tercero.</p></div>
    <div class="grid2">${campo('cargo', 'Cargo', e.cargo || '', 'maxlength="80"')}${campoSel('contrato', 'Tipo de contrato', CONTRATOS, e.contrato || 'indefinido')}</div>
    <div class="grid2">${campo('salario', 'Salario mensual', num(e.salario) || '', 'type="number" min="0" step="1" class="mono" required')}${campo('fecha_ingreso', 'Fecha de ingreso', e.fecha_ingreso || '', 'type="date"')}</div>
    <div class="grid2">${campoSel('area', 'Área (define la cuenta del gasto)', AREAS.map(([k, n, c]) => [k, `${n} · ${c}`]), e.area || 'admin')}${campoSel('riesgo', 'Clase de riesgo ARL', RIESGOS.map(([k, n]) => [k, n]), e.riesgo || '1')}</div>
    <p>${check('auxilio', `Tiene derecho a auxilio de transporte (solo aplica si gana hasta 2 salarios mínimos: ${money(2 * P.smmlv)})`, e.auxilio !== false)}</p>
    <p>${check('pensionado', 'Es pensionado (no se le descuenta ni se le paga pensión ni fondo de solidaridad; la salud sí se liquida completa)', e.pensionado === true)}</p>
    <h3>Entidades</h3>
    <div class="grid2"><div><label for="f_eps">EPS</label><select id="f_eps" name="eps_id">${optsTerceros(e.eps_id, e.tercero_id)}</select></div><div><label for="f_pen">Fondo de pensiones <span class="hint">(no aplica si es pensionado)</span></label><select id="f_pen" name="pension_id">${optsTerceros(e.pension_id, e.tercero_id)}</select></div></div>
    <div class="grid2"><div><label for="f_ces">Fondo de cesantías</label><select id="f_ces" name="cesantias_id">${optsTerceros(e.cesantias_id, e.tercero_id)}</select></div><div><label for="f_caja">Caja de compensación</label><select id="f_caja" name="caja_id">${optsTerceros(e.caja_id, e.tercero_id)}</select></div></div>
    <p class="hint">Si una entidad no está en la lista, créala primero en Proveedores con su NIT. La ARL, el ICBF y el SENA son de la empresa: van en Configuración de nómina.</p>
    <div class="grid2">${campo('banco', 'Banco', e.banco || '', 'maxlength="60"')}${campo('cuenta_bancaria', 'Cuenta bancaria', e.cuenta_bancaria || '', 'maxlength="40" class="mono"')}</div>
    ${e.id ? `<div class="grid2">${campo('fecha_retiro', 'Fecha de retiro', e.fecha_retiro || '', 'type="date"')}<div class="checkcell">${check('activo', 'Activo (se liquida en la nómina)', e.activo !== false)}</div></div>` : ''}
    ${pie()}`, async fd => {
    const tercero_id = fd.get('tercero_id'), salario = r2(num(fd.get('salario')));
    if (!tercero_id) throw new Error('Escoge la persona o créala con "+ Nueva persona".');
    if (salario <= 0) throw new Error('Escribe el salario mensual.');
    if (empleados().some(x => x.id !== e.id && x.tercero_id === tercero_id)) throw new Error('Esa persona ya es empleado.');
    const ent = k => fd.get(k) || null;
    const row = { empresa_id: S.eid, tercero_id, cargo: String(fd.get('cargo') || '').trim(), contrato: fd.get('contrato'), salario, fecha_ingreso: fd.get('fecha_ingreso') || null, area: fd.get('area'), riesgo: fd.get('riesgo'),
      auxilio: fd.get('auxilio') === 'on', ...(fd.get('pensionado') === 'on' || e.pensionado !== undefined ? { pensionado: fd.get('pensionado') === 'on' } : {}), eps_id: ent('eps_id'), pension_id: ent('pension_id'), cesantias_id: ent('cesantias_id'), caja_id: ent('caja_id'), banco: String(fd.get('banco') || '').trim(), cuenta_bancaria: String(fd.get('cuenta_bancaria') || '').trim(),
      ...(e.id ? { fecha_retiro: fd.get('fecha_retiro') || null, activo: fd.get('activo') === 'on' } : { activo: true }) };
    try { await store.save('empleados', e.id ? { ...row, id: e.id } : row); } catch (x) { throw new Error(faltaTablaNomina(x)); }
    await cargarEmpresa(); toast('Empleado guardado.'); route();
  }, { ancho: true });
  if ($('nuevaP')) $('nuevaP').onclick = () => {
    const actual = Object.fromEntries(new FormData(f)); $('dlg').close();
    formTercero({ tipo_id: '13', tipo_persona: 'natural' }, async t => { await cargarEmpresa(); setTimeout(() => formEmpleado({ ...e, ...actual, tercero_id: t.id }), 0); }, 'empleado');
  };
}

function vNominaCfg(m) {
  const P = pNom(), g = emp()?.contabilidad?.nomina || {};
  const fila = c => {
    const gasto = c.tipo !== 'ded', pasivo = c.tipo !== 'dev';
    const inp = (area, def) => `<input class="mono w-cod" list="ctasNom" data-c="${c.k}" data-a="${area}" value="${esc(P.cuentas?.[c.k]?.[area] || '')}" placeholder="${def}" autocomplete="off" aria-label="${esc(c.nombre)} ${area}">`;
    return `<tr><td><b>${esc(c.nombre)}</b>${c.pct ? ` <span class="hint">${String(c.pct).replace('.', ',')} %</span>` : ''}</td>
      ${AREAS.map(([a]) => `<td>${gasto ? inp(a, cuentaGasto({}, c.k, a)) : ''}</td>`).join('')}<td>${pasivo ? inp('pasivo', CONCEPTO[c.k].pasivo) : ''}</td></tr>`;
  };
  const grupo = (tipo, titulo) => `<tr class="sub-row"><td colspan="5"><b>${titulo}</b></td></tr>${CONCEPTOS_NOM.filter(c => c.tipo === tipo).map(fila).join('')}`;
  m.innerHTML = `<header class="vhead"><div><h2>Configuración de nómina</h2><p class="sub">Valores del año, entidades de la empresa y la cuenta de cada concepto.</p></div></header>
  <form id="nc" class="stack">
    <section class="panel stack"><h3>Valores del año</h3>
      <div class="grid3">${campo('smmlv', 'Salario mínimo mensual', P.smmlv, 'type="number" min="0" step="1" class="mono"')}${campo('auxilio', 'Auxilio de transporte mensual', P.auxilio, 'type="number" min="0" step="1" class="mono"')}${campoSel('periodo', 'Periodo de pago', PERIODOS, P.periodo)}</div>
      <p class="hint">Revisa el salario mínimo y el auxilio de transporte de cada año en el decreto del Gobierno.</p>
      <p>${check('exonerada', 'La empresa está exonerada de salud 8,5 %, ICBF y SENA por los empleados que ganan menos de 10 salarios mínimos (artículo 114-1 del Estatuto Tributario)', P.exonerada)}</p></section>
    <section class="panel stack"><h3>Entidades de la empresa</h3>
      <div class="grid3"><div><label for="f_arl">ARL</label><select id="f_arl" name="arl_id">${optsTerceros(P.arl_id)}</select></div><div><label for="f_icbf">ICBF</label><select id="f_icbf" name="icbf_id">${optsTerceros(P.icbf_id)}</select></div><div><label for="f_sena">SENA</label><select id="f_sena" name="sena_id">${optsTerceros(P.sena_id)}</select></div></div>
      <p class="hint">Son los terceros a los que queda el saldo por pagar. Las EPS, fondos y cajas de cada empleado se escogen en su ficha.</p></section>
    <section class="panel stack"><h3>Cuentas</h3>
      <p class="hint">Vacías = las sugeridas (en gris). El gasto va según el área del empleado. Si una cuenta no existe en el plan, se crea al guardar la primera nómina que la use.</p>
      <div>${campo('cuenta_neto', 'Salarios por pagar (neto de la nómina)', g.cuenta_neto || '', `list="ctasNom" class="mono" placeholder="${CUENTA_NETO}" autocomplete="off"`)}</div>
      <datalist id="ctasNom">${optsLista(cuentasAux().filter(x => /^(13|23|25|51|52|72)/.test(x.codigo)))}</datalist>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Concepto</th>${AREAS.map(([, n]) => `<th>Gasto ${n.toLowerCase()}</th>`).join('')}<th>Por pagar</th></tr></thead><tbody>
        ${grupo('dev', 'Devengados')}${grupo('ded', 'Deducciones')}${grupo('apo', 'Aportes de la empresa')}${grupo('pro', 'Provisiones de prestaciones')}</tbody></table></div>
      <p class="hint">Fondo de solidaridad: 1 % desde 4 salarios mínimos, hasta 2 % desde 20. ARL según la clase de riesgo de cada empleado. Cesantías y prima: un doceavo de lo salarial más el auxilio; intereses: 12 % de las cesantías; vacaciones: 15 días por año sobre el salario.</p></section>
    <div class="row end"><button class="primary">Guardar configuración</button></div>
  </form>`;
  $('nc').onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData($('nc')), cuentas = {};
    try {
      for (const i of m.querySelectorAll('[data-c]')) {
        const v = i.value.trim().split(' ')[0]; if (!v) continue;
        if (!/^\d{8}$/.test(v)) throw new Error(`${CONCEPTO[i.dataset.c].nombre}: la cuenta ${v} debe ser auxiliar de 8 dígitos.`);
        (cuentas[i.dataset.c] = cuentas[i.dataset.c] || {})[i.dataset.a] = v;
      }
      const neto = String(fd.get('cuenta_neto') || '').trim().split(' ')[0];
      if (neto && !/^\d{8}$/.test(neto)) throw new Error('La cuenta de salarios por pagar debe ser auxiliar de 8 dígitos.');
      if (num(fd.get('smmlv')) <= 0) throw new Error('Escribe el salario mínimo.');
      await guardarContab('nomina', { smmlv: num(fd.get('smmlv')), auxilio: num(fd.get('auxilio')), periodo: fd.get('periodo'), exonerada: fd.get('exonerada') === 'on',
        arl_id: fd.get('arl_id') || '', icbf_id: fd.get('icbf_id') || '', sena_id: fd.get('sena_id') || '', cuenta_neto: neto, cuentas });
      toast('Configuración de nómina guardada.'); vNominaCfg(m);
    } catch (e) { fail(e); }
  };
}

function vNominas(m) {
  let anuladas = false;
  m.innerHTML = `<header class="vhead"><div><h2>Liquidaciones de nómina</h2><p class="sub">Cada nómina se contabiliza al guardarla: salarios, deducciones, aportes y provisiones.</p></div><a class="btn primary" href="#/nominanueva">Liquidar nómina</a></header>
    <div class="row filters"><label class="check"><input type="checkbox" id="anu"> Ver anuladas</label></div><section class="panel" id="lst"></section>`;
  const pintar = () => {
    const l = nominas().filter(n => anuladas || n.estado !== 'anulado').sort((a, b) => b.hasta.localeCompare(a.hasta) || b.numero - a.numero);
    $('lst').innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Número</th><th>Periodo</th><th class="r">Empleados</th><th class="r">Devengado</th><th class="r">Deducciones</th><th class="r">Neto a pagar</th><th></th></tr></thead><tbody>
      ${l.map(n => `<tr class="click ${n.estado === 'anulado' ? 'muted' : ''}" data-go="#/nominadoc/${n.id}"><td class="mono"><a href="#/nominadoc/${n.id}">NE ${n.numero}</a></td><td class="nowrap">${fFecha(n.desde)} a ${fFecha(n.hasta)}</td><td class="r">${(n.lineas || []).length}</td>
        <td class="r mono">${money(n.devengado)}</td><td class="r mono">${money(n.deducciones)}</td><td class="r mono"><b>${money(n.neto)}</b></td><td>${n.estado === 'anulado' ? '<span class="tag bad">Anulada</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${empleados().length ? 'Todavía no hay nóminas liquidadas.' : 'Primero crea los empleados en Nómina › Empleados.'}</p>`;
  };
  $('anu').onchange = () => { anuladas = $('anu').checked; pintar(); };
  pintar();
}

// Días que trabaja un empleado en el periodo (si entró o salió en medio), sobre 30 o 15.
function diasEmpleado(e, desde, hasta, base) {
  const ini = e.fecha_ingreso && e.fecha_ingreso > desde ? e.fecha_ingreso : desde, fin = e.fecha_retiro && e.fecha_retiro < hasta ? e.fecha_retiro : hasta;
  if (fin < ini) return 0;
  if (ini === desde && fin === hasta) return base;
  return Math.min(base, Math.round((new Date(fin + 'T12:00:00') - new Date(ini + 'T12:00:00')) / 864e5) + 1);
}
function vNominaEditor(m, id) {
  const P = pNom(), x = id && nominaById(id);
  if (id && !x) { m.innerHTML = '<p>No se encontró la nómina.</p>'; return; }
  if (x && x.estado === 'anulado') { location.replace('#/nominadoc/' + id); return; }
  const ult = [...nominas()].filter(n => n.estado !== 'anulado').sort((a, b) => b.hasta.localeCompare(a.hasta))[0];
  // Periodo propuesto: el siguiente al de la última nómina, o el mes (o la quincena) actual.
  const propuesto = per => {
    const base = ult ? sumarDias(ult.hasta, 1) : hoy().slice(0, 8) + (per === 'quincenal' && Number(hoy().slice(8)) > 15 ? '16' : '01');
    const desde = per === 'mensual' ? base.slice(0, 8) + '01' : base.slice(8) <= '15' ? base.slice(0, 8) + '01' : base.slice(0, 8) + '16';
    return { desde, hasta: per === 'mensual' || desde.slice(8) === '16' ? finMes(desde) : desde.slice(0, 8) + '15' };
  };
  const n = x ? JSON.parse(JSON.stringify(x)) : { periodo: P.periodo, ...propuesto(P.periodo), novedades: {}, observaciones: '' };
  if (!x) n.fecha = n.hasta;
  const nov = n.novedades || {};
  if (x) for (const l of x.lineas || []) nov[l.empleado_id] = { ...(nov[l.empleado_id] || {}), incluir: true, dias: l.dias };
  const lista = () => empleados().filter(e => (x && (x.lineas || []).some(l => l.empleado_id === e.id)) || (e.activo !== false && (!e.fecha_ingreso || e.fecha_ingreso <= n.hasta) && (!e.fecha_retiro || e.fecha_retiro >= n.desde)))
    .sort((a, b) => (terc(a.tercero_id)?.nombre || '').localeCompare(terc(b.tercero_id)?.nombre || ''));
  const COLS = [['dias', 'Días'], ...NOVEDADES.map(c => [c.k, c.nombre])];
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/nomina">← Liquidaciones de nómina</a><h2>${x ? `Editar nómina NE ${x.numero}` : 'Liquidar nómina'}</h2>
    <p class="sub">Escribe las novedades del periodo. Salario, auxilio, seguridad social, aportes y provisiones se calculan solos.</p></div></header>
  <form id="nf" class="stack" novalidate>
    <section class="panel grid-doc">
      <div><label for="np">Periodo</label><select id="np">${opts(PERIODOS, n.periodo)}</select></div>
      <div><label for="nd">Desde</label><input id="nd" type="date" value="${n.desde}" required></div>
      <div><label for="nh">Hasta</label><input id="nh" type="date" value="${n.hasta}" required></div>
      <div><label for="nfe">Fecha de contabilización</label><input id="nfe" type="date" value="${n.fecha}" required></div>
      <div><label>Número</label><p class="mono">${x ? 'NE ' + x.numero : `NE ${siguienteNomina()} (al guardar)`}</p></div>
    </section>
    <section class="panel stack"><h3>Empleados</h3><div id="nl"></div><p class="aviso" id="nWarn" hidden></p></section>
    <section class="panel grid-doc"><div class="span2 c-obs"><label for="nob">Observaciones</label><textarea id="nob" rows="2" maxlength="1000">${esc(n.observaciones || '')}</textarea></div><div class="span2 totbox" id="ntot"></div></section>
    <section class="panel stack"><h3>Contabilización</h3><div id="nas"></div></section>
    <div class="err" id="nErr" hidden></div>
    <div class="row end sticky-actions"><span class="spacer"></span><a class="btn ghost" href="${x ? '#/nominadoc/' + x.id : '#/nomina'}">Cancelar</a><button type="submit" class="primary" id="nSave">Guardar y contabilizar</button></div>
  </form>`;
  const base = () => $('np').value === 'quincenal' ? 15 : 30;
  const novDe = e => { const v = nov[e.id] || {}; return { ...v, dias: v.dias === undefined || v.dias === '' ? diasEmpleado(e, $('nd').value, $('nh').value, base()) : v.dias }; };
  const calc = () => { const PP = { ...P, periodo: $('np').value }; return lista().filter(e => (nov[e.id]?.incluir ?? true)).map(e => liquidar(e, novDe(e), PP)).filter(l => l.dias > 0 || l.devengado > 0); };
  const pintarTabla = () => {
    const es = lista();
    $('nl').innerHTML = !es.length ? '<p class="muted">No hay empleados activos en este periodo. <a href="#/empleados">Crea los empleados</a>.</p>' :
      `<div class="tbl-wrap"><table class="tbl nomina"><thead><tr><th></th><th>Empleado</th><th class="r">Salario</th>${COLS.map(([, t]) => `<th class="r">${t}</th>`).join('')}<th class="r">Devengado</th><th class="r">Deducciones</th><th class="r">Neto</th></tr></thead><tbody>
      ${es.map(e => { const v = novDe(e), inc = nov[e.id]?.incluir ?? true; return `<tr data-e="${e.id}" class="${inc ? '' : 'muted'}"><td><input type="checkbox" data-inc ${inc ? 'checked' : ''} aria-label="Incluir"></td><td><b>${esc(terc(e.tercero_id)?.nombre || '')}</b><br><span class="hint">${esc(e.cargo || nomArea(e.area))}</span></td><td class="r mono">${money(e.salario)}</td>
        ${COLS.map(([k, t]) => `<td data-l="${t}"><input data-k="${k}" type="number" min="0" ${k === 'dias' ? `max="30" step="1" class="r mono w-num"` : 'step="1" class="r mono w-val"'} value="${k === 'dias' ? v.dias : num(v[k]) || ''}" aria-label="${t}"></td>`).join('')}
        <td class="r mono" data-dv></td><td class="r mono" data-dd></td><td class="r mono" data-dn></td></tr>`; }).join('')}</tbody></table></div>`;
    resumen();
  };
  const resumen = () => {
    const ls = calc(), T = totalesNomina(ls);
    for (const tr of m.querySelectorAll('#nl tr[data-e]')) { const l = ls.find(y => y.empleado_id === tr.dataset.e); tr.querySelector('[data-dv]').textContent = l ? money(l.devengado) : ''; tr.querySelector('[data-dd]').textContent = l ? money(l.deducciones) : ''; tr.querySelector('[data-dn]').innerHTML = l ? `<b>${money(l.neto)}</b>` : ''; }
    $('ntot').innerHTML = `<dl class="tot"><dt>Devengado</dt><dd class="mono">${money(T.devengado)}</dd><dt>Deducciones</dt><dd class="mono">−${money(T.deducciones)}</dd><dt class="strong">Neto a pagar</dt><dd class="mono big">${money(T.neto)}</dd>
      <dt>Aportes de la empresa</dt><dd class="mono">${money(T.aportes)}</dd><dt>Provisiones de prestaciones</dt><dd class="mono">${money(T.provisiones)}</dd><dt class="strong">Costo total</dt><dd class="mono strong">${money(T.devengado + T.aportes + T.provisiones)}</dd></dl>`;
    const fal = entidadesFaltantes(ls), emps = fal.filter(f => !f.empresa), deE = fal.filter(f => f.empresa);
    $('nWarn').hidden = !fal.length;
    $('nWarn').innerHTML = fal.length ? `Faltan entidades: ${[emps.length ? `${emps.map(f => f.nombre).join(', ')} de algún empleado (<a href="#/empleados">Empleados</a>)` : '', deE.length ? `${deE.map(f => f.nombre).join(', ')} de la empresa (<a href="#/nominacfg">Configuración de nómina</a>)` : ''].filter(Boolean).join(' y ')}. Se puede guardar, pero esos saldos quedan sin tercero y no se pueden pagar con un egreso.` : '';
    const nuevas = Object.fromEntries(cuentasFaltantes([...cuentasDeNomina(ls), P.cuenta_neto], S.d.cuentas).map(c => [c.codigo, c.nombre]));
    $('nas').innerHTML = tablaAsiento(asientoNomina({ id: 'nuevo', numero: x?.numero || siguienteNomina(), fecha: $('nfe').value, lineas: ls, cuenta_neto: P.cuenta_neto, estado: 'contabilizado' }), nuevas);
  };
  $('nl').addEventListener('input', ev => {
    const tr = ev.target.closest('tr[data-e]'); if (!tr) return; const v = nov[tr.dataset.e] = nov[tr.dataset.e] || {};
    if (ev.target.dataset.k) v[ev.target.dataset.k] = ev.target.value;
    if (ev.target.hasAttribute('data-inc')) { v.incluir = ev.target.checked; tr.classList.toggle('muted', !v.incluir); }
    resumen();
  });
  $('np').onchange = () => { if (!x) { const p = propuesto($('np').value); $('nd').value = p.desde; $('nh').value = p.hasta; $('nfe').value = p.hasta; } for (const k in nov) delete nov[k].dias; pintarTabla(); };
  $('nd').onchange = $('nh').onchange = () => { for (const k in nov) delete nov[k].dias; if (!x) $('nfe').value = $('nh').value; pintarTabla(); };
  $('nfe').onchange = resumen;
  $('nf').onsubmit = async ev => {
    ev.preventDefault();
    const err = t => { $('nErr').textContent = t; $('nErr').hidden = false; };
    const desde = $('nd').value, hasta = $('nh').value, fecha = $('nfe').value, ls = calc();
    if (!desde || !hasta || hasta < desde) return err('Revisa las fechas del periodo.');
    if (!fecha) return err('Escribe la fecha de contabilización.');
    if (!ls.length) return err('No hay empleados para liquidar en este periodo.');
    if (ls.some(l => l.neto < 0)) return err(`El neto de ${terc(ls.find(l => l.neto < 0).tercero_id)?.nombre} queda negativo: revisa sus descuentos.`);
    $('nErr').hidden = true; $('nSave').disabled = true;
    try {
      // Las cuentas que usa la nómina y no están en el plan se crean (con su subcuenta y su cuenta).
      const faltan = cuentasFaltantes([...cuentasDeNomina(ls), P.cuenta_neto], S.d.cuentas);
      if (faltan.length) await store.saveMany('cuentas', faltan.map(c => ({ ...c, empresa_id: S.eid })));
      const novGuardar = Object.fromEntries(Object.entries(nov).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([kk, vv]) => kk !== 'dias' && vv !== '' && vv !== undefined))]));
      const row = { empresa_id: S.eid, periodo: $('np').value, desde, hasta, fecha, lineas: ls, novedades: novGuardar, cuenta_neto: P.cuenta_neto, observaciones: $('nob').value.trim(), ...totalesNomina(ls) };
      const g = x ? await store.save('nominas', { ...row, id: x.id }) : await store.save('nominas', { ...row, numero: siguienteNomina(), estado: 'contabilizado' });
      await cargarEmpresa(); toast(faltan.length ? `Nómina guardada y contabilizada. Se crearon ${faltan.length} cuentas en el plan.` : 'Nómina guardada y contabilizada.'); location.hash = '#/nominadoc/' + g.id;
    } catch (e) { err(faltaTablaNomina(e)); } finally { $('nSave').disabled = false; }
  };
  pintarTabla();
}

function hojaDesprendible(n, l) {
  const t = terc(l.tercero_id), e = empById(l.empleado_id) || {};
  const dev = (l.items || []).filter(i => i.tipo === 'dev'), ded = (l.items || []).filter(i => i.tipo === 'ded');
  const filas = Math.max(dev.length, ded.length);
  return `<article class="desprendible">${cabInforme('Desprendible de nómina', `NE ${n.numero}<br><small>${fFecha(n.desde)} a ${fFecha(n.hasta)}</small>`)}
    <div class="grid2"><div><b>${esc(t?.nombre || '')}</b><br><span class="muted">${esc(docId(t))}</span><br>${esc(e.cargo || '')}</div>
      <div><b>Salario:</b> ${money(e.salario)}<br><b>Días liquidados:</b> ${l.dias}${e.banco ? `<br><b>Pago a:</b> ${esc(e.banco)} ${esc(e.cuenta_bancaria || '')}` : ''}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Devengados</th><th class="r">Valor</th><th>Deducciones</th><th class="r">Valor</th></tr></thead><tbody>
      ${Array.from({ length: filas }, (_, i) => `<tr><td>${esc(dev[i]?.nombre || '')}</td><td class="r mono">${dev[i] ? money(dev[i].valor) : ''}</td><td>${esc(ded[i]?.nombre || '')}</td><td class="r mono">${ded[i] ? money(ded[i].valor) : ''}</td></tr>`).join('')}
      <tr class="strong"><td>Total devengado</td><td class="r mono">${money(l.devengado)}</td><td>Total deducciones</td><td class="r mono">${money(l.deducciones)}</td></tr></tbody></table></div>
    <dl class="tot"><dt class="strong">Neto a pagar</dt><dd class="mono big">${money(l.neto)}</dd></dl><p class="hint letras">${enLetras(l.neto)}</p>
    <div class="firmas"><span>Elaboró</span><span>Recibí conforme</span></div></article>`;
}
function vNominaDoc(m, id) {
  const n = nominaById(id); if (!n) { m.innerHTML = '<p>No se encontró la nómina.</p>'; return; }
  const anulada = n.estado === 'anulado', ms = asientoNomina({ ...n, estado: 'contabilizado' });
  const tot = k => money((n.lineas || []).reduce((s, l) => s + num(l[k]), 0));
  m.innerHTML = `<header class="vhead noprint"><div><a class="back" href="#/nomina">← Liquidaciones de nómina</a><h2>Nómina NE ${n.numero} ${anulada ? '<span class="tag bad">Anulada</span>' : ''}</h2>
      <p class="sub">${fFecha(n.desde)} a ${fFecha(n.hasta)} · ${n.periodo === 'quincenal' ? 'quincenal' : 'mensual'} · contabilizada el ${fFecha(n.fecha)}</p></div>
    <div class="row">${anulada ? '' : `<button id="anular">Anular</button><a class="btn" href="#/nominaeditar/${id}">Editar</a>`}<button class="primary" id="imprimir">Imprimir desprendibles</button></div></header>
    <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empleado</th><th class="r">Días</th><th class="r">Devengado</th><th class="r">Deducciones</th><th class="r">Neto</th><th class="r">Aportes</th><th class="r">Provisiones</th><th></th></tr></thead><tbody>
      ${(n.lineas || []).map((l, i) => `<tr><td><b>${esc(terc(l.tercero_id)?.nombre || '')}</b></td><td class="r">${l.dias}</td><td class="r mono">${money(l.devengado)}</td><td class="r mono">${money(l.deducciones)}</td><td class="r mono"><b>${money(l.neto)}</b></td><td class="r mono">${money(l.aportes)}</td><td class="r mono">${money(l.provisiones)}</td>
        <td class="r nowrap"><button class="sm" data-dp="${i}">Desprendible</button>${anulada ? '' : `<a class="btn sm ghost" href="#/compranueva?tipo=CE&tercero=${l.tercero_id}">Pagar</a>`}</td></tr>`).join('')}
      <tr class="strong"><td>Total</td><td></td><td class="r mono">${tot('devengado')}</td><td class="r mono">${tot('deducciones')}</td><td class="r mono">${tot('neto')}</td><td class="r mono">${tot('aportes')}</td><td class="r mono">${tot('provisiones')}</td><td></td></tr></tbody></table></div>
      ${n.observaciones ? `<p><b>Observaciones:</b> ${esc(n.observaciones)}</p>` : ''}</section>
    <section class="panel stack"><h3>Contabilización</h3>${tablaAsiento(ms)}${anulada ? `<p class="hint">Anulada${n.anulado_motivo ? `: ${esc(n.anulado_motivo)}` : ''}. No suma en los informes.</p>` : ''}
      <p class="hint">El pago a cada empleado y a cada entidad se hace con un comprobante de egreso: ahí aparecen los saldos de nómina por pagar.</p></section>`;
  const imprimirN = ls => { $('print').innerHTML = ls.map(l => hojaDesprendible(n, l)).join(''); const t = document.title; document.title = `Nómina NE ${n.numero} - ${emp().nombre}`; window.print(); document.title = t; };
  $('imprimir').onclick = () => imprimirN(n.lineas || []);
  m.querySelectorAll('[data-dp]').forEach(b => b.onclick = () => imprimirN([n.lineas[Number(b.dataset.dp)]]));
  if ($('anular')) $('anular').onclick = () => {
    const pagada = compras().some(c => c.tipo === 'CE' && c.estado !== 'anulado' && c.fecha >= n.fecha && (c.aplicaciones || []).some(a => a.cuenta && (n.lineas || []).some(l => l.tercero_id === c.tercero_id)));
    dialogo(`<h2>Anular nómina NE ${n.numero}</h2><p>Sus movimientos dejan de sumar en los informes. El número no se vuelve a usar.${pagada ? ' <b>Hay egresos que pagaron saldos de nómina a estos empleados después de esta fecha: revísalos.</b>' : ''}</p>
      <div><label for="f_mot">Motivo</label><input id="f_mot" name="motivo" required maxlength="200"></div>${pie('Anular')}`, async fd => {
      const mot = String(fd.get('motivo')).trim(); if (!mot) throw new Error('Escribe el motivo.');
      await store.save('nominas', { id: n.id, estado: 'anulado', anulado_motivo: mot, anulado_en: new Date().toISOString() });
      await cargarEmpresa(); toast('Nómina anulada.'); route();
    });
  };
}

/* ---------- Medios magnéticos ---------- */
function vExogena(m) {
  const ms = movs(), anios = [...new Set(ms.map(x => x.fecha.slice(0, 4)))].sort().reverse();
  const def = String(Number(hoy().slice(0, 4)) - 1);
  m.innerHTML = `<header class="vhead"><div><h2>Medios magnéticos</h2><p class="sub">Información exógena para la DIAN, sacada de la contabilidad por tercero.</p></div></header>
    <section class="panel stack"><div class="row filters">
      <div><label for="xa">Año gravable</label><select id="xa">${(anios.length ? anios : [def]).map(a => `<option ${a === (anios.includes(def) ? def : anios[0]) ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="grow"><label for="xf">Formato</label><select id="xf">${Object.entries(FORMATOS).map(([k, f]) => `<option value="${k}">${k} · ${esc(f.nombre)}</option>`).join('')}</select></div>
      <div class="end row"><a class="btn" id="xc" href="#/exogenacfg">Configurar</a><button class="primary" id="xd">Descargar para Excel</button></div></div>
      <p class="hint">Cada cuenta va al formato, concepto y columna que tengas en Configurar medios magnéticos (por ejemplo 5110 honorarios = 5002). Revísalos antes de pasarlos al prevalidador de la DIAN. Para persona natural se usan los nombres y apellidos del tercero; para jurídica, la razón social. Los terceros sin nombres separados o sin dirección hay que completarlos en Clientes o Proveedores.</p></section>
    <section class="panel" id="xOut"></section>`;
  const reglas = reglasExogena(emp()?.contabilidad);
  const datos = () => ({ anio: $('xa').value, cod: $('xf').value, filas: formato($('xf').value, ms, $('xa').value, reglas) });
  const pintar = () => {
    const { cod, filas } = datos(), F = FORMATOS[cod], con = F.concepto;
    $('xc').href = `#/exogenacfg?f=${cod}`;
    const falta = t => !t ? true : (t.tipo_persona === 'natural' ? !(t.primer_nombre && t.primer_apellido) : false) || !t.direccion;
    $('xOut').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${con ? '<th>Concepto</th>' : ''}<th>Tercero</th><th>Identificación</th>${F.valores.map(([, n]) => `<th class="r">${esc(n)}</th>`).join('')}</tr></thead><tbody>
      ${filas.map(f => { const t = terc(f.tercero_id); return `<tr>${con ? `<td class="nowrap"><b class="mono">${f.concepto}</b> <span class="hint">${esc(f.nombre_concepto)}</span></td>` : ''}<td>${esc(t?.nombre || '')}${falta(t) ? ' <span class="tag bad">Datos incompletos</span>' : ''}</td><td class="mono nowrap">${esc(fmtNit(t?.numero || ''))}</td>${F.valores.map(([k]) => `<td class="r mono">${money(f[k] || 0)}</td>`).join('')}</tr>`; }).join('') || `<tr><td colspan="${3 + F.valores.length}" class="muted">Sin información para este formato en el año.</td></tr>`}
      ${filas.length ? `<tr class="strong"><td colspan="${con ? 3 : 2}">Total (${filas.length} registros)</td>${F.valores.map(([k]) => `<td class="r mono">${money(filas.reduce((a, f) => a + (f[k] || 0), 0))}</td>`).join('')}</tr>` : ''}</tbody></table></div>`;
  };
  $('xa').onchange = pintar; $('xf').onchange = pintar;
  $('xd').onclick = () => {
    const { anio, cod, filas } = datos();
    const url = URL.createObjectURL(new Blob([csvFormato(cod, filas, S.d.terceros)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `formato-${cod}-${anio}-${(emp()?.nit || 'empresa')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  pintar();
}

// Qué cuentas se revisan en cada formato para avisar las que tienen movimiento y no tienen regla.
const CLASES_EXO = { 1001: /^(14|15|5|6|7)/, 1005: /^2408/, 1006: /^2408/, 1007: /^4/, 1008: /^13/, 1009: /^2/ };
function vExogenaCfg(m, fSel) {
  const cod = FORMATOS[fSel] ? fSel : '1001', F = FORMATOS[cod];
  const reglas = reglasExogena(emp()?.contabilidad), propias = Array.isArray(emp()?.contabilidad?.exogena);
  const lista = reglas.filter(r => String(r.formato) === cod).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
  const col = k => k ? (F.valores.find(([x]) => x === k)?.[1] || k) : 'No se reporta';
  const nomCon = r => r.nombre || nombreConcepto(r.concepto);
  const nomCalc = r => Object.fromEntries(CALCULOS)[calculoDe(r, cod)];
  const ms = movs(), anios = [...new Set(ms.map(x => x.fecha.slice(0, 4)))].sort(), pasado = String(Number(hoy().slice(0, 4)) - 1);
  const anio = anios.includes(pasado) ? pasado : anios.at(-1) || pasado;
  const sinRegla = [...new Set(ms.filter(x => x.tipo !== 'CI' && x.fecha.startsWith(anio) && CLASES_EXO[cod].test(x.cuenta)).map(x => x.cuenta))]
    .filter(c => !reglas.some(r => String(r.formato) === cod && r.cuenta && c.startsWith(r.cuenta))).sort();
  m.innerHTML = `<header class="vhead"><div><h2>Configurar medios magnéticos</h2><p class="sub">Qué cuentas van a cada formato, con qué concepto y en qué columna.</p></div>
      <div class="row"><a class="btn" href="#/exogena">Ver formatos</a><button class="primary" id="nx">Nueva regla</button></div></header>
    <section class="panel stack"><div class="row filters"><div class="grow"><label for="cf">Formato</label><select id="cf">${Object.entries(FORMATOS).map(([k, f]) => `<option value="${k}" ${k === cod ? 'selected' : ''}>${k} · ${esc(f.nombre)}</option>`).join('')}</select></div></div>
      <p class="hint">La cuenta puede ser de cualquier nivel (2, 4, 6 u 8 dígitos) y cubre todas las que empiezan así. Si una cuenta cabe en varias reglas, gana la más detallada; por ejemplo 5110 manda sobre 5. "No se reporta" sirve para sacar una cuenta de una regla más general.${F.concepto && cod === '1001' ? ' Las retenciones sin concepto van al concepto donde el tercero tenga el mayor pago.' : ''}</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cuenta</th>${F.concepto ? '<th>Concepto</th>' : ''}<th>Columna</th><th>Cálculo</th><th></th></tr></thead><tbody>
      ${lista.map(r => `<tr><td><b class="mono">${esc(r.cuenta)}</b> <span class="muted">${esc(nomCta(r.cuenta))}</span></td>
        ${F.concepto ? `<td>${r.columna ? (r.concepto ? `<b class="mono">${esc(r.concepto)}</b> <span class="hint">${esc(nomCon(r))}</span>` : '<span class="hint">El principal del tercero</span>') : ''}</td>` : ''}
        <td>${r.columna ? esc(col(r.columna)) : '<span class="tag">No se reporta</span>'}</td><td>${r.columna ? esc(nomCalc(r)) : ''}</td>
        <td class="r nowrap"><button class="sm" data-ex="${esc(r.id)}">Editar</button><button class="sm ghost" data-bx="${esc(r.id)}">Quitar</button></td></tr>`).join('') || `<tr><td colspan="5" class="muted">Este formato no tiene reglas: no saldrá nada.</td></tr>`}</tbody></table></div></section>
    ${sinRegla.length ? `<section class="panel stack"><h3>Cuentas con movimiento en ${anio} que no van a este formato</h3><p class="hint">Si alguna debe reportarse, créale una regla.</p>
      <div class="row wrap">${sinRegla.map(c => `<button class="sm" data-nc="${c}"><span class="mono">${c}</span> ${esc(nomCta(c))}</button>`).join('')}</div></section>` : ''}
    <section class="panel row"><p class="hint" style="flex:1 1 240px;margin:0">${propias ? 'Estás usando la configuración de la empresa.' : 'Estás usando la configuración de fábrica. Al guardar un cambio queda como configuración de la empresa.'}</p>
      ${propias ? '<button class="ghost" id="rx">Volver a la de fábrica</button>' : ''}</section>`;
  const guardar = async l => { await guardarContab('exogena', l); vExogenaCfg(m, cod); };
  const form = r => {
    dialogo(`<h2>${r.id ? 'Editar' : 'Nueva'} regla · formato ${cod}</h2>
      <div><label for="fx_c">Cuenta</label><input id="fx_c" name="cuenta" list="ctasX" class="mono" required value="${esc(r.cuenta || '')}" autocomplete="off" placeholder="Ej.: 5110 o 51101001">
        <datalist id="ctasX">${optsLista(S.d.cuentas.filter(x => x.codigo.length >= 2))}</datalist><p class="hint">Cualquier nivel; cubre todas las cuentas que empiezan así.</p></div>
      <div class="grid2"><div><label for="fx_k">Columna</label><select id="fx_k" name="columna">${opts([...F.valores.map(([k, n]) => [k, n]), ['', 'No se reporta']], r.columna ?? F.valores[0][0])}</select></div>
        <div><label for="fx_a">Cálculo</label><select id="fx_a" name="calculo">${opts(CALCULOS, calculoDe(r, cod))}</select></div></div>
      <p class="hint">Débito o crédito: la suma de esos movimientos. Pago o abono en cuenta: el movimiento neto. Saldo: lo acumulado al 31 de diciembre. El año se escoge al sacar el informe.</p>
      ${F.concepto ? `<div class="grid2"><div><label for="fx_o">Concepto DIAN</label><input id="fx_o" name="concepto" list="conX" class="mono" inputmode="numeric" maxlength="4" value="${esc(r.concepto || '')}" autocomplete="off" placeholder="${cod === '1001' ? 'Vacío = el principal' : 'Ej.: ' + CATALOGO[cod][0][0]}">
          <datalist id="conX">${(CATALOGO[cod] || []).map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('')}</datalist></div>
        <div><label for="fx_n">Nombre del concepto</label><input id="fx_n" name="nombre" maxlength="80" value="${esc(r.nombre || '')}" placeholder="Opcional"></div></div>
        <p class="hint">Escoge un concepto de la lista o escribe el código que pida la resolución de la DIAN.</p>` : ''}${pie()}`, async fd => {
      const cuenta = String(fd.get('cuenta') || '').trim().split(' ')[0], columna = String(fd.get('columna') || ''), concepto = String(fd.get('concepto') || '').trim(), nombre = String(fd.get('nombre') || '').trim();
      if (!/^\d{1,8}$/.test(cuenta)) throw new Error('Escribe el código de la cuenta (solo números).');
      if (columna && F.concepto && !concepto && cod !== '1001') throw new Error('Escribe el concepto DIAN.');
      if (concepto && !/^\d{4}$/.test(concepto)) throw new Error('El concepto DIAN es un código de 4 dígitos.');
      const nueva = { id: r.id || `x-${Date.now().toString(36)}`, formato: cod, cuenta, concepto: columna ? concepto : '', columna, calculo: String(fd.get('calculo') || calculoDe({}, cod)), ...(nombre && columna ? { nombre } : {}) };
      const resto = reglas.filter(x => x.id !== r.id && !(String(x.formato) === cod && x.cuenta === cuenta));
      await guardar([...resto, nueva]); toast('Regla guardada.');
    });
    const ver = () => { const sin = !$('fx_k').value; ['fx_o', 'fx_n', 'fx_a'].forEach(id => { if ($(id)) $(id).disabled = sin; }); };
    $('fx_k').onchange = ver; ver();
  };
  $('cf').onchange = () => { location.hash = `#/exogenacfg?f=${$('cf').value}`; };
  $('nx').onclick = () => form({});
  m.querySelectorAll('[data-nc]').forEach(b => b.onclick = () => form({ cuenta: b.dataset.nc }));
  m.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => form(reglas.find(r => r.id === b.dataset.ex)));
  m.querySelectorAll('[data-bx]').forEach(b => b.onclick = async () => { try { await guardar(reglas.filter(r => r.id !== b.dataset.bx)); toast('Regla quitada.'); } catch (e) { fail(e); } });
  if ($('rx')) $('rx').onclick = async () => { try { await guardarContab('exogena', null); vExogenaCfg(m, cod); toast('Volviste a la configuración de fábrica.'); } catch (e) { fail(e); } };
}

/* ---------- Impuestos ---------- */
// Guarda una lista de impuestos dentro de la configuración contable de la empresa.
const guardarContab = async (clave, valor) => { await store.save('empresas', { id: S.eid, contabilidad: { ...(emp()?.contabilidad || {}), [clave]: valor } }); await recargar(); };
function vRetenciones(m) {
  const P = param(), todos = conceptosRet(emp()?.contabilidad, P);
  const nat = c => c.naturaleza === 'D' ? 'Débito' : 'Crédito';
  const tabla = (uso, titulo, sub) => `<section class="panel stack"><header class="vhead"><div><h3>${titulo}</h3><p class="hint">${sub}</p></div><button class="primary" data-nr="${uso}">Nuevo concepto</button></header>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tipo</th><th>Concepto</th><th class="r">Tarifa</th><th class="r">Base mínima</th><th>Cuenta</th><th>Naturaleza</th><th></th></tr></thead><tbody>
    ${todos.filter(c => c.uso === uso).map(c => `<tr><td>${TIPOS_RET[c.tipo].corto}</td><td><b>${esc(c.nombre)}</b></td><td class="r mono">${num(c.tarifa)}${c.tipo === 'reteica' ? '‰' : '%'}</td><td class="r mono">${num(c.base_minima) ? money(c.base_minima) : ''}</td>
      <td class="mono">${esc(c.cuenta)} <span class="muted">${esc(nomCta(c.cuenta))}</span></td><td>${nat(c)}<br><span class="hint">Nota crédito: ${c.naturaleza === 'D' ? 'crédito' : 'débito'}</span></td>
      <td class="r nowrap"><button class="sm" data-er="${c.id}">Editar</button><button class="sm ghost" data-br="${c.id}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sin conceptos.</td></tr>'}</tbody></table></div></section>`;
  m.innerHTML = `<header class="vhead"><div><h2>Conceptos de retención</h2><p class="sub">Cada concepto tiene su tarifa, su base mínima y la cuenta a la que va. Se escogen en las facturas de venta y de compra.</p></div></header>
    ${tabla('venta', 'Ventas: retenciones que le practican a la empresa', 'Facturas de venta y notas. Naturaleza débito (anticipo de impuestos); la nota crédito la lleva al crédito.')}
    ${tabla('compra', 'Compras: retenciones que practica la empresa', 'Facturas de proveedor y documentos soporte. Naturaleza crédito (retención por pagar).')}
    <p class="hint">Para llevar cada concepto a su propia subcuenta (por ejemplo 23651501 honorarios o 23652501 servicios), créala primero en el Plan de cuentas.</p>`;
  const guardar = async lista => { await guardarContab('retenciones', lista.map(({ naturaleza: _n, ...x }) => x)); vRetenciones(m); };
  m.querySelectorAll('[data-nr]').forEach(b => b.onclick = () => formRetencion({ uso: b.dataset.nr, tipo: 'retefuente' }, todos, guardar));
  m.querySelectorAll('[data-er]').forEach(b => b.onclick = () => formRetencion(todos.find(c => c.id === b.dataset.er), todos, guardar));
  m.querySelectorAll('[data-br]').forEach(b => b.onclick = async () => { try { await guardar(todos.filter(x => x.id !== b.dataset.br)); toast('Concepto quitado.'); } catch (e) { fail(e); } });
}
function formRetencion(c, todos, guardar) {
  const P = param();
  const defecto = t => c.uso === 'venta' ? P[t] : P[t + '_pagar'];
  const ctas = cuentasAux().filter(x => c.uso === 'venta' ? /^13/.test(x.codigo) : /^2/.test(x.codigo));
  dialogo(`<h2>${c.id ? 'Editar' : 'Nuevo'} concepto de retención · ${c.uso === 'venta' ? 'ventas' : 'compras'}</h2>
    <div class="grid2"><div><label for="fr_t">Tipo</label><select id="fr_t" name="tipo">${opts(Object.entries(TIPOS_RET).map(([k, v]) => [k, v.nombre]), c.tipo)}</select></div>
      <div><label for="fr_n">Concepto</label><input id="fr_n" name="nombre" required maxlength="60" value="${esc(c.nombre || '')}" placeholder="Ej.: Servicios en general"></div></div>
    <div class="grid2"><div><label for="fr_p" id="fr_pl">Tarifa</label><input id="fr_p" name="tarifa" type="number" min="0" max="100" step="0.001" class="mono" value="${c.tarifa ?? ''}"><p class="hint" id="fr_ph"></p></div>
      <div><label for="fr_b">Base mínima (pesos)</label><input id="fr_b" name="base_minima" type="number" min="0" step="1" class="mono" value="${num(c.base_minima) || ''}"><p class="hint">Si la base del documento es menor, no se retiene. Vacío = siempre.</p></div></div>
    <div><label for="fr_c">Cuenta</label><input id="fr_c" name="cuenta" list="ctasFR" class="mono" value="${esc(c.cuenta || '')}" autocomplete="off" placeholder="Código o nombre"><datalist id="ctasFR">${optsLista(ctas)}</datalist>
      <p class="hint" id="fr_ch"></p></div>
    <p class="hint">Naturaleza: <b>${c.uso === 'venta' ? 'débito' : 'crédito'}</b> en ${c.uso === 'venta' ? 'la factura y la nota débito' : 'la factura de proveedor y el documento soporte'}${c.uso === 'venta' ? '; en la nota crédito va al crédito' : ''}.</p>${pie()}`, async fd => {
    const tipo = fd.get('tipo'), nombre = String(fd.get('nombre') || '').trim(), cuenta = String(fd.get('cuenta') || '').trim().split(' ')[0] || defecto(tipo);
    if (!nombre) throw new Error('Escribe el nombre del concepto.');
    if (num(fd.get('tarifa')) < 0 || num(fd.get('tarifa')) > 100) throw new Error('La tarifa debe estar entre 0 y 100.');
    if (!esAuxiliar(cuenta)) throw new Error('Escoge una cuenta auxiliar de 8 dígitos.');
    if (!idxCuentas()[cuenta]) throw new Error(`La cuenta ${cuenta} no existe en el plan de cuentas.`);
    const nuevo = { id: c.id || `${c.uso[0]}-r-${Date.now().toString(36)}`, uso: c.uso, tipo, nombre, tarifa: num(fd.get('tarifa')), base_minima: Math.max(0, num(fd.get('base_minima'))), cuenta };
    await guardar(c.id ? todos.map(x => x.id === c.id ? nuevo : x) : [...todos, nuevo]);
    toast('Concepto guardado.');
  });
  const ver = () => { const t = $('fr_t').value; $('fr_pl').textContent = `Tarifa (${TIPOS_RET[t].unidad})`; $('fr_ph').textContent = TIPOS_RET[t].ayuda; $('fr_ch').textContent = `Vacío = la de la empresa (${defecto(t)} ${nomCta(defecto(t))}).`; };
  $('fr_t').onchange = ver; ver();
}
function vTarifasIva(m) {
  const P = param(), ts = tarifasIva(emp()?.contabilidad);
  m.innerHTML = `<header class="vhead"><div><h2>Tarifas de IVA</h2><p class="sub">Las tarifas que se escogen en los productos y en cada línea de las facturas de venta y de compra.</p></div><button class="primary" id="nt">Nueva tarifa</button></header>
    <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tarifa</th><th class="r">%</th><th>Cuenta en ventas</th><th>Cuenta en compras</th><th class="r">Productos</th><th></th></tr></thead><tbody>
    ${ts.map(t => { const n = S.d.productos.filter(p => num(p.iva_pct) === num(t.tarifa)).length; return `<tr><td><b>${esc(t.nombre)}</b></td><td class="r mono">${num(t.tarifa)}%</td>
      <td class="mono">${esc(t.cuenta_venta || P.iva)} <span class="muted">${esc(nomCta(t.cuenta_venta || P.iva))}</span></td><td class="mono">${esc(t.cuenta_compra || P.iva_descontable)} <span class="muted">${esc(nomCta(t.cuenta_compra || P.iva_descontable))}</span></td>
      <td class="r">${n}</td><td class="r nowrap"><button class="sm" data-et="${t.id}">Editar</button><button class="sm ghost" data-bt="${t.id}">Quitar</button></td></tr>`; }).join('')}</tbody></table></div></section>
    <p class="hint">Si una tarifa no tiene cuenta propia, usa la de la empresa (Plan de cuentas › Cuentas de la empresa): ${P.iva} en ventas y ${P.iva_descontable} en compras.</p>`;
  const guardar = async lista => { await guardarContab('tarifas_iva', lista); vTarifasIva(m); };
  const form = t => {
    const ctas = cuentasAux().filter(x => /^24/.test(x.codigo));
    dialogo(`<h2>${t.id ? 'Editar' : 'Nueva'} tarifa de IVA</h2>
      <div class="grid2"><div><label for="ft_n">Nombre</label><input id="ft_n" name="nombre" required maxlength="50" value="${esc(t.nombre || '')}" placeholder="Ej.: IVA 19 %"></div>
        <div><label for="ft_p">Tarifa %</label><input id="ft_p" name="tarifa" type="number" min="0" max="100" step="0.01" class="mono" required value="${t.tarifa ?? ''}"></div></div>
      <div class="grid2"><div><label for="ft_v">Cuenta en ventas</label><input id="ft_v" name="cuenta_venta" list="ctasT" class="mono" value="${esc(t.cuenta_venta || '')}" autocomplete="off" placeholder="${P.iva}"></div>
        <div><label for="ft_c">Cuenta en compras</label><input id="ft_c" name="cuenta_compra" list="ctasT" class="mono" value="${esc(t.cuenta_compra || '')}" autocomplete="off" placeholder="${P.iva_descontable}"></div></div>
      <datalist id="ctasT">${optsLista(ctas)}</datalist><p class="hint">Vacías = las de la empresa.</p>${pie()}`, async fd => {
      const nombre = String(fd.get('nombre') || '').trim(), tarifa = num(fd.get('tarifa'));
      if (!nombre) throw new Error('Escribe el nombre de la tarifa.');
      if (tarifa < 0 || tarifa > 100) throw new Error('La tarifa debe estar entre 0 y 100.');
      if (ts.some(x => x.id !== t.id && num(x.tarifa) === tarifa)) throw new Error(`Ya existe una tarifa del ${tarifa} %.`);
      const cta = k => { const v = String(fd.get(k) || '').trim().split(' ')[0]; if (v && (!esAuxiliar(v) || !idxCuentas()[v])) throw new Error(`La cuenta ${v} no es auxiliar o no existe.`); return v; };
      const nueva = { id: t.id || `iva-${Date.now().toString(36)}`, nombre, tarifa, cuenta_venta: cta('cuenta_venta'), cuenta_compra: cta('cuenta_compra') };
      await guardar(t.id ? ts.map(x => x.id === t.id ? nueva : x) : [...ts, nueva]); toast('Tarifa guardada.');
    });
  };
  $('nt').onclick = () => form({});
  m.querySelectorAll('[data-et]').forEach(b => b.onclick = () => form(ts.find(t => t.id === b.dataset.et)));
  m.querySelectorAll('[data-bt]').forEach(b => b.onclick = async () => {
    const t = ts.find(x => x.id === b.dataset.bt);
    if (S.d.productos.some(p => num(p.iva_pct) === num(t.tarifa))) return toast('Hay productos con esa tarifa. Cámbiales la tarifa primero.', true);
    if (ts.length < 2) return toast('Debe quedar al menos una tarifa.', true);
    try { await guardar(ts.filter(x => x.id !== t.id)); toast('Tarifa quitada.'); } catch (e) { fail(e); }
  });
}
function formCuenta(c = {}, padre = '') {
  const nueva = !c.id;
  const usada = c.codigo && movs().some(x => x.cuenta.startsWith(c.codigo));
  const tieneHijas = c.codigo && S.d.cuentas.some(x => x.codigo !== c.codigo && x.codigo.startsWith(c.codigo));
  const ejemplo = padre ? padre + (padre.length === 1 ? '9' : '95') : '11100502';
  const f = dialogo(`<h2>${nueva ? 'Nueva cuenta' : `Cuenta ${esc(c.codigo)} · ${esc(nivelDe(c.codigo))}`}</h2>
    ${nueva ? `${campo('codigo', 'Código', padre, 'required inputmode="numeric" class="mono" maxlength="8" pattern="[0-9]{2}|[0-9]{4}|[0-9]{6}|[0-9]{8}" placeholder="' + ejemplo + '"')}<p class="hint" id="ctaPadre">Grupo de 2 dígitos, cuenta de 4, subcuenta de 6 o auxiliar de 8. La cuenta padre debe existir. Solo las auxiliares de 8 dígitos reciben movimientos.</p>` : ''}
    ${campo('nombre', 'Nombre', c.nombre, 'required maxlength="120"')}
    <div class="grid2">${campoSel('naturaleza', 'Naturaleza', [['D', 'Débito'], ['C', 'Crédito']], c.naturaleza || (padre && idxCuentas()[padre]?.naturaleza) || 'D')}
    ${campo('niif_codigo', 'Código en el plan NIIF (opcional)', c.niif_codigo, 'class="mono" maxlength="20"')}</div>
    <div><label for="f_rub">Rubro NIIF (línea del estado financiero)</label><select id="f_rub" name="niif_rubro"><option value="">Igual que la cuenta padre</option>
      ${['ESF', 'ER', '—'].map(e => `<optgroup label="${e === 'ESF' ? 'Estado de situación financiera' : e === 'ER' ? 'Estado de resultados' : 'Otros'}">${RUBROS.filter(r => r.estado === e).map(r => `<option value="${r.id}" ${r.id === c.niif_rubro ? 'selected' : ''}>${esc(r.seccion)} · ${esc(r.nombre)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    ${!nueva && !usada && !tieneHijas && c.codigo.length > 4 ? '<div class="row"><button value="del" class="ghost">Borrar cuenta</button></div>' : ''}
    ${pie()}`, async (fd, btn) => {
    if (btn === 'del') { await store.remove('cuentas', c.id); await cargarEmpresa(); toast('Cuenta borrada.'); route(); return; }
    const row = { empresa_id: S.eid, nombre: String(fd.get('nombre')).trim(), naturaleza: fd.get('naturaleza'), niif_rubro: fd.get('niif_rubro') || null, niif_codigo: String(fd.get('niif_codigo') || '').trim() };
    if (!row.nombre) throw new Error('Escribe el nombre de la cuenta.');
    if (nueva) {
      const cod = String(fd.get('codigo')).trim();
      if (!/^(\d{2}|\d{4}|\d{6}|\d{8})$/.test(cod)) throw new Error('El código lleva 2, 4, 6 u 8 dígitos (grupo, cuenta, subcuenta o auxiliar).');
      if (idxCuentas()[cod]) throw new Error('Ya existe una cuenta con ese código.');
      if (!idxCuentas()[padreDe(cod)]) throw new Error(`Primero debe existir la cuenta ${padreDe(cod)}.`);
      row.codigo = cod; row.activa = true;
    }
    await store.save('cuentas', nueva ? row : { ...row, id: c.id });
    if (nueva) { for (let p = padreDe(row.codigo); p; p = padreDe(p)) pucAbiertas?.add(p); try { localStorage.setItem('agasoft-puc', JSON.stringify([...(pucAbiertas || [])])); } catch (_) {} }
    await cargarEmpresa(); toast('Cuenta guardada.'); route();
  });
  if (nueva) {
    const i = f.querySelector('[name=codigo]');
    i.oninput = () => {
      const cod = i.value.trim(), p = idxCuentas()[padreDe(cod)];
      $('ctaPadre').textContent = /^(\d{2}|\d{4}|\d{6}|\d{8})$/.test(cod) ? (p ? `${nivelDe(cod)} dentro de ${p.codigo} ${p.nombre}.${cod.length === 8 ? ' Recibe movimientos.' : ' Para registrar movimientos crea luego una auxiliar de 8 dígitos.'}` : `No existe la cuenta ${padreDe(cod)}.`) : 'Grupo de 2 dígitos, cuenta de 4, subcuenta de 6 o auxiliar de 8.';
      if (p) f.querySelector('[name=naturaleza]').value = p.naturaleza;
    };
    if (padre) { i.focus(); i.setSelectionRange(padre.length, padre.length); }
  }
}

let balOpc = { nivel: '4', tercero: '', detalle: '' };
function vBalance(m) {
  const terceros = [...S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre));
  m.innerHTML = `<header class="vhead"><h2>Balance de prueba</h2><button id="csv">Descargar CSV</button></header>
    ${filtroFechas('fb', true, () => pintar())}
    <div class="row filters"><div><label for="niv">Nivel</label><select id="niv">${opts([['1', 'Clase'], ['2', 'Grupo'], ['4', 'Cuenta'], ['6', 'Subcuenta'], ['8', 'Auxiliar']], balOpc.nivel)}</select></div>
      <div class="grow"><label for="bter">Tercero</label><select id="bter"><option value="">Todos los terceros</option>${terceros.map(t => `<option value="${t.id}" ${t.id === balOpc.tercero ? 'selected' : ''}>${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`).join('')}</select></div>
      <div><label for="bdet">Detallar por tercero</label><select id="bdet">${opts([['', 'No'], ['nivel', 'Solo el nivel escogido'], ['todos', 'En todos los niveles']], balOpc.detalle)}</select></div></div>
    <section class="panel" id="out"></section>`;
  let b, ms;
  const nomT = id => id ? (terc(id)?.nombre || 'Tercero borrado') : 'Sin tercero';
  // Terceros debajo de cada cuenta: solo en el nivel escogido o en todos los niveles visibles.
  const conDet = f => balOpc.detalle === 'todos' || (balOpc.detalle && f.codigo.length === Math.min(Number(balOpc.nivel), 8));
  const detalle = f => saldosPorTercero(ms, S.d.cuentas, f.codigo, F.desde, F.hasta).sort((a, c) => nomT(a.tercero_id).localeCompare(nomT(c.tercero_id)));
  const pintar = () => {
    ms = movs().filter(x => !balOpc.tercero || x.tercero_id === balOpc.tercero);
    b = balancePrueba(ms, S.d.cuentas, F.desde, F.hasta);
    const n = Number(balOpc.nivel);
    const l = b.filas.filter(f => f.codigo.length <= n);
    const sub = balOpc.tercero ? `${esc(nomT(balOpc.tercero))} · ${esc(docId(terc(balOpc.tercero)))}<br><small>${fFecha(F.desde)} a ${fFecha(F.hasta)}</small>` : `${fFecha(F.desde)} a ${fFecha(F.hasta)}`;
    $('out').innerHTML = cabInforme(balOpc.tercero ? 'Balance de prueba por tercero' : 'Balance de prueba', sub) + (l.length ? `<div class="tbl-wrap"><table class="tbl bal"><thead><tr><th>Código</th><th>Cuenta</th><th class="r">Saldo anterior</th><th class="r">Débitos</th><th class="r">Créditos</th><th class="r">Saldo final</th></tr></thead><tbody>
      ${l.map(f => `<tr class="lv${f.codigo.length} click" data-go="#/auxiliar?cuenta=${f.codigo}"><td class="mono">${f.codigo}</td><td>${esc(f.nombre)}</td><td class="r mono">${valor(f.inicial)}</td><td class="r mono">${valor(f.debito)}</td><td class="r mono">${valor(f.credito)}</td><td class="r mono">${valor(f.final)}</td></tr>
        ${conDet(f) ? detalle(f).map(x => `<tr class="ter"><td></td><td>${esc(nomT(x.tercero_id))}${x.tercero_id ? ` <span class="muted mono">${esc(fmtNit(terc(x.tercero_id)?.numero || ''))}</span>` : ''}</td><td class="r mono">${valor(x.inicial)}</td><td class="r mono">${valor(x.debito)}</td><td class="r mono">${valor(x.credito)}</td><td class="r mono">${valor(x.final)}</td></tr>`).join('') : ''}`).join('')}
      <tr class="strong"><td colspan="3">Sumas iguales</td><td class="r mono">${money(b.debitos)}</td><td class="r mono">${money(b.creditos)}</td><td></td></tr></tbody></table></div>
      ${!balOpc.tercero && Math.abs(b.debitos - b.creditos) > 0.009 ? '<p class="err">Los débitos y créditos no cuadran. Revisa las cuentas de la contabilización.</p>' : ''}<p class="hint">Saldos según la naturaleza de cada cuenta. Toca una fila para ver su libro auxiliar.${balOpc.tercero ? ' Al filtrar por un tercero, las sumas no tienen que ser iguales.' : ''}</p>` : '<p class="muted">No hay movimientos en este periodo con ese filtro.</p>');
  };
  $('niv').onchange = () => { balOpc.nivel = $('niv').value; pintar(); };
  $('bter').onchange = () => { balOpc.tercero = $('bter').value; pintar(); };
  $('bdet').onchange = () => { balOpc.detalle = $('bdet').value; pintar(); };
  $('csv').onclick = () => {
    const n = Number(balOpc.nivel), filas = [['Código', 'Cuenta', 'Tercero', 'Identificación', 'Saldo anterior', 'Débitos', 'Créditos', 'Saldo final']];
    const v = x => String(x).replace('.', ',');
    for (const f of b.filas.filter(f => f.codigo.length <= n)) {
      filas.push([f.codigo, f.nombre, balOpc.tercero ? nomT(balOpc.tercero) : '', balOpc.tercero ? terc(balOpc.tercero)?.numero || '' : '', v(f.inicial), v(f.debito), v(f.credito), v(f.final)]);
      if (conDet(f)) for (const x of detalle(f)) filas.push([f.codigo, f.nombre, nomT(x.tercero_id), terc(x.tercero_id)?.numero || '', v(x.inicial), v(x.debito), v(x.credito), v(x.final)]);
    }
    descargar(`balance${balOpc.detalle || balOpc.tercero ? '-terceros' : ''}-${emp().nit}-${F.hasta}.csv`, '﻿' + filas.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  };
  pintar();
}

function vAuxiliar(m, q) {
  // Rango de cuentas: desde la 1 hasta la 2, o desde la 1 hasta la 1 para una sola.
  let desdeC = q.get('cuenta') || param().clientes, hastaC = q.get('hasta') || desdeC, tercero = '';
  const conMov = [...new Set(movs().map(x => x.cuenta))].sort();
  const lista = `<datalist id="ctasAuxL">${[...S.d.cuentas].sort((a, b) => a.codigo.localeCompare(b.codigo)).map(c => `<option value="${c.codigo} ${esc(c.nombre)}${conMov.some(x => x.startsWith(c.codigo)) ? '' : ' (sin movimientos)'}"></option>`).join('')}</datalist>`;
  const caja = (id, lab, v) => `<div class="grow"><label for="${id}">${lab}</label><input id="${id}" list="ctasAuxL" class="mono" style="width:100%;max-width:100%" value="${esc(v)}" autocomplete="off" placeholder="Código o nombre de la cuenta"><p class="hint" id="${id}Nom">${esc(nomCta(v))}</p></div>`;
  m.innerHTML = `<header class="vhead"><h2>Libro auxiliar</h2></header>
    <div class="row filters">${caja('cta', 'Desde la cuenta', desdeC)}${caja('cta2', 'Hasta la cuenta', hastaC)}
      <div class="grow"><label for="ter">Tercero</label><select id="ter"><option value="">Todos</option>${[...S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(t => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select></div></div>
    ${lista}<p class="hint">Escribe el código de cualquier nivel (por ejemplo 1105 o 11050501) o parte del nombre. Para una sola cuenta pon la misma en los dos campos; desde 1 hasta 1 es toda la clase 1.</p>
    ${filtroFechas('fa', true, () => pintar())}
    <section class="panel" id="out"></section>`;
  const rango = () => desdeC === hastaC ? `${esc(desdeC)} ${esc(nomCta(desdeC))}` : `Desde ${esc(desdeC)} ${esc(nomCta(desdeC))} hasta ${esc(hastaC)} ${esc(nomCta(hastaC))}`;
  const pintar = () => {
    const r = auxiliarRango(movs(), S.d.cuentas, desdeC, hastaC, F.desde, F.hasta, tercero);
    $('out').innerHTML = cabInforme('Libro auxiliar', `${rango()}<br><small>${fFecha(F.desde)} a ${fFecha(F.hasta)}</small>`) + `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Documento</th><th>Tercero</th><th>Detalle</th><th class="r">Débito</th><th class="r">Crédito</th><th class="r">Saldo</th></tr></thead><tbody>
      ${r.secciones.map(a => `<tr class="strong"><td colspan="7"><span class="mono">${a.cuenta}</span> ${esc(nomCta(a.cuenta))}</td></tr>
      <tr class="muted"><td colspan="6">Saldo anterior</td><td class="r mono">${money(a.inicial)}</td></tr>
      ${a.filas.map(x => `<tr><td class="nowrap">${fFecha(x.fecha)}</td><td>${linkDoc(x)}</td><td>${esc(x.tercero_id ? terc(x.tercero_id)?.nombre : '')}</td><td>${esc(x.detalle)}</td><td class="r mono">${valor(x.debito)}</td><td class="r mono">${valor(x.credito)}</td><td class="r mono">${money(x.saldo)}</td></tr>`).join('')}
      <tr><td colspan="4" class="muted">Total ${a.cuenta}</td><td class="r mono">${money(a.debitos)}</td><td class="r mono">${money(a.creditos)}</td><td class="r mono">${money(a.final)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sin movimientos en el periodo.</td></tr>'}
      ${r.secciones.length > 1 ? `<tr class="strong"><td colspan="4">Totales del rango</td><td class="r mono">${money(r.debitos)}</td><td class="r mono">${money(r.creditos)}</td><td></td></tr>` : ''}</tbody></table></div>`;
  };
  const leer = id => {
    const v = $(id).value.trim().split(' ')[0];
    if (!v) return null;
    if (!S.d.cuentas.some(c => c.codigo === v)) { $(id + 'Nom').textContent = `La cuenta ${v} no existe en el plan de cuentas.`; return null; }
    $(id).value = v; $(id + 'Nom').textContent = nomCta(v); return v;
  };
  const ir = id => {
    const v = leer(id); if (!v) return;
    if (id === 'cta') { const igual = desdeC === hastaC; desdeC = v; if (igual) { hastaC = v; $('cta2').value = v; $('cta2Nom').textContent = nomCta(v); } } else hastaC = v;
    history.replaceState(null, '', `#/auxiliar?cuenta=${desdeC}${hastaC !== desdeC ? '&hasta=' + hastaC : ''}`); pintar();
  };
  for (const id of ['cta', 'cta2']) { $(id).onchange = () => ir(id); $(id).onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); ir(id); } }; }
  $('ter').onchange = () => { tercero = $('ter').value; pintar(); };
  pintar();
}

// Nivel de detalle de los estados financieros: solo rubros NIIF (desplegables) o cuentas del PUC hasta el nivel escogido.
let infOpc = { nivel: '0', tercero: '', detalle: '' };
// Movimientos y periodo del informe que se está pintando (para el detalle por tercero).
let infCtx = { ms: [], desde: null, hasta: '' };
const NIVELES_INF = [['0', 'Rubros NIIF'], ['2', 'Grupo'], ['4', 'Cuenta'], ['6', 'Subcuenta'], ['8', 'Auxiliar']];
function selNivelInf() {
  const ts = [...S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return `<div class="row filters"><div><label for="ninf">Nivel</label><select id="ninf">${opts(NIVELES_INF, infOpc.nivel)}</select></div>
    <div class="grow"><label for="iter">Tercero</label><select id="iter"><option value="">Todos los terceros</option>${ts.map(t => `<option value="${t.id}" ${t.id === infOpc.tercero ? 'selected' : ''}>${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`).join('')}</select></div>
    <div><label for="idet">Detallar por tercero</label><select id="idet">${opts([['', 'No'], ['nivel', 'Solo el nivel escogido'], ['todos', 'En todos los niveles']], infOpc.detalle)}</select></div></div>`;
}
// Conecta los filtros del informe (nivel, tercero y detalle por tercero).
function filtrosInf(pintar) {
  $('ninf').onchange = () => { infOpc.nivel = $('ninf').value; pintar(); };
  $('iter').onchange = () => { infOpc.tercero = $('iter').value; pintar(); };
  $('idet').onchange = () => { infOpc.detalle = $('idet').value; pintar(); };
}
const movsInf = (desde, hasta) => { const ms = movs().filter(x => !infOpc.tercero || x.tercero_id === infOpc.tercero); infCtx = { ms, desde, hasta }; return ms; };
// Filas de terceros debajo de una cuenta, con el mismo signo del rubro.
function tercerosInf(codigo, signo, nivelFila) {
  const n = Number(infOpc.nivel) || 8;
  if (!infOpc.detalle || (infOpc.detalle === 'nivel' && nivelFila !== Math.min(n, 8))) return '';
  const acc = {};
  for (const m of infCtx.ms) if (m.cuenta.startsWith(codigo) && m.fecha <= infCtx.hasta && (!infCtx.desde || m.fecha >= infCtx.desde)) { const k = m.tercero_id || ''; acc[k] = r2((acc[k] || 0) + signo * (m.debito - m.credito)); }
  const nom = id => id ? (terc(id)?.nombre || 'Tercero borrado') : 'Sin tercero';
  return Object.entries(acc).filter(([, v]) => v).sort(([a], [b]) => nom(a).localeCompare(nom(b)))
    .map(([id, v]) => `<div class="inf-c ter n${nivelFila}"><span>${esc(nom(id))}${id ? ` <span class="mono">${esc(fmtNit(terc(id)?.numero || ''))}</span>` : ''}</span><span class="mono">${money(v)}</span></div>`).join('');
}
// Suma las cuentas auxiliares de un rubro en cada nivel del PUC hasta n dígitos (grupo, cuenta, subcuenta, auxiliar).
function cuentasPorNivel(cuentas, n) {
  const idx = idxCuentas(), acc = {};
  for (const c of cuentas) for (const l of [2, 4, 6, 8]) if (l <= n && c.codigo.length >= l) { const k = c.codigo.slice(0, l); acc[k] = r2((acc[k] || 0) + c.valor); }
  return Object.entries(acc).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b)).map(([codigo, valor]) => ({ codigo, valor, nombre: idx[codigo]?.nombre || '' }));
}
function lineaInforme(x) {
  const n = Number(infOpc.nivel);
  if (n && x.cuentas?.length) return `<div class="inf-l plain head"><span>${esc(x.nombre)}</span><span class="mono">${money(x.valor)}</span></div>
    ${cuentasPorNivel(x.cuentas, n).map(c => `<a class="inf-c n${c.codigo.length}" href="#/auxiliar?cuenta=${c.codigo}"><span><span class="mono">${c.codigo}</span> ${esc(c.nombre)}</span><span class="mono">${money(c.valor)}</span></a>${tercerosInf(c.codigo, x.signo, c.codigo.length)}`).join('')}`;
  return x.cuentas?.length ? `<details class="inf-l" ${infOpc.detalle ? 'open' : ''}><summary><span>${esc(x.nombre)}</span><span class="mono">${money(x.valor)}</span></summary>
    ${x.cuentas.map(c => `<a class="inf-c" href="#/auxiliar?cuenta=${c.codigo}"><span><span class="mono">${c.codigo}</span> ${esc(c.nombre)}</span><span class="mono">${money(c.valor)}</span></a>${tercerosInf(c.codigo, x.signo, 8)}`).join('')}</details>`
    : `<div class="inf-l plain"><span>${esc(x.nombre)}</span><span class="mono">${money(x.valor)}</span></div>`;
}
function vEsf(m) {
  m.innerHTML = `<header class="vhead"><h2>Estado de situación financiera</h2></header>${filtroFechas('fe', false, () => pintar())}${selNivelInf()}<section class="panel" id="out"></section>`;
  const pintar = () => {
    const e = situacionFinanciera(movsInf(null, F.hasta), S.d.cuentas, F.hasta);
    $('out').innerHTML = cabInforme('Estado de situación financiera', `${infOpc.tercero ? esc(terc(infOpc.tercero)?.nombre || '') + '<br>' : ''}A ${fFecha(F.hasta)}`) + `<p class="rep-small">Bajo NIIF para Pymes (Decreto 2420 de 2015, Grupo 2). Cifras en pesos colombianos. ${infOpc.nivel === '0' ? 'Toca un rubro para ver las cuentas del PUC que lo forman.' : 'Cada rubro muestra sus cuentas del PUC hasta el nivel escogido. Toca una cuenta para ver su libro auxiliar.'}</p>
      <div class="inf">${e.grupos.map(g => `<section class="inf-g"><h3>${g.titulo}</h3>${g.secciones.map(sx => sx.lineas.length ? `${sx.titulo ? `<h4>${sx.titulo}</h4>` : ''}${sx.lineas.map(lineaInforme).join('')}<div class="inf-l sub"><span>Total ${(sx.titulo || g.titulo).toLowerCase()}</span><span class="mono">${money(sx.lineas.reduce((s, x) => s + x.valor, 0))}</span></div>` : '').join('') || '<p class="muted">Sin saldos.</p>'}
        <div class="inf-l tot"><span>Total ${g.titulo.toLowerCase()}</span><span class="mono">${money(g.total)}</span></div></section>`).join('')}
        <div class="inf-l tot big"><span>Total pasivo y patrimonio</span><span class="mono">${money(e.pasivo + e.patrimonio)}</span></div></div>
      ${e.cuadra ? '<p class="okmsg">El activo es igual al pasivo más el patrimonio.</p>' : `<p class="err">No cuadra: diferencia de ${money(e.activo - e.pasivo - e.patrimonio)}. Revisa la homologación de las cuentas.</p>`}
      <p class="hint">El resultado del ejercicio incluye los ingresos, costos y gastos que aún no se han cerrado contra la cuenta 36.</p>`;
  };
  filtrosInf(pintar);
  pintar();
}
function vEr(m) {
  m.innerHTML = `<header class="vhead"><h2>Estado de resultados</h2></header>${filtroFechas('fr', true, () => pintar())}${selNivelInf()}<section class="panel" id="out"></section>`;
  const pintar = () => {
    // El cierre contable no se muestra en el estado de resultados (lo dejaría en cero).
    const r = estadoResultados(movsInf(F.desde, F.hasta).filter(x => x.tipo !== 'CI'), S.d.cuentas, F.desde, F.hasta);
    $('out').innerHTML = cabInforme('Estado de resultados', `${infOpc.tercero ? esc(terc(infOpc.tercero)?.nombre || '') + '<br>' : ''}Del ${fFecha(F.desde)} al ${fFecha(F.hasta)}`) + `<p class="rep-small">Bajo NIIF para Pymes, gastos clasificados por función. Cifras en pesos colombianos.</p>
      <div class="inf">${r.secciones.map(sx => sx.total ? `<div class="inf-l tot ${sx.final ? 'big' : ''}"><span>${sx.total}</span><span class="mono">${money(sx.valor)}</span></div>`
        : sx.lineas.length ? `<h4>${sx.titulo}${sx.resta ? ' <span class="muted">(menos)</span>' : ''}</h4>${sx.lineas.map(lineaInforme).join('')}` : '').join('')}</div>`;
  };
  filtrosInf(pintar);
  pintar();
}

iniciar().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<p class="err" style="padding:16px">No se pudo iniciar AGAsoft: ${esc(e.message)}</p>`); });
void dvOf;

/* ---------- Comprobantes contables (notas de contabilidad y saldos iniciales) ---------- */
const comps = () => S.d?.comprobantes || [];
const compById = id => comps().find(c => c.id === id);
const nomComp = c => `${TIPOS_COMP[c.tipo].nombre} ${c.numero}`;
const valorComp = c => r2((c.lineas || []).reduce((s, l) => s + num(l.debito), 0));
const siguienteComp = tipo => Math.max(0, ...comps().filter(c => c.tipo === tipo).map(c => Number(c.numero) || 0)) + 1;
// Cuentas auxiliares: las de 8 dígitos, las únicas que reciben movimientos.
// Cuentas que se usan en compras y gastos: inventarios, activos fijos e intangibles, diferidos, gastos y costos.
const CLASES_COMPRA = ['14', '15', '16', '17', '18', '5', '6', '7'];
// Opciones de lista con código y nombre: así se puede buscar escribiendo cualquiera de los dos.
const optsLista = l => l.map(x => `<option value="${x.codigo} ${esc(x.nombre)}"></option>`).join('');
// Al escoger de la lista queda solo el código en la casilla.
document.addEventListener('change', ev => { const el = ev.target; if (el.matches?.('input[list^="ctas"]') && el.value.includes(' ')) { el.value = el.value.trim().split(' ')[0]; el.dispatchEvent(new Event('input', { bubbles: true })); } });
function cuentasAux() {
  return S.d.cuentas.filter(c => c.activa !== false && esAuxiliar(c.codigo)).sort((a, b) => a.codigo.localeCompare(b.codigo));
}
function vComprobantes(m) {
  let q = '', tipo = '', anulados = false;
  m.innerHTML = `<header class="vhead"><div><h2>Comprobantes contables</h2><p class="sub">Notas de contabilidad para ajustes, depreciaciones, provisiones y cierres, y los saldos iniciales de la empresa.</p></div>
    <div class="row"><a class="btn" href="#/compnuevo?tipo=SI">Saldos iniciales</a><a class="btn primary" href="#/compnuevo?tipo=CC">Nueva nota de contabilidad</a></div></header>
    <div class="row filters"><input id="q" type="search" placeholder="Buscar por número, descripción o cuenta"><select id="tp" aria-label="Tipo"><option value="">Todos</option>${Object.entries(TIPOS_COMP).map(([k, v]) => `<option value="${k}">${v.plural}</option>`).join('')}</select>
    <label class="check"><input type="checkbox" id="anu"> Ver anulados</label></div>
    <section class="panel" id="lst"></section>`;
  const pintar = () => {
    const l = comps().filter(c => (!tipo || c.tipo === tipo) && (anulados || c.estado !== 'anulado') && (!q || `${c.numero} ${c.descripcion} ${(c.lineas || []).map(x => `${x.cuenta} ${x.detalle}`).join(' ')}`.toLowerCase().includes(q)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero);
    $('lst').innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Comprobante</th><th>Descripción</th><th class="r">Valor</th><th></th></tr></thead><tbody>
      ${l.map(c => `<tr class="click ${c.estado === 'anulado' ? 'muted' : ''}" data-go="#/comp/${c.id}"><td class="nowrap">${fFecha(c.fecha)}</td><td class="nowrap"><a href="#/comp/${c.id}">${esc(nomComp(c))}</a></td><td>${esc(c.descripcion)}</td><td class="r mono">${money(valorComp(c))}</td><td>${c.estado === 'anulado' ? '<span class="tag bad">Anulado</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${q || tipo ? 'Ningún comprobante coincide.' : 'Todavía no hay comprobantes. Empieza por los saldos iniciales si la empresa ya venía funcionando.'}</p>`;
  };
  $('q').oninput = () => { q = $('q').value.trim().toLowerCase(); pintar(); };
  $('tp').onchange = () => { tipo = $('tp').value; pintar(); };
  $('anu').onchange = () => { anulados = $('anu').checked; pintar(); };
  pintar();
}

function vCompEditor(m, { id, tipo }) {
  let c;
  if (id) {
    const x = compById(id);
    if (!x) { m.innerHTML = '<p>No se encontró el comprobante.</p>'; return; }
    if (x.estado === 'anulado') { location.replace('#/comp/' + id); return; }
    c = { ...x, lineas: (x.lineas || []).map(l => ({ ...l, cuenta: a8(l.cuenta) })) };
  } else {
    if (!TIPOS_COMP[tipo]) tipo = 'CC';
    const linea0 = () => ({ cuenta: '', tercero_id: '', detalle: '', debito: '', credito: '' });
    c = { empresa_id: S.eid, tipo, fecha: tipo === 'SI' ? hoy().slice(0, 4) + '-01-01' : hoy(), descripcion: tipo === 'SI' ? 'Saldos iniciales' : '', lineas: [linea0(), linea0()] };
  }
  const T = TIPOS_COMP[c.tipo];
  const aux = cuentasAux(), idx = idxCuentas();
  const terceros = [...S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const nuevaLinea = () => ({ cuenta: '', tercero_id: '', detalle: '', debito: '', credito: '' });
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/comprobantes">← Comprobantes</a><h2>${id ? `Editar ${esc(nomComp(c))}` : `Nuevo: ${T.nombre.toLowerCase()}`}</h2>
    <p class="sub">${c.tipo === 'SI' ? 'Registra el saldo de cada cuenta a la fecha en que empiezas a llevar la contabilidad en AGAsoft. Puedes importarlo desde el balance de prueba de Alegra o World Office.' : 'Cada línea lleva débito o crédito. El comprobante debe cuadrar (sumas iguales) para guardarse.'}</p></div></header>
  <form id="ce" class="stack" novalidate>
    <section class="panel grid-doc">
      <div><label for="cf">Fecha</label><input id="cf" type="date" value="${c.fecha}" required></div>
      <div><label>Número</label><p class="mono">${id ? c.numero : `${siguienteComp(c.tipo)} (se asigna al guardar)`}</p></div>
      <div class="span2"><label for="cd">Descripción</label><input id="cd" maxlength="300" value="${esc(c.descripcion)}" placeholder="${c.tipo === 'SI' ? 'Saldos iniciales' : 'Ej.: Depreciación de noviembre'}"></div>
    </section>
    <section class="panel stack"><div class="vhead"><h3>Movimientos</h3><div class="row"><button type="button" id="impL">Importar CSV</button><button type="button" id="addL">+ Agregar línea</button></div></div>
      <datalist id="ctasComp">${optsLista(aux)}</datalist>
      <div class="tbl-wrap"><table class="tbl items comp"><thead><tr><th>Cuenta</th><th>Tercero</th><th>Detalle</th><th class="r">Débito</th><th class="r">Crédito</th><th></th></tr></thead><tbody id="lns"></tbody></table></div>
      <div class="totbox" id="ctot"></div>
    </section>
    <div class="err" id="ceErr" hidden></div>
    <div class="row end sticky-actions"><span class="spacer"></span><a class="btn ghost" href="${id ? '#/comp/' + id : '#/comprobantes'}">Cancelar</a><button type="submit" class="primary" id="ceSave">Guardar</button></div>
  </form>`;
  const nomDe = cod => cod ? (idx[cod]?.nombre || 'No existe en el plan') : '';
  const pintar = () => {
    $('lns').innerHTML = c.lineas.map((l, i) => `<tr data-i="${i}">
      <td data-l="Cuenta"><input data-k="cuenta" list="ctasComp" class="mono w-cod" value="${esc(l.cuenta)}" aria-label="Cuenta" autocomplete="off" placeholder="Código o nombre"><small class="hint" data-n="${i}">${esc(nomDe(l.cuenta))}</small></td>
      <td data-l="Tercero"><select data-k="tercero_id" aria-label="Tercero"><option value="">—</option>${terceros.map(t => `<option value="${t.id}" ${t.id === l.tercero_id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></td>
      <td data-l="Detalle" class="c-desc"><input data-k="detalle" value="${esc(l.detalle)}" maxlength="200" aria-label="Detalle"></td>
      <td data-l="Débito"><input data-k="debito" type="number" min="0" step="0.01" class="r mono w-val" value="${num(l.debito) || ''}" aria-label="Débito"></td>
      <td data-l="Crédito"><input data-k="credito" type="number" min="0" step="0.01" class="r mono w-val" value="${num(l.credito) || ''}" aria-label="Crédito"></td>
      <td class="c-del"><button type="button" class="ghost" data-del="${i}" aria-label="Quitar línea">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sin líneas.</td></tr>';
    totales_();
  };
  const totales_ = () => {
    const d = r2(c.lineas.reduce((s, l) => s + num(l.debito), 0)), k = r2(c.lineas.reduce((s, l) => s + num(l.credito), 0)), dif = r2(d - k);
    $('ctot').innerHTML = `<dl class="tot"><dt>Débitos</dt><dd class="mono">${money(d)}</dd><dt>Créditos</dt><dd class="mono">${money(k)}</dd>
      <dt class="strong">Diferencia</dt><dd class="mono strong ${dif ? 'neg' : ''}">${dif ? money(dif) : 'Cuadrado ✓'}</dd></dl>`;
  };
  $('lns').addEventListener('input', ev => {
    const el = ev.target, tr = el.closest('tr[data-i]'); if (!tr || !el.dataset.k) return;
    const l = c.lineas[Number(tr.dataset.i)];
    l[el.dataset.k] = el.dataset.k === 'cuenta' ? el.value.trim().split(' ')[0] : el.value;
    if (el.dataset.k === 'cuenta') m.querySelector(`[data-n="${tr.dataset.i}"]`).textContent = nomDe(l.cuenta);
    if (el.dataset.k === 'debito' || el.dataset.k === 'credito') {
      // Cada línea lleva solo débito o solo crédito: al escribir en uno se borra el otro.
      const otro = el.dataset.k === 'debito' ? 'credito' : 'debito';
      if (num(el.value)) { l[otro] = ''; const o = tr.querySelector(`[data-k=${otro}]`); if (o) o.value = ''; }
      totales_();
    }
  });
  $('lns').addEventListener('change', ev => { const el = ev.target, tr = el.closest('tr[data-i]'); if (tr && el.tagName === 'SELECT') c.lineas[Number(tr.dataset.i)].tercero_id = el.value; });
  $('lns').addEventListener('click', ev => { const b = ev.target.closest('[data-del]'); if (!b) return; c.lineas.splice(Number(b.dataset.del), 1); pintar(); });
  $('addL').onclick = () => {
    // La línea nueva propone el valor que falta para cuadrar.
    const dif = r2(c.lineas.reduce((s, l) => s + num(l.debito) - num(l.credito), 0));
    c.lineas.push({ ...nuevaLinea(), detalle: c.lineas.at(-1)?.detalle || '', debito: dif < 0 ? -dif : '', credito: dif > 0 ? dif : '' });
    pintar(); $('lns').querySelector(`tr[data-i="${c.lineas.length - 1}"] [data-k=cuenta]`)?.focus();
  };
  $('impL').onclick = () => importarLineas(c, pintar);
  $('ce').onsubmit = async ev => {
    ev.preventDefault();
    c.fecha = $('cf').value; c.descripcion = $('cd').value.trim();
    const lineas = c.lineas.filter(l => String(l.cuenta || '').trim() || num(l.debito) || num(l.credito))
      .map(l => ({ cuenta: String(l.cuenta).trim(), tercero_id: l.tercero_id || '', detalle: String(l.detalle || '').trim(), debito: r2(num(l.debito)), credito: r2(num(l.credito)) }));
    const errs = erroresComprobante({ ...c, lineas }, S.d.cuentas);
    if (errs.length) { $('ceErr').innerHTML = errs.slice(0, 8).map(esc).join('<br>') + (errs.length > 8 ? `<br>…y ${errs.length - 8} más.` : ''); $('ceErr').hidden = false; return; }
    $('ceErr').hidden = true; $('ceSave').disabled = true;
    try {
      const row = { empresa_id: S.eid, tipo: c.tipo, fecha: c.fecha, descripcion: c.descripcion, lineas };
      let g;
      if (id) g = await store.save('comprobantes', { ...row, id });
      else {
        try { g = await store.save('comprobantes', { ...row, numero: siguienteComp(c.tipo), estado: 'contabilizado' }); }
        catch (e) { await cargarEmpresa(); g = await store.save('comprobantes', { ...row, numero: siguienteComp(c.tipo), estado: 'contabilizado' }); }
      }
      await cargarEmpresa(); toast('Comprobante guardado.'); location.hash = '#/comp/' + g.id;
    } catch (e) { $('ceErr').textContent = /comprobantes/.test(e.message) && /exist|schema|relation/i.test(e.message) ? 'Falta crear la tabla de comprobantes en Supabase (archivo supabase/004_comprobantes.sql).' : e.message; $('ceErr').hidden = false; }
    finally { $('ceSave').disabled = false; }
  };
  pintar();
}

// Importa líneas desde un CSV (por ejemplo el balance de prueba exportado de Alegra o World Office).
function importarLineas(c, alTerminar) {
  const COLS_L = { cuenta: ['cuenta', 'codigo', 'codigocuenta', 'cuentacontable', 'codcuenta'], tercero: ['nit', 'tercero', 'identificacion', 'numeroidentificacion', 'documento', 'nittercero'],
    detalle: ['detalle', 'descripcion', 'concepto'], debito: ['debito', 'debitos', 'debe'], credito: ['credito', 'creditos', 'haber'], saldo: ['saldo', 'saldofinal', 'saldoactual', 'nuevosaldo'] };
  const f = dialogo(`<h2>Importar movimientos</h2><p>Guarda la hoja como <b>CSV</b>. Debe tener la cuenta y los valores, en columnas <b>Débito</b> y <b>Crédito</b> o en una sola columna <b>Saldo</b>. Por ejemplo:</p>
    <pre class="mono">Cuenta;NIT;Detalle;Débito;Crédito\n11100501;;Saldo banco;15.000.000;0\n31050501;;Capital;0;15.000.000</pre>
    <p class="hint">Si el archivo trae cuentas de grupo (1, 11, 1110…) y también sus auxiliares, solo se toman las auxiliares para no sumar dos veces. Con la columna Saldo, el valor positivo va a la naturaleza de la cuenta.</p>
    <input type="file" name="archivo" accept=".csv,text/csv" required><div id="ilPrev"></div>${pie('Importar')}`, async () => {
    const filas = f._filas; if (!filas?.length) throw new Error('Escoge un archivo con datos.');
    const idx = idxCuentas(), codigos = filas.map(x => x.cuenta);
    const hojas = filas.filter(x => !codigos.some(o => o.length > x.cuenta.length && o.startsWith(x.cuenta)));
    let sinTercero = 0;
    const nuevas = hojas.map(x => {
      let d = parseValor(x.debito), k = parseValor(x.credito);
      if (x.saldo !== undefined && !x.debito && !x.credito) {
        const s = parseValor(x.saldo), nat = idx[x.cuenta]?.naturaleza || (/^[1567]/.test(x.cuenta) ? 'D' : 'C');
        if ((nat === 'D') === (s >= 0)) d = Math.abs(s); else k = Math.abs(s);
      }
      const neto = r2(d - k); d = neto > 0 ? neto : 0; k = neto < 0 ? -neto : 0;
      const nit = String(x.tercero || '').split('-')[0].replace(/\D/g, '');
      const t = nit ? S.d.terceros.find(y => y.numero === nit) : null;
      if (nit && !t) sinTercero++;
      return { cuenta: a8(x.cuenta), tercero_id: t?.id || '', detalle: [x.detalle, nit && !t ? `NIT ${nit}` : ''].filter(Boolean).join(' · ') || c.descripcion || '', debito: d || '', credito: k || '' };
    }).filter(l => l.debito || l.credito);
    c.lineas = c.lineas.filter(l => String(l.cuenta || '').trim() || num(l.debito) || num(l.credito)).concat(nuevas);
    alTerminar();
    toast(`${nuevas.length} líneas importadas.${sinTercero ? ` ${sinTercero} con un NIT que no está en Clientes (quedó en el detalle).` : ''}`);
  });
  f.querySelector('[name=archivo]').onchange = async ev => {
    const file = ev.target.files[0]; if (!file) return;
    let txt = await file.text(); if (txt.includes(String.fromCharCode(0xfffd))) txt = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
    const rows = parseCSV(txt); const hi = rows.findIndex(r => r.some(h => COLS_L.cuenta.includes(norm(h))));
    const head = (rows[hi] || []).map(norm), map = {};
    for (const [k, alias] of Object.entries(COLS_L)) { const i = head.findIndex(h => alias.includes(h)); if (i >= 0) map[k] = i; }
    const ok = hi >= 0 && (map.debito !== undefined || map.credito !== undefined || map.saldo !== undefined);
    f._filas = ok ? rows.slice(hi + 1).map(r => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, (r[i] || '').trim()]))).map(x => ({ ...x, cuenta: String(x.cuenta || '').replace(/\D/g, '') })).filter(x => x.cuenta) : null;
    $('ilPrev').innerHTML = !ok ? '<p class="err">No encontré la columna de cuenta y la de valores (Débito y Crédito, o Saldo). Revisa los títulos.</p>' : `<p class="hint">${f._filas.length} filas con cuenta. Columnas reconocidas: ${Object.keys(map).join(', ')}.</p>`;
  };
}

function vComp(m, id) {
  const c = compById(id);
  if (!c) { m.innerHTML = '<p>No se encontró el comprobante.</p>'; return; }
  const anulado = c.estado === 'anulado';
  const ms = asientoComprobante({ ...c, estado: 'contabilizado' });
  m.innerHTML = `<header class="vhead noprint"><div><a class="back" href="#/comprobantes">← Comprobantes</a><h2>${esc(nomComp(c))} ${anulado ? '<span class="tag bad">Anulado</span>' : ''}</h2></div>
    <div class="row">${anulado ? '' : `<button id="anular">Anular</button><a class="btn" href="#/compeditar/${c.id}">Editar</a>`}<button class="primary" id="imprimir">Imprimir o PDF</button></div></header>
    <section class="panel stack">${hojaComp(c, ms)}</section>
    ${anulado ? `<p class="hint">Anulado${c.anulado_motivo ? `: ${esc(c.anulado_motivo)}` : ''}. No suma en los informes.</p>` : ''}`;
  $('imprimir').onclick = () => { $('print').innerHTML = hojaComp(c, ms, true); const t = document.title; document.title = `${nomComp(c)} - ${emp().nombre}`; window.print(); document.title = t; };
  if ($('anular')) $('anular').onclick = () => dialogo(`<h2>Anular ${esc(nomComp(c))}</h2><p>Sus movimientos dejan de sumar en el balance, el auxiliar y los estados financieros. El número no se vuelve a usar.</p>
    <div><label for="f_mot">Motivo</label><input id="f_mot" name="motivo" required maxlength="200"></div>${pie('Anular comprobante')}`, async fd => {
    const mot = String(fd.get('motivo')).trim(); if (!mot) throw new Error('Escribe el motivo.');
    await store.save('comprobantes', { id: c.id, estado: 'anulado', anulado_motivo: mot, anulado_en: new Date().toISOString() });
    await cargarEmpresa(); toast('Comprobante anulado.'); route();
  });
}
function hojaComp(c, ms, imprimir) {
  return `${cabInforme(TIPOS_COMP[c.tipo].nombre, `No. ${c.numero}<br><small>${fFecha(c.fecha)}</small>`)}
    ${c.descripcion ? `<p><b>Descripción:</b> ${esc(c.descripcion)}</p>` : ''}${imprimir && c.estado === 'anulado' ? '<p><b>ANULADO</b></p>' : ''}
    ${tablaAsiento(ms)}${imprimir ? '<div class="firmas"><span>Elaboró</span><span>Aprobó</span></div><p class="rep-small">Elaborado con AGAsoft.</p>' : ''}`;
}

/* ---------- Compras y gastos ---------- */
const compras = () => S.d?.compras || [];
const compraById = id => compras().find(c => c.id === id);
const nomCompra = c => `${TIPOS_COMPRA[c.tipo].nombre} ${c.numero}`;
const siguienteCompra = tipo => Math.max(0, ...compras().filter(c => c.tipo === tipo).map(c => Number(c.numero) || 0)) + 1;
// A quién se le puede pagar con un egreso: proveedores, empleados y quien tenga saldos de nómina por pagar.
const tercerosEgreso = incluir => { const lab = new Set(movs().filter(mv => /^(2370|2380|2505|2510|2515|2520|2525)/.test(mv.cuenta)).map(mv => mv.tercero_id)); return [...S.d.terceros].filter(t => t.es_proveedor || t.id === incluir || esEmpleado(t.id) || lab.has(t.id) || compras().some(c => c.tercero_id === t.id)).sort((a, b) => a.nombre.localeCompare(b.nombre)); };
const refAplicacion = a => { if (a.cuenta) return { ...a, ref: `${nomCta(a.cuenta)} (${a.cuenta})` }; const f = compraById(a.compra_id); return { ...a, ref: f ? `${TIPOS_COMPRA[f.tipo].corto} ${f.numero}${f.num_proveedor ? ' ' + f.num_proveedor : ''}` : '' }; };
const proveedores = (incluir) => [...S.d.terceros].filter(t => t.es_proveedor || t.id === incluir || compras().some(c => c.tercero_id === t.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
const cxp = () => cuentasPorPagar(compras(), hoy());
const ctasDe = re => cuentasAux().filter(c => re.test(c.codigo));
const optsCta = (lista, sel) => lista.map(c => `<option value="${c.codigo}" ${c.codigo === sel ? 'selected' : ''}>${c.codigo} ${esc(c.nombre)}</option>`).join('');

function vCompras(m, tipo) {
  const T = TIPOS_COMPRA[tipo]; if (!T) { location.replace('#/compras/FC'); return; }
  let q = '', anulados = false;
  const saldos = Object.fromEntries(cxp().map(x => [x.compra.id, x]));
  m.innerHTML = `<header class="vhead"><h2>${T.plural}</h2><a class="btn primary" href="#/compranueva?tipo=${tipo}">${T.nuevo}</a></header>
    <div class="row filters"><input id="q" type="search" placeholder="Buscar por número o proveedor"><label class="check"><input type="checkbox" id="anu"> Ver anulados</label></div>
    ${tipo === 'DS' ? '<p class="hint">Para compras a personas no obligadas a facturar. La transmisión a la DIAN se hará cuando se conecte el proveedor tecnológico.</p>' : ''}
    <section class="panel" id="lst"></section>`;
  const pintar = () => {
    const l = compras().filter(c => c.tipo === tipo && (anulados || c.estado !== 'anulado') && (!q || `${c.numero} ${c.num_proveedor} ${terc(c.tercero_id)?.nombre} ${terc(c.tercero_id)?.numero}`.toLowerCase().includes(q)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero);
    $('lst').innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Número</th><th>Proveedor</th>${tipo === 'FC' ? '<th>Factura del proveedor</th>' : ''}<th class="r">${tipo === 'CE' ? 'Pagado' : 'Neto a pagar'}</th>${tipo === 'CE' ? '' : '<th class="r">Saldo</th>'}<th></th></tr></thead><tbody>
      ${l.map(c => { const s = saldos[c.id]; return `<tr class="click ${c.estado === 'anulado' ? 'muted' : ''}" data-go="#/compra/${c.id}"><td class="nowrap">${fFecha(c.fecha)}</td><td class="mono"><a href="#/compra/${c.id}">${c.numero}</a></td><td>${esc(terc(c.tercero_id)?.nombre)}</td>${tipo === 'FC' ? `<td class="mono">${esc(c.num_proveedor)}</td>` : ''}
        <td class="r mono">${money(tipo === 'CE' ? totalEgreso(c) : c.neto)}</td>${tipo === 'CE' ? '' : `<td class="r mono">${s && s.saldo > 0.009 ? money(s.saldo) : ''}</td>`}
        <td>${c.estado === 'anulado' ? '<span class="tag bad">Anulado</span>' : s && s.saldo > 0.009 && s.diasVencida ? `<span class="tag bad">Vencida ${s.diasVencida} d</span>` : s && s.saldo <= 0.009 ? '<span class="tag ok">Pagada</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`
      : `<p class="muted">No hay ${T.plural.toLowerCase()}${q ? ' con ese filtro' : ' todavía'}.</p>`;
  };
  $('q').oninput = () => { q = $('q').value.trim().toLowerCase(); pintar(); };
  $('anu').onchange = () => { anulados = $('anu').checked; pintar(); };
  pintar();
}

function vCompraEditor(m, { id, tipo, tercero, ref }) {
  let c;
  if (id) {
    const x = compraById(id); if (!x) { m.innerHTML = '<p>No se encontró el documento.</p>'; return; }
    if (x.estado === 'anulado') { location.replace('#/compra/' + id); return; }
    c = JSON.parse(JSON.stringify(x)); tipo = x.tipo;
  } else {
    if (!TIPOS_COMPRA[tipo]) tipo = 'FC';
    const f = ref && compraById(ref), t = terc(f?.tercero_id || tercero);
    c = { empresa_id: S.eid, tipo, fecha: hoy(), vence: '', tercero_id: t?.id || '', num_proveedor: '', observaciones: '',
      lineas: [{ cuenta: '', descripcion: '', base: '', iva_pct: '0' }], retefuente_pct: num(t?.ret_compra_fuente_pct), reteiva_pct: num(t?.ret_compra_iva_pct), reteica_milaje: num(t?.ret_compra_ica_milaje), cuenta_retefuente: '',
      cuenta_pago: param().bancos, aplicaciones: f ? [{ compra_id: f.id, valor: Math.max(0, cxp().find(x => x.compra.id === f.id)?.saldo || 0) }] : [], anticipo: 0 };
  }
  const T = TIPOS_COMPRA[tipo], esCE = tipo === 'CE';
  const pagado = !esCE && id && compras().some(e => e.tipo === 'CE' && e.estado !== 'anulado' && (e.aplicaciones || []).some(a => a.compra_id === id));
  const RET_C = { retefuente: ['krfC', 'krf'], reteiva: ['kriC', 'kri'], reteica: ['kricaC', 'krica'] };
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/compras/${tipo}">← ${T.plural}</a><h2>${id ? `Editar ${esc(nomCompra(c))}` : T.nuevo}</h2>
    <p class="sub">${esCE ? 'Pago a un proveedor, a un empleado o a una entidad de seguridad social: escoge lo que se paga o registra un anticipo.' : tipo === 'DS' ? 'Compra a una persona no obligada a facturar. Se contabiliza al guardar.' : 'Factura electrónica que te envió el proveedor. Se contabiliza al guardar.'}</p></div></header>
  <form id="ke" class="stack" novalidate>
    <section class="panel grid-doc">
      <div class="span2"><label for="prv">${esCE ? 'Pagado a' : 'Proveedor'}</label><div class="row nowrap"><select id="prv" required><option value="">${esCE ? 'Escoge el proveedor, el empleado o la entidad…' : 'Escoge el proveedor…'}</option>${(esCE ? tercerosEgreso(c.tercero_id) : proveedores(c.tercero_id)).map(t => `<option value="${t.id}" ${t.id === c.tercero_id ? 'selected' : ''}>${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`).join('')}</select>
        <button type="button" id="newPrv">+ Nuevo</button></div></div>
      <div><label for="kf">Fecha</label><input id="kf" type="date" value="${c.fecha}" required></div>
      ${esCE ? `<div><label for="kp">Forma de pago <a class="hint" href="#/formaspago">Configurar</a></label><select id="kp">${optsContado(fCompra(), id ? c.cuenta_pago : '')}</select></div>` :
        `<div><label for="kfp">Forma de pago <a class="hint" href="#/formaspago">Configurar</a></label><select id="kfp">${fCompra().map(f => `<option value="${f.id}" ${f.id === formaDe(fCompra(), !c.cuenta_pago, c.cuenta_pago).id ? 'selected' : ''}>${esc(f.nombre)}${f.credito ? '' : ` · ${esc(f.cuenta)}`}</option>`).join('')}</select></div>
        <div><label for="kv">Vence</label><input id="kv" type="date" value="${c.vence || ''}"></div>
        ${tipo === 'FC' ? `<div><label for="knp">Número de la factura del proveedor</label><input id="knp" class="mono" maxlength="40" value="${esc(c.num_proveedor)}" placeholder="FE-1234"></div>` : ''}`}
      <div><label>Número interno</label><p class="mono">${id ? c.numero : `${siguienteCompra(tipo)} (al guardar)`}</p></div>
    </section>
    ${esCE ? `<section class="panel stack"><h3>Lo que paga</h3><div id="aplK"></div>
      <div class="grid2"><div><label for="kant">Anticipo o pago sin factura</label><input id="kant" type="number" min="0" step="0.01" class="mono" value="${num(c.anticipo) || ''}"></div></div></section>` :
    `<section class="panel stack"><div class="vhead"><h3>Conceptos</h3><button type="button" id="addK">+ Agregar línea</button></div>
      <datalist id="ctasK">${optsLista(cuentasAux().filter(x => CLASES_COMPRA.some(p => x.codigo.startsWith(p))))}</datalist>
      <div class="tbl-wrap"><table class="tbl items comp"><thead><tr><th>Cuenta (gasto, costo, inventario o activo)</th><th>Descripción</th><th class="r">Valor antes de IVA</th><th class="r">IVA %</th><th class="r">Total</th><th></th></tr></thead><tbody id="kl"></tbody></table></div>
      ${pagado ? '<p class="hint">Esta factura ya tiene pagos. Si cambias los valores, revisa el egreso.</p>' : ''}</section>`}
    <section class="panel grid-doc">
      <div class="span2 c-obs"><label for="kob">Observaciones</label><textarea id="kob" rows="3" maxlength="1000">${esc(c.observaciones)}</textarea></div>
      ${esCE ? '' : `<div class="span2 ret"><h3>Retenciones que la empresa practica</h3><div class="grid3">
        ${campoRet('compra', 'retefuente', ['krfC', 'krf'], c)}${campoRet('compra', 'reteiva', ['kriC', 'kri'], c)}${campoRet('compra', 'reteica', ['kricaC', 'krica'], c)}</div></div>`}
      <div class="span2 totbox" id="ktot"></div>
    </section>
    <section class="panel stack"><h3>Contabilización</h3><div id="kas"></div></section>
    <div class="err" id="kErr" hidden></div>
    <div class="row end sticky-actions"><span class="spacer"></span><a class="btn ghost" href="${id ? '#/compra/' + id : '#/compras/' + tipo}">Cancelar</a><button type="submit" class="primary" id="kSave">Guardar y contabilizar</button></div>
  </form>`;
  const leer = () => {
    c.tercero_id = $('prv').value; c.fecha = $('kf').value; c.observaciones = $('kob').value.trim();
    if (esCE) { c.cuenta_pago = $('kp').value; c.anticipo = num($('kant').value); }
    else {
      c.vence = $('kv').value || ''; if ($('knp')) c.num_proveedor = $('knp').value.trim();
      if ($('kfp')) { const f = fCompra().find(x => x.id === $('kfp').value) || fCompra()[0]; c.cuenta_pago = f.credito ? '' : f.cuenta; }
      c.retenciones = leerRet('compra', RET_C, r2((c.lineas || []).reduce((s2, l) => s2 + num(l.base), 0)));
      Object.assign(c, { retefuente_pct: num($('krf').value), reteiva_pct: num($('kri').value), reteica_milaje: num($('krica').value) });
      Object.assign(c, totalesCompra(c.lineas, c));
    }
  };
  const resumen = () => {
    leer();
    if (esCE) {
      const t = totalEgreso(c);
      $('ktot').innerHTML = `<dl class="tot"><dt class="strong">Total pagado</dt><dd class="mono big">${money(t)}</dd></dl><p class="hint letras">${enLetras(t)}</p>`;
    } else {
      $('ktot').innerHTML = `<dl class="tot"><dt>Subtotal</dt><dd class="mono">${money(c.base)}</dd>${c.iva ? `<dt>IVA</dt><dd class="mono">${money(c.iva)}</dd>` : ''}<dt class="strong">Total</dt><dd class="mono strong">${money(c.total)}</dd>
        ${c.retefuente ? `<dt>Retefuente</dt><dd class="mono">−${money(c.retefuente)}</dd>` : ''}${c.reteiva ? `<dt>ReteIVA</dt><dd class="mono">−${money(c.reteiva)}</dd>` : ''}${c.reteica ? `<dt>ReteICA</dt><dd class="mono">−${money(c.reteica)}</dd>` : ''}
        <dt class="strong">Neto a pagar</dt><dd class="mono big">${money(c.neto)}</dd></dl>`;
      c.lineas.forEach((l, i) => { const x = m.querySelector(`[data-kt="${i}"]`); if (x) x.textContent = money(r2(num(l.base) * (1 + num(l.iva_pct) / 100))); });
    }
    $('kas').innerHTML = tablaAsiento(asientoCompra({ ...c, id: c.id || 'nuevo', numero: c.numero || siguienteCompra(tipo), estado: 'contabilizado', aplicaciones: (c.aplicaciones || []).filter(a => num(a.valor)).map(refAplicacion) }, emp()?.contabilidad, tarifasIva(emp()?.contabilidad)));
  };
  const pintarLineas = () => {
    $('kl').innerHTML = c.lineas.map((l, i) => `<tr data-i="${i}">
      <td data-l="Cuenta"><input data-k="cuenta" list="ctasK" class="mono w-cod" autocomplete="off" value="${esc(l.cuenta)}" placeholder="Código o nombre" aria-label="Cuenta"><small class="hint" data-n="${i}">${esc(l.cuenta ? nomCta(l.cuenta) : '')}</small></td>
      <td data-l="Descripción" class="c-desc"><input data-k="descripcion" maxlength="200" value="${esc(l.descripcion)}" aria-label="Descripción"></td>
      <td data-l="Valor"><input data-k="base" type="number" min="0" step="0.01" class="r mono w-val" value="${num(l.base) || ''}" aria-label="Valor antes de IVA"></td>
      <td data-l="IVA %"><select data-k="iva_pct" class="w-num" aria-label="IVA %">${optsIva(l.iva_pct)}</select></td>
      <td class="r mono c-tot" data-l="Total" data-kt="${i}"></td>
      <td class="c-del"><button type="button" class="ghost" data-del="${i}" aria-label="Quitar línea">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sin líneas.</td></tr>';
    resumen();
  };
  const pintarApl = () => {
    const tid = $('prv').value;
    const pend = cuentasPorPagar(compras().filter(x => x.id !== c.id), hoy()).filter(x => x.compra.tercero_id === tid && (x.saldo > 0.009 || c.aplicaciones.some(a => a.compra_id === x.compra.id)));
    // Saldos de nómina por pagar a este tercero (salarios, aportes, prestaciones), sin contar este mismo egreso.
    const lab = tid ? porPagarLaboral(movs().filter(mv => mv.doc_id !== c.id), tid) : [];
    c.aplicaciones = c.aplicaciones.filter(a => a.cuenta ? lab.some(x => x.cuenta === a.cuenta) : pend.some(x => x.compra.id === a.compra_id));
    const tabla = pend.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Documento</th><th>Fecha</th><th>Vence</th><th class="r">Saldo</th><th class="r">Valor que paga</th></tr></thead><tbody>
      ${pend.map(x => { const a = c.aplicaciones.find(y => y.compra_id === x.compra.id); return `<tr><td class="mono">${esc(TIPOS_COMPRA[x.compra.tipo].corto)} ${x.compra.numero}${x.compra.num_proveedor ? ` · ${esc(x.compra.num_proveedor)}` : ''}</td><td>${fFecha(x.compra.fecha)}</td><td>${fFecha(x.compra.vence)}${x.diasVencida ? ` <span class="tag bad">${x.diasVencida} d</span>` : ''}</td><td class="r mono">${money(x.saldo)}</td>
        <td class="r"><div class="row nowrap end"><button type="button" class="ghost sm" data-todo="${x.compra.id}" data-saldo="${x.saldo}">Todo</button><input type="number" min="0" step="0.01" class="r mono w-val" data-apl="${x.compra.id}" value="${a ? num(a.valor) || '' : ''}" aria-label="Valor que paga"></div></td></tr>`; }).join('')}
      </tbody></table></div>` : '';
    const tablaLab = lab.length ? `<h3>Nómina y seguridad social por pagar</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cuenta</th><th>Concepto</th><th class="r">Saldo</th><th class="r">Valor que paga</th></tr></thead><tbody>
      ${lab.map(x => { const a = c.aplicaciones.find(y => y.cuenta === x.cuenta); return `<tr><td class="mono">${x.cuenta}</td><td>${esc(nomCta(x.cuenta))}</td><td class="r mono">${money(x.saldo)}</td>
        <td class="r"><div class="row nowrap end"><button type="button" class="ghost sm" data-ltodo="${x.cuenta}" data-saldo="${x.saldo}">Todo</button><input type="number" min="0" step="0.01" class="r mono w-val" data-lab="${x.cuenta}" value="${a ? num(a.valor) || '' : ''}" aria-label="Valor que paga"></div></td></tr>`; }).join('')}
      </tbody></table></div>` : '';
    $('aplK').innerHTML = !tid ? '<p class="muted">Escoge a quién se le paga para ver lo que tiene pendiente.</p>' : !pend.length && !lab.length ? '<p class="muted">No tiene facturas ni saldos de nómina pendientes. Puedes registrar el valor como anticipo.</p>' : tabla + tablaLab;
    resumen();
  };
  if (esCE) {
    $('aplK').addEventListener('input', ev => { const l = ev.target.closest('[data-lab]'); if (l) { c.aplicaciones = c.aplicaciones.filter(a => a.cuenta !== l.dataset.lab); if (num(l.value)) c.aplicaciones.push({ cuenta: l.dataset.lab, valor: num(l.value) }); resumen(); return; } const i = ev.target.closest('[data-apl]'); if (!i) return; const id2 = i.dataset.apl; c.aplicaciones = c.aplicaciones.filter(a => a.compra_id !== id2); if (num(i.value)) c.aplicaciones.push({ compra_id: id2, valor: num(i.value) }); resumen(); });
    $('aplK').addEventListener('click', ev => { const lb = ev.target.closest('[data-ltodo]'); if (lb) { c.aplicaciones = c.aplicaciones.filter(a => a.cuenta !== lb.dataset.ltodo).concat([{ cuenta: lb.dataset.ltodo, valor: num(lb.dataset.saldo) }]); pintarApl(); return; } const b = ev.target.closest('[data-todo]'); if (!b) return; c.aplicaciones = c.aplicaciones.filter(a => a.compra_id !== b.dataset.todo).concat([{ compra_id: b.dataset.todo, valor: num(b.dataset.saldo) }]); pintarApl(); });
    $('prv').onchange = pintarApl;
    pintarApl();
  } else {
    $('kl').addEventListener('input', ev => {
      const el = ev.target, tr = el.closest('tr[data-i]'); if (!tr || !el.dataset.k) return;
      const l = c.lineas[Number(tr.dataset.i)]; l[el.dataset.k] = el.dataset.k === 'cuenta' ? el.value.trim().split(' ')[0] : el.value;
      if (el.dataset.k === 'cuenta') m.querySelector(`[data-n="${tr.dataset.i}"]`).textContent = l.cuenta ? nomCta(l.cuenta) : '';
      resumen();
    });
    $('kl').addEventListener('change', ev => { const el = ev.target, tr = el.closest('tr[data-i]'); if (tr && el.tagName === 'SELECT') { c.lineas[Number(tr.dataset.i)].iva_pct = el.value; resumen(); } });
    $('kl').addEventListener('click', ev => { const b = ev.target.closest('[data-del]'); if (!b) return; c.lineas.splice(Number(b.dataset.del), 1); pintarLineas(); });
    $('addK').onclick = () => { const u = c.lineas.at(-1) || {}; c.lineas.push({ cuenta: u.cuenta || '', descripcion: '', base: '', iva_pct: u.iva_pct || '0' }); pintarLineas(); $('kl').querySelector(`tr[data-i="${c.lineas.length - 1}"] [data-k=descripcion]`)?.focus(); };
    ligarRet('compra', RET_C, () => r2((c.lineas || []).reduce((s2, l) => s2 + num(l.base), 0)));
    $('prv').onchange = () => {
      // Al escoger el proveedor se proponen sus retenciones y su plazo.
      const t = terc($('prv').value); if (!t || id) return resumen();
      $('krf').value = num(t.ret_compra_fuente_pct) || ''; $('kri').value = num(t.ret_compra_iva_pct) || ''; $('krica').value = num(t.ret_compra_ica_milaje) || ''; syncRet('compra', RET_C);
      if (t.plazo_dias > 0 && !$('kv').value) $('kv').value = sumarDias($('kf').value || hoy(), t.plazo_dias);
      resumen();
    };
    pintarLineas();
  }
  $('ke').addEventListener('input', ev => { if (!ev.target.closest('#kl,#aplK')) resumen(); });
  $('ke').addEventListener('change', ev => { if (!ev.target.closest('#kl,#aplK') && ev.target.id !== 'prv') resumen(); });
  $('newPrv').onclick = () => formTercero({}, async t => { await cargarEmpresa(); const sel = $('prv'); sel.insertAdjacentHTML('beforeend', `<option value="${t.id}">${esc(t.nombre)} · ${esc(fmtNit(t.numero))}</option>`); sel.value = t.id; sel.onchange(); }, 'proveedor');
  $('ke').onsubmit = async ev => {
    ev.preventDefault(); leer();
    if (!esCE) c.lineas = c.lineas.filter(l => String(l.cuenta || '').trim() || String(l.descripcion || '').trim() || num(l.base)).map(l => ({ cuenta: String(l.cuenta).trim(), descripcion: String(l.descripcion || '').trim(), base: r2(num(l.base)), iva_pct: num(l.iva_pct) }));
    else c.aplicaciones = c.aplicaciones.filter(a => num(a.valor) > 0).map(a => refAplicacion({ ...(a.cuenta ? { cuenta: a.cuenta } : { compra_id: a.compra_id }), valor: r2(num(a.valor)) }));
    if (esCE) {
      const lab = porPagarLaboral(movs().filter(mv => mv.doc_id !== c.id), c.tercero_id);
      for (const a of c.aplicaciones) {
        const s = a.cuenta ? lab.find(x => x.cuenta === a.cuenta) : cuentasPorPagar(compras().filter(x => x.id !== c.id), hoy()).find(x => x.compra.id === a.compra_id);
        if (s && a.valor > s.saldo + 0.009) { $('kErr').textContent = `El pago a ${a.ref} supera su saldo (${money(s.saldo)}).`; $('kErr').hidden = false; return; }
      }
    }
    const errs = erroresCompra({ ...c, tipo }, S.d.cuentas);
    if (errs.length) { $('kErr').innerHTML = errs.slice(0, 8).map(esc).join('<br>'); $('kErr').hidden = false; if (!esCE) pintarLineas(); return; }
    $('kErr').hidden = true; $('kSave').disabled = true;
    try {
      const t = esCE ? { base: 0, iva: 0, retefuente: 0, reteiva: 0, reteica: 0, total: totalEgreso(c), neto: totalEgreso(c) } : totalesCompra(c.lineas, c);
      const row = { empresa_id: S.eid, tipo, fecha: c.fecha, vence: esCE ? null : (c.vence || null), tercero_id: c.tercero_id, num_proveedor: c.num_proveedor || '', observaciones: c.observaciones || '',
        lineas: esCE ? [] : c.lineas, retefuente_pct: num(c.retefuente_pct), reteiva_pct: num(c.reteiva_pct), reteica_milaje: num(c.reteica_milaje), cuenta_retefuente: c.cuenta_retefuente || '', retenciones: esCE ? {} : (c.retenciones || {}),
        cuenta_pago: c.cuenta_pago || '', aplicaciones: esCE ? c.aplicaciones : [], anticipo: esCE ? r2(num(c.anticipo)) : 0, ...t };
      let g;
      if (id) g = await store.save('compras', { ...row, id });
      else {
        try { g = await store.save('compras', { ...row, numero: siguienteCompra(tipo), estado: 'contabilizado' }); }
        catch (e) { if (/compras/.test(e.message) && /exist|schema|relation/i.test(e.message)) throw e; await cargarEmpresa(); g = await store.save('compras', { ...row, numero: siguienteCompra(tipo), estado: 'contabilizado' }); }
      }
      // El proveedor queda marcado como tal.
      const t2 = terc(c.tercero_id); if (t2 && !t2.es_proveedor && !esEmpleado(t2.id)) { try { await store.save('terceros', { id: t2.id, es_proveedor: true }); } catch (_) {} }
      await cargarEmpresa(); toast('Guardado y contabilizado.'); location.hash = '#/compra/' + g.id;
    } catch (e) { $('kErr').textContent = /compras|es_proveedor/.test(e.message) && /exist|schema|relation|column/i.test(e.message) ? 'Falta crear la tabla de compras en Supabase (archivo supabase/006_compras.sql).' : e.message; $('kErr').hidden = false; }
    finally { $('kSave').disabled = false; }
  };
}

function hojaCompra(c, imprimir) {
  const t = terc(c.tercero_id), T = TIPOS_COMPRA[c.tipo];
  const s = c.tipo === 'CE' ? null : cxp().find(x => x.compra.id === c.id);
  return `${cabInforme(T.nombre, `No. ${c.numero}<br><small>${fFecha(c.fecha)}</small>`)}
    <div class="grid2"><div><b>${c.tipo === 'CE' ? 'Pagado a' : 'Proveedor'}:</b> ${esc(t?.nombre)}<br><span class="muted">${esc(docId(t))}</span></div>
    <div>${c.num_proveedor ? `<b>Factura del proveedor:</b> <span class="mono">${esc(c.num_proveedor)}</span><br>` : ''}${c.vence ? `<b>Vence:</b> ${fFecha(c.vence)}<br>` : ''}${c.tipo === 'CE' ? `<b>Forma de pago:</b> ${esc(nomForma(fCompra(), false, c.cuenta_pago))}` : `<b>Forma de pago:</b> ${esc(nomForma(fCompra(), !c.cuenta_pago, c.cuenta_pago))}`}</div></div>
    ${c.tipo === 'CE' ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Concepto</th><th class="r">Valor</th></tr></thead><tbody>
        ${(c.aplicaciones || []).map(a => `<tr><td>Pago ${esc(a.ref || '')}</td><td class="r mono">${money(a.valor)}</td></tr>`).join('')}${num(c.anticipo) ? `<tr><td>Anticipo</td><td class="r mono">${money(c.anticipo)}</td></tr>` : ''}
        <tr class="strong"><td>Total pagado</td><td class="r mono">${money(totalEgreso(c))}</td></tr></tbody></table></div><p class="hint letras">${enLetras(totalEgreso(c))}</p>`
    : `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cuenta</th><th>Descripción</th><th class="r">Valor</th><th class="r">IVA</th><th class="r">Total</th></tr></thead><tbody>
        ${(c.lineas || []).map(l => { const iva = r2(num(l.base) * num(l.iva_pct) / 100); return `<tr><td class="mono">${esc(l.cuenta)}</td><td>${esc(l.descripcion)}</td><td class="r mono">${money(l.base)}</td><td class="r mono">${iva ? money(iva) : ''}</td><td class="r mono">${money(num(l.base) + iva)}</td></tr>`; }).join('')}</tbody></table></div>
      <dl class="tot"><dt>Subtotal</dt><dd class="mono">${money(c.base)}</dd>${num(c.iva) ? `<dt>IVA</dt><dd class="mono">${money(c.iva)}</dd>` : ''}<dt class="strong">Total</dt><dd class="mono strong">${money(c.total)}</dd>
        ${num(c.retefuente) ? `<dt>Retefuente ${num(c.retefuente_pct)}%</dt><dd class="mono">−${money(c.retefuente)}</dd>` : ''}${num(c.reteiva) ? `<dt>ReteIVA ${num(c.reteiva_pct)}%</dt><dd class="mono">−${money(c.reteiva)}</dd>` : ''}${num(c.reteica) ? `<dt>ReteICA ${num(c.reteica_milaje)}‰</dt><dd class="mono">−${money(c.reteica)}</dd>` : ''}
        <dt class="strong">Neto a pagar</dt><dd class="mono big">${money(c.neto)}</dd>${s ? `<dt>Pagado</dt><dd class="mono">${money(s.pagado)}</dd><dt class="strong">Saldo</dt><dd class="mono strong">${money(s.saldo)}</dd>` : ''}</dl>`}
    ${c.observaciones ? `<p><b>Observaciones:</b> ${esc(c.observaciones)}</p>` : ''}${imprimir && c.estado === 'anulado' ? '<p><b>ANULADO</b></p>' : ''}
    ${imprimir ? `<h3>Contabilización</h3>${tablaAsiento(asientoCompra({ ...c, estado: 'contabilizado' }, emp()?.contabilidad, tarifasIva(emp()?.contabilidad)))}<div class="firmas"><span>Elaboró</span><span>${c.tipo === 'CE' ? 'Recibí conforme' : 'Aprobó'}</span></div><p class="rep-small">Elaborado con AGAsoft.</p>` : ''}`;
}
function vCompra(m, id) {
  const c = compraById(id); if (!c) { m.innerHTML = '<p>No se encontró el documento.</p>'; return; }
  const anulado = c.estado === 'anulado', T = TIPOS_COMPRA[c.tipo];
  const s = c.tipo === 'CE' ? null : cxp().find(x => x.compra.id === id);
  const pagos = compras().filter(e => e.tipo === 'CE' && e.estado !== 'anulado' && (e.aplicaciones || []).some(a => a.compra_id === id));
  m.innerHTML = `<header class="vhead noprint"><div><a class="back" href="#/compras/${c.tipo}">← ${T.plural}</a><h2>${esc(nomCompra(c))} ${anulado ? '<span class="tag bad">Anulado</span>' : ''}</h2></div>
    <div class="row">${!anulado && s && s.saldo > 0.009 ? `<a class="btn" href="#/compranueva?tipo=CE&ref=${id}">Pagar</a>` : ''}${anulado ? '' : `<button id="anular">Anular</button><a class="btn" href="#/compraeditar/${id}">Editar</a>`}<button class="primary" id="imprimir">Imprimir o PDF</button></div></header>
    <section class="panel stack">${hojaCompra(c)}</section>
    <section class="panel stack noprint"><h3>Contabilización</h3>${tablaAsiento(asientoCompra({ ...c, estado: 'contabilizado' }, emp()?.contabilidad, tarifasIva(emp()?.contabilidad)))}${anulado ? `<p class="hint">Anulado${c.anulado_motivo ? `: ${esc(c.anulado_motivo)}` : ''}. No suma en los informes.</p>` : ''}</section>
    ${pagos.length ? `<section class="panel stack noprint"><h3>Pagos</h3><div class="tbl-wrap"><table class="tbl"><tbody>${pagos.map(e => `<tr class="click" data-go="#/compra/${e.id}"><td>${fFecha(e.fecha)}</td><td><a href="#/compra/${e.id}">Egreso ${e.numero}</a></td><td class="r mono">${money(e.aplicaciones.find(a => a.compra_id === id).valor)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  $('imprimir').onclick = () => { $('print').innerHTML = hojaCompra(c, true); const t = document.title; document.title = `${nomCompra(c)} - ${emp().nombre}`; window.print(); document.title = t; };
  if ($('anular')) $('anular').onclick = () => {
    if (pagos.length) return toast('Este documento tiene pagos. Anula primero el comprobante de egreso.', true);
    dialogo(`<h2>Anular ${esc(nomCompra(c))}</h2><p>Sus movimientos dejan de sumar en los informes${c.tipo === 'CE' ? ' y las facturas que pagaba vuelven a quedar pendientes' : ''}. El número no se vuelve a usar.</p>
    <div><label for="f_mot">Motivo</label><input id="f_mot" name="motivo" required maxlength="200"></div>${pie('Anular')}`, async fd => {
      const mot = String(fd.get('motivo')).trim(); if (!mot) throw new Error('Escribe el motivo.');
      await store.save('compras', { id: c.id, estado: 'anulado', anulado_motivo: mot, anulado_en: new Date().toISOString() });
      await cargarEmpresa(); toast('Documento anulado.'); route();
    });
  };
}

function vCxp(m) {
  const c = cxp().filter(x => x.saldo > 0.009);
  const porP = {};
  for (const x of c) { const k = x.compra.tercero_id; (porP[k] = porP[k] || { t: terc(k), l: [], b: [0, 0, 0, 0, 0] }).l.push(x); const dv = x.diasVencida; porP[k].b[dv <= 0 ? 0 : dv <= 30 ? 1 : dv <= 60 ? 2 : dv <= 90 ? 3 : 4] += x.saldo; }
  const filas = Object.values(porP).sort((a, b) => b.b.reduce((s, v) => s + v, 0) - a.b.reduce((s, v) => s + v, 0));
  const tot = [0, 0, 0, 0, 0]; filas.forEach(f => f.b.forEach((v, i) => tot[i] += v));
  const H = ['Por vencer', '1–30 días', '31–60', '61–90', 'Más de 90'];
  m.innerHTML = `<header class="vhead"><h2>Cuentas por pagar</h2><button id="csv">Descargar CSV</button></header>
  <section class="kpis">${H.map((h, i) => `<div class="kpi ${i >= 1 && tot[i] > 0 ? 'warn' : ''}"><span>${h}</span><b class="mono">${money(tot[i])}</b></div>`).join('')}</section>
  <section class="panel">${filas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Proveedor</th>${H.map(h => `<th class="r">${h}</th>`).join('')}<th class="r">Total</th></tr></thead><tbody>
    ${filas.map(f => `<tr class="grp"><td><b>${esc(f.t?.nombre)}</b><br><span class="muted mono">${esc(docId(f.t))}</span></td>${f.b.map(v => `<td class="r mono">${v ? money(v) : ''}</td>`).join('')}<td class="r mono strong">${money(f.b.reduce((s, v) => s + v, 0))}</td></tr>
      ${f.l.map(x => `<tr class="click sub-row" data-go="#/compra/${x.compra.id}"><td><a class="mono" href="#/compra/${x.compra.id}">${esc(TIPOS_COMPRA[x.compra.tipo].corto)} ${x.compra.numero}${x.compra.num_proveedor ? ' · ' + esc(x.compra.num_proveedor) : ''}</a>${x.compra.vence ? ` · vence ${fFecha(x.compra.vence)}` : ''}</td><td colspan="5" class="muted">${x.diasVencida ? `Vencida hace ${x.diasVencida} días` : ''}</td><td class="r"><span class="mono">${money(x.saldo)}</span> <a class="btn ghost sm" href="#/compranueva?tipo=CE&ref=${x.compra.id}">Pagar</a></td></tr>`).join('')}`).join('')}
    </tbody></table></div>` : '<p class="muted">No hay facturas de proveedor pendientes de pago.</p>'}</section>`;
  $('csv').onclick = () => {
    const rows = [['Proveedor', 'Identificación', 'Documento', 'Factura proveedor', 'Fecha', 'Vence', 'Días vencida', 'Saldo']].concat(c.map(x => { const t = terc(x.compra.tercero_id); return [t?.nombre, t?.numero, `${x.compra.tipo} ${x.compra.numero}`, x.compra.num_proveedor, x.compra.fecha, x.compra.vence || '', x.diasVencida, String(x.saldo).replace('.', ',')]; }));
    descargar(`cuentas-por-pagar-${emp().nit}-${hoy()}.csv`, '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  };
}

function vProveedores(m) {
  let q = '';
  m.innerHTML = `<header class="vhead"><h2>Proveedores</h2><button class="primary" id="nuevo">Nuevo proveedor</button></header>
    <div class="row filters"><input id="q" type="search" placeholder="Buscar por nombre o documento"></div><section class="panel" id="lst"></section>`;
  const saldos = {}; for (const x of cxp()) saldos[x.compra.tercero_id] = r2((saldos[x.compra.tercero_id] || 0) + x.saldo);
  const pintar = () => {
    const l = proveedores().filter(t => !q || `${t.nombre} ${t.numero}`.toLowerCase().includes(q));
    $('lst').innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th>Documento</th><th>Ciudad</th><th class="r">Por pagar</th><th></th></tr></thead><tbody>
      ${l.map(t => `<tr><td>${esc(t.nombre)}</td><td class="mono">${esc(docId(t))}</td><td>${esc(t.ciudad)}</td><td class="r mono">${saldos[t.id] > 0.009 ? money(saldos[t.id]) : ''}</td>
        <td class="r nowrap"><a class="btn ghost sm" href="#/compranueva?tipo=FC&tercero=${t.id}">Registrar factura</a><button class="ghost sm" data-ed="${t.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${q ? 'Ningún proveedor coincide.' : 'Todavía no hay proveedores. Un cliente también puede ser proveedor: edítalo y marca "Es proveedor".'}</p>`;
  };
  $('q').oninput = () => { q = $('q').value.trim().toLowerCase(); pintar(); };
  $('nuevo').onclick = () => formTercero({}, null, 'proveedor');
  $('lst').onclick = ev => { const b = ev.target.closest('[data-ed]'); if (b) formTercero(terc(b.dataset.ed), null, 'proveedor'); };
  pintar();
}

/* ---------- Importar plantillas (datos descargados de la DIAN con el token) ---------- */
function vImportar(m, solo) {
  if (solo && !PLANTILLAS[solo]) solo = '';
  m.innerHTML = `<header class="vhead"><div><h2>${solo ? 'Plantilla de ' + PLANTILLAS[solo].titulo.toLowerCase() : 'Importar plantillas'}</h2><p class="sub">Carga en AGAsoft las facturas de venta, las facturas de compra y los terceros que la empresa ya tiene en la DIAN.</p></div></header>
    <section class="panel stack" ${solo ? 'hidden' : ''}><h3>Cómo se hace</h3><ol class="steps-list">
      <li>Con el <b>token de la DIAN</b> de la empresa, entra al catálogo de facturación electrónica y descarga en Excel los documentos <b>emitidos</b> (ventas) y <b>recibidos</b> (compras) del periodo.</li>
      <li>Descarga aquí la plantilla de AGAsoft que corresponda y pasa los datos a sus columnas, sin cambiar los títulos de la primera fila. Puedes dejar los dos ejemplos como guía y borrarlos al final.</li>
      <li>En Excel guarda la plantilla como <b>CSV</b> y súbela aquí. AGAsoft revisa todo y te muestra qué va a cargar antes de guardar nada.</li></ol>
      <p class="hint">Sube primero los terceros si los tienes. Si no, las facturas crean los clientes y proveedores que falten con el NIT y el nombre de la plantilla. Lo que ya existe (misma factura o mismo tercero) no se duplica.</p></section>
    ${solo ? '<p class="hint">Con el token de la DIAN descarga los documentos, pásalos a esta plantilla, guárdala como CSV y súbela. <a href="#/importar">Ver los pasos</a>.</p>' : ''}
    ${Object.entries(PLANTILLAS).filter(([k]) => !solo || k === solo).map(([k, p]) => `<section class="panel stack"><header class="vhead"><h3>${p.titulo}</h3><div class="row"><button data-plt="${k}">Descargar plantilla</button>
      <label class="btn primary">Subir CSV<input type="file" accept=".csv,text/csv" data-sub="${k}" hidden></label></div></header>
      <p class="hint">${p.ayuda}</p><p class="hint">Columnas: ${p.cols.map(c => c[2] ? `<b>${esc(c[1])}</b>` : esc(c[1])).join(' · ')}. Las de negrilla son obligatorias.</p><div id="prev_${k}"></div></section>`).join('')}`;
  m.querySelectorAll('[data-plt]').forEach(b => b.onclick = () => descargar(PLANTILLAS[b.dataset.plt].archivo, csvPlantilla(b.dataset.plt)));
  m.querySelectorAll('[data-sub]').forEach(inp => inp.onchange = async () => {
    const cual = inp.dataset.sub, file = inp.files[0]; inp.value = ''; if (!file) return;
    let txt = await file.text(); if (txt.includes(String.fromCharCode(0xfffd))) txt = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
    previaImport(cual, parseCSV(txt));
  });
}
function previaImport(cual, rows) {
  const out = $('prev_' + cual);
  const { filas, faltan } = leerFilas(cual, rows);
  if (faltan.length) { out.innerHTML = `<p class="err">No encontré las columnas: ${faltan.map(esc).join(', ')}. Usa la plantilla de AGAsoft sin cambiar los títulos.</p>`; return; }
  if (!filas.length) { out.innerHTML = '<p class="err">El archivo no tiene filas con datos.</p>'; return; }
  const ctx = { terceros: S.d.terceros, documentos: S.d.documentos, cuentas: S.d.cuentas, productos: S.d.productos, compras: compras() };
  const r = cual === 'terceros' ? prepararTerceros(filas, ctx) : cual === 'ventas' ? prepararVentas(filas, ctx) : prepararCompras(filas, ctx, totalesCompra);
  const total = r.docs.reduce((s, d) => s + num((d.doc || d.compra).total), 0);
  const nomT = n => r.terceros.find(t => t.numero === n)?.nombre || S.d.terceros.find(t => t.numero === n)?.nombre || n;
  const listos = cual === 'terceros' ? r.terceros.length + r.marcar.length : r.docs.length;
  out.innerHTML = `<div class="stack imp-prev">
    <p><b>${listos}</b> ${cual === 'terceros' ? 'terceros listos' : 'documentos listos'}${cual !== 'terceros' ? ` por <b>${money(total)}</b>` : ''}${cual !== 'terceros' && r.terceros.length ? ` y <b>${r.terceros.length}</b> terceros nuevos` : ''}.${r.errores.length ? ` <span class="tag bad">${r.errores.length} con problemas</span>` : ''}</p>
    ${r.docs.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Documento</th><th>Fecha</th><th>Tercero</th><th class="r">Total</th></tr></thead><tbody>
      ${r.docs.slice(0, 50).map(d => { const x = d.doc || d.compra; return `<tr><td class="mono">${esc(d.doc ? `${x.prefijo} ${x.numero}` : `${x.tipo} ${x.num_proveedor}`)}</td><td>${fFecha(x.fecha)}</td><td>${esc(nomT(d.tercero))}</td><td class="r mono">${money(x.total)}</td></tr>`; }).join('')}
      </tbody></table></div>${r.docs.length > 50 ? `<p class="hint">Y ${r.docs.length - 50} más.</p>` : ''}` : ''}
    ${cual === 'terceros' && r.terceros.length ? `<p class="hint">Nuevos: ${r.terceros.slice(0, 20).map(t => esc(t.nombre)).join(', ')}${r.terceros.length > 20 ? '…' : ''}</p>` : ''}
    ${r.errores.length ? `<details class="imp-err" open><summary>No se importan (${r.errores.length})</summary><ul>${r.errores.slice(0, 100).map(e => `<li>${esc(e)}</li>`).join('')}</ul></details>` : ''}
    <div class="row end"><button class="primary" id="go_${cual}" ${listos ? '' : 'disabled'}>Importar ${listos}</button></div></div>`;
  $('go_' + cual).onclick = async () => {
    const b = $('go_' + cual); b.disabled = true; b.textContent = 'Importando…';
    try { const res = await ejecutarImport(cual, r); await cargarEmpresa(); route(); toast(res, /problema/.test(res)); }
    catch (e) { fail(e); b.disabled = false; b.textContent = `Importar ${listos}`; }
  };
}
async function ejecutarImport(cual, r) {
  const ids = new Map(S.d.terceros.map(t => [t.numero, t.id])), errs = [];
  for (const t of r.terceros) {
    try {
      const g = await store.save('terceros', { empresa_id: S.eid, tipo_id: t.tipo_id, numero: t.numero, dv: t.dv, nombre: t.nombre, direccion: t.direccion || '', ciudad: t.ciudad || '', telefono: t.telefono || '', correo: t.correo || '',
        es_cliente: t.es_cliente !== false, es_proveedor: !!t.es_proveedor, plazo_dias: 0, responsable_iva: false, retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0 });
      ids.set(t.numero, g.id);
    } catch (e) { errs.push(`${t.nombre}: ${e.message}`); }
  }
  for (const x of r.marcar) { try { await store.save('terceros', x); } catch (e) { errs.push(e.message); } }
  let ok = 0;
  const sig = { FC: siguienteCompra('FC'), DS: siguienteCompra('DS') };
  for (const d of r.docs) {
    const tid = ids.get(d.tercero); if (!tid) { errs.push(`No se pudo crear el tercero ${d.tercero}`); continue; }
    try {
      if (d.doc) await store.importarDoc({ ...d.doc, empresa_id: S.eid, tercero_id: tid }, d.items);
      else { await store.save('compras', { ...d.compra, empresa_id: S.eid, tercero_id: tid, numero: sig[d.compra.tipo] }); sig[d.compra.tipo]++; }
      ok++;
    } catch (e) { errs.push(`${d.doc ? `${d.doc.prefijo} ${d.doc.numero}` : d.compra.num_proveedor}: ${/importar_documento/.test(e.message) ? 'falta correr en Supabase el archivo supabase/008_importar.sql' : e.message}`); }
  }
  const nT = r.terceros.length + r.marcar.length;
  const msg = cual === 'terceros' ? `${nT - errs.length} terceros importados.` : `${ok} documentos importados${r.terceros.length ? ` y ${r.terceros.length} terceros nuevos` : ''}.`;
  return msg + (errs.length ? ` ${errs.length} con problemas: ${errs.slice(0, 3).join('; ')}${errs.length > 3 ? '…' : ''}` : '');
}

// Plan de la cuenta y su uso (lo asigna el administrador en /admin). En la prueba gratis, la cuenta escoge el plan que quiere.
function tuPlan(x, planes = []) {
  if (!x) return '<h3>Tu plan</h3><p class="muted">Sin información.</p>';
  const p = x.plan, lim = (v, max) => `<span class="mono">${v}${max === null || max === undefined ? '' : ' de ' + max}</span>`;
  const dp = diasPrueba(x.prueba_hasta), pedido = x.plan_solicitado;
  const uso = `<dt>Contabilidades</dt><dd>${lim(x.empresas, p?.max_empresas)}</dd><dt>Documentos este mes</dt><dd>${lim(x.documentos_mes, p?.max_documentos_mes)}</dd>
    <dt>Personas con acceso</dt><dd>${lim(x.usuarios, p?.max_usuarios)}</dd>`;
  if (dp !== null) return `<h3>Tu plan</h3><dl class="kv"><dt>Plan</dt><dd><b>Prueba gratis</b> hasta el ${fFecha(x.prueba_hasta)} <span class="tag ${dp <= 3 ? 'bad' : 'el'}">${dp ? `Quedan ${dp} día${dp === 1 ? '' : 's'}` : 'Último día'}</span></dd>${uso}</dl>
    <p class="sub">${pedido ? `Pediste el plan <b>${esc(pedido.nombre)}</b>. AGAsoft lo aprueba y sigues sin interrupciones.` : 'Escoge el plan que quieres para cuando termine la prueba. AGAsoft lo aprueba y sigues sin interrupciones.'}</p>
    ${opcionesPlan(planes, pedido?.id)}<div class="row"><button class="primary" id="pedirP">${pedido ? 'Cambiar el plan pedido' : 'Pedir este plan'}</button></div>`;
  return `<h3>Tu plan</h3>${p ? `<dl class="kv"><dt>Plan</dt><dd><b>${esc(p.nombre)}</b> · ${money(p.precio_mensual)} al mes</dd>
    <dt>Pagado hasta</dt><dd>${x.plan_vence ? fFecha(x.plan_vence) + (x.plan_vence < hoy() ? ' <span class="tag bad">Vencido</span>' : '') : 'Sin vencimiento'}</dd>
    ${uso}</dl>` : '<p class="muted">Tu cuenta no tiene un plan asignado.</p>'}
    <p class="hint">Para cambiar de plan o renovarlo, comunícate con AGAsoft.</p>`;
}
