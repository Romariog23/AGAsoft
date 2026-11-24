// Pantallas de Operación (módulo opcional por empresa). La lógica está en operacion.js; aquí solo se pinta y se guarda.
// main.js entrega sus utilidades con iniciarOperacion(ctx) para no duplicarlas.
import { TIPOS_CAMPO, MODOS_TARIFA, USOS_TARIFA, CUANDO, SALIDAS_PAGO, SALIDAS_COBRO, PLANTILLAS, nuevoTipo, cfgTipo, calcular, resumen, avisos, erroresTipo, erroresRegistro, erroresTarifa, ultimaLectura, claveDe, diaDe, NOMBRE_DIA, compilar, esPendiente, elegiblesCorte, volantes, dsDeVolante, facturables, itemsDeGrupo, cotizacionVigente, cotizacionPara, porCerrar, esCargo, estaCerrado, avanceCotizacion, acumuladoMaquinas, MODOS_PROYECTO, ajustesDeCotizaciones, nombreProyecto } from './operacion.js';
import { totalesCompra, erroresCompra } from './compras.js';
import { enLetras, totales } from './calc.js';

let X = null; // { S, store, $, esc, money, num, fFecha, hoy, sumarDias, opts, dialogo, pie, confirmar, campo, campoSel, check, toast, fail, cargarEmpresa, route, guardarContab, emp }
export const iniciarOperacion = ctx => { X = ctx; };

/* ---------- Datos ---------- */
export const operacionActiva = () => X?.emp()?.contabilidad?.operacion?.activo === true;
// Modo escogido al activar. Las empresas que activaron antes de existir el modo quedan en maquinaria.
export const modoOperacion = () => operacionActiva() ? (X.emp().contabilidad.operacion.modo || 'maquinaria') : null;
export const tiposOp = () => [...(X?.S.d?.op_tipos || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre));
const tipoById = id => (X.S.d.op_tipos || []).find(t => t.id === id);
const elementosDe = (tipo, lista, todos) => (X.S.d.op_elementos || []).filter(e => e.tipo_id === tipo.id && e.lista === lista && (todos || e.activo !== false)).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)) || a.nombre.localeCompare(b.nombre));
// Tarifas del tipo + ajustes al operador escritos en las cotizaciones (proyectos) amarradas a él.
const tarifasDe = tipo => [...(X.S.d.op_tarifas || []).filter(t => t.tipo_id === tipo.id), ...ajustesDeCotizaciones(X.S.d.cotizaciones, tipo.id)];
const proyectosDe = (tipo, incluir) => (X.S.d.cotizaciones || []).filter(c => c.op_tipo_id === tipo.id && (cotizacionVigente(c) || c.id === incluir)).sort((a, b) => b.numero - a.numero);
const nomProy = c => c ? nombreProyecto(c, nomT, id => elem(id)?.nombre) : '';
const registrosDe = tipo => (X.S.d.op_registros || []).filter(r => r.tipo_id === tipo.id);
const elem = id => (X.S.d.op_elementos || []).find(e => e.id === id);
const terc = id => X.S.d.terceros.find(t => t.id === id);
const nomT = id => terc(id)?.nombre || '—';
const personas = () => [...X.S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre));
const faltaSql = e => /op_(tipos|elementos|tarifas|registros|cortes)|schema cache|does not exist/i.test(e?.message || '') ? new Error('Falta correr en Supabase el archivo supabase/037_operacion.sql.') : e;
async function guardar(t, row) { try { const r = await X.store.save(t, row); await X.cargarEmpresa(); return r; } catch (e) { throw faltaSql(e); } }
async function borrar(t, id) { try { await X.store.remove(t, id); await X.cargarEmpresa(); } catch (e) { throw faltaSql(e); } }
const cant = (v, u = '') => `${X.num(v).toLocaleString('es-CO', { maximumFractionDigits: 2 })}${u ? ' ' + u : ''}`;
// Números escritos a mano: 1.750.905 (miles con punto) o 13118,5 (decimal con coma).
const numIn = v => { const s = String(v ?? '').trim(); return !s.includes(',') && /^-?\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : X.num(s); };
const mesActual = () => X.hoy().slice(0, 8) + '01';

const ICO = {
  maquina: 'M3 17h11v-4H6l-3 4zM14 17h3l2-6h-5M19 11l2-5-4 1M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M16 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  camion: 'M3 7h10v9H3zM13 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  mas: 'M12 5v14M5 12h14',
  op: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
};
const icono = k => `<span class="op-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICO[k] || ICO.op}"/></svg></span>`;
export const ICONO_MENU = ICO.op;

/* ---------- Inicio de Operación ---------- */
export function vOperacion(m) {
  const { esc, money } = X;
  if (operacionActiva()) { location.hash = '#/oprecibos'; return; }
  if (!operacionActiva()) {
    // Al activar se escoge el modo. Por ahora solo Maquinaria amarilla; los demás quedan anunciados.
    m.innerHTML = `<header class="vhead"><div><h2>Operación</h2><p class="sub">Es opcional y no mueve la contabilidad hasta que programes (documento soporte) o factures. Escoge el modo de tu empresa para activarla.</p></div></header>
    <div class="op-cards op-modos">
      <article class="op-card">${icono('maquina')}<h3>Maquinaria amarilla</h3><p class="hint">Alquiler de maquinaria con operador: recibos de horas con horómetro, valor hora de cada operador, recargo dominical y festivo, horómetro acumulado por máquina, cotización de maquinaria como proyecto, documento soporte al operador y factura al cliente.</p><div class="row"><button class="primary" data-modo="maquinaria">Activar Maquinaria amarilla</button></div></article>
      <article class="op-card dash">${icono('camion')}<h3>Transporte y otras actividades</h3><p class="hint">Viajes, servicios por día u otros registros operativos.</p><div class="row"><span class="tag">Próximamente</span></div></article></div>`;
    m.querySelectorAll('[data-modo]').forEach(b => b.onclick = async () => { if (b.disabled) return; b.disabled = true;
      try { await X.guardarContab('operacion', { ...(X.emp()?.contabilidad?.operacion || {}), activo: true, modo: b.dataset.modo }); X.toast('Operación activada: Maquinaria amarilla.'); location.hash = '#/oprecibos'; } catch (e) { b.disabled = false; X.fail(e); } });
    return;
  }
  const tipos = tiposOp(), desde = mesActual(), hasta = X.hoy();
  const tarjeta = t => {
    const c = cfgTipo(t), regs = registrosDe(t).filter(r => r.fecha >= desde && r.fecha <= hasta), tar = tarifasDe(t);
    const res = resumen(regs, t, tar), total = res.reduce((s, p) => s + p.total, 0), q = res.reduce((s, p) => s + p.cantidad, 0);
    const av = avisos(regs, t, tar).length, nl = c.listas.map(l => `${elementosDe(t, l.k).length} ${esc(l.nombre.toLowerCase())}`).join(' · ');
    return `<article class="op-card${t.activo === false ? ' off' : ''}">${icono(PLANTILLAS[t.plantilla]?.icono)}<h3>${esc(t.nombre)}${t.activo === false ? ' <span class="tag">Cerrado</span>' : ''}</h3>
      <p class="hint">${nl || 'Sin listas'}</p>
      <div class="op-mini"><span><b>${cant(q, c.unidad)}</b> este mes</span><span><b>${money(total)}</b> por programar</span>${av ? `<span class="tag demo">${av} aviso${av === 1 ? '' : 's'}</span>` : ''}</div>
      <div class="row">${t.activo === false ? `<a class="btn" href="#/opregistros/${t.id}">Ver historial</a><button data-reab="${t.id}">Reabrir</button>` : `<a class="btn primary" href="#/opregistros/${t.id}">Registrar</a><a class="btn" href="#/opcfg/${t.id}">Configurar</a>`}</div></article>`;
  };
  m.innerHTML = `<header class="vhead"><div><h2>Operación</h2><p class="sub">Registros operativos que no afectan la contabilidad hasta que generes un documento. Cada tipo se arma a la medida de la empresa.</p></div>
    <div class="row"><a class="btn ghost" href="#/config">Apagar o encender en Configuración</a>${tipos.length ? '<a class="btn" href="#/opporcerrar">Horas por cerrar</a>' : ''}</div></header>
  ${tipos.length ? `<div class="op-cards">${tipos.filter(t => t.activo !== false).map(tarjeta).join('') || '<p class="muted">No hay tipos abiertos.</p>'}</div>` : '<p class="muted">Todavía no hay tipos de operación. Empieza con una plantilla o desde cero.</p>'}
  ${tipos.some(t => t.activo === false) ? `<details class="stack op-cerrados"><summary><b>Cerrados (${tipos.filter(t => t.activo === false).length})</b> <span class="hint">· proyectos terminados: no salen en el menú, su historial se conserva</span></summary><div class="op-cards">${tipos.filter(t => t.activo === false).map(tarjeta).join('')}</div></details>` : ''}
  <section class="stack"><h3>Agregar un tipo de operación</h3><div class="op-cards">${Object.entries(PLANTILLAS).map(([k, p]) => `<article class="op-card dash">${icono(p.icono)}<h3>${esc(p.nombre)}</h3><p class="hint">${esc(p.descripcion)}</p><div class="row"><button data-pl="${k}">${k === 'libre' ? 'Crear' : 'Usar plantilla'}</button></div></article>`).join('')}</div>
  <p class="hint">Las plantillas son un punto de partida: después cambias campos, fórmulas, tarifas y reglas en Configurar.</p></section>`;
  m.querySelectorAll('[data-reab]').forEach(b => b.onclick = async () => { const t = tipoById(b.dataset.reab); b.disabled = true;
    try { await guardar('op_tipos', { id: t.id, activo: true }); X.toast(`${t.nombre} reabierto: vuelve al menú.`); X.route(); } catch (e) { b.disabled = false; X.fail(e); } });
  // Un solo clic: el botón se bloquea mientras guarda (en el servidor tarda) y un nombre repetido sale numerado.
  m.querySelectorAll('[data-pl]').forEach(b => b.onclick = async () => {
    if (b.disabled) return;
    const nt = nuevoTipo(b.dataset.pl, X.S.eid), usados = new Set(tiposOp().map(x => x.nombre.trim().toLowerCase()));
    if (usados.has(nt.nombre.toLowerCase()) && !await X.confirmar('Ya tienes este tipo', `Ya existe <b>${esc(nt.nombre)}</b>. Un solo tipo maneja todas las máquinas, operadores y obras. ¿Crear otro de todas formas?`, 'Crear otro')) return;
    let nombre = nt.nombre, i = 2; while (usados.has(nombre.toLowerCase())) nombre = `${nt.nombre} ${i++}`;
    const txt = b.textContent; m.querySelectorAll('[data-pl]').forEach(x => { x.disabled = true; }); b.textContent = 'Creando…';
    try { const t = await guardar('op_tipos', { ...nt, nombre, orden: tipos.length + 1 }); X.toast('Tipo de operación creado. Revisa listas y tarifas.'); location.hash = '#/opcfg/' + t.id; }
    catch (e) { X.fail(e); m.querySelectorAll('[data-pl]').forEach(x => { x.disabled = false; }); b.textContent = txt; }
  });
}

/* ---------- Configurar un tipo ---------- */
const TABS_CFG = [['general', 'General'], ['listas', 'Listas'], ['campos', 'Campos'], ['calculo', 'Fórmulas y reglas'], ['tarifas', 'Tarifas'], ['salidas', 'Salidas']];
let tabCfg = 'general';
async function guardarCfg(t, cambios, msg = 'Guardado.') {
  const nuevo = { ...t, ...cambios, config: { ...cfgTipo(t), ...(cambios.config || {}) } };
  const errs = erroresTipo(nuevo); if (errs.length) throw new Error(errs.join(' '));
  await guardar('op_tipos', { id: t.id, nombre: nuevo.nombre, activo: nuevo.activo !== false, config: nuevo.config }); X.toast(msg); X.route();
}
const plural = w => /[aeiouáéíóú]$/i.test(w) ? w + 's' : w + 'es';
export function vOpCfg(m, id, q) {
  const t = tipoById(id); if (!t) { location.hash = '#/operacion'; return; }
  const { esc } = X, c = cfgTipo(t);
  if (q?.get('tab')) { tabCfg = q.get('tab'); history.replaceState(null, '', '#/opcfg/' + id); }
  const TABS = [TABS_CFG[0], ['personas', plural(c.persona)], ...TABS_CFG.slice(1)];
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/operacion">← Operación</a><h2>Configurar · ${esc(t.nombre)}</h2><p class="sub">Todo es de esta empresa: cambia lo que necesites, no afecta a las demás.</p></div><a class="btn primary" href="#/opregistros/${t.id}">Ir a registrar</a></header>
  <div class="seg op-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tabCfg === k}">${n}</button>`).join('')}</div><div id="opTab"></div>`;
  m.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tabCfg = b.dataset.tab; vOpCfg(m, id); });
  const box = X.$('opTab');
  ({ general: tabGeneral, personas: tabPersonas, listas: tabListas, campos: tabCampos, calculo: tabCalculo, tarifas: tabTarifas, salidas: tabSalidas }[tabCfg] || tabGeneral)(box, t, c);
}
const selCampos = (c, tipos, sel, vacio) => `<option value="">${vacio}</option>${c.campos.filter(f => tipos.includes(f.tipo)).map(f => `<option value="${f.k}" ${f.k === sel ? 'selected' : ''}>${X.esc(f.nombre)}</option>`).join('')}`;
function tabGeneral(box, t, c) {
  const { esc } = X, pend = c.pendiente?.campo ? c.campos.find(f => f.k === c.pendiente.campo) : null;
  box.innerHTML = `<form class="panel stack" id="opG">
    <div class="grid3">${X.campo('nombre', 'Nombre del tipo', t.nombre, 'required maxlength="60"')}${X.campo('persona', 'Quién trabaja (cómo se llama)', c.persona, 'maxlength="30" placeholder="Operador, Conductor…"')}${X.campo('unidad', 'Unidad', c.unidad, 'maxlength="12" placeholder="h, viajes, kg"')}</div>
    <div class="grid2">${X.campoSel('proyecto', 'Proyecto (cotización) en cada registro', MODOS_PROYECTO, c.proyecto)}<p class="hint">El proyecto trae a quién se le factura, la obra y los precios. Lo que trae no se vuelve a pedir en el registro.</p></div>
    ${X.check('editar_pagadas', 'Se pueden liquidar cantidades distintas a las de la fórmula (con nota)', c.editar_pagadas)}
    <div class="grid2"><div><label for="f_cl">Controlar que las lecturas empaten</label><select id="f_cl" name="cont_lectura">${selCampos(c, ['lectura'], c.continuidad?.lectura, 'No controlar')}</select></div>
      <div><label for="f_cp">… por cada</label><select id="f_cp" name="cont_por">${selCampos(c, ['elemento'], c.continuidad?.por, 'Escoge la lista')}</select></div></div>
    <div class="grid2"><div><label for="f_pc">Soporte pendiente según el campo</label><select id="f_pc" name="pend_campo">${selCampos(c, ['lista'], c.pendiente?.campo, 'No avisar')}</select></div>
      <div><label>Valores que cuentan como pendiente</label><div class="row" id="opPV">${(pend?.opciones || []).map(o => `<label class="check"><input type="checkbox" name="pend_val" value="${esc(o)}" ${(c.pendiente?.valores || []).includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('') || '<span class="hint">Escoge primero el campo y guarda.</span>'}</div></div></div>
    ${X.check('activo', 'Abierto (si lo cierras sale del menú y queda en Operación › Cerrados)', t.activo !== false)}
    <div class="row end"><button type="button" class="ghost" id="opDel">Eliminar este tipo</button><button class="primary">Guardar</button></div></form>`;
  X.$('opG').onsubmit = async ev => {
    ev.preventDefault(); const fd = new FormData(ev.target);
    const cl = fd.get('cont_lectura'), cp = fd.get('cont_por'), pc = fd.get('pend_campo');
    try { await guardarCfg(t, { nombre: String(fd.get('nombre')).trim(), activo: fd.get('activo') === 'on', config: { persona: String(fd.get('persona')).trim() || 'Persona', unidad: String(fd.get('unidad')).trim(), proyecto: fd.get('proyecto') || 'opcional', editar_pagadas: fd.get('editar_pagadas') === 'on',
      continuidad: cl && cp ? { lectura: cl, por: cp } : null, pendiente: pc ? { campo: pc, valores: pc === c.pendiente?.campo ? fd.getAll('pend_val') : [] } : null } }); } catch (e) { X.fail(e); }
  };
  X.$('opDel').onclick = async () => {
    const n = registrosDe(t).length;
    if (n) return X.toast(`Este tipo tiene ${n} registro${n === 1 ? '' : 's'}: bórralos primero o pausa el tipo.`, true);
    if (!await X.confirmar('Eliminar tipo de operación', `Se borra <b>${esc(t.nombre)}</b> con sus listas y tarifas.`, 'Eliminar')) return;
    try { await borrar('op_tipos', t.id); X.toast('Tipo eliminado.'); location.hash = '#/operacion'; } catch (e) { X.fail(e); }
  };
}
function tabListas(box, t, c) {
  const { esc } = X, centros = X.S.d.centros_costo || [], ccOn = X.emp()?.contabilidad?.cc?.activo;
  box.innerHTML = `${c.listas.map(l => { const els = elementosDe(t, l.k, true); return `<section class="panel stack"><header class="vhead"><div><h3>${esc(l.nombre)}</h3><p class="hint">${l.campos.length ? 'Datos: ' + l.campos.map(f => esc(f.nombre)).join(', ') : 'Sin datos extra'}</p></div>
    <div class="row"><button class="ghost sm" data-el="${l.k}">Editar lista</button><button class="primary sm" data-ne="${l.k}">Nuevo</button></div></header>
    ${els.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Código</th><th>Nombre</th>${l.campos.map(f => `<th>${esc(f.nombre)}</th>`).join('')}<th>Tercero</th>${ccOn ? '<th>Centro de costo</th>' : ''}<th></th></tr></thead><tbody>
      ${els.map(e => `<tr class="${e.activo === false ? 'muted' : ''}"><td class="mono">${esc(e.codigo)}</td><td><b>${esc(e.nombre)}</b>${e.activo === false ? ' <span class="tag">Inactivo</span>' : ''}</td>${l.campos.map(f => `<td>${esc(e.datos?.[f.k] ?? '')}</td>`).join('')}<td>${e.tercero_id ? esc(nomT(e.tercero_id)) : ''}</td>${ccOn ? `<td>${esc(centros.find(x => x.id === e.centro_id)?.nombre || '')}</td>` : ''}<td class="r"><button class="sm ghost" data-ee="${e.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">Todavía no hay ${esc(l.nombre.toLowerCase())}.</p>`}</section>`; }).join('')}
  <div class="row"><button id="opNL">+ Nueva lista</button><span class="hint">Por ejemplo: Equipos, Obras, Rutas, Lotes, Turnos.</span></div>`;
  const formLista = (l = {}) => X.dialogo(`<h2>${l.k ? 'Editar lista' : 'Nueva lista'}</h2>${X.campo('nombre', 'Nombre de la lista', l.nombre || '', 'required maxlength="40" placeholder="Equipos"')}
    ${X.campo('campos', 'Datos de cada elemento (separados por coma)', (l.campos || []).map(f => f.nombre).join(', '), 'maxlength="300" placeholder="Modelo, Serie o placa"')}
    <p class="hint">El código y el nombre ya vienen. Aquí pones solo lo adicional.</p>${l.k ? '<label class="check"><input type="checkbox" name="quitar"> Quitar esta lista</label>' : ''}${X.pie()}`, async fd => {
    const listas = [...c.listas];
    if (fd.get('quitar') === 'on') {
      if (c.campos.some(f => f.lista === l.k)) throw new Error('Un campo usa esta lista: quítalo primero en Campos.');
      if (elementosDe(t, l.k, true).length) throw new Error('La lista tiene elementos: déjalos inactivos o bórralos antes.');
      return guardarCfg(t, { config: { listas: listas.filter(x => x.k !== l.k) } }, 'Lista quitada.');
    }
    const nombre = String(fd.get('nombre')).trim(), campos = String(fd.get('campos')).split(',').map(s => s.trim()).filter(Boolean).map(s => ({ k: (l.campos || []).find(f => f.nombre === s)?.k || claveDe(s), nombre: s, tipo: 'texto' }));
    let k = l.k || claveDe(nombre); if (!l.k) while (listas.some(x => x.k === k)) k += '_2';
    const nueva = { ...l, k, nombre, campos, nivel_cc: l.nivel_cc ?? null };
    await guardarCfg(t, { config: { listas: l.k ? listas.map(x => x.k === l.k ? nueva : x) : [...listas, nueva] } }, 'Lista guardada.');
  });
  const formElem = (l, e = {}) => X.dialogo(`<h2>${e.id ? 'Editar' : 'Nuevo'}: ${esc(l.nombre.toLowerCase())}</h2>
    <div class="grid2">${X.campo('codigo', 'Código', e.codigo ?? String(elementosDe(t, l.k, true).length + 1).padStart(2, '0'), 'maxlength="20" class="mono"')}${X.campo('nombre', 'Nombre', e.nombre || '', 'required maxlength="100"')}</div>
    ${l.campos.length ? `<div class="grid2">${l.campos.map(f => X.campo('x_' + f.k, esc(f.nombre), e.datos?.[f.k] ?? '', 'maxlength="100"')).join('')}</div>` : ''}
    <div class="grid2"><div><label for="f_ter">Tercero (cliente de la obra, dueño…)</label><select id="f_ter" name="tercero_id"><option value="">Ninguno</option>${personas().map(p => `<option value="${p.id}" ${p.id === e.tercero_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>
    ${ccOn ? `<div><label for="f_cen">Centro de costo</label><select id="f_cen" name="centro_id"><option value="">Ninguno</option>${centros.filter(x => x.activo !== false).map(x => `<option value="${x.id}" ${x.id === e.centro_id ? 'selected' : ''}>${esc(x.codigo)} · ${esc(x.nombre)}</option>`).join('')}</select></div>` : '<div></div>'}</div>
    ${e.id ? X.check('activo', 'Activo', e.activo !== false) : ''}${X.pie()}`, async fd => {
    const row = { empresa_id: X.S.eid, tipo_id: t.id, lista: l.k, codigo: String(fd.get('codigo')).trim(), nombre: String(fd.get('nombre')).trim(), datos: Object.fromEntries(l.campos.map(f => [f.k, String(fd.get('x_' + f.k) || '').trim()])),
      tercero_id: fd.get('tercero_id') || null, centro_id: fd.get('centro_id') || null, activo: e.id ? fd.get('activo') === 'on' : true };
    if (!row.nombre) throw new Error('Escribe el nombre.');
    await guardar('op_elementos', e.id ? { ...row, id: e.id } : row); X.toast('Guardado.'); X.route();
  });
  X.$('opNL').onclick = () => formLista();
  box.querySelectorAll('[data-el]').forEach(b => b.onclick = () => formLista(c.listas.find(l => l.k === b.dataset.el)));
  box.querySelectorAll('[data-ne]').forEach(b => b.onclick = () => formElem(c.listas.find(l => l.k === b.dataset.ne)));
  box.querySelectorAll('[data-ee]').forEach(b => b.onclick = () => { const e = elem(b.dataset.ee); formElem(c.listas.find(l => l.k === e.lista), e); });
}
function tabCampos(box, t, c) {
  const { esc } = X, tipoN = k => TIPOS_CAMPO.find(x => x[0] === k)?.[1] || k;
  box.innerHTML = `<section class="panel stack"><header class="vhead"><div><h3>Campos de cada registro</h3><p class="hint">Fecha y ${esc(c.persona.toLowerCase())} siempre van. La clave es el nombre que usas en las fórmulas.</p></div><button class="primary sm" id="opNC">Nuevo campo</button></header>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Campo</th><th>Clave</th><th>Tipo</th><th>Detalle</th><th></th></tr></thead><tbody>
    ${c.campos.map((f, i) => `<tr><td class="nowrap"><button class="sm ghost" data-up="${i}" ${i ? '' : 'disabled'} aria-label="Subir">↑</button></td><td><b>${esc(f.nombre)}</b>${f.obligatorio ? ' <span class="tag">Obligatorio</span>' : ''}</td><td class="mono">${f.k}</td><td>${esc(tipoN(f.tipo))}</td>
      <td class="hint">${f.tipo === 'elemento' ? 'Lista: ' + esc(c.listas.find(l => l.k === f.lista)?.nombre || '—') : f.tipo === 'lista' ? esc((f.opciones || []).join(' · ')) : f.tipo === 'lectura' ? 'Variable = final − inicial' : ''}</td>
      <td class="r nowrap"><button class="sm" data-ec="${i}">Editar</button><button class="sm ghost" data-qc="${i}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Sin campos.</td></tr>'}</tbody></table></div></section>`;
  const formCampo = (f = {}, i = -1) => {
    X.dialogo(`<h2>${i >= 0 ? 'Editar campo' : 'Nuevo campo'}</h2><div class="grid2">${X.campo('nombre', 'Nombre', f.nombre || '', 'required maxlength="40" placeholder="Horómetro"')}${X.campoSel('tipo', 'Tipo', TIPOS_CAMPO, f.tipo || 'numero')}</div>
      <div id="opCL" ${f.tipo === 'elemento' ? '' : 'hidden'}>${X.campoSel('lista', 'Lista', c.listas.map(l => [l.k, l.nombre]), f.lista)}${c.listas.length ? '' : '<p class="hint">Crea primero la lista en la pestaña Listas.</p>'}</div>
      <div id="opCO" ${f.tipo === 'lista' ? '' : 'hidden'}>${X.campo('opciones', 'Opciones (separadas por coma)', (f.opciones || []).join(', '), 'maxlength="400" placeholder="Recibo firmado, Foto, Sin soporte"')}</div>
      ${X.check('obligatorio', 'Obligatorio', f.obligatorio)}${i >= 0 ? `<p class="hint">Clave: <span class="mono">${f.k}</span> (no cambia, para no dañar fórmulas y registros).</p>` : ''}${X.pie()}`, async fd => {
      const nombre = String(fd.get('nombre')).trim(), tipo = fd.get('tipo');
      let k = f.k || claveDe(nombre); if (!f.k) while (c.campos.some(x => x.k === k)) k += '_2';
      const nuevo = { k, nombre, tipo, obligatorio: fd.get('obligatorio') === 'on', ...(tipo === 'elemento' ? { lista: fd.get('lista') } : {}), ...(tipo === 'lista' ? { opciones: String(fd.get('opciones')).split(',').map(s => s.trim()).filter(Boolean) } : {}) };
      const campos = i >= 0 ? c.campos.map((x, j) => j === i ? nuevo : x) : [...c.campos, nuevo];
      await guardarCfg(t, { config: { campos } }, 'Campo guardado.');
    });
    X.$('f_tipo').onchange = () => { X.$('opCL').hidden = X.$('f_tipo').value !== 'elemento'; X.$('opCO').hidden = X.$('f_tipo').value !== 'lista'; };
  };
  X.$('opNC').onclick = () => formCampo();
  box.querySelectorAll('[data-ec]').forEach(b => b.onclick = () => formCampo(c.campos[+b.dataset.ec], +b.dataset.ec));
  box.querySelectorAll('[data-up]').forEach(b => b.onclick = async () => { const i = +b.dataset.up, l = [...c.campos]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; try { await guardarCfg(t, { config: { campos: l } }, 'Orden guardado.'); } catch (e) { X.fail(e); } });
  box.querySelectorAll('[data-qc]').forEach(b => b.onclick = async () => {
    const f = c.campos[+b.dataset.qc];
    const usado = [c.formulas.cantidad, c.formulas.valor, ...c.reglas.map(g => g.formula)].some(s => { try { return compilar(s).vars.includes(f.k); } catch (_) { return false; } });
    if (usado) return X.toast(`Una fórmula usa ${f.k}: cámbiala primero.`, true);
    if (!await X.confirmar('Quitar campo', `Se quita <b>${esc(f.nombre)}</b>. Los registros que ya lo tienen guardan su valor pero deja de mostrarse.`, 'Quitar')) return;
    try { await guardarCfg(t, { config: { campos: c.campos.filter(x => x !== f), tarifa_por: c.tarifa_por.filter(k => k !== f.k), continuidad: [c.continuidad?.lectura, c.continuidad?.por].includes(f.k) ? null : c.continuidad, pendiente: c.pendiente?.campo === f.k ? null : c.pendiente } }, 'Campo quitado.'); } catch (e) { X.fail(e); }
  });
}
// Fórmulas como lista para escoger; "Otra fórmula" abre el campo para escribirla.
const VALOR_OPC = [['pagadas * tarifa', 'Cantidad liquidada × tarifa'], ['cantidad * tarifa', 'Cantidad de la fórmula (horómetro) × tarifa'], ['tarifa', 'Solo la tarifa (un valor por registro)']];
function selFormula(k, label, val, opciones) {
  const { esc } = X, esOtra = !opciones.some(o => o[0] === val);
  return `<div><label for="f_${k}">${label}</label><select id="f_${k}" name="${k}" data-fsel="${k}">${opciones.map(([v, n]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(n)}</option>`).join('')}<option value="__otra" ${esOtra ? 'selected' : ''}>Otra fórmula…</option></select>
    <input id="f_${k}_otra" name="${k}_otra" class="mono" value="${esOtra ? esc(val) : ''}" placeholder="Escribe la fórmula" ${esOtra ? '' : 'hidden'} style="margin-top:6px"></div>`;
}
function tabCalculo(box, t, c) {
  const { esc } = X, cuandoN = k => CUANDO.find(x => x[0] === k)?.[1] || k;
  const vars = [...c.campos.filter(f => ['numero', 'lectura', 'sino'].includes(f.tipo)).map(f => [f.k, f.nombre]), ...c.constantes.map(k => [k.k, k.nombre])];
  box.innerHTML = `<form class="panel stack" id="opF"><h3>Fórmulas</h3>
    <div class="grid2">${selFormula('cantidad', `Cantidad (${esc(c.unidad)})`, c.formulas.cantidad, c.campos.filter(f => ['lectura', 'numero'].includes(f.tipo)).map(f => [f.k, f.tipo === 'lectura' ? `${f.nombre} (final − inicial)` : f.nombre]))}
      ${selFormula('valor', 'Valor a programar con tarifa por unidad', c.formulas.valor, VALOR_OPC)}</div>
    <p class="hint">Escoge de la lista. "Otra fórmula" deja escribirla a mano con: ${vars.map(([k, nn]) => `<span class="mono">${k}</span> (${esc(nn)})`).join(', ') || 'ninguna variable todavía'}${vars.length ? ', ' : ''}<span class="mono">cantidad</span>, <span class="mono">pagadas</span> (liquidadas) y <span class="mono">tarifa</span>; funciones min, max, redondear.</p>
    <p class="hint">Con tarifa <b>por registro</b> el valor es la tarifa; con tarifa <b>fija por corte</b> se programa una vez el valor fijo.</p>
    <div class="row end"><button class="primary">Guardar fórmulas</button></div></form>
  <section class="panel stack"><header class="vhead"><div><h3>Constantes</h3><p class="hint">Valores que usas en las fórmulas y cambias en un solo lugar, como el salario base del recargo.</p></div><button class="sm" id="opNK">Nueva constante</button></header>
    ${c.constantes.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${c.constantes.map((k, i) => `<tr><td><b>${esc(k.nombre)}</b></td><td class="mono">${k.k}</td><td class="r mono">${cant(k.valor)}</td><td class="r nowrap"><button class="sm" data-ek="${i}">Editar</button><button class="sm ghost" data-qk="${i}">Quitar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin constantes.</p>'}</section>
  <section class="panel stack"><header class="vhead"><div><h3>Reglas de día y recargos</h3><p class="hint">Se suman al valor cuando se cumple la condición. Los festivos salen del calendario de Colombia.</p></div><button class="sm" id="opNR">Nueva regla</button></header>
    ${c.reglas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Regla</th><th>Cuándo</th><th>Fórmula</th><th>A quién</th><th></th></tr></thead><tbody>${c.reglas.map((g, i) => `<tr><td><b>${esc(g.nombre)}</b></td><td>${esc(cuandoN(g.cuando))}</td><td class="mono">${esc(g.formula)}</td><td>${g.terceros?.length ? g.terceros.map(id => esc(nomT(id))).join(', ') : 'Todos'}</td><td class="r nowrap"><button class="sm" data-er="${i}">Editar</button><button class="sm ghost" data-qr="${i}">Quitar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin reglas.</p>'}</section>`;
  X.$('opF').querySelectorAll('select[data-fsel]').forEach(sel => sel.onchange = () => { const inp = X.$('f_' + sel.dataset.fsel + '_otra'); inp.hidden = sel.value !== '__otra'; if (!inp.hidden) inp.focus(); });
  const leerF = (fd, k) => { const v = fd.get(k); return String(v === '__otra' ? fd.get(k + '_otra') : v).trim(); };
  X.$('opF').onsubmit = async ev => { ev.preventDefault(); const fd = new FormData(ev.target); try { const f = { cantidad: leerF(fd, 'cantidad'), valor: leerF(fd, 'valor') }; if (!f.cantidad || !f.valor) throw new Error('Escribe la fórmula.'); compilar(f.cantidad); compilar(f.valor); await guardarCfg(t, { config: { formulas: f } }, 'Fórmulas guardadas.'); } catch (e) { X.fail(e); } };
  const formK = (k = {}, i = -1) => X.dialogo(`<h2>${i >= 0 ? 'Editar' : 'Nueva'} constante</h2><div class="grid2">${X.campo('nombre', 'Nombre', k.nombre || '', 'required maxlength="40" placeholder="Salario base del recargo"')}${X.campo('valor', 'Valor', k.valor ?? '', 'required class="mono" inputmode="decimal"')}</div>${X.pie()}`, async fd => {
    const nombre = String(fd.get('nombre')).trim(); let kk = k.k || claveDe(nombre); if (!k.k) while ([...c.constantes, ...c.campos].some(x => x.k === kk)) kk += '_2';
    const nueva = { k: kk, nombre, valor: numIn(fd.get('valor')) };
    await guardarCfg(t, { config: { constantes: i >= 0 ? c.constantes.map((x, j) => j === i ? nueva : x) : [...c.constantes, nueva] } }, 'Constante guardada.');
  });
  const formR = (g = { cuando: 'dominical_festivo', terceros: [] }, i = -1) => X.dialogo(`<h2>${i >= 0 ? 'Editar' : 'Nueva'} regla</h2>
    <div class="grid2">${X.campo('nombre', 'Nombre', g.nombre || '', 'required maxlength="60" placeholder="Recargo dominical y festivo"')}${X.campoSel('cuando', 'Cuándo aplica', CUANDO, g.cuando)}</div>
    ${X.campo('formula', 'Valor que se suma (fórmula)', g.formula || '', 'required class="mono" placeholder="pagadas * salario_base / 210 * 1.9"')}
    <div><label for="f_rt">Solo para estas personas (vacío = todas)</label><select id="f_rt" name="terceros" multiple size="6">${personas().map(p => `<option value="${p.id}" ${(g.terceros || []).includes(p.id) ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select><p class="hint">Ctrl o Cmd para escoger varias.</p></div>${X.pie()}`, async fd => {
    const nueva = { nombre: String(fd.get('nombre')).trim(), cuando: fd.get('cuando'), formula: String(fd.get('formula')).trim(), terceros: fd.getAll('terceros') };
    await guardarCfg(t, { config: { reglas: i >= 0 ? c.reglas.map((x, j) => j === i ? nueva : x) : [...c.reglas, nueva] } }, 'Regla guardada.');
  }, { ancho: true });
  X.$('opNK').onclick = () => formK(); X.$('opNR').onclick = () => formR();
  box.querySelectorAll('[data-ek]').forEach(b => b.onclick = () => formK(c.constantes[+b.dataset.ek], +b.dataset.ek));
  box.querySelectorAll('[data-er]').forEach(b => b.onclick = () => formR(c.reglas[+b.dataset.er], +b.dataset.er));
  box.querySelectorAll('[data-qk]').forEach(b => b.onclick = async () => { try { await guardarCfg(t, { config: { constantes: c.constantes.filter((_, j) => j !== +b.dataset.qk) } }, 'Constante quitada.'); } catch (e) { X.fail(e); } });
  box.querySelectorAll('[data-qr]').forEach(b => b.onclick = async () => { try { await guardarCfg(t, { config: { reglas: c.reglas.filter((_, j) => j !== +b.dataset.qr) } }, 'Regla quitada.'); } catch (e) { X.fail(e); } });
}
// Nombre del valor de un criterio de tarifa (persona o elemento de una lista).
const valorCrit = (c, k, v) => !v ? '' : k === 'tercero' ? nomT(v) : (c.campos.find(f => f.k === k)?.tipo === 'elemento' ? elem(v)?.nombre || '—' : v);
const nombreCrit = (c, k) => k === 'tercero' ? c.persona : c.campos.find(f => f.k === k)?.nombre || k;
// Cada persona con su valor negociado por unidad (la hora máquina del operador). Por detrás es una tarifa de programación
// que solo depende de la persona. Cambiar el valor desde una fecha cierra la anterior, así lo ya registrado no cambia.
const esBase = x => (x.uso || 'pago') === 'pago' && (x.modo || 'unidad') === 'unidad' && x.criterios?.tercero && Object.entries(x.criterios).every(([k, v]) => k === 'tercero' || !v);
function tabPersonas(box, t, c) {
  const { esc, money } = X, hoy = X.hoy(), tar = (X.S.d.op_tarifas || []).filter(x => x.tipo_id === t.id && esBase(x));
  const vigente = (tid, f = hoy) => tar.filter(x => x.criterios.tercero === tid && (!x.desde || x.desde <= f) && (!x.hasta || x.hasta >= f)).sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || '')))[0] || null;
  const servicios = (X.S.d.productos || []).filter(p => p.activo !== false && p.tipo === 'servicio');
  const ids = [...new Set([...tar.map(x => x.criterios.tercero), ...registrosDe(t).filter(r => !esCargo(r)).map(r => r.tercero_id)])].filter(Boolean).sort((a, b) => nomT(a).localeCompare(nomT(b)));
  box.innerHTML = `<section class="panel stack"><header class="vhead"><div><h3>${esc(plural(c.persona))} y su valor por ${esc(c.unidad || 'unidad')}</h3><p class="hint">El valor negociado con cada ${esc(c.persona.toLowerCase())}. Se escribe una vez y se usa en todos los proyectos. Lo que cambia por proyecto (precio al cliente y ajuste adicional) va en la cotización.</p></div><button class="primary sm" id="opNP">Agregar ${esc(c.persona.toLowerCase())}</button></header>
    ${ids.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(c.persona)}</th><th class="r">Valor por ${esc(c.unidad || 'unidad')}</th><th>Desde</th><th>Ítem de servicio</th><th></th></tr></thead><tbody>
    ${ids.map(tid => { const v = vigente(tid), hist = tar.filter(x => x.criterios.tercero === tid && x !== v).length; return `<tr><td><b>${esc(nomT(tid))}</b>${hist ? ` <small class="hint">· ${hist} valor${hist === 1 ? '' : 'es'} anterior${hist === 1 ? '' : 'es'}</small>` : ''}</td><td class="r mono">${v ? money(v.valor) : '<span class="tag demo">Sin valor</span>'}</td><td class="hint">${v?.desde ? X.fFecha(v.desde) : v ? 'Siempre' : ''}</td><td>${esc((X.S.d.productos || []).find(p => p.id === v?.producto_id)?.nombre || '')}</td><td class="r"><button class="sm" data-vp="${tid}">${v ? 'Cambiar valor' : 'Poner valor'}</button></td></tr>`; }).join('')}</tbody></table></div>` : `<p class="muted">Todavía no hay ${esc(plural(c.persona).toLowerCase())}. Agrégalos con su valor por ${esc(c.unidad || 'unidad')}.</p>`}
    <p class="hint">Si alguien no aparece en la lista para agregar, créalo en Terceros.</p></section>`;
  const form = tid => { const v = tid ? vigente(tid) : null; X.dialogo(`<h2>${tid ? esc(nomT(tid)) : 'Agregar ' + esc(c.persona.toLowerCase())}</h2>
    ${tid ? `<input type="hidden" name="tercero_id" value="${tid}">` : `<div><label for="f_pt">${esc(c.persona)} *</label><select id="f_pt" name="tercero_id" required><option value="">Escoge…</option>${personas().filter(p => !ids.includes(p.id)).map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div>`}
    <div class="grid2">${X.campo('valor', `Valor por ${esc(c.unidad || 'unidad')} *`, v?.valor ?? '', 'required class="mono" inputmode="decimal"')}${X.campo('desde', v ? 'Desde (el valor anterior queda para lo registrado antes)' : 'Desde (vacío = siempre)', v ? hoy : '', 'type="date"')}</div>
    <div><label for="f_ps">Ítem de servicio del documento soporte</label><select id="f_ps" name="producto_id"><option value="">Escoge después</option>${servicios.map(p => `<option value="${p.id}" ${p.id === v?.producto_id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.nombre)}</option>`).join('')}</select></div>${X.pie()}`, async fd => {
    const terc = fd.get('tercero_id'), valor = numIn(fd.get('valor')), desde = fd.get('desde') || null, producto_id = fd.get('producto_id') || null;
    if (!(valor > 0)) throw new Error('El valor debe ser mayor que cero.');
    const act = vigente(terc, desde || hoy), base = { empresa_id: X.S.eid, tipo_id: t.id, uso: 'pago', modo: 'unidad', criterios: { tercero: terc }, valor, producto_id, nota: '' };
    if (act && desde && (!act.desde || act.desde < desde)) { await guardar('op_tarifas', { id: act.id, hasta: X.sumarDias(desde, -1) }); await guardar('op_tarifas', { ...base, desde, hasta: act.hasta || null }); }
    else if (act) await guardar('op_tarifas', { id: act.id, valor, producto_id, desde: desde || act.desde || null });
    else await guardar('op_tarifas', { ...base, desde, hasta: null });
    X.toast('Valor guardado.'); X.route();
  }); };
  X.$('opNP').onclick = () => form(null);
  box.querySelectorAll('[data-vp]').forEach(b => b.onclick = () => form(b.dataset.vp));
}
function tabTarifas(box, t, c) {
  const { esc, money } = X, tar = tarifasDe(t).filter(x => !x.sintetica).sort((a, b) => (a.uso || '').localeCompare(b.uso || '') || String(b.desde || '').localeCompare(String(a.desde || '')));
  const servicios = X.S.d.productos.filter(p => p.activo !== false && (p.tipo || 'producto') === 'servicio');
  const criterios = ['tercero', ...c.campos.filter(f => ['elemento', 'lista'].includes(f.tipo)).map(f => f.k)];
  const modoN = k => MODOS_TARIFA.find(x => x[0] === k)?.[1] || k;
  const aplica = x => Object.entries(x.criterios || {}).filter(([, v]) => v).map(([k, v]) => `${esc(nombreCrit(c, k))}: <b>${esc(valorCrit(c, k, v))}</b>`).join(' · ') || 'Todos';
  box.innerHTML = `<form class="panel stack" id="opTP"><h3>De qué depende el precio</h3><div class="row">${criterios.map(k => `<label class="check"><input type="checkbox" name="por" value="${k}" ${c.tarifa_por.includes(k) ? 'checked' : ''}> ${esc(nombreCrit(c, k))}</label>`).join('')}</div>
    <p class="hint">Gana la tarifa más específica: si hay una para la persona en una obra y otra solo para la persona, en esa obra se usa la primera.</p><div class="row end"><button class="sm">Guardar</button></div></form>
  <p class="callout">El valor por ${esc(c.unidad || 'unidad')} de cada ${esc(c.persona.toLowerCase())} se pone en la pestaña <button type="button" class="link" id="opIrP">${esc(plural(c.persona))}</button>. Aquí quedan las tarifas especiales (por máquina, por día, valor fijo o de cobro sin cotización).</p>
  <section class="panel stack"><header class="vhead"><h3>Tarifas</h3><button class="primary sm" id="opNT">Nueva tarifa</button></header>
    ${tar.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Uso</th><th>Aplica a</th><th>Modo</th><th class="r">Valor</th><th>Vigencia</th><th>Ítem de servicio</th><th></th></tr></thead><tbody>
    ${tar.map(x => `<tr><td><span class="tag ${x.uso === 'cobro' ? 'el' : 'ok'}">${x.uso === 'cobro' ? 'Cobro' : 'Programación'}</span></td><td>${aplica(x)}</td><td>${esc(modoN(x.modo))}</td><td class="r mono">${money(x.valor)}</td><td class="hint">${x.desde ? X.fFecha(x.desde) : 'Siempre'}${x.hasta ? ' – ' + X.fFecha(x.hasta) : ''}</td>
      <td>${esc(X.S.d.productos.find(p => p.id === x.producto_id)?.nombre || '')}</td><td class="r nowrap"><button class="sm" data-et="${x.id}">Editar</button><button class="sm ghost" data-bt="${x.id}">Borrar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin tarifas. Sin tarifa, los registros quedan en $0 y salen como aviso.</p>'}
    <p class="hint">La tarifa de programación se crea <b>una vez por operador</b>. Lo que cambia por proyecto (precio al cliente y ajuste adicional al operador por hora) va en la cotización: Ventas › Cotizaciones.</p>
    <p class="hint">El <b>ítem de servicio</b> es el que cerrará el documento soporte (programación) o la factura (cobro). Créalo en Inventario › Productos y servicios como tipo servicio.</p></section>`;
  X.$('opTP').onsubmit = async ev => { ev.preventDefault(); try { await guardarCfg(t, { config: { tarifa_por: new FormData(ev.target).getAll('por') } }, 'Guardado.'); } catch (e) { X.fail(e); } };
  const selCrit = (k, v) => {
    const f = c.campos.find(x => x.k === k);
    const list = k === 'tercero' ? personas().map(p => [p.id, p.nombre]) : f.tipo === 'elemento' ? elementosDe(t, f.lista).map(e => [e.id, `${e.codigo ? e.codigo + ' · ' : ''}${e.nombre}`]) : (f.opciones || []).map(o => [o, o]);
    return `<div><label for="f_c_${k}">${esc(nombreCrit(c, k))}</label><select id="f_c_${k}" name="c_${k}"><option value="">Todos</option>${X.opts(list, v)}</select></div>`;
  };
  const formT = (x = { uso: 'pago', modo: 'unidad', criterios: {}, desde: mesActual() }) => X.dialogo(`<h2>${x.id ? 'Editar' : 'Nueva'} tarifa</h2>
    <div class="grid2">${X.campoSel('uso', 'Uso', USOS_TARIFA, x.uso)}${X.campoSel('modo', 'Modo', MODOS_TARIFA, x.modo)}</div>
    <div class="grid2">${c.tarifa_por.map(k => selCrit(k, x.criterios?.[k])).join('')}</div>
    <div class="grid3">${X.campo('valor', 'Valor', x.valor ?? '', 'required class="mono" inputmode="decimal"')}${X.campo('desde', 'Desde', x.desde || '', 'type="date"')}${X.campo('hasta', 'Hasta (opcional)', x.hasta || '', 'type="date"')}</div>
    <div><label for="f_pr">Ítem de servicio</label><select id="f_pr" name="producto_id"><option value="">Escoge después</option>${servicios.map(p => `<option value="${p.id}" ${p.id === x.producto_id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.nombre)}</option>`).join('')}</select>${servicios.length ? '' : '<p class="hint">No hay servicios creados todavía.</p>'}</div>
    ${X.campo('nota', 'Nota', x.nota || '', 'maxlength="200"')}${X.pie()}`, async fd => {
    const row = { empresa_id: X.S.eid, tipo_id: t.id, uso: fd.get('uso'), modo: fd.get('modo'), valor: numIn(fd.get('valor')), desde: fd.get('desde') || null, hasta: fd.get('hasta') || null,
      criterios: Object.fromEntries(c.tarifa_por.map(k => [k, fd.get('c_' + k) || ''])), producto_id: fd.get('producto_id') || null, nota: String(fd.get('nota') || '').trim() };
    const errs = erroresTarifa(row); if (errs.length) throw new Error(errs.join(' '));
    await guardar('op_tarifas', x.id ? { ...row, id: x.id } : row); X.toast('Tarifa guardada.'); X.route();
  }, { ancho: true });
  X.$('opNT').onclick = () => formT();
  X.$('opIrP').onclick = () => { tabCfg = 'personas'; X.route(); };
  box.querySelectorAll('[data-et]').forEach(b => b.onclick = () => formT(tar.find(x => x.id === b.dataset.et)));
  box.querySelectorAll('[data-bt]').forEach(b => b.onclick = async () => { if (!await X.confirmar('Borrar tarifa', 'Los registros que la usaban toman la siguiente tarifa que aplique.', 'Borrar')) return; try { await borrar('op_tarifas', b.dataset.bt); X.toast('Tarifa borrada.'); X.route(); } catch (e) { X.fail(e); } });
}
function tabSalidas(box, t, c) {
  const { esc } = X, ctas = X.S.d.cuentas.filter(x => /^[567]\d{7}$/.test(x.codigo)).sort((a, b) => a.codigo.localeCompare(b.codigo));
  box.innerHTML = `<form class="panel stack" id="opS"><h3>Qué cierra cada registro</h3><p class="hint">Cada registro puede cerrarse dos veces, por separado: lo que se programa a la persona (documento soporte) y el cobro al cliente. Escoge lo que use esta empresa.</p>
    <div class="grid2">${X.campoSel('pago', 'Programación a la persona', SALIDAS_PAGO, c.salidas.pago)}${X.campoSel('cobro', 'Cobro al cliente', SALIDAS_COBRO, c.salidas.cobro)}</div>
    <div class="grid2"><div><label for="f_cta">Cuenta del documento soporte cuando el ítem de servicio no tiene una</label><select id="f_cta" name="cuenta"><option value="">Escoge una cuenta de costo o gasto</option>${ctas.map(x => `<option value="${x.codigo}" ${x.codigo === c.salidas.cuenta ? 'selected' : ''}>${x.codigo} ${esc(x.nombre)}</option>`).join('')}</select></div>
      ${X.campo('titulo', 'Título del volante', c.salidas.titulo || 'Horas adicionales', 'maxlength="60"')}</div>
    <div class="grid2">${X.campoSel('cobrar', 'Al cliente se le cobra', [['cantidad', 'La cantidad registrada (horómetro, km…)'], ['pagadas', 'La cantidad liquidada a la persona']], c.salidas.cobrar || 'cantidad')}<div></div></div>
    <p class="hint">La programación se genera desde el corte (Registrar › Cortes de programación): un documento soporte por persona con el ítem de servicio de cada tarifa. El cobro, desde Registrar › Facturar: una factura en borrador por cotización (Ventas › Cotizaciones) o, sin cotización, con la tarifa de cobro.</p>
    <div class="row end"><button class="primary">Guardar</button></div></form>`;
  X.$('opS').onsubmit = async ev => { ev.preventDefault(); const fd = new FormData(ev.target); try { await guardarCfg(t, { config: { salidas: { ...c.salidas, pago: fd.get('pago'), cobro: fd.get('cobro'), cuenta: fd.get('cuenta') || '', titulo: String(fd.get('titulo') || '').trim(), cobrar: fd.get('cobrar') || 'cantidad' } } }, 'Salidas guardadas.'); } catch (e) { X.fail(e); } };
}

/* ---------- Registrar ---------- */
const filtros = {};
const VER_REG = [['abiertos', 'Abiertos (en trabajo)'], ['cerrados', 'Cerrados (historial)'], ['todos', 'Todos']];
export function vOpRegistros(m, id, q) {
  const t = tipoById(id); if (!t) { location.hash = '#/operacion'; return; }
  const { esc, money } = X, c = cfgTipo(t), tar = tarifasDe(t);
  const todos = registrosDe(t), cerradoReg = r => estaCerrado(r, c, corteDe(r)), cerradoT = t.activo === false;
  const e0 = q?.get('ver') || filtros[id]?.e || 'abiertos';
  // Abiertos arranca en el registro abierto más antiguo, para que nada pendiente quede escondido por la fecha.
  const desde0 = () => { const ab = todos.filter(r => !cerradoReg(r)).map(r => r.fecha).sort()[0]; return e0 === 'abiertos' && ab && ab < mesActual() ? ab : mesActual(); };
  const f = filtros[id] = { desde: q?.get('desde') || filtros[id]?.desde || desde0(), hasta: q?.get('hasta') || filtros[id]?.hasta || X.hoy(), p: filtros[id]?.p || '', e: e0, cot: filtros[id]?.cot || '' };
  const pasaE = r => f.e === 'todos' || (f.e === 'cerrados') === cerradoReg(r);
  // Proyecto de cada registro: la cotización escogida o la que coincide por sus datos.
  const cotsTodas = X.S.d.cotizaciones || [], proyDe = r => cotizacionPara(r, cotsTodas)?.id || '', proysT = cotsTodas.filter(x => x.op_tipo_id === t.id).sort((a, b) => b.numero - a.numero), proySel = proysT.find(x => x.id === f.cot);
  const regs = todos.filter(r => r.fecha >= f.desde && r.fecha <= f.hasta && (!f.p || r.tercero_id === f.p) && (!f.cot || proyDe(r) === f.cot) && pasaE(r)).sort((a, b) => a.fecha.localeCompare(b.fecha) || nomT(a.tercero_id).localeCompare(nomT(b.tercero_id)));
  const calc = new Map(regs.map(r => [r.id, calcular(r, t, tar)])), res = resumen(regs, t, tar), av = avisos(regs, t, tar);
  const total = res.reduce((s, p) => s + p.total, 0), q2 = res.reduce((s, p) => s + p.cantidad, 0);
  // Columnas: el proyecto reemplaza lo que trae la cotización (obra…), y se esconden las que están vacías en todo lo mostrado.
  const conProy = c.proyecto !== 'no' && proysT.length > 0, deProy = new Set(conProy ? proysT.flatMap(x => Object.keys(x.criterios || {}).filter(k => x.criterios[k])) : []);
  const vacio = v => v == null || v === '' || v === false || (typeof v === 'object' && (v.ini == null || v.ini === '') && (v.fin == null || v.fin === ''));
  const cols = c.campos.filter(fc => !deProy.has(fc.k) && regs.some(r => !esCargo(r) && !vacio(r.datos?.[fc.k])));
  const celProy = r => { const x = cotizacionPara(r, cotsTodas); return x ? `<a href="#/cotizacion/${x.id}">N.º ${x.numero}</a><br><small class="hint">${esc(nomT(x.tercero_id))}</small>` : esCargo(r) ? '' : '<span class="tag demo">Sin proyecto</span>'; };
  const celda = (r, fc) => { const v = r.datos?.[fc.k]; if (fc.tipo === 'elemento') return esc(elem(v)?.nombre || ''); if (fc.tipo === 'lectura') return v && v.ini !== '' && v.ini != null ? `<span class="mono">${cant(v.ini)} → ${cant(v.fin)}</span>` : '—'; if (fc.tipo === 'sino') return v ? 'Sí' : ''; return esc(v ?? ''); };
  const avDe = new Map(); for (const a of av) avDe.set(a.registro_id, [...(avDe.get(a.registro_id) || []), a.texto]);
  const linea = l => l.cargo ? `${esc(l.cargo)}${l.registros > 1 ? ` (${l.registros})` : ''}` : l.regla ? `${esc(l.regla)} · ${cant(l.cantidad, c.unidad)}` : !l.tarifa ? `Sin tarifa · ${cant(l.cantidad, c.unidad)}` : l.modo === 'fijo' ? `Pago fijo${l.tarifa.nota ? ' · ' + esc(l.tarifa.nota) : ''} · ${cant(l.cantidad, c.unidad)}` : l.modo === 'registro' ? `${l.registros} × ${money(l.tarifa.valor)}` : `${cant(l.cantidad, c.unidad)} × ${money(l.tarifa.valor)}`;
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/operacion">← Operación</a><h2>${esc(t.nombre)}</h2><p class="sub">Estos registros no generan movimientos contables.</p></div>
    <div class="row">${cerradoT ? '<button class="primary" id="opReabrir">Reabrir</button>' : `<button class="ghost" id="opCerrarT" title="Ya no se usa esta actividad: sale del menú y queda en el historial">Cerrar tipo</button><a class="btn ghost" href="#/opcfg/${t.id}">Configurar</a><a class="btn ghost" href="#/opcfg/${t.id}?tab=personas">${esc(plural(c.persona))}</a>`}${c.continuidad?.lectura && c.continuidad?.por ? `<a class="btn ghost" href="#/opmaquinas/${t.id}">${esc(plural(c.campos.find(f => f.k === c.continuidad.por)?.nombre || 'Máquinas'))}</a>` : ''}${c.salidas.pago !== 'ninguno' ? `<a class="btn" href="#/opcortes/${t.id}">Cortes de programación</a>` : ''}${c.salidas.cobro === 'fv' ? `<a class="btn" href="#/opfacturar/${t.id}">Facturar</a>` : ''}${cerradoT ? '' : `${c.salidas.pago !== 'ninguno' ? '<button id="opCargo" title="Transporte, auxilio u otro valor para la persona">+ Cargo</button>' : ''}<button class="primary" id="opNuevo">+ Registro</button>`}</div></header>
  ${cerradoT ? `<section class="panel callout"><b>Cerrado.</b> No sale en el menú y no recibe registros nuevos. Puedes seguir programando o facturando lo que haya quedado abierto, o reabrirlo.</section>` : ''}
  <section class="panel row op-fil"><div><label for="opE">Ver</label><select id="opE">${X.opts(VER_REG, f.e)}</select></div><div><label for="opD">Desde</label><input type="date" id="opD" value="${f.desde}"></div><div><label for="opH">Hasta</label><input type="date" id="opH" value="${f.hasta}"></div>
    <div><label for="opP">${esc(c.persona)}</label><select id="opP"><option value="">Todos</option>${X.opts([...new Set(todos.map(r => r.tercero_id))].map(i => [i, nomT(i)]).sort((a, b) => a[1].localeCompare(b[1])), f.p)}</select></div>
    ${proysT.length ? `<div><label for="opC">Proyecto</label><select id="opC"><option value="">Todos</option>${proysT.map(x => `<option value="${x.id}" ${x.id === f.cot ? 'selected' : ''}>${esc(nomProy(x))}${cotizacionVigente(x) ? '' : ' (' + x.estado + ')'}</option>`).join('')}</select></div>` : ''}
    ${proySel ? `<div class="row end">${cotizacionVigente(proySel) ? '<button class="ghost" id="opCerrarP" title="El proyecto terminó: la cotización pasa a Cerrada">Cerrar proyecto</button>' : `<span class="tag">Proyecto ${esc(proySel.estado)}</span><button class="ghost" id="opReabrirP">Reabrir proyecto</button>`}<a class="btn ghost" href="#/cotizacion/${proySel.id}">Ver cotización</a></div>` : ''}</section>
  ${proySel ? barrasAvance(proySel, t, c) : ''}
  <div class="kpis"><div class="kpi"><span>Registros</span><b>${regs.filter(r => !esCargo(r)).length}</b></div><div class="kpi"><span>Cantidad liquidada</span><b>${cant(q2, c.unidad)}</b></div><div class="kpi"><span>${f.e === 'abiertos' ? 'Por programar' : 'Valor programación'}</span><b>${money(total)}</b></div><div class="kpi ${av.length ? 'op-warn' : ''}"><span>Avisos</span><b>${av.length}</b></div></div>
  ${av.length ? `<section class="panel stack op-avisos"><h3>Para revisar</h3><ul>${av.map(a => `<li><button type="button" class="link" data-er="${a.registro_id}">${X.fFecha(a.fecha)} · ${esc(nomT(regs.find(r => r.id === a.registro_id)?.tercero_id))}</button> ${esc(a.texto)}</li>`).join('')}</ul></section>` : ''}
  <section class="panel stack"><div class="tbl-wrap"><table class="tbl op-reg"><thead><tr><th>Fecha</th><th>Día</th><th>${esc(c.persona)}</th>${conProy ? '<th>Proyecto</th>' : ''}${cols.map(fc => `<th>${esc(fc.nombre)}</th>`).join('')}<th class="r">Cantidad</th>${c.editar_pagadas ? '<th class="r">Liquidadas</th>' : ''}<th class="r">Valor</th><th></th></tr></thead><tbody>
    ${regs.map(r => { const k = calc.get(r.id), dia = NOMBRE_DIA[k.dia]; return `<tr class="${k.dia === 'domingo' || k.dia === 'festivo' ? 'op-fest' : ''}"><td class="nowrap">${X.fFecha(r.fecha)}</td><td>${dia ? `<span class="tag ${k.dia === 'sabado' ? '' : 'demo'}">${dia}</span>` : ''}</td><td>${esc(nomT(r.tercero_id))}${avDe.has(r.id) ? ` <span class="tag demo" title="${esc(avDe.get(r.id).join(' '))}">Revisar</span>` : ''}${r.nota ? `<br><small class="hint">${esc(r.nota)}</small>` : ''}</td>
      ${conProy ? `<td>${celProy(r)}</td>` : ''}${k.cargo ? `<td colspan="${cols.length + 1 + (c.editar_pagadas ? 1 : 0)}"><span class="tag">Cargo</span> ${esc(k.cargo)}${r.datos?.producto_id ? ` <small class="hint">· ${esc((X.S.d.productos || []).find(p => p.id === r.datos.producto_id)?.nombre || '')}</small>` : ''}</td>` : `${cols.map(fc => `<td>${celda(r, fc)}</td>`).join('')}<td class="r mono">${cant(k.cantidad)}</td>`}${c.editar_pagadas && !k.cargo ? `<td class="r mono">${k.pagadas !== k.cantidad ? '<b>' + cant(k.pagadas) + '</b>' : cant(k.pagadas)}</td>` : ''}
      <td class="r mono">${k.fijo ? '<span class="hint">Pago fijo</span>' : money(k.valor)}${k.recargos.length ? `<br><small class="hint">incluye ${k.recargos.map(x => esc(x.nombre.toLowerCase())).join(', ')}</small>` : ''}</td>
      <td class="r nowrap">${r.cierre_pago || r.cierre_cobro ? `${r.cierre_pago ? '<span class="tag ok" title="Ya tiene documento soporte">Programado</span>' : c.salidas.pago !== 'ninguno' ? '<span class="tag demo">Por programar</span>' : ''}${r.cierre_cobro ? ' <span class="tag ok">Facturado</span>' : c.salidas.cobro === 'fv' && !k.cargo ? ' <span class="tag demo">Por facturar</span>' : ''}` : corteDe(r)?.estado === 'cerrado' ? '<span class="tag">En corte cerrado</span>' : `<button class="sm" data-er="${r.id}">Editar</button>${k.cargo ? '' : `<button class="sm ghost" data-cr="${r.id}" title="Copiar para el día siguiente">Copiar</button>`}<button class="sm ghost" data-br="${r.id}">Borrar</button>`}</td></tr>`; }).join('') || `<tr><td colspan="${6 + cols.length + (conProy ? 1 : 0)}" class="muted">${f.e === 'abiertos' ? 'No hay registros abiertos en estas fechas.' : f.e === 'cerrados' ? 'No hay registros cerrados en estas fechas. Cambia las fechas para ver el historial.' : 'No hay registros en estas fechas.'}</td></tr>`}</tbody></table></div></section>
  ${res.length && f.e !== 'cerrados' ? `<section class="panel stack"><header class="vhead"><div><h3>Resumen por ${esc(c.persona.toLowerCase())}</h3><p class="hint">Lo que será el volante de cada persona en el corte.</p></div><b class="mono">${money(total)}</b></header>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(c.persona)}</th><th>Concepto</th><th class="r">Valor</th></tr></thead><tbody>
    ${res.sort((a, b) => nomT(a.tercero_id).localeCompare(nomT(b.tercero_id))).map(p => p.lineas.map((l, i) => `<tr${i ? '' : ' class="op-p"'}><td>${i ? '' : `<b>${esc(nomT(p.tercero_id))}</b>`}</td><td>${linea(l)}</td><td class="r mono">${money(l.valor)}</td></tr>`).join('') + `<tr class="grp"><td></td><td>Total ${esc(nomT(p.tercero_id))}</td><td class="r mono"><b>${money(p.total)}</b></td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  const filtrar = () => { filtros[id] = { desde: X.$('opD').value || f.desde, hasta: X.$('opH').value || f.hasta, p: X.$('opP').value, e: X.$('opE').value, cot: X.$('opC')?.value || '' }; vOpRegistros(m, id); };
  X.$('opD').onchange = X.$('opH').onchange = X.$('opP').onchange = filtrar; if (X.$('opC')) X.$('opC').onchange = filtrar;
  if (X.$('opCerrarP')) X.$('opCerrarP').onclick = async () => {
    const ab = todos.filter(r => proyDe(r) === proySel.id && !cerradoReg(r)).length;
    if (!await X.confirmar(`Cerrar proyecto N.º ${proySel.numero}`, `${ab ? `${ab === 1 ? "Queda 1 registro" : `Quedan ${ab} registros`} sin programar o facturar: los podrás cerrar después desde Cortes y Facturar. ` : ''}La cotización pasa a Cerrada y el proyecto ya no sale para registrar. Puedes reabrirlo.`, 'Cerrar proyecto')) return;
    try { await guardar('cotizaciones', { id: proySel.id, estado: 'cerrada' }); X.toast(`Proyecto N.º ${proySel.numero} cerrado.`); X.route(); } catch (e) { X.fail(e); } };
  if (X.$('opReabrirP')) X.$('opReabrirP').onclick = async () => { try { await guardar('cotizaciones', { id: proySel.id, estado: 'aceptada' }); X.toast(`Proyecto N.º ${proySel.numero} reabierto.`); X.route(); } catch (e) { X.fail(e); } };
  // Al cambiar Ver, las fechas vuelven a su valor inicial para ese filtro.
  X.$('opE').onchange = () => { filtros[id] = { p: X.$('opP').value, e: X.$('opE').value, cot: X.$('opC')?.value || '' }; vOpRegistros(m, id); };
  if (X.$('opCerrarT')) X.$('opCerrarT').onclick = async () => {
    const ab = todos.filter(r => !cerradoReg(r)).length;
    if (!await X.confirmar(`Cerrar ${t.nombre}`, `${ab ? `Quedan ${ab} registro${ab === 1 ? '' : 's'} sin programar o facturar: podrás cerrarlos después desde aquí. ` : ''}Sale del menú y queda en Operación › Cerrados con todo su historial. Puedes reabrirlo cuando quieras.`, 'Cerrar')) return;
    try { await guardar('op_tipos', { id: t.id, activo: false }); X.toast(`${t.nombre} cerrado.`); location.hash = '#/operacion'; } catch (e) { X.fail(e); } };
  if (X.$('opReabrir')) X.$('opReabrir').onclick = async () => { try { await guardar('op_tipos', { id: t.id, activo: true }); X.toast(`${t.nombre} reabierto.`); X.route(); } catch (e) { X.fail(e); } };
  if (X.$('opNuevo')) X.$('opNuevo').onclick = () => formRegistro(t, { fecha: X.hoy(), tercero_id: f.p || '', cotizacion_id: proySel && cotizacionVigente(proySel) ? proySel.id : null, datos: proySel && cotizacionVigente(proySel) ? { ...proySel.criterios } : {} });
  if (X.$('opCargo')) X.$('opCargo').onclick = () => formCargo(t, { fecha: X.hoy(), tercero_id: f.p || '', clase: 'cargo', datos: {} });
  m.querySelectorAll('[data-er]').forEach(b => b.onclick = () => { const r = todos.find(x => x.id === b.dataset.er); (esCargo(r) ? formCargo : formRegistro)(t, r); });
  m.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => { const r = todos.find(x => x.id === b.dataset.cr), d = { ...r.datos };
    for (const fc of c.campos) if (fc.tipo === 'lectura') d[fc.k] = { ini: r.datos?.[fc.k]?.fin ?? '', fin: '' }; else if (!['elemento', 'lista'].includes(fc.tipo)) delete d[fc.k];
    formRegistro(t, { fecha: X.sumarDias(r.fecha, 1), tercero_id: r.tercero_id, datos: d }); });
  m.querySelectorAll('[data-br]').forEach(b => b.onclick = async () => { if (!await X.confirmar('Borrar registro', 'El registro se borra de Operación. No afecta la contabilidad.', 'Borrar')) return; try { await borrar('op_registros', b.dataset.br); X.toast('Registro borrado.'); X.route(); } catch (e) { X.fail(e); } });
}
// Cargo suelto para la persona (transporte, auxilio…): entra a su volante y a su documento soporte; no se factura al cliente.
function formCargo(t, r) {
  const { esc } = X, c = cfgTipo(t);
  const conceptos = [...new Set(registrosDe(t).filter(esCargo).map(x => x.datos?.concepto).filter(Boolean))];
  const servs = (X.S.d.productos || []).filter(p => p.activo !== false && p.tipo === 'servicio').sort((a, b) => a.nombre.localeCompare(b.nombre));
  X.dialogo(`<h2>${r.id ? 'Editar cargo' : 'Nuevo cargo'} · ${esc(t.nombre)}</h2>
    <div class="grid2">${X.campo('fecha', 'Fecha', r.fecha, 'type="date" required')}<div><label for="f_tercero_id">${esc(c.persona)} *</label><select id="f_tercero_id" name="tercero_id" required><option value="">Escoge…</option>${personas().map(p => `<option value="${p.id}" ${p.id === r.tercero_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div></div>
    <div class="grid2">${X.campo('concepto', 'Concepto *', r.datos?.concepto || '', 'list="opConc" maxlength="80" placeholder="Transporte" required')}<datalist id="opConc">${conceptos.map(x => `<option value="${esc(x)}">`).join('')}</datalist>${X.campo('valor', 'Valor *', r.datos?.valor ?? '', 'class="mono" inputmode="decimal" required')}</div>
    <div class="grid2"><div><label for="f_prod">Ítem de servicio del documento soporte</label><select id="f_prod" name="producto_id"><option value="">El de Configurar › Salidas</option>${servs.map(p => `<option value="${p.id}" ${p.id === r.datos?.producto_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div>${X.campo('nota', 'Nota', r.nota || '', 'maxlength="300"')}</div>
    <p class="hint">El cargo se suma al volante de la persona en el corte y sale como una línea de su documento soporte. No se cobra al cliente.</p>${X.pie()}`, async fd => {
    const row = { ...r, empresa_id: X.S.eid, tipo_id: t.id, clase: 'cargo', fecha: fd.get('fecha'), tercero_id: fd.get('tercero_id') || null, nota: String(fd.get('nota') || '').trim(), cantidad_pagada: null,
      datos: { concepto: String(fd.get('concepto') || '').trim(), valor: numIn(fd.get('valor')), producto_id: fd.get('producto_id') || null } };
    delete row.creado_en;
    const errs = erroresRegistro(row, t); if (errs.length) throw new Error(errs.join(' '));
    await guardar('op_registros', row); X.toast('Cargo guardado.'); X.route();
  });
}
function formRegistro(t, r) {
  const { esc } = X, c = cfgTipo(t), todos = registrosDe(t), modoP = c.proyecto, proys = modoP === 'no' ? [] : proyectosDe(t, r.cotizacion_id);
  const cotSel = () => proys.find(x => x.id === X.$('f_cot')?.value) || null;
  const input = fc => {
    const v = r.datos?.[fc.k], req = fc.obligatorio ? ' *' : '';
    if (fc.tipo === 'elemento') return `<div><label for="f_d_${fc.k}">${esc(fc.nombre)}${req}</label><select id="f_d_${fc.k}" name="d_${fc.k}" data-el="${fc.k}"><option value="">Escoge…</option>${elementosDe(t, fc.lista).concat(v && !elementosDe(t, fc.lista).some(e => e.id === v) && elem(v) ? [elem(v)] : []).map(e => `<option value="${e.id}" ${e.id === v ? 'selected' : ''}>${esc(e.codigo ? e.codigo + ' · ' : '')}${esc(e.nombre)}</option>`).join('')}</select></div>`;
    if (fc.tipo === 'lista') return `<div><label for="f_d_${fc.k}">${esc(fc.nombre)}${req}</label><select id="f_d_${fc.k}" name="d_${fc.k}"><option value="">Escoge…</option>${(fc.opciones || []).map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
    if (fc.tipo === 'sino') return `<div class="checkcell">${X.check('d_' + fc.k, esc(fc.nombre), v)}</div>`;
    if (fc.tipo === 'lectura') return `<div><label>${esc(fc.nombre)}${req}</label><div class="row nowrap"><input name="d_${fc.k}_ini" id="f_d_${fc.k}_ini" class="mono" inputmode="decimal" placeholder="Inicial" value="${esc(v?.ini ?? '')}" aria-label="${esc(fc.nombre)} inicial"><input name="d_${fc.k}_fin" class="mono" inputmode="decimal" placeholder="Final" value="${esc(v?.fin ?? '')}" aria-label="${esc(fc.nombre)} final"></div></div>`;
    return X.campo('d_' + fc.k, esc(fc.nombre) + req, v ?? '', fc.tipo === 'numero' ? 'class="mono" inputmode="decimal"' : 'maxlength="200"');
  };
  const leer = fd => {
    const d = {};
    for (const fc of c.campos) {
      if (fc.tipo === 'lectura') { const a = String(fd.get(`d_${fc.k}_ini`) ?? '').trim(), b = String(fd.get(`d_${fc.k}_fin`) ?? '').trim(); d[fc.k] = { ini: a === '' ? '' : numIn(a), fin: b === '' ? '' : numIn(b) }; }
      else if (fc.tipo === 'sino') d[fc.k] = fd.get('d_' + fc.k) === 'on';
      else if (fc.tipo === 'numero') { const s = String(fd.get('d_' + fc.k) ?? '').trim(); d[fc.k] = s === '' ? '' : numIn(s); }
      else d[fc.k] = String(fd.get('d_' + fc.k) ?? '').trim();
    }
    // Lo que trae el proyecto (obra, cliente…) se guarda en el registro para centros de costo y líneas de la cotización.
    const cot = proys.find(x => x.id === fd.get('cotizacion_id'));
    if (cot) for (const [k, v] of Object.entries(cot.criterios || {})) if (v && c.campos.some(fc => fc.k === k)) d[k] = v;
    const p = String(fd.get('pagadas') ?? '').trim();
    return { ...r, empresa_id: X.S.eid, tipo_id: t.id, fecha: fd.get('fecha'), tercero_id: fd.get('tercero_id') || null, ...(modoP !== 'no' ? { cotizacion_id: fd.get('cotizacion_id') || null } : {}), datos: d, cantidad_pagada: c.editar_pagadas && p !== '' && numIn(p) > 0 ? numIn(p) : null, nota: String(fd.get('nota') || '').trim() };
  };
  const f = X.dialogo(`<h2>${r.id ? 'Editar registro' : 'Nuevo registro'} · ${esc(t.nombre)}</h2>
    <div class="grid2">${X.campo('fecha', 'Fecha', r.fecha, 'type="date" required')}<div><label for="f_tercero_id">${esc(c.persona)} *</label><select id="f_tercero_id" name="tercero_id" required><option value="">Escoge…</option>${personas().map(p => `<option value="${p.id}" ${p.id === r.tercero_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div></div>
    ${modoP === 'no' ? '' : proys.length ? `<div class="op-proy"><label for="f_cot">Proyecto (cotización)${modoP === 'obligatorio' ? ' *' : ''}</label><select id="f_cot" name="cotizacion_id"><option value="">${modoP === 'obligatorio' ? 'Escoge el proyecto…' : 'Sin proyecto'}</option>${proys.map(x => `<option value="${x.id}" ${x.id === r.cotizacion_id ? 'selected' : ''}>${esc(nomProy(x))}${cotizacionVigente(x) ? '' : ' (' + x.estado + ')'}</option>`).join('')}</select><p class="hint" id="opProyInfo"></p></div>`
      : `<p class="callout">No hay cotizaciones abiertas amarradas a ${esc(t.nombre)}. ${modoP === 'obligatorio' ? 'Crea la del proyecto en <a href="#/cotizacion/nueva-maq">Ventas › Cotizaciones</a> para poder registrar.' : 'Puedes registrar sin proyecto.'}</p>`}
    <div class="grid2">${c.campos.map(fc => `<div data-campo="${fc.k}">${input(fc)}</div>`).join('')}</div>
    <p class="op-prev" id="opPrev"></p>
    <div class="grid2">${c.editar_pagadas ? X.campo('pagadas', 'Cantidad liquidada, solo si es distinta (vacío = la del horómetro)', r.cantidad_pagada > 0 ? r.cantidad_pagada : '', 'class="mono" inputmode="decimal"') : ''}${X.campo('nota', 'Nota', r.nota || '', 'maxlength="300"')}</div>
    <p class="hint">Si la persona no aparece, créala en Terceros. Los registros no tocan la contabilidad.</p>${X.pie()}`, async (fd, btn) => {
    const row = leer(fd); delete row.creado_en;
    if (modoP === 'obligatorio' && !row.cotizacion_id) throw new Error('Escoge el proyecto (cotización) del recibo.');
    const errs = erroresRegistro(row, t); if (errs.length) throw new Error(errs.join(' '));
    await guardar('op_registros', row); X.toast('Registro guardado.'); X.route();
  }, { ancho: true });
  const prev = () => { if (!X.$('opPrev')) return; try { const k = calcular({ ...leer(new FormData(f)), id: r.id || 'nuevo' }, t, tarifasDe(t)); X.$('opPrev').innerHTML = `${NOMBRE_DIA[diaDe(X.$('f_fecha').value)] ? `<span class="tag demo">${NOMBRE_DIA[diaDe(X.$('f_fecha').value)]}</span> ` : ''}Cantidad <b>${cant(k.cantidad, c.unidad)}</b>${k.pagadas !== k.cantidad ? ` · pagadas <b>${cant(k.pagadas)}</b>` : ''} · ${k.tarifa ? (k.fijo ? 'pago fijo del corte' : `valor <b>${X.money(k.valor)}</b>`) : '<span class="err">sin tarifa</span>'}`; } catch (_) { X.$('opPrev').textContent = ''; } };
  // El proyecto trae la obra, el cliente… : esos campos se llenan y se esconden. Debajo se ve el avance de horas del proyecto.
  const aplicarProy = () => {
    const cot = cotSel(), crit = cot?.criterios || {};
    f.querySelectorAll('[data-campo]').forEach(w => { const k = w.dataset.campo, v = crit[k]; w.hidden = !!v; if (v) { const s = X.$('f_d_' + k); if (s && s.value !== v) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } } });
    const info = X.$('opProyInfo'); if (!info) return;
    if (!cot) { info.textContent = ''; return; }
    const av = avanceCotizacion(cot, X.S.d.op_registros || [], t, X.S.d.cotizaciones).filter(x => x.horas && x.proyectado > 0);
    const dat = Object.entries(crit).filter(([, v]) => v).map(([k, v]) => `${esc(c.campos.find(fc => fc.k === k)?.nombre || k)}: <b>${esc(elem(v)?.nombre || '')}</b>`);
    info.innerHTML = [`Factura a <b>${esc(nomT(cot.tercero_id))}</b>`, ...dat, ...av.map(x => `${esc(x.descripcion || 'Horas')}: ${cant(x.ejecutado)} de ${cant(x.proyectado, c.unidad)}${x.saldo <= 0 ? ' <span class="tag demo">Se acabaron: adiciona en la cotización</span>' : ''}`)].join(' · ');
  };
  if (X.$('f_cot')) { X.$('f_cot').addEventListener('change', aplicarProy); aplicarProy(); }
  f.addEventListener('input', prev); f.addEventListener('change', prev); prev();
  // Lectura inicial sugerida: donde terminó el último registro del mismo elemento.
  const co = c.continuidad;
  if (co?.lectura && co?.por && f.querySelector(`[data-el="${co.por}"]`)) f.querySelector(`[data-el="${co.por}"]`).addEventListener('change', ev => {
    const ini = X.$(`f_d_${co.lectura}_ini`); if (!ini || ini.value) return;
    const u = ultimaLectura(todos.filter(x => x.id !== r.id), t, ev.target.value, X.$('f_fecha').value); if (u != null) { ini.value = String(u).replace('.', ','); prev(); }
  });
}

// Avance de las líneas "con horas" de un proyecto: ejecutado contra proyectado.
function barrasAvance(cot, t, c) {
  const { esc } = X, av = avanceCotizacion(cot, X.S.d.op_registros || [], t, X.S.d.cotizaciones).filter(x => x.horas && x.proyectado > 0);
  if (!av.length) return '';
  return `<section class="panel stack op-avance"><h3>Avance del proyecto N.º ${cot.numero}</h3>${av.map(x => `<div class="op-bar-row"><div class="row between"><span>${esc(x.descripcion || 'Horas')}</span><span class="mono">${cant(x.ejecutado)} de ${cant(x.proyectado, c.unidad)}${x.adicionado ? ` <small class="hint">(incluye ${cant(x.adicionado)} adicionadas)</small>` : ''}</span></div>
    <div class="op-bar"><i style="width:${Math.min(100, x.pct)}%" class="${x.saldo <= 0 ? 'over' : x.pct >= 80 ? 'warn' : ''}"></i></div>${x.saldo <= 0 ? `<p class="hint">Se acabaron las ${esc(c.unidad)} cotizadas${x.saldo < 0 ? ` (van ${cant(-x.saldo)} de más)` : ''}. <a href="#/cotizacion/${cot.id}">Adicionar en la cotización</a></p>` : ''}</div>`).join('')}</section>`;
}

/* ---------- Máquinas: acumulado de horómetro ---------- */
export function vOpMaquinas(m, id, q) {
  const t = tipoById(id); if (!t) { location.hash = '#/operacion'; return; }
  const { esc } = X, c = cfgTipo(t), co = c.continuidad, desde = q?.get('desde') || mesActual(), hasta = q?.get('hasta') || X.hoy();
  const fl = co ? c.campos.find(f => f.k === co.por) : null, fLect = co ? c.campos.find(f => f.k === co.lectura) : null;
  const head = `<header class="vhead"><div><a class="back" href="#/opregistros/${t.id}">← ${esc(t.nombre)}</a><h2>${esc(fl ? plural(fl.nombre) : 'Máquinas')}</h2><p class="sub">Acumulado de ${esc((fLect?.nombre || 'lectura').toLowerCase())} por ${esc((fl?.nombre || 'máquina').toLowerCase())}, sacado de los recibos. Base para controles y mantenimiento.</p></div></header>`;
  if (!co?.lectura || !co?.por) { m.innerHTML = head + `<section class="panel callout">Este tipo no controla lecturas. Actívalo en <a href="#/opcfg/${t.id}">Configurar › General</a> (Controlar que las lecturas empaten… por cada máquina).</section>`; return; }
  const acc = acumuladoMaquinas(registrosDe(t), t, { desde, hasta }), porId = new Map(acc.map(a => [a.elemento, a]));
  const lista = elementosDe(t, fl.lista, true).map(e => ({ e, a: porId.get(e.id) })).sort((x, y) => (y.a ? 1 : 0) - (x.a ? 1 : 0) || x.e.nombre.localeCompare(y.e.nombre));
  const saltos = acc.flatMap(a => a.saltos.map(sx => ({ ...sx, elemento: a.elemento }))).sort((a, b) => b.fecha.localeCompare(a.fecha));
  m.innerHTML = head + `<section class="panel row op-fil"><div><label for="mqD">Desde</label><input type="date" id="mqD" value="${desde}"></div><div><label for="mqH">Hasta</label><input type="date" id="mqH" value="${hasta}"></div></section>
  <section class="panel stack"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(fl.nombre)}</th><th class="r">Último ${esc((fLect?.nombre || 'lectura').toLowerCase())}</th><th>Fecha</th><th class="r">Horas del período</th><th class="r">Recibos del período</th><th class="r">Horas acumuladas</th><th>Control</th></tr></thead><tbody>
    ${lista.map(({ e, a }) => `<tr class="${e.activo === false ? 'muted' : ''}"><td><b>${esc(e.nombre)}</b>${e.codigo ? ` <small class="hint">${esc(e.codigo)}</small>` : ''}</td><td class="r mono">${a?.ultimo != null ? cant(a.ultimo) : '—'}</td><td class="hint">${a ? X.fFecha(a.fecha) : ''}</td><td class="r mono">${a ? cant(a.periodo, c.unidad) : ''}</td><td class="r">${a ? a.recibosPeriodo : ''}</td><td class="r mono">${a ? cant(a.total, c.unidad) : ''}</td><td>${a?.saltos.length ? `<span class="tag demo">${a.saltos.length} salto${a.saltos.length === 1 ? '' : 's'}</span>` : a ? '<span class="tag ok">Empata</span>' : '<span class="hint">Sin recibos</span>'}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">No hay ${esc(plural(fl.nombre).toLowerCase())} en la lista. Agrégalas en Configurar › Listas.</td></tr>`}</tbody></table></div>
    <p class="hint">Horas acumuladas = suma de (final − inicial) de todos los recibos. Un salto es un recibo que no empieza donde terminó el anterior de la misma ${esc(fl.nombre.toLowerCase())}.</p></section>
  ${saltos.length ? `<section class="panel stack"><h3>Saltos para revisar</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>${esc(fl.nombre)}</th><th class="r">Debía empezar en</th><th class="r">Empezó en</th><th class="r">Diferencia</th><th></th></tr></thead><tbody>
    ${saltos.map(sx => `<tr><td>${X.fFecha(sx.fecha)}</td><td>${esc(elem(sx.elemento)?.nombre || '')}</td><td class="r mono">${cant(sx.esperado)}</td><td class="r mono">${cant(sx.ini)}</td><td class="r mono">${sx.dif > 0 ? '+' : ''}${cant(sx.dif)}</td><td class="r"><button class="sm" data-er="${sx.registro_id}">Ver recibo</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  const ir = () => { location.hash = `#/opmaquinas/${t.id}?desde=${X.$('mqD').value || desde}&hasta=${X.$('mqH').value || hasta}`; };
  X.$('mqD').onchange = X.$('mqH').onchange = ir;
  m.querySelectorAll('[data-er]').forEach(b => b.onclick = () => { const r = registrosDe(t).find(x => x.id === b.dataset.er); if (r) formRegistro(t, r); });
}

/* ---------- Cortes de programación ---------- */
const cortesDe = tipo => (X.S.d.op_cortes || []).filter(c => c.tipo_id === tipo.id).sort((a, b) => b.desde.localeCompare(a.desde));
const corteDe = r => r.corte_id ? (X.S.d.op_cortes || []).find(c => c.id === r.corte_id) : null;
const corteById = id => (X.S.d.op_cortes || []).find(c => c.id === id);
const perTxt = c => { const f = d => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }); return `${f(c.desde)} al ${f(c.hasta)} ${c.hasta.slice(0, 4)}`; };
const regsCorte = c => (X.S.d.op_registros || []).filter(r => r.corte_id === c.id);
export const ctxCC = () => ({ elementos: X.S.d.op_elementos || [], centros: X.S.d.centros_costo || [] });
// Volantes del corte: congelados al cerrar; mientras está en borrador se calculan con la configuración actual.
const volantesCorte = (c, t) => c.estado === 'cerrado' && (c.volantes || []).length ? c.volantes : volantes(regsCorte(c), t, tarifasDe(t), ctxCC());
const compraDe = id => (X.S.d.compras || []).find(x => x.id === id);
async function guardarVarios(t, rows) { try { for (const r of rows) await X.store.save(t, r); } catch (e) { throw faltaSql(e); } }

export function vOpCortes(m, id) {
  const t = tipoById(id); if (!t) { location.hash = '#/operacion'; return; }
  const { esc, money } = X, cs = cortesDe(t), sinCorte = registrosDe(t).filter(r => !r.corte_id && !r.cierre_pago);
  const ult = cs[0];
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/opregistros/${t.id}">← ${esc(t.nombre)}</a><h2>Cortes de programación</h2><p class="sub">Cada corte junta los registros de un periodo, arma el volante de cada persona y genera sus documentos soporte.</p></div><button class="primary" id="opNC">Nuevo corte</button></header>
  ${sinCorte.length ? `<p class="hint">${sinCorte.length} registro${sinCorte.length === 1 ? '' : 's'} sin corte todavía${sinCorte.some(r => esPendiente(r, t)) ? `, ${sinCorte.filter(r => esPendiente(r, t)).length} con soporte pendiente` : ''}.</p>` : ''}
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Periodo</th><th>Estado</th><th class="r">Personas</th><th class="r">Total</th><th>Documentos soporte</th></tr></thead><tbody>
  ${cs.map(c => { const v = volantesCorte(c, t), g = (c.generados || []).filter(x => compraDe(x.compra_id)?.estado !== 'anulado' && compraDe(x.compra_id)); return `<tr class="click" data-c="${c.id}"><td><b>${perTxt(c)}</b></td><td>${c.estado === 'cerrado' ? '<span class="tag ok">Cerrado</span>' : '<span class="tag demo">Borrador</span>'}</td><td class="r">${v.length}</td><td class="r mono">${money(v.reduce((s, x) => s + x.total, 0))}</td><td>${g.length ? `${g.length} de ${v.filter(x => x.total > 0).length}` : '—'}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">Todavía no hay cortes.</td></tr>'}</tbody></table></div></section>`;
  m.querySelectorAll('[data-c]').forEach(tr => tr.onclick = () => { location.hash = '#/opcorte/' + tr.dataset.c; });
  X.$('opNC').onclick = () => {
    const desde = ult ? X.sumarDias(ult.hasta, 1) : mesActual(), hasta = X.hoy() > desde ? X.hoy() : desde;
    X.dialogo(`<h2>Nuevo corte de programación</h2><div class="grid2">${X.campo('desde', 'Desde', desde, 'type="date" required')}${X.campo('hasta', 'Hasta', hasta, 'type="date" required')}</div>
      ${X.check('pend', 'Incluir los registros con soporte pendiente', false)}<p class="hint">Sin marcar, los que no tienen soporte quedan para el corte siguiente, como en tus volantes ("se programan cuando se entreguen").</p>${X.pie('Crear corte')}`, async fd => {
      const d = fd.get('desde'), h = fd.get('hasta'); if (!d || !h || h < d) throw new Error('Revisa las fechas del corte.');
      if (cs.some(c => !(h < c.desde || d > c.hasta))) throw new Error('Ese periodo se cruza con otro corte.');
      const regs = elegiblesCorte(X.S.d.op_registros || [], t, d, h, fd.get('pend') === 'on');
      if (!regs.length) throw new Error('No hay registros sin programar en esas fechas.');
      let c; try { c = await X.store.save('op_cortes', { empresa_id: X.S.eid, tipo_id: t.id, desde: d, hasta: h, estado: 'borrador', volantes: [], generados: [] }); } catch (e) { throw faltaSql(e); }
      await guardarVarios('op_registros', regs.map(r => ({ id: r.id, corte_id: c.id })));
      await X.cargarEmpresa(); X.toast(`Corte creado con ${regs.length} registros.`); location.hash = '#/opcorte/' + c.id;
    });
  };
}

export function vOpCorte(m, id) {
  const c = corteById(id); if (!c) { location.hash = '#/operacion'; return; }
  const t = tipoById(c.tipo_id); if (!t) { location.hash = '#/operacion'; return; }
  const { esc, money } = X, cfg = cfgTipo(t), cerrado = c.estado === 'cerrado', vs = volantesCorte(c, t), regs = regsCorte(c);
  const total = vs.reduce((s, v) => s + v.total, 0), gen = c.generados || [];
  const genDe = tid => gen.find(g => g.tercero_id === tid && compraDe(g.compra_id) && compraDe(g.compra_id).estado !== 'anulado');
  const huerfanos = gen.filter(g => !compraDe(g.compra_id) || compraDe(g.compra_id).estado === 'anulado');
  const fuera = elegiblesCorte(X.S.d.op_registros || [], t, c.desde, c.hasta, true);
  const porPagar = vs.filter(v => v.total > 0 && !genDe(v.tercero_id));
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/opcortes/${t.id}">← Cortes de programación</a><h2>Corte ${perTxt(c)} ${cerrado ? '<span class="tag ok">Cerrado</span>' : '<span class="tag demo">Borrador</span>'}</h2><p class="sub">${esc(t.nombre)} · ${regs.length} registros · los registros de un corte cerrado ya no se pueden cambiar.</p></div>
    <div class="row">${cerrado ? `${gen.length ? '' : '<button class="ghost" id="opReab">Reabrir</button>'}<button id="opImp">Imprimir volantes</button><button id="opRes">Imprimir resumen</button>${cfg.salidas.pago === 'ds' && porPagar.length ? `<button class="primary" id="opGen">Generar ${porPagar.length} documento${porPagar.length === 1 ? '' : 's'} soporte</button>` : ''}`
      : `<button class="ghost" id="opBorrar">Eliminar corte</button><button id="opImp">Vista previa de volantes</button><button class="primary" id="opCerrar">Cerrar corte</button>`}</div></header>
  ${fuera.length && !cerrado ? `<section class="panel callout row"><span>${fuera.length} registro${fuera.length === 1 ? '' : 's'} del periodo no está${fuera.length === 1 ? '' : 'n'} en el corte${fuera.some(r => esPendiente(r, t)) ? ' (algunos con soporte pendiente)' : ''}.</span><button class="sm" id="opAdd">Agregarlos</button></section>` : ''}
  ${huerfanos.length ? `<section class="panel callout row"><span>${huerfanos.length} documento${huerfanos.length === 1 ? '' : 's'} soporte de este corte se anuló o se eliminó: sus registros siguen marcados como programados.</span><button class="sm" id="opLib">Liberar esos registros</button></section>` : ''}
  <div class="kpis"><div class="kpi"><span>Personas</span><b>${vs.length}</b></div><div class="kpi"><span>Cantidad liquidada</span><b>${cant(vs.reduce((s, v) => s + v.cantidad, 0), cfg.unidad)}</b></div><div class="kpi"><span>Total programado</span><b>${money(total)}</b></div><div class="kpi"><span>Documentos soporte</span><b>${gen.length - huerfanos.length} de ${vs.filter(v => v.total > 0).length}</b></div></div>
  <section class="panel stack"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(cfg.persona)}</th><th>Concepto</th><th class="r">Valor</th><th>Documento soporte</th><th></th></tr></thead><tbody>
  ${vs.sort((a, b) => nomT(a.tercero_id).localeCompare(nomT(b.tercero_id))).map(v => { const g = genDe(v.tercero_id), cp = g && compraDe(g.compra_id); return `<tr><td><b>${esc(nomT(v.tercero_id))}</b></td><td>${v.lineas.map(l => esc(l.detalle)).join(' + ')}</td><td class="r mono"><b>${money(v.total)}</b></td>
    <td>${cp ? `<a href="#/compra/${cp.id}">DS ${cp.numero}</a>` : cerrado && cfg.salidas.pago === 'ds' && v.total > 0 ? '<span class="tag demo">Por generar</span>' : ''}</td><td class="r"><button class="sm ghost" data-v="${v.tercero_id}">Volante</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">El corte no tiene registros.</td></tr>'}
  <tr class="grp"><td colspan="2">Total</td><td class="r mono"><b>${money(total)}</b></td><td colspan="2"></td></tr></tbody></table></div></section>
  ${!cerrado && regs.length ? `<details class="panel"><summary>Registros del corte (${regs.length})</summary><div class="tbl-wrap"><table class="tbl"><tbody>${regs.sort((a, b) => a.fecha.localeCompare(b.fecha)).map(r => { const k = calcular(r, t, tarifasDe(t)); return `<tr><td>${X.fFecha(r.fecha)}</td><td>${esc(nomT(r.tercero_id))}</td><td class="r mono">${cant(k.pagadas, cfg.unidad)}</td><td class="r mono">${k.fijo ? 'Pago fijo' : money(k.valor)}</td><td>${esPendiente(r, t) ? '<span class="tag demo">Soporte pendiente</span>' : ''}</td><td class="r"><button class="sm ghost" data-s="${r.id}">Sacar del corte</button></td></tr>`; }).join('')}</tbody></table></div></details>` : ''}`;
  const imp = lista => { X.$('print').innerHTML = lista.map(v => hojaVolante(v, c, t)).join(''); const tt = document.title; document.title = `Volantes ${perTxt(c)} - ${X.emp().nombre}`; window.print(); document.title = tt; };
  X.$('opImp').onclick = () => imp(vs);
  m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => imp(vs.filter(v => v.tercero_id === b.dataset.v)));
  if (X.$('opRes')) X.$('opRes').onclick = () => { X.$('print').innerHTML = hojaResumen(vs, c, t); window.print(); };
  if (X.$('opAdd')) X.$('opAdd').onclick = async () => { try { await guardarVarios('op_registros', fuera.map(r => ({ id: r.id, corte_id: c.id }))); await X.cargarEmpresa(); X.toast('Registros agregados.'); X.route(); } catch (e) { X.fail(e); } };
  m.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { try { await guardarVarios('op_registros', [{ id: b.dataset.s, corte_id: null }]); await X.cargarEmpresa(); X.toast('Registro fuera del corte: queda para el siguiente.'); X.route(); } catch (e) { X.fail(e); } });
  if (X.$('opBorrar')) X.$('opBorrar').onclick = async () => {
    if (!await X.confirmar('Eliminar corte', 'Los registros quedan libres para otro corte. No se borra ningún registro.', 'Eliminar')) return;
    try { await guardarVarios('op_registros', regs.map(r => ({ id: r.id, corte_id: null }))); await borrar('op_cortes', c.id); X.toast('Corte eliminado.'); location.hash = '#/opcortes/' + t.id; } catch (e) { X.fail(e); }
  };
  if (X.$('opCerrar')) X.$('opCerrar').onclick = async () => {
    const sinT = vs.flatMap(v => v.lineas).filter(l => !l.tarifa_id && !l.regla && l.cantidad > 0);
    if (sinT.length && !await X.confirmar('Hay registros sin tarifa', 'Algunos registros no tienen tarifa de programación y quedan en $0. ¿Cerrar igual?', 'Cerrar igual')) return;
    if (!sinT.length && !await X.confirmar('Cerrar corte', `Se congelan los volantes (${money(total)}) y los registros del corte ya no se podrán cambiar.`, 'Cerrar corte')) return;
    try { await guardar('op_cortes', { id: c.id, estado: 'cerrado', volantes: volantes(regs, t, tarifasDe(t), ctxCC()) }); X.toast('Corte cerrado.'); X.route(); } catch (e) { X.fail(e); }
  };
  if (X.$('opReab')) X.$('opReab').onclick = async () => { try { await guardar('op_cortes', { id: c.id, estado: 'borrador', volantes: [] }); X.toast('Corte reabierto.'); X.route(); } catch (e) { X.fail(e); } };
  if (X.$('opLib')) X.$('opLib').onclick = async () => {
    try {
      const ids = new Set(huerfanos.map(g => g.compra_id));
      await guardarVarios('op_registros', regs.filter(r => ids.has(r.cierre_pago)).map(r => ({ id: r.id, cierre_pago: null })));
      await guardar('op_cortes', { id: c.id, generados: gen.filter(g => !ids.has(g.compra_id)) }); X.toast('Registros liberados: puedes volver a generar.'); X.route();
    } catch (e) { X.fail(e); }
  };
  if (X.$('opGen')) X.$('opGen').onclick = () => generarDS(c, t, porPagar);
}
// Un documento soporte por persona, contabilizado, con el ítem de servicio de cada tarifa. Los registros quedan programados con ese DS (el pago real va por egreso).
// c es un corte o solo un periodo {desde, hasta} (pantalla Programar, sin cortes).
export async function generarDS(c, t, lista) {
  const { esc, money } = X, cfg = cfgTipo(t), ccOn = X.emp()?.contabilidad?.cc?.activo === true;
  const arm = lista.map(v => ({ v, ...dsDeVolante(v, { empresa_id: X.S.eid, fecha: c.hasta, periodo: perTxt(c), tipoNombre: t.nombre, productos: X.S.d.productos, cuentaDefecto: cfg.salidas.cuenta, tercero: terc(v.tercero_id) || {}, conCC: ccOn }) }));
  for (const a of arm) if (!a.errores.length) a.errores = erroresCompra(a.compra, X.S.d.cuentas, X.S.d.productos);
  const malos = arm.filter(a => a.errores.length);
  if (malos.length) return X.toast(`${nomT(malos[0].v.tercero_id)}: ${malos[0].errores[0]}`, true);
  const filas = arm.map(a => { const tt = totalesCompra(a.compra.lineas, a.compra); return `<tr><td>${esc(nomT(a.v.tercero_id))}</td><td class="r mono">${money(tt.base)}</td><td class="r mono">${tt.retefuente + tt.reteica + tt.reteiva ? money(tt.retefuente + tt.reteica + tt.reteiva) : ''}</td><td class="r mono"><b>${money(tt.neto)}</b></td></tr>`; }).join('');
  if (!await X.confirmar('Generar documentos soporte', `Se crean y contabilizan ${arm.length} documentos soporte con fecha ${X.fFecha(c.hasta)}, a cuentas por pagar:<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Persona</th><th class="r">Valor</th><th class="r">Retenciones</th><th class="r">Neto</th></tr></thead><tbody>${filas}</tbody></table></div>`, 'Generar')) return;
  const gen = [...(c.generados || [])];
  let numero = Math.max(0, ...(X.S.d.compras || []).filter(x => x.tipo === 'DS').map(x => Number(x.numero) || 0)) + 1;
  try {
    for (const a of arm) {
      const tt = totalesCompra(a.compra.lineas, a.compra);
      const g = await X.store.save('compras', { ...a.compra, ...tt, numero: numero++, estado: 'contabilizado' });
      gen.push({ tercero_id: a.v.tercero_id, compra_id: g.id, numero: g.numero });
      await guardarVarios('op_registros', a.v.registros.map(r => ({ id: r.id, cierre_pago: g.id })));
      const tr = terc(a.v.tercero_id); if (tr && !tr.es_proveedor) { try { await X.store.save('terceros', { id: tr.id, es_proveedor: true }); } catch (_) { /* sin permiso */ } }
      if (c.id) await X.store.save('op_cortes', { id: c.id, generados: gen });
    }
    await X.cargarEmpresa(); X.toast(arm.length === 1 ? "Documento soporte generado y contabilizado." : `${arm.length} documentos soporte generados y contabilizados.`); X.route();
  } catch (e) { await X.cargarEmpresa(); X.fail(faltaSql(e)); X.route(); }
}

/* ---------- Facturar (cobro al cliente) ---------- */
// Junta las horas sin facturar de un rango de fechas: una factura en borrador por cotización (o por cliente con tarifa de cobro).
// El rango es libre: no depende de los cortes de programación (se puede programar cada semana y facturar cada quince días).
const filtrosFac = {};
const docVenta = id => (X.S.d.documentos || []).find(d => d.id === id);
// Una línea de una sola vez ya se facturó si su factura existe y no está anulada (si se elimina o anula, vuelve a salir).
const fijoPendiente = (cot, i) => { const f = cot.lineas?.[i]?.facturado, d = f && docVenta(f); return !d || d.estado === 'anulado'; };
export function vOpFacturar(m, id, q) {
  const t = tipoById(id); if (!t) { location.hash = '#/operacion'; return; }
  const { esc, money } = X, cfg = cfgTipo(t), todos = registrosDe(t);
  const sinFac = todos.filter(r => !r.cierre_cobro).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const f = filtrosFac[id] = { desde: q?.get('desde') || filtrosFac[id]?.desde || sinFac[0]?.fecha || mesActual(), hasta: q?.get('hasta') || filtrosFac[id]?.hasta || X.hoy(), cot: q?.has('cot') ? q.get('cot') : filtrosFac[id]?.cot || '' };
  const cotsT = (X.S.d.cotizaciones || []).filter(c => c.op_tipo_id === t.id);
  const regs = sinFac.filter(r => r.fecha >= f.desde && r.fecha <= f.hasta);
  const res = facturables(regs, t, { cotizaciones: X.S.d.cotizaciones || [], tarifas: tarifasDe(t), ...ctxCC(), productos: X.S.d.productos || [], fijoPendiente });
  const grupos = res.grupos.filter(g => !f.cot || g.cotizacion?.id === f.cot).sort((a, b) => nomT(a.tercero_id).localeCompare(nomT(b.tercero_id)));
  const periodo = perTxt(f);
  // Facturas ya hechas desde Operación (para ver su estado y liberar las que se anularon o eliminaron).
  const porDoc = new Map(); for (const r of todos.filter(r => r.cierre_cobro)) porDoc.set(r.cierre_cobro, [...(porDoc.get(r.cierre_cobro) || []), r]);
  const hechas = [...porDoc.entries()].map(([did, rs]) => ({ id: did, doc: docVenta(did), regs: rs })).sort((a, b) => String(b.doc?.fecha || '').localeCompare(String(a.doc?.fecha || '')));
  const nomDoc = d => d ? (d.estado === 'borrador' ? 'Factura en borrador' : `Factura ${d.prefijo || ''}${d.numero || ''}`) : 'Factura eliminada';
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/oprecibos">← Recibos</a><h2>Facturar</h2><p class="sub">Junta lo registrado y aún no facturado en las fechas que escojas. Cada cotización arma su factura en borrador; la revisas y la envías a la DIAN desde Ventas.</p></div><a class="btn ghost" href="#/cotizaciones">Cotizaciones</a></header>
  ${cfg.salidas.cobro !== 'fv' ? `<section class="panel callout">Este tipo no está configurado para facturar. Actívalo en <a href="#/opcfg/${t.id}">Configurar › Salidas</a> (Cobro al cliente: Factura de venta).</section>` : ''}
  <section class="panel row op-filtros"><div><label for="fcD">Desde</label><input type="date" id="fcD" value="${f.desde}"></div><div><label for="fcH">Hasta</label><input type="date" id="fcH" value="${f.hasta}"></div>
    <div><label for="fcC">Cotización</label><select id="fcC"><option value="">Todas</option>${cotsT.map(c => `<option value="${c.id}" ${c.id === f.cot ? 'selected' : ''}>N.º ${c.numero} · ${esc(nomT(c.tercero_id))}${cotizacionVigente(c) ? '' : ' (' + c.estado + ')'}</option>`).join('')}</select></div></section>
  ${grupos.map((g, gi) => `<section class="panel stack op-fac"><header class="vhead"><div><h3>${esc(nomT(g.tercero_id))}</h3><p class="hint">${g.cotizacion ? `<a href="#/cotizacion/${g.cotizacion.id}">Cotización N.º ${g.cotizacion.numero}</a>` : 'Tarifa de cobro'} · ${g.registros.length} registro${g.registros.length === 1 ? '' : 's'} del ${X.fFecha(g.desde)} al ${X.fFecha(g.hasta)}</p></div><button class="primary" data-g="${gi}" ${cfg.salidas.cobro === 'fv' && g.total > 0 ? '' : 'disabled'}>Crear factura en borrador</button></header>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Descripción</th><th class="r">Cantidad</th><th class="r">Precio</th><th class="r">IVA</th><th class="r">Valor</th></tr></thead><tbody>
    ${g.lineas.map(l => `<tr><td>${esc(l.descripcion)}${l.registros ? ` <span class="muted">· ${l.registros} reg.</span>` : l.fijo_i != null ? ' <span class="tag">Una vez</span>' : ''}</td><td class="r mono">${cant(l.cantidad, l.modo === 'unidad' ? cfg.unidad : '')}</td><td class="r mono">${money(l.precio)}</td><td class="r">${l.iva_pct} %</td><td class="r mono">${money(l.valor)}</td></tr>`).join('')}
    <tr class="strong"><td colspan="4">Subtotal (antes de IVA)</td><td class="r mono">${money(g.total)}</td></tr></tbody></table></div></section>`).join('') || `<section class="panel muted">${regs.length ? 'Ningún registro de estas fechas tiene precio de cobro.' : 'No hay registros sin facturar en estas fechas.'}</section>`}
  ${res.sinPrecio.length && !f.cot ? `<section class="panel stack"><h3>Sin precio de cobro (${res.sinPrecio.length})</h3><p class="hint">Crea una <a href="#/cotizacion/nueva">cotización</a> para esa obra o equipo, o una tarifa de cobro en <a href="#/opcfg/${t.id}">Configurar › Tarifas</a>. Mientras tanto quedan sin facturar.</p>
    <div class="tbl-wrap"><table class="tbl"><tbody>${res.sinPrecio.map(x => `<tr><td>${X.fFecha(x.registro.fecha)}</td><td>${esc(nomT(x.registro.tercero_id))}</td><td>${cfg.campos.filter(c => c.tipo === 'elemento').map(c => esc(elem(x.registro.datos?.[c.k])?.nombre || '')).filter(Boolean).join(' · ')}</td><td class="r mono">${cant(x.cantidad, cfg.unidad)}</td><td class="muted">${esc(x.motivo)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  ${hechas.length ? `<details class="panel"><summary>Facturas hechas desde aquí (${hechas.length})</summary><div class="tbl-wrap"><table class="tbl"><tbody>${hechas.map(h => `<tr><td>${h.doc ? `<a href="#/${h.doc.estado === 'borrador' ? 'editar' : 'doc'}/${h.id}">${esc(nomDoc(h.doc))}</a>` : esc(nomDoc(h.doc))}${h.doc?.estado === 'anulado' ? ' <span class="tag bad">Anulada</span>' : ''}</td><td>${esc(h.doc ? nomT(h.doc.tercero_id) : '')}</td><td>${h.regs.length} registros</td><td class="r mono">${h.doc ? money(h.doc.total) : ''}</td><td class="r">${!h.doc || h.doc.estado === 'anulado' ? `<button class="sm" data-lib="${h.id}">Liberar registros</button>` : ''}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
  const ir = () => { location.hash = `#/opfacturar/${t.id}?desde=${X.$('fcD').value}&hasta=${X.$('fcH').value}&cot=${X.$('fcC').value}`; };
  ['fcD', 'fcH', 'fcC'].forEach(k => X.$(k).onchange = ir);
  m.querySelectorAll('[data-g]').forEach(b => b.onclick = () => crearFactura(grupos[Number(b.dataset.g)], t, periodo));
  m.querySelectorAll('[data-lib]').forEach(b => b.onclick = async () => {
    try { await guardarVarios('op_registros', porDoc.get(b.dataset.lib).map(r => ({ id: r.id, cierre_cobro: null }))); await X.cargarEmpresa(); X.toast('Registros liberados: se pueden volver a facturar.'); X.route(); } catch (e) { X.fail(e); }
  });
}
async function crearFactura(g, t, periodo) {
  const { esc, money } = X, tr = terc(g.tercero_id); if (!tr) return X.toast('El cliente no existe.', true);
  const conCC = X.emp()?.contabilidad?.cc?.activo === true, contab = X.emp()?.contabilidad || {};
  const items = itemsDeGrupo(g, { periodo, conCC, bodega: X.bodegaVenta });
  const ret = { retefuente_pct: X.num(tr.retefuente_pct), reteiva_pct: X.num(tr.reteiva_pct), reteica_milaje: X.num(tr.reteica_milaje) };
  const { porTarifa: _p, ...tt } = totales(items, ret);
  const numFV = el => (X.S.d.numeraciones || []).some(x => x.tipo === 'FV' && x.activa && !!x.electronica === el);
  const electronica = contab.factura_normal !== true || (!numFV(false) && numFV(true));
  const plazo = Number(tr.plazo_dias) || 0;
  const doc = { empresa_id: X.S.eid, tipo: 'FV', fecha: X.hoy(), tercero_id: tr.id, forma_pago: plazo > 0 ? 'credito' : 'contado', vence: plazo > 0 ? X.sumarDias(X.hoy(), plazo) : null, medio_pago: 'transferencia', ref_id: null, concepto: '',
    observaciones: `${g.cotizacion ? `Cotización N.º ${g.cotizacion.numero} · ` : ''}${t.nombre} · ${periodo}`, anticipo: 0, electronica, ...ret, ...tt };
  if (!await X.confirmar('Crear factura en borrador', `Factura ${electronica ? 'electrónica' : 'normal'} para <b>${esc(tr.nombre)}</b> por ${money(tt.total)} (${items.length} línea${items.length === 1 ? '' : 's'}). Los ${g.registros.length} registros quedan facturados con ella. La revisas y la emites desde Ventas; si la eliminas, aquí puedes liberarlos.`, 'Crear borrador')) return;
  try {
    const d = await X.store.saveDoc(doc, items, []);
    await guardarVarios('op_registros', g.registros.map(r => ({ id: r.id, cierre_cobro: d.id })));
    const fijos = g.lineas.filter(l => l.fijo_i != null);
    // La factura queda anotada en la línea de la cotización (lineas es jsonb: no hace falta SQL nuevo).
    if (fijos.length && g.cotizacion) await X.store.save('cotizaciones', { id: g.cotizacion.id, lineas: g.cotizacion.lineas.map((l, i) => fijos.some(x => x.fijo_i === i) ? { ...l, facturado: d.id } : l) });
    await X.cargarEmpresa(); X.toast('Factura en borrador creada. Revísala y emítela.'); location.hash = '#/editar/' + d.id;
  } catch (e) { await X.cargarEmpresa(); X.fail(e); X.route(); }
}

/* ---------- Horas por cerrar ---------- */
// Lo que falta pagar y lo que falta facturar, por tipo de operación. Cada lado se cierra por separado.
let pcHasta = '', pcTipo = '';
const nReg = k => `${k} registro${k === 1 ? '' : 's'}`;
const diasDesde = f => Math.round((new Date(X.hoy() + 'T12:00:00') - new Date(f + 'T12:00:00')) / 864e5);
export function vOpPorCerrar(m) {
  const { esc, money } = X, hasta = pcHasta || X.hoy();
  // Un tipo cerrado sigue saliendo mientras le queden registros abiertos.
  const tipos = tiposOp().filter(t => (t.activo !== false || registrosDe(t).some(r => !estaCerrado(r, cfgTipo(t), corteDe(r)))) && (!pcTipo || t.id === pcTipo));
  const bloques = tipos.map(t => ({ t, cfg: cfgTipo(t), x: porCerrar(registrosDe(t), t, { hasta, tarifas: tarifasDe(t), cotizaciones: X.S.d.cotizaciones || [], ...ctxCC(), productos: X.S.d.productos || [] }) }));
  const viejo = f => { const d = diasDesde(f); return d > 15 ? ` <span class="tag bad" title="Registro más antiguo sin cerrar">${d} días</span>` : ''; };
  const bloque = ({ t, cfg, x }) => {
    if (!x.conPago && !x.conCobro) return `<section class="panel stack"><h3>${esc(t.nombre)}</h3><p class="hint">Este tipo no genera programación ni cobro (solo control). Cámbialo en <a href="#/opcfg/${t.id}">Configurar › Salidas</a>.</p></section>`;
    return `<section class="stack"><h3>${esc(t.nombre)}</h3>
    <div class="kpis">${x.conPago ? `<div class="kpi"><span>Falta programar</span><b>${money(x.pago.valor)}</b><small>${nReg(x.pago.registros)}</small></div>` : ''}${x.conCobro ? `<div class="kpi"><span>Falta facturar</span><b>${money(x.cobro.valor)}</b><small>${nReg(x.cobro.registros)}${x.cobro.sinPrecio.length ? ` · ${x.cobro.sinPrecio.length} sin precio` : ''}</small></div>` : ''}
      ${x.conPago && x.conCobro ? `<div class="kpi"><span>Programados sin facturar</span><b>${x.pagadoSinFacturar}</b><small>registros</small></div><div class="kpi"><span>Facturados sin programar</span><b>${x.facturadoSinPagar}</b><small>registros</small></div>` : ''}</div>
    <div class="op-pc">
    ${x.conPago ? `<section class="panel stack"><header class="vhead"><h3>Falta programar</h3><a class="btn sm" href="#/opprogramar">Programar</a></header><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(cfg.persona)}</th><th>Desde</th><th class="r">${esc(cfg.unidad || 'Cant.')}</th><th class="r">Valor</th></tr></thead><tbody>
      ${x.pago.personas.map(p => `<tr><td><b>${esc(nomT(p.tercero_id))}</b><br><small class="muted">${p.registros} reg.${p.enCorte ? ` · ${p.enCorte} en corte abierto` : ''}${p.pendientes ? ` · ${p.pendientes} sin soporte` : ''}</small></td><td class="nowrap">${X.fFecha(p.desde)}${viejo(p.desde)}</td><td class="r mono">${cant(p.cantidad)}</td><td class="r mono">${money(p.valor)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Todo programado.</td></tr>'}</tbody></table></div></section>` : ''}
    ${x.conCobro ? `<section class="panel stack"><header class="vhead"><h3>Falta facturar</h3><a class="btn sm" href="#/opfacturar/${t.id}?desde=${x.cobro.grupos.reduce((mn, g) => g.desde < mn ? g.desde : mn, hasta)}&hasta=${hasta}&cot=">Facturar</a></header><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>Desde</th><th class="r">${esc(cfg.unidad || 'Cant.')}</th><th class="r">Valor</th></tr></thead><tbody>
      ${x.cobro.grupos.sort((a, b) => b.total - a.total).map(g => `<tr><td><b>${esc(nomT(g.tercero_id))}</b><br><small class="muted">${g.cotizacion ? `Cotización N.º ${g.cotizacion.numero}` : 'Tarifa de cobro'} · ${g.registros.length} reg.</small></td><td class="nowrap">${X.fFecha(g.desde)}${viejo(g.desde)}</td><td class="r mono">${cant(g.cantidad)}</td><td class="r mono">${money(g.total)}</td></tr>`).join('')}
      ${x.cobro.sinPrecio.length ? `<tr><td colspan="2"><span class="tag demo">Sin precio de cobro</span> <small class="muted">crea una cotización o una tarifa de cobro</small></td><td class="r mono">${cant(x.cobro.sinPrecio.reduce((s, y) => s + y.cantidad, 0))}</td><td class="r muted">${x.cobro.sinPrecio.length} reg.</td></tr>` : ''}
      ${!x.cobro.grupos.length && !x.cobro.sinPrecio.length ? '<tr><td colspan="4" class="muted">Todo facturado.</td></tr>' : ''}</tbody></table></div></section>` : ''}
    </div></section>`;
  };
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/oprecibos">← Recibos</a><h2>Horas por cerrar</h2><p class="sub">Lo registrado que todavía no se ha programado a la persona (documento soporte) o no se ha facturado al cliente. Los valores son estimados con las tarifas y cotizaciones vigentes.</p></div></header>
  <section class="panel row op-filtros"><div><label for="pcH">Registrado hasta</label><input type="date" id="pcH" value="${hasta}"></div>${tiposOp().length > 1 ? `<div><label for="pcT">Tipo</label><select id="pcT"><option value="">Todos</option>${tiposOp().map(t => `<option value="${t.id}" ${t.id === pcTipo ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></div>` : ''}</section>
  ${bloques.map(bloque).join('') || '<p class="muted">No hay tipos de operación activos.</p>'}`;
  X.$('pcH').onchange = e => { pcHasta = e.target.value; vOpPorCerrar(m); };
  if (X.$('pcT')) X.$('pcT').onchange = e => { pcTipo = e.target.value; vOpPorCerrar(m); };
}

/* ---------- Impresión ---------- */
export function hojaVolante(v, c, t) {
  const { esc, money } = X, cfg = cfgTipo(t), tr = terc(v.tercero_id);
  const els = cfg.campos.filter(f => f.tipo === 'elemento').map(f => [f.nombre, [...new Set(v.registros.map(r => elem(r.datos?.[f.k])?.nombre).filter(Boolean))].join(', ')]).filter(x => x[1]);
  const cols = cfg.campos.filter(f => !['elemento'].includes(f.tipo));
  const celda = (r, f) => { const x = r.datos?.[f.k]; return f.tipo === 'lectura' ? (x && x.ini !== '' && x.ini != null ? `${cant(x.ini)} – ${cant(x.fin)}` : '—') : f.tipo === 'sino' ? (x ? 'Sí' : '') : esc(x ?? ''); };
  return `<article class="desprendible op-vol">${X.cabInforme('Programación de horas', `${esc(cfg.salidas.titulo || 'Horas adicionales')}<br><small>Corte ${perTxt(c)}</small>`)}
    <div class="grid2"><div><b>${esc(cfg.persona.toUpperCase())}</b><br>${esc(tr?.nombre || '')}<br><span class="muted">${esc(X.docId(tr))}</span></div><div>${els.map(([k, val]) => `<b>${esc(k)}:</b> ${esc(val)}`).join('<br>')}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Día</th>${cols.map(f => `<th>${esc(f.nombre)}</th>`).join('')}<th class="r">${esc(cfg.unidad || 'Cant.')}</th><th class="r">Valor</th></tr></thead><tbody>
    ${v.registros.filter(r => !r.cargo).map(r => `<tr${r.dia === 'domingo' || r.dia === 'festivo' ? ' class="op-fest"' : ''}><td class="nowrap">${r.fecha.slice(8)}/${r.fecha.slice(5, 7)}</td>${r.ajuste ? `<td colspan="${cols.length + 1}"><b>Ajuste de horas</b>${r.nota ? ' · ' + esc(r.nota) : ''}</td>` : `<td>${NOMBRE_DIA[r.dia] || ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date(r.fecha + 'T12:00:00').getDay()]}</td>${cols.map(f => `<td>${celda(r, f)}</td>`).join('')}`}<td class="r mono">${cant(r.pagadas)}${r.standby ? `<br><small>incl. ${cant(r.standby)} stand by</small>` : ''}</td><td class="r mono">${r.fijo ? 'Pago fijo' : money(r.valor)}</td></tr>`).join('')}
    ${v.lineas.map(l => `<tr class="strong"><td colspan="${cols.length + 2}">${esc(l.detalle)}</td><td class="r mono">${l.cargo ? '' : cant(l.cantidad)}</td><td class="r mono">${money(l.valor)}</td></tr>`).join('')}</tbody></table></div>
    <dl class="tot"><dt class="strong">Total programado</dt><dd class="mono big">${money(v.total)}</dd></dl><p class="hint letras">${enLetras(v.total)}</p>
    ${v.registros.filter(r => r.nota && !r.ajuste).map(r => `<p class="hint">• ${r.fecha.slice(8)}/${r.fecha.slice(5, 7)}: ${esc(r.nota)}</p>`).join('')}
    <div class="firmas"><span>${esc(X.emp().nombre)}</span><span>Recibí conforme · ${esc(tr?.nombre || '')}</span></div></article>`;
}
export function hojaResumen(vs, c, t) {
  const { esc, money } = X, cfg = cfgTipo(t), total = vs.reduce((s, v) => s + v.total, 0);
  return `<article class="desprendible">${X.cabInforme('Resumen de programación', `${esc(cfg.salidas.titulo || t.nombre)}<br><small>Corte ${perTxt(c)} · ${vs.length} volantes</small>`)}
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>${esc(cfg.persona)}</th><th>Concepto</th><th class="r">Valor programado</th></tr></thead><tbody>
    ${vs.map((v, i) => `<tr><td>${i + 1}</td><td>${esc(nomT(v.tercero_id))}</td><td>${v.lineas.map(l => esc(l.detalle)).join(' + ')}</td><td class="r mono">${money(v.total)}</td></tr>`).join('')}
    <tr class="strong"><td colspan="3">Total</td><td class="r mono">${money(total)}</td></tr></tbody></table></div><p class="hint letras">${enLetras(total)}</p></article>`;
}
