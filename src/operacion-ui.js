// Pantallas de Operación (módulo opcional por empresa). La lógica está en operacion.js; aquí solo se pinta y se guarda.
// main.js entrega sus utilidades con iniciarOperacion(ctx) para no duplicarlas.
import { TIPOS_CAMPO, MODOS_TARIFA, USOS_TARIFA, CUANDO, SALIDAS_PAGO, SALIDAS_COBRO, PLANTILLAS, nuevoTipo, cfgTipo, calcular, resumen, avisos, erroresTipo, erroresRegistro, erroresTarifa, ultimaLectura, claveDe, diaDe, NOMBRE_DIA, compilar } from './operacion.js';

let X = null; // { S, store, $, esc, money, num, fFecha, hoy, sumarDias, opts, dialogo, pie, confirmar, campo, campoSel, check, toast, fail, cargarEmpresa, route, guardarContab, emp }
export const iniciarOperacion = ctx => { X = ctx; };

/* ---------- Datos ---------- */
export const operacionActiva = () => X?.emp()?.contabilidad?.operacion?.activo === true;
export const tiposOp = () => [...(X?.S.d?.op_tipos || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre));
const tipoById = id => (X.S.d.op_tipos || []).find(t => t.id === id);
const elementosDe = (tipo, lista, todos) => (X.S.d.op_elementos || []).filter(e => e.tipo_id === tipo.id && e.lista === lista && (todos || e.activo !== false)).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)) || a.nombre.localeCompare(b.nombre));
const tarifasDe = tipo => (X.S.d.op_tarifas || []).filter(t => t.tipo_id === tipo.id);
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
  if (!operacionActiva()) {
    m.innerHTML = `<header class="vhead"><div><h2>Operación</h2><p class="sub">Registros operativos que no afectan la contabilidad hasta que generes un documento.</p></div></header>
    <section class="panel callout stack"><b>Operación está apagada para esta empresa.</b><p>Es opcional: actívala si quieres llevar aquí horas máquina, viajes, jornales u otros registros de tu operación y después usarlos para tus documentos.</p>
    <div class="row"><button class="primary" id="opOn">Activar Operación</button></div></section>`;
    X.$('opOn').onclick = async () => { try { await X.guardarContab('operacion', { ...(X.emp()?.contabilidad?.operacion || {}), activo: true }); X.toast('Operación activada. Escoge una plantilla para empezar.'); X.route(); } catch (e) { X.fail(e); } };
    return;
  }
  const tipos = tiposOp(), desde = mesActual(), hasta = X.hoy();
  const tarjeta = t => {
    const c = cfgTipo(t), regs = registrosDe(t).filter(r => r.fecha >= desde && r.fecha <= hasta), tar = tarifasDe(t);
    const res = resumen(regs, t, tar), total = res.reduce((s, p) => s + p.total, 0), q = res.reduce((s, p) => s + p.cantidad, 0);
    const av = avisos(regs, t, tar).length, nl = c.listas.map(l => `${elementosDe(t, l.k).length} ${esc(l.nombre.toLowerCase())}`).join(' · ');
    return `<article class="op-card${t.activo === false ? ' off' : ''}">${icono(PLANTILLAS[t.plantilla]?.icono)}<h3>${esc(t.nombre)}${t.activo === false ? ' <span class="tag">Pausado</span>' : ''}</h3>
      <p class="hint">${nl || 'Sin listas'}</p>
      <div class="op-mini"><span><b>${cant(q, c.unidad)}</b> este mes</span><span><b>${money(total)}</b> por pagar</span>${av ? `<span class="tag demo">${av} aviso${av === 1 ? '' : 's'}</span>` : ''}</div>
      <div class="row"><a class="btn primary" href="#/opregistros/${t.id}">Registrar</a><a class="btn" href="#/opcfg/${t.id}">Configurar</a></div></article>`;
  };
  m.innerHTML = `<header class="vhead"><div><h2>Operación</h2><p class="sub">Registros operativos que no afectan la contabilidad hasta que generes un documento. Cada tipo se arma a la medida de la empresa.</p></div>
    <a class="btn ghost" href="#/config">Apagar o encender en Configuración</a></header>
  ${tipos.length ? `<div class="op-cards">${tipos.map(tarjeta).join('')}</div>` : '<p class="muted">Todavía no hay tipos de operación. Empieza con una plantilla o desde cero.</p>'}
  <section class="stack"><h3>Agregar un tipo de operación</h3><div class="op-cards">${Object.entries(PLANTILLAS).map(([k, p]) => `<article class="op-card dash">${icono(p.icono)}<h3>${esc(p.nombre)}</h3><p class="hint">${esc(p.descripcion)}</p><div class="row"><button data-pl="${k}">${k === 'libre' ? 'Crear' : 'Usar plantilla'}</button></div></article>`).join('')}</div>
  <p class="hint">Las plantillas son un punto de partida: después cambias campos, fórmulas, tarifas y reglas en Configurar.</p></section>`;
  m.querySelectorAll('[data-pl]').forEach(b => b.onclick = async () => {
    try { const t = await guardar('op_tipos', { ...nuevoTipo(b.dataset.pl, X.S.eid), orden: tipos.length + 1 }); X.toast('Tipo de operación creado. Revisa listas y tarifas.'); location.hash = '#/opcfg/' + t.id; } catch (e) { X.fail(e); }
  });
}

/* ---------- Configurar un tipo ---------- */
const TABS = [['general', 'General'], ['listas', 'Listas'], ['campos', 'Campos'], ['calculo', 'Fórmulas y reglas'], ['tarifas', 'Tarifas'], ['salidas', 'Salidas']];
let tabCfg = 'general';
async function guardarCfg(t, cambios, msg = 'Guardado.') {
  const nuevo = { ...t, ...cambios, config: { ...cfgTipo(t), ...(cambios.config || {}) } };
  const errs = erroresTipo(nuevo); if (errs.length) throw new Error(errs.join(' '));
  await guardar('op_tipos', { id: t.id, nombre: nuevo.nombre, activo: nuevo.activo !== false, config: nuevo.config }); X.toast(msg); X.route();
}
export function vOpCfg(m, id) {
  const t = tipoById(id); if (!t) { location.hash = '#/operacion'; return; }
  const { esc } = X, c = cfgTipo(t);
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/operacion">← Operación</a><h2>Configurar · ${esc(t.nombre)}</h2><p class="sub">Todo es de esta empresa: cambia lo que necesites, no afecta a las demás.</p></div><a class="btn primary" href="#/opregistros/${t.id}">Ir a registrar</a></header>
  <div class="seg op-tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tabCfg === k}">${n}</button>`).join('')}</div><div id="opTab"></div>`;
  m.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tabCfg = b.dataset.tab; vOpCfg(m, id); });
  const box = X.$('opTab');
  ({ general: tabGeneral, listas: tabListas, campos: tabCampos, calculo: tabCalculo, tarifas: tabTarifas, salidas: tabSalidas }[tabCfg] || tabGeneral)(box, t, c);
}
const selCampos = (c, tipos, sel, vacio) => `<option value="">${vacio}</option>${c.campos.filter(f => tipos.includes(f.tipo)).map(f => `<option value="${f.k}" ${f.k === sel ? 'selected' : ''}>${X.esc(f.nombre)}</option>`).join('')}`;
function tabGeneral(box, t, c) {
  const { esc } = X, pend = c.pendiente?.campo ? c.campos.find(f => f.k === c.pendiente.campo) : null;
  box.innerHTML = `<form class="panel stack" id="opG">
    <div class="grid3">${X.campo('nombre', 'Nombre del tipo', t.nombre, 'required maxlength="60"')}${X.campo('persona', 'Quién trabaja (cómo se llama)', c.persona, 'maxlength="30" placeholder="Operador, Conductor…"')}${X.campo('unidad', 'Unidad', c.unidad, 'maxlength="12" placeholder="h, viajes, kg"')}</div>
    ${X.check('editar_pagadas', 'Se pueden pagar cantidades distintas a las de la fórmula (con nota)', c.editar_pagadas)}
    <div class="grid2"><div><label for="f_cl">Controlar que las lecturas empaten</label><select id="f_cl" name="cont_lectura">${selCampos(c, ['lectura'], c.continuidad?.lectura, 'No controlar')}</select></div>
      <div><label for="f_cp">… por cada</label><select id="f_cp" name="cont_por">${selCampos(c, ['elemento'], c.continuidad?.por, 'Escoge la lista')}</select></div></div>
    <div class="grid2"><div><label for="f_pc">Soporte pendiente según el campo</label><select id="f_pc" name="pend_campo">${selCampos(c, ['lista'], c.pendiente?.campo, 'No avisar')}</select></div>
      <div><label>Valores que cuentan como pendiente</label><div class="row" id="opPV">${(pend?.opciones || []).map(o => `<label class="check"><input type="checkbox" name="pend_val" value="${esc(o)}" ${(c.pendiente?.valores || []).includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('') || '<span class="hint">Escoge primero el campo y guarda.</span>'}</div></div></div>
    ${X.check('activo', 'Activo (si lo pausas no aparece en el menú)', t.activo !== false)}
    <div class="row end"><button type="button" class="ghost" id="opDel">Eliminar este tipo</button><button class="primary">Guardar</button></div></form>`;
  X.$('opG').onsubmit = async ev => {
    ev.preventDefault(); const fd = new FormData(ev.target);
    const cl = fd.get('cont_lectura'), cp = fd.get('cont_por'), pc = fd.get('pend_campo');
    try { await guardarCfg(t, { nombre: String(fd.get('nombre')).trim(), activo: fd.get('activo') === 'on', config: { persona: String(fd.get('persona')).trim() || 'Persona', unidad: String(fd.get('unidad')).trim(), editar_pagadas: fd.get('editar_pagadas') === 'on',
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
function tabCalculo(box, t, c) {
  const { esc } = X, cuandoN = k => CUANDO.find(x => x[0] === k)?.[1] || k;
  const vars = [...c.campos.filter(f => ['numero', 'lectura', 'sino'].includes(f.tipo)).map(f => [f.k, f.nombre]), ...c.constantes.map(k => [k.k, k.nombre])];
  box.innerHTML = `<form class="panel stack" id="opF"><h3>Fórmulas</h3>
    <div class="grid2">${X.campo('cantidad', `Cantidad (${esc(c.unidad)})`, c.formulas.cantidad, 'required class="mono" placeholder="horometro"')}${X.campo('valor', 'Valor a pagar con tarifa por unidad', c.formulas.valor, 'required class="mono" placeholder="pagadas * tarifa"')}</div>
    <p class="hint">Variables: ${vars.map(([k, nn]) => `<span class="mono">${k}</span> (${esc(nn)})`).join(', ') || 'ninguna todavía'}${vars.length ? ', ' : ''}<span class="mono">cantidad</span>, <span class="mono">pagadas</span> y <span class="mono">tarifa</span>. Funciones: min, max, redondear. Ejemplo: <span class="mono">max(pagadas, 8) * tarifa</span> cobra mínimo 8 horas.</p>
    <p class="hint">Con tarifa <b>por registro</b> el valor es la tarifa; con tarifa <b>fija por corte</b> se paga una vez el valor fijo.</p>
    <div class="row end"><button class="primary">Guardar fórmulas</button></div></form>
  <section class="panel stack"><header class="vhead"><div><h3>Constantes</h3><p class="hint">Valores que usas en las fórmulas y cambias en un solo lugar, como el salario base del recargo.</p></div><button class="sm" id="opNK">Nueva constante</button></header>
    ${c.constantes.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${c.constantes.map((k, i) => `<tr><td><b>${esc(k.nombre)}</b></td><td class="mono">${k.k}</td><td class="r mono">${cant(k.valor)}</td><td class="r nowrap"><button class="sm" data-ek="${i}">Editar</button><button class="sm ghost" data-qk="${i}">Quitar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin constantes.</p>'}</section>
  <section class="panel stack"><header class="vhead"><div><h3>Reglas de día y recargos</h3><p class="hint">Se suman al valor cuando se cumple la condición. Los festivos salen del calendario de Colombia.</p></div><button class="sm" id="opNR">Nueva regla</button></header>
    ${c.reglas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Regla</th><th>Cuándo</th><th>Fórmula</th><th>A quién</th><th></th></tr></thead><tbody>${c.reglas.map((g, i) => `<tr><td><b>${esc(g.nombre)}</b></td><td>${esc(cuandoN(g.cuando))}</td><td class="mono">${esc(g.formula)}</td><td>${g.terceros?.length ? g.terceros.map(id => esc(nomT(id))).join(', ') : 'Todos'}</td><td class="r nowrap"><button class="sm" data-er="${i}">Editar</button><button class="sm ghost" data-qr="${i}">Quitar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin reglas.</p>'}</section>`;
  X.$('opF').onsubmit = async ev => { ev.preventDefault(); const fd = new FormData(ev.target); try { await guardarCfg(t, { config: { formulas: { cantidad: String(fd.get('cantidad')).trim(), valor: String(fd.get('valor')).trim() } } }, 'Fórmulas guardadas.'); } catch (e) { X.fail(e); } };
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
function tabTarifas(box, t, c) {
  const { esc, money } = X, tar = tarifasDe(t).sort((a, b) => (a.uso || '').localeCompare(b.uso || '') || String(b.desde || '').localeCompare(String(a.desde || '')));
  const servicios = X.S.d.productos.filter(p => p.activo !== false && (p.tipo || 'producto') === 'servicio');
  const criterios = ['tercero', ...c.campos.filter(f => ['elemento', 'lista'].includes(f.tipo)).map(f => f.k)];
  const modoN = k => MODOS_TARIFA.find(x => x[0] === k)?.[1] || k;
  const aplica = x => Object.entries(x.criterios || {}).filter(([, v]) => v).map(([k, v]) => `${esc(nombreCrit(c, k))}: <b>${esc(valorCrit(c, k, v))}</b>`).join(' · ') || 'Todos';
  box.innerHTML = `<form class="panel stack" id="opTP"><h3>De qué depende el precio</h3><div class="row">${criterios.map(k => `<label class="check"><input type="checkbox" name="por" value="${k}" ${c.tarifa_por.includes(k) ? 'checked' : ''}> ${esc(nombreCrit(c, k))}</label>`).join('')}</div>
    <p class="hint">Gana la tarifa más específica: si hay una para la persona en una obra y otra solo para la persona, en esa obra se usa la primera.</p><div class="row end"><button class="sm">Guardar</button></div></form>
  <section class="panel stack"><header class="vhead"><h3>Tarifas</h3><button class="primary sm" id="opNT">Nueva tarifa</button></header>
    ${tar.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Uso</th><th>Aplica a</th><th>Modo</th><th class="r">Valor</th><th>Vigencia</th><th>Ítem de servicio</th><th></th></tr></thead><tbody>
    ${tar.map(x => `<tr><td><span class="tag ${x.uso === 'cobro' ? 'el' : 'ok'}">${x.uso === 'cobro' ? 'Cobro' : 'Pago'}</span></td><td>${aplica(x)}</td><td>${esc(modoN(x.modo))}</td><td class="r mono">${money(x.valor)}</td><td class="hint">${x.desde ? X.fFecha(x.desde) : 'Siempre'}${x.hasta ? ' – ' + X.fFecha(x.hasta) : ''}</td>
      <td>${esc(X.S.d.productos.find(p => p.id === x.producto_id)?.nombre || '')}</td><td class="r nowrap"><button class="sm" data-et="${x.id}">Editar</button><button class="sm ghost" data-bt="${x.id}">Borrar</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin tarifas. Sin tarifa, los registros quedan en $0 y salen como aviso.</p>'}
    <p class="hint">El <b>ítem de servicio</b> es el que cerrará el documento soporte (pago) o la factura (cobro). Créalo en Inventario › Productos y servicios como tipo servicio.</p></section>`;
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
  box.querySelectorAll('[data-et]').forEach(b => b.onclick = () => formT(tar.find(x => x.id === b.dataset.et)));
  box.querySelectorAll('[data-bt]').forEach(b => b.onclick = async () => { if (!await X.confirmar('Borrar tarifa', 'Los registros que la usaban toman la siguiente tarifa que aplique.', 'Borrar')) return; try { await borrar('op_tarifas', b.dataset.bt); X.toast('Tarifa borrada.'); X.route(); } catch (e) { X.fail(e); } });
}
function tabSalidas(box, t, c) {
  box.innerHTML = `<form class="panel stack" id="opS"><h3>Qué cierra cada registro</h3><p class="hint">Cada registro puede cerrarse dos veces, por separado: el pago a la persona y el cobro al cliente. Escoge lo que use esta empresa.</p>
    <div class="grid2">${X.campoSel('pago', 'Pago a la persona', SALIDAS_PAGO, c.salidas.pago)}${X.campoSel('cobro', 'Cobro al cliente', SALIDAS_COBRO, c.salidas.cobro)}</div>
    <p class="hint">Generar los documentos desde un corte llega en la siguiente entrega. Mientras tanto, el resumen de Registrar ya muestra cuánto se le paga a cada persona.</p>
    <div class="row end"><button class="primary">Guardar</button></div></form>`;
  X.$('opS').onsubmit = async ev => { ev.preventDefault(); const fd = new FormData(ev.target); try { await guardarCfg(t, { config: { salidas: { pago: fd.get('pago'), cobro: fd.get('cobro') } } }, 'Salidas guardadas.'); } catch (e) { X.fail(e); } };
}

/* ---------- Registrar ---------- */
const filtros = {};
export function vOpRegistros(m, id, q) {
  const t = tipoById(id); if (!t) { location.hash = '#/operacion'; return; }
  const { esc, money } = X, c = cfgTipo(t), tar = tarifasDe(t);
  const f = filtros[id] = { desde: q?.get('desde') || filtros[id]?.desde || mesActual(), hasta: q?.get('hasta') || filtros[id]?.hasta || X.hoy(), p: filtros[id]?.p || '' };
  const todos = registrosDe(t), regs = todos.filter(r => r.fecha >= f.desde && r.fecha <= f.hasta && (!f.p || r.tercero_id === f.p)).sort((a, b) => a.fecha.localeCompare(b.fecha) || nomT(a.tercero_id).localeCompare(nomT(b.tercero_id)));
  const calc = new Map(regs.map(r => [r.id, calcular(r, t, tar)])), res = resumen(regs, t, tar), av = avisos(regs, t, tar);
  const total = res.reduce((s, p) => s + p.total, 0), q2 = res.reduce((s, p) => s + p.cantidad, 0);
  const cols = c.campos;
  const celda = (r, fc) => { const v = r.datos?.[fc.k]; if (fc.tipo === 'elemento') return esc(elem(v)?.nombre || ''); if (fc.tipo === 'lectura') return v && v.ini !== '' && v.ini != null ? `<span class="mono">${cant(v.ini)} → ${cant(v.fin)}</span>` : '—'; if (fc.tipo === 'sino') return v ? 'Sí' : ''; return esc(v ?? ''); };
  const avDe = new Map(); for (const a of av) avDe.set(a.registro_id, [...(avDe.get(a.registro_id) || []), a.texto]);
  const linea = l => l.regla ? `${esc(l.regla)} · ${cant(l.cantidad, c.unidad)}` : !l.tarifa ? `Sin tarifa · ${cant(l.cantidad, c.unidad)}` : l.modo === 'fijo' ? `Pago fijo${l.tarifa.nota ? ' · ' + esc(l.tarifa.nota) : ''} · ${cant(l.cantidad, c.unidad)}` : l.modo === 'registro' ? `${l.registros} × ${money(l.tarifa.valor)}` : `${cant(l.cantidad, c.unidad)} × ${money(l.tarifa.valor)}`;
  m.innerHTML = `<header class="vhead"><div><a class="back" href="#/operacion">← Operación</a><h2>${esc(t.nombre)}</h2><p class="sub">Estos registros no generan movimientos contables.</p></div>
    <div class="row"><a class="btn ghost" href="#/opcfg/${t.id}">Configurar</a><button class="primary" id="opNuevo">+ Registro</button></div></header>
  <section class="panel row op-fil"><div><label for="opD">Desde</label><input type="date" id="opD" value="${f.desde}"></div><div><label for="opH">Hasta</label><input type="date" id="opH" value="${f.hasta}"></div>
    <div><label for="opP">${esc(c.persona)}</label><select id="opP"><option value="">Todos</option>${X.opts([...new Set(todos.map(r => r.tercero_id))].map(i => [i, nomT(i)]).sort((a, b) => a[1].localeCompare(b[1])), f.p)}</select></div></section>
  <div class="kpis"><div class="kpi"><span>Registros</span><b>${regs.length}</b></div><div class="kpi"><span>Cantidad pagada</span><b>${cant(q2, c.unidad)}</b></div><div class="kpi"><span>Por pagar</span><b>${money(total)}</b></div><div class="kpi ${av.length ? 'op-warn' : ''}"><span>Avisos</span><b>${av.length}</b></div></div>
  ${av.length ? `<section class="panel stack op-avisos"><h3>Para revisar</h3><ul>${av.map(a => `<li><button type="button" class="link" data-er="${a.registro_id}">${X.fFecha(a.fecha)} · ${esc(nomT(regs.find(r => r.id === a.registro_id)?.tercero_id))}</button> ${esc(a.texto)}</li>`).join('')}</ul></section>` : ''}
  <section class="panel stack"><div class="tbl-wrap"><table class="tbl op-reg"><thead><tr><th>Fecha</th><th>Día</th><th>${esc(c.persona)}</th>${cols.map(fc => `<th>${esc(fc.nombre)}</th>`).join('')}<th class="r">Cantidad</th>${c.editar_pagadas ? '<th class="r">Pagadas</th>' : ''}<th class="r">Valor</th><th></th></tr></thead><tbody>
    ${regs.map(r => { const k = calc.get(r.id), dia = NOMBRE_DIA[k.dia]; return `<tr class="${k.dia === 'domingo' || k.dia === 'festivo' ? 'op-fest' : ''}"><td class="nowrap">${X.fFecha(r.fecha)}</td><td>${dia ? `<span class="tag ${k.dia === 'sabado' ? '' : 'demo'}">${dia}</span>` : ''}</td><td>${esc(nomT(r.tercero_id))}${avDe.has(r.id) ? ` <span class="tag demo" title="${esc(avDe.get(r.id).join(' '))}">Revisar</span>` : ''}${r.nota ? `<br><small class="hint">${esc(r.nota)}</small>` : ''}</td>
      ${cols.map(fc => `<td>${celda(r, fc)}</td>`).join('')}<td class="r mono">${cant(k.cantidad)}</td>${c.editar_pagadas ? `<td class="r mono">${k.pagadas !== k.cantidad ? '<b>' + cant(k.pagadas) + '</b>' : cant(k.pagadas)}</td>` : ''}
      <td class="r mono">${k.fijo ? '<span class="hint">Pago fijo</span>' : money(k.valor)}${k.recargos.length ? `<br><small class="hint">incluye ${k.recargos.map(x => esc(x.nombre.toLowerCase())).join(', ')}</small>` : ''}</td>
      <td class="r nowrap">${r.cierre_pago || r.cierre_cobro ? '<span class="tag ok">Cerrado</span>' : `<button class="sm" data-er="${r.id}">Editar</button><button class="sm ghost" data-cr="${r.id}" title="Copiar para el día siguiente">Copiar</button><button class="sm ghost" data-br="${r.id}">Borrar</button>`}</td></tr>`; }).join('') || `<tr><td colspan="${6 + cols.length}" class="muted">No hay registros en estas fechas.</td></tr>`}</tbody></table></div></section>
  ${res.length ? `<section class="panel stack"><header class="vhead"><div><h3>Resumen por ${esc(c.persona.toLowerCase())}</h3><p class="hint">Lo que será el volante de cada persona en el corte.</p></div><b class="mono">${money(total)}</b></header>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${esc(c.persona)}</th><th>Concepto</th><th class="r">Valor</th></tr></thead><tbody>
    ${res.sort((a, b) => nomT(a.tercero_id).localeCompare(nomT(b.tercero_id))).map(p => p.lineas.map((l, i) => `<tr${i ? '' : ' class="op-p"'}><td>${i ? '' : `<b>${esc(nomT(p.tercero_id))}</b>`}</td><td>${linea(l)}</td><td class="r mono">${money(l.valor)}</td></tr>`).join('') + `<tr class="grp"><td></td><td>Total ${esc(nomT(p.tercero_id))}</td><td class="r mono"><b>${money(p.total)}</b></td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
  const filtrar = () => { filtros[id] = { desde: X.$('opD').value || f.desde, hasta: X.$('opH').value || f.hasta, p: X.$('opP').value }; vOpRegistros(m, id); };
  X.$('opD').onchange = X.$('opH').onchange = X.$('opP').onchange = filtrar;
  X.$('opNuevo').onclick = () => formRegistro(t, { fecha: X.hoy(), tercero_id: f.p || '', datos: {} });
  m.querySelectorAll('[data-er]').forEach(b => b.onclick = () => formRegistro(t, todos.find(r => r.id === b.dataset.er)));
  m.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => { const r = todos.find(x => x.id === b.dataset.cr), d = { ...r.datos };
    for (const fc of c.campos) if (fc.tipo === 'lectura') d[fc.k] = { ini: r.datos?.[fc.k]?.fin ?? '', fin: '' }; else if (!['elemento', 'lista'].includes(fc.tipo)) delete d[fc.k];
    formRegistro(t, { fecha: X.sumarDias(r.fecha, 1), tercero_id: r.tercero_id, datos: d }); });
  m.querySelectorAll('[data-br]').forEach(b => b.onclick = async () => { if (!await X.confirmar('Borrar registro', 'El registro se borra de Operación. No afecta la contabilidad.', 'Borrar')) return; try { await borrar('op_registros', b.dataset.br); X.toast('Registro borrado.'); X.route(); } catch (e) { X.fail(e); } });
}
function formRegistro(t, r) {
  const { esc } = X, c = cfgTipo(t), todos = registrosDe(t);
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
    const p = String(fd.get('pagadas') ?? '').trim();
    return { ...r, empresa_id: X.S.eid, tipo_id: t.id, fecha: fd.get('fecha'), tercero_id: fd.get('tercero_id') || null, datos: d, cantidad_pagada: c.editar_pagadas && p !== '' ? numIn(p) : null, nota: String(fd.get('nota') || '').trim() };
  };
  const f = X.dialogo(`<h2>${r.id ? 'Editar registro' : 'Nuevo registro'} · ${esc(t.nombre)}</h2>
    <div class="grid2">${X.campo('fecha', 'Fecha', r.fecha, 'type="date" required')}<div><label for="f_tercero_id">${esc(c.persona)} *</label><select id="f_tercero_id" name="tercero_id" required><option value="">Escoge…</option>${personas().map(p => `<option value="${p.id}" ${p.id === r.tercero_id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></div></div>
    <div class="grid2">${c.campos.map(input).join('')}</div>
    <p class="op-prev" id="opPrev"></p>
    <div class="grid2">${c.editar_pagadas ? X.campo('pagadas', `${c.unidad ? 'Cantidad' : 'Cantidad'} pagada (vacío = la de la fórmula)`, r.cantidad_pagada ?? '', 'class="mono" inputmode="decimal"') : ''}${X.campo('nota', 'Nota', r.nota || '', 'maxlength="300"')}</div>
    <p class="hint">Si la persona no aparece, créala en Terceros. Los registros no tocan la contabilidad.</p>${X.pie()}`, async (fd, btn) => {
    const row = leer(fd); delete row.creado_en;
    const errs = erroresRegistro(row, t); if (errs.length) throw new Error(errs.join(' '));
    await guardar('op_registros', row); X.toast('Registro guardado.'); X.route();
  }, { ancho: true });
  const prev = () => { try { const k = calcular({ ...leer(new FormData(f)), id: r.id || 'nuevo' }, t, tarifasDe(t)); X.$('opPrev').innerHTML = `${NOMBRE_DIA[diaDe(X.$('f_fecha').value)] ? `<span class="tag demo">${NOMBRE_DIA[diaDe(X.$('f_fecha').value)]}</span> ` : ''}Cantidad <b>${cant(k.cantidad, c.unidad)}</b>${k.pagadas !== k.cantidad ? ` · pagadas <b>${cant(k.pagadas)}</b>` : ''} · ${k.tarifa ? (k.fijo ? 'pago fijo del corte' : `valor <b>${X.money(k.valor)}</b>`) : '<span class="err">sin tarifa</span>'}`; } catch (_) { X.$('opPrev').textContent = ''; } };
  f.addEventListener('input', prev); f.addEventListener('change', prev); prev();
  // Lectura inicial sugerida: donde terminó el último registro del mismo elemento.
  const co = c.continuidad;
  if (co?.lectura && co?.por && f.querySelector(`[data-el="${co.por}"]`)) f.querySelector(`[data-el="${co.por}"]`).addEventListener('change', ev => {
    const ini = X.$(`f_d_${co.lectura}_ini`); if (!ini || ini.value) return;
    const u = ultimaLectura(todos.filter(x => x.id !== r.id), t, ev.target.value, X.$('f_fecha').value); if (u != null) { ini.value = String(u).replace('.', ','); prev(); }
  });
}
