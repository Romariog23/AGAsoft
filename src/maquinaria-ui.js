// Operación de maquinaria: seis pantallas (Recibos, Proyectos, Operadores, Máquinas, Programar, Facturar).
// Diseño aprobado por Romario el 2026-11-22: sin constructor genérico. Recibo = operador + proyecto (cotización) + máquina + horómetro;
// horas = final − inicial; valor = horas × valor hora del operador (+ recargo dominical y festivo si el operador lo tiene, + ajuste del proyecto).
// Por dentro usa las mismas tablas (op_tipos con un solo tipo de maquinaria, op_registros, op_tarifas, op_elementos, cotizaciones).
import { cfgTipo, calcular, avisos, ultimaLectura, erroresRegistro, nuevoTipo, configMaquinaria, volantes, avanceCotizacion, acumuladoMaquinas, estadoPM, horometroActual, pmBase, cotizacionPara, cotizacionVigente, nombreProyecto, ajustesDeCotizaciones, esCargo, esAjusteHoras, horasCliente, encadenar, quitarDeCadena, horometroInicialMaq, diaDe, NOMBRE_DIA } from './operacion.js';
import { operacionActiva, tiposOp, hojaVolante, hojaResumen, generarDS, ctxCC, escogerRecibos } from './operacion-ui.js';

let X = null;
export const iniciarMaquinaria = ctx => { X = ctx; };

/* ---------- Datos ---------- */
export const tipoMaq = () => { const ts = tiposOp().filter(t => t.activo !== false); return ts.find(t => t.plantilla === 'maquinaria') || ts[0] || tiposOp()[0] || null; };
const registrosDe = t => (X.S.d.op_registros || []).filter(r => r.tipo_id === t.id);
const recibosDe = t => registrosDe(t).filter(r => !esCargo(r));
const tarifasDe = t => [...(X.S.d.op_tarifas || []).filter(x => x.tipo_id === t.id), ...ajustesDeCotizaciones(X.S.d.cotizaciones, t.id)];
const proyectosDe = t => (X.S.d.cotizaciones || []).filter(c => c.op_tipo_id === t.id).sort((a, b) => b.numero - a.numero);
const elem = id => (X.S.d.op_elementos || []).find(e => e.id === id);
const maquinasDe = (t, todas) => (X.S.d.op_elementos || []).filter(e => e.tipo_id === t.id && e.lista === 'equipos' && (todas || e.activo !== false)).sort((a, b) => a.nombre.localeCompare(b.nombre));
const terc = id => X.S.d.terceros.find(x => x.id === id);
const nomT = id => terc(id)?.nombre || '—';
const personas = () => [...X.S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre));
const nomProy = c => c ? nombreProyecto(c, nomT, id => elem(id)?.nombre) : '';
const obraDe = c => elem(c?.criterios?.obra)?.nombre || '';
const cant = (v, u = '') => `${X.num(v).toLocaleString('es-CO', { maximumFractionDigits: 2 })}${u ? ' ' + u : ''}`;
const numIn = v => { const s = String(v ?? '').trim(); return !s.includes(',') && /^-?\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : X.num(s); };
const mesActual = () => X.hoy().slice(0, 8) + '01';
const nRec = n => `${n} recibo${n === 1 ? '' : 's'}`;
const faltaSql = e => /op_(tipos|elementos|tarifas|registros|cortes)|schema cache|does not exist/i.test(e?.message || '') ? new Error('Falta correr en Supabase el archivo supabase/037_operacion.sql.') : e;
async function guardar(tabla, row) { try { const r = await X.store.save(tabla, row); await X.cargarEmpresa(); return r; } catch (e) { throw faltaSql(e); } }
async function borrar(tabla, id) { try { await X.store.remove(tabla, id); await X.cargarEmpresa(); } catch (e) { throw faltaSql(e); } }
const docVenta = id => (X.S.d.documentos || []).find(d => d.id === id);
const compra = id => (X.S.d.compras || []).find(c => c.id === id);

// Valor hora vigente de un operador: la tarifa de programación que solo depende de la persona.
const esBase = x => (x.uso || 'pago') === 'pago' && (x.modo || 'unidad') === 'unidad' && x.criterios?.tercero && Object.entries(x.criterios).every(([k, v]) => k === 'tercero' || !v);
const valoresDe = t => (X.S.d.op_tarifas || []).filter(x => x.tipo_id === t.id && esBase(x));
const valorHora = (t, tid, f = X.hoy()) => valoresDe(t).filter(x => x.criterios.tercero === tid && (!x.desde || x.desde <= f) && (!x.hasta || x.hasta >= f)).sort((a, b) => String(b.desde || '').localeCompare(String(a.desde || '')))[0] || null;

// Comparación sin importar el orden de las claves (jsonb de Postgres las reordena).
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const igual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// El módulo trabaja sobre un solo tipo de maquinaria con la configuración fija. Lo crea si no existe y lo ajusta si quedó de antes.
async function asegurar() {
  let t = tipoMaq();
  if (!t) { const nt = nuevoTipo('maquinaria', X.S.eid); t = await guardar('op_tipos', { ...nt, nombre: 'Maquinaria', config: configMaquinaria(nt.config), orden: 1 }); return t; }
  const cfg = configMaquinaria(t.config);
  if (!igual(cfg, t.config || {})) { await guardar('op_tipos', { id: t.id, config: cfg }); t = tipoMaq(); }
  return t;
}
// Cada pantalla arranca así: si falta preparar el tipo, lo hace y vuelve a pintar.
function conTipo(m, pintar) {
  if (!operacionActiva()) { location.hash = '#/operacion'; return; }
  const t = tipoMaq();
  if (t && igual(configMaquinaria(t.config), t.config || {})) return pintar(t);
  m.innerHTML = '<p class="muted">Preparando Operación…</p>';
  asegurar().then(() => X.route()).catch(e => { m.innerHTML = `<section class="panel callout">${X.esc(e.message)}</section>`; });
}
const encabezado = (titulo, sub, acciones = '') => `<header class="vhead"><div><h2>${titulo}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${acciones ? `<div class="row">${acciones}</div>` : ''}</header>`;
const diaTag = f => { const d = diaDe(f); return d === 'domingo' || d === 'festivo' ? ` <span class="tag demo">${NOMBRE_DIA[d]}</span>` : ''; };

/* ---------- 1. Recibos ---------- */
const fr = {};
export function vRecibos(m, q) {
  conTipo(m, t => {
    const { esc, money } = X, tar = tarifasDe(t), cots = X.S.d.cotizaciones || [];
    const cerrado = r => !!r.cierre_pago && !!r.cierre_cobro;
    const todos = recibosDe(t);
    const desde0 = () => { const ab = todos.filter(r => !cerrado(r)).map(r => r.fecha).sort()[0]; return ab && ab < mesActual() ? ab : mesActual(); };
    Object.assign(fr, { e: fr.e || 'abiertos', desde: q?.get('desde') || fr.desde || desde0(), hasta: q?.get('hasta') || fr.hasta || X.hoy(), p: fr.p || '', cot: q?.get('cot') ?? fr.cot ?? '', maq: fr.maq || '' });
    const regs = todos.filter(r => r.fecha >= fr.desde && r.fecha <= fr.hasta && (!fr.p || r.tercero_id === fr.p) && (!fr.maq || r.datos?.equipo === fr.maq)
      && (!fr.cot || cotizacionPara(r, cots)?.id === fr.cot) && (fr.e === 'todos' || (fr.e === 'cerrados') === cerrado(r)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || nomT(a.tercero_id).localeCompare(nomT(b.tercero_id)));
    const calc = new Map(regs.map(r => [r.id, calcular(r, t, tar)]));
    const av = avisos(regs, t, tar).map(a => a.clase === 'tarifa' ? { ...a, texto: `${nomT(regs.find(r => r.id === a.registro_id)?.tercero_id)} no tiene valor hora: ponlo en Operadores.` } : a);
    const avDe = new Map(); for (const a of av) avDe.set(a.registro_id, [...(avDe.get(a.registro_id) || []), a.texto]);
    const horas = regs.reduce((s, r) => s + calc.get(r.id).cantidad, 0), valor = regs.reduce((s, r) => s + calc.get(r.id).valor, 0);
    const estado = r => `${r.cierre_pago ? '<span class="tag ok">Programado</span>' : '<span class="tag">Por programar</span>'}<br>${r.cierre_cobro ? `<span class="tag ok">Facturado</span>${r.datos?.acta ? `<br><small class="hint">Acta ${X.esc(r.datos.acta)}</small>` : ''}` : '<span class="tag">Por facturar</span>'}`;
    const editable = r => !r.cierre_pago && !r.cierre_cobro;
    const lect = r => { const h = r.datos?.horometro; return h && h.ini !== '' && h.ini != null ? `${cant(h.ini)} → ${cant(h.fin)}` : '—'; };
    m.innerHTML = encabezado('Recibos', 'Las horas máquina de cada operador. Cada recibo va con su proyecto y su máquina.', '<button class="primary" id="mqNuevo">+ Recibo</button>') + `
    <section class="panel row op-fil">
      <div><label for="rcE">Ver</label><select id="rcE">${X.opts([['abiertos', 'Abiertos (falta programar o facturar)'], ['cerrados', 'Cerrados (programados y facturados)'], ['todos', 'Todos']], fr.e)}</select></div>
      <div><label for="rcD">Desde</label><input type="date" id="rcD" value="${fr.desde}"></div><div><label for="rcH">Hasta</label><input type="date" id="rcH" value="${fr.hasta}"></div>
      <div><label for="rcP">Operador</label><select id="rcP"><option value="">Todos</option>${X.opts([...new Set(todos.map(r => r.tercero_id))].map(i => [i, nomT(i)]).sort((a, b) => a[1].localeCompare(b[1])), fr.p)}</select></div>
      <div><label for="rcC">Proyecto</label><select id="rcC"><option value="">Todos</option>${X.opts(proyectosDe(t).map(c => [c.id, `N.º ${c.numero} · ${obraDe(c) || nomT(c.tercero_id)}`]), fr.cot)}</select></div>
      <div><label for="rcM">Máquina</label><select id="rcM"><option value="">Todas</option>${X.opts(maquinasDe(t, true).map(e => [e.id, e.nombre]), fr.maq)}</select></div></section>
    <div class="kpis"><div class="kpi"><span>Recibos</span><b>${regs.length}</b></div><div class="kpi"><span>Horas</span><b>${cant(horas, 'h')}</b></div><div class="kpi"><span>Valor operadores</span><b>${money(valor)}</b></div><div class="kpi ${av.length ? 'op-warn' : ''}"><span>Para revisar</span><b>${av.length}</b></div></div>
    ${av.length ? `<section class="panel stack op-avisos"><h3>Para revisar</h3><ul>${av.map(a => `<li><button type="button" class="link" data-er="${a.registro_id}">${X.fFecha(a.fecha)} · ${esc(nomT(regs.find(r => r.id === a.registro_id)?.tercero_id))}</button> ${esc(a.texto)}${a.clase === 'tarifa' ? ' <a href="#/opoperadores">Ir a Operadores</a>' : ''}</li>`).join('')}</ul></section>` : ''}
    <section class="panel stack"><div class="tbl-wrap"><table class="tbl op-reg"><thead><tr><th>Fecha</th><th>Operador</th><th>Proyecto</th><th>Máquina y recibo</th><th>Horómetro</th><th class="r">Horas</th><th class="r">Valor</th><th>Estado</th><th></th></tr></thead><tbody>
    ${regs.map(r => { const k = calc.get(r.id), cot = cotizacionPara(r, cots); return `<tr class="${diaDe(r.fecha) === 'domingo' || diaDe(r.fecha) === 'festivo' ? 'op-fest' : ''}">
      <td class="nowrap">${X.fFecha(r.fecha)}${diaTag(r.fecha)}</td><td>${esc(nomT(r.tercero_id))}${avDe.has(r.id) ? ` <span class="tag demo" title="${esc(avDe.get(r.id).join(' '))}">Revisar</span>` : ''}${r.nota ? `<br><small class="hint">${esc(r.nota)}</small>` : ''}</td>
      <td>${cot ? `<span class="nowrap"><a href="#/cotizacion/${cot.id}">N.º ${cot.numero}</a> ${esc(obraDe(cot) || nomT(cot.tercero_id))}</span>` : '<span class="tag demo">Sin proyecto</span>'}</td>
      <td>${esc(elem(r.datos?.equipo)?.nombre || '')}${r.datos?.recibo ? `<br><small class="hint">Recibo ${esc(r.datos.recibo)}</small>` : ''}</td><td class="mono nowrap">${lect(r)}</td><td class="r mono">${cant(k.cantidad)}${k.noAceptadas || k.standby ? `<br><small class="hint" title="${esc([r.datos?.obs_cliente, r.datos?.obs_standby].filter(Boolean).join(' · '))}">Cliente ${cant(k.cobro)}${k.standby ? ` · ${cant(k.standby)} stand by` : ''}</small>` : ''}</td>
      <td class="r mono">${money(k.valor)}${k.recargos.length ? `<br><small class="hint">con recargo</small>` : ''}</td><td class="nowrap">${estado(r)}</td>
      <td class="r nowrap">${editable(r) ? `<button class="sm" data-er="${r.id}">Editar</button><button class="sm ghost" data-cr="${r.id}" title="Siguiente recibo de la misma máquina">Copiar</button><button class="sm ghost" data-br="${r.id}">Borrar</button>` : !r.cierre_cobro ? `<button class="sm ghost" data-hc="${r.id}" title="Horas que acepta el cliente y stand by">Horas cliente</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="9" class="muted">${fr.e === 'abiertos' ? 'No hay recibos abiertos en estas fechas.' : 'No hay recibos en estas fechas.'}</td></tr>`}</tbody></table></div></section>`;
    const filtrar = () => { Object.assign(fr, { e: X.$('rcE').value, desde: X.$('rcD').value || fr.desde, hasta: X.$('rcH').value || fr.hasta, p: X.$('rcP').value, cot: X.$('rcC').value, maq: X.$('rcM').value }); history.replaceState(null, '', '#/oprecibos'); vRecibos(m); };
    ['rcD', 'rcH', 'rcP', 'rcC', 'rcM'].forEach(k => { X.$(k).onchange = filtrar; });
    X.$('rcE').onchange = () => { fr.e = X.$('rcE').value; fr.desde = ''; history.replaceState(null, '', '#/oprecibos'); vRecibos(m); };
    X.$('mqNuevo').onclick = () => formRecibo(t, { fecha: X.hoy(), tercero_id: fr.p || '', cotizacion_id: fr.cot || '', datos: { equipo: fr.maq || '' } });
    m.querySelectorAll('[data-er]').forEach(b => b.onclick = () => { const r = todos.find(x => x.id === b.dataset.er); if (r) formRecibo(t, r); });
    m.querySelectorAll('[data-cr]').forEach(b => b.onclick = () => { const r = todos.find(x => x.id === b.dataset.cr);
      formRecibo(t, { fecha: X.sumarDias(r.fecha, 1), tercero_id: r.tercero_id, cotizacion_id: r.cotizacion_id, datos: { equipo: r.datos?.equipo, horometro: { ini: r.datos?.horometro?.fin ?? '', fin: '' } } }); });
    m.querySelectorAll('[data-hc]').forEach(b => b.onclick = () => { const r = todos.find(x => x.id === b.dataset.hc); if (r) formCliente(t, r); });
    m.querySelectorAll('[data-br]').forEach(b => b.onclick = async () => { const r = todos.find(x => x.id === b.dataset.br), q = quitarDeCadena(r, registrosDe(t), elem(r.datos?.equipo));
      if (q.errores.length) return X.toast(q.errores.join(' '), true);
      if (!await X.confirmar('Borrar recibo', `El recibo se borra. No afecta la contabilidad.${q.actualizar.length ? ` El recibo siguiente de esta máquina pasa a empezar en ${cant(q.actualizar[0].datos.horometro.ini)}.` : ''}`, 'Borrar')) return;
      try { for (const u of q.actualizar) await X.store.save('op_registros', u); await borrar('op_registros', b.dataset.br); X.toast('Recibo borrado.'); X.route(); } catch (e) { X.fail(e); } });
  });
}

// Recibo ya programado al operador (tiene documento soporte) pero aún sin facturar: solo se cambian las horas con el cliente.
function formCliente(t, r) {
  const { esc } = X, k = calcular(r, t, []);
  X.dialogo(`<h2>Horas con el cliente</h2><p class="hint">Recibo ${esc(r.datos?.recibo || '')} del ${X.fFecha(r.fecha)} · ${esc(nomT(r.tercero_id))} · ${cant(k.cantidad, 'h')} trabajadas.
      Este recibo ya está programado: el stand by que agregues aquí se factura al cliente, pero no entra al documento soporte ya hecho. Si hay que pagárselo al operador, usa <b>Ajustar horas</b> en Programar.</p>
    <div class="grid2">${X.campo('h_cliente', 'Horas que acepta el cliente (vacío = todas)', r.datos?.h_cliente ?? '', 'class="mono" inputmode="decimal"')}${X.campo('obs_cliente', 'Observación (por qué no las acepta)', r.datos?.obs_cliente || '', 'maxlength="300"')}</div>
    <div class="grid2">${X.campo('standby', 'Horas de stand by', r.datos?.standby ?? '', 'class="mono" inputmode="decimal"')}${X.campo('obs_standby', 'Observación del stand by', r.datos?.obs_standby || '', 'maxlength="300"')}</div>${X.pie('Guardar')}`, async fd => {
    const v = k => String(fd.get(k) ?? '').trim();
    const datos = { ...r.datos, h_cliente: v('h_cliente') === '' ? '' : numIn(v('h_cliente')), obs_cliente: v('obs_cliente'), standby: v('standby') === '' ? '' : numIn(v('standby')), obs_standby: v('obs_standby') };
    const errs = erroresRegistro({ ...r, datos }, t); if (errs.length) throw new Error(errs.join(' '));
    await guardar('op_registros', { id: r.id, datos }); X.toast('Horas con el cliente guardadas.'); X.route();
  });
}
function formRecibo(t, r) {
  const { esc, money } = X, cots = X.S.d.cotizaciones || [], tar = tarifasDe(t);
  const proys = proyectosDe(t).filter(c => cotizacionVigente(c) || c.id === r.cotizacion_id), maqs = maquinasDe(t).concat(r.datos?.equipo && !maquinasDe(t).some(e => e.id === r.datos.equipo) && elem(r.datos.equipo) ? [elem(r.datos.equipo)] : []);
  const h = r.datos?.horometro || {}, hcAbierto = (r.datos?.h_cliente ?? '') !== '' || Number(r.datos?.standby) > 0;
  const conValor = new Set(valoresDe(t).map(x => x.criterios.tercero));
  const ops = personas().sort((a, b) => (conValor.has(b.id) ? 1 : 0) - (conValor.has(a.id) ? 1 : 0) || a.nombre.localeCompare(b.nombre));
  const leer = fd => {
    const cot = proys.find(c => c.id === fd.get('cotizacion_id'));
    const fin = String(fd.get('fin') ?? '').trim(), maq = elem(fd.get('equipo')), base = { ...r, fecha: fd.get('fecha'), datos: { ...(r.datos || {}), equipo: fd.get('equipo') || '', horometro: { ini: '', fin: fin === '' ? '' : numIn(fin) } } };
    const enc = maq ? encadenar(base, registrosDe(t), maq) : { ini: null }, ini = enc.ini == null ? '' : String(enc.ini);
    const datos = { ...(r.datos || {}), ...(cot?.criterios || {}), equipo: fd.get('equipo') || '', recibo: String(fd.get('recibo') || '').trim(), horometro: { ini: ini === '' ? '' : Number(ini), fin: fin === '' ? '' : numIn(fin) },
      h_cliente: String(fd.get('h_cliente') ?? '').trim() === '' ? '' : numIn(fd.get('h_cliente')), obs_cliente: String(fd.get('obs_cliente') || '').trim(),
      standby: String(fd.get('standby') ?? '').trim() === '' ? '' : numIn(fd.get('standby')), obs_standby: String(fd.get('obs_standby') || '').trim() };
    return { ...r, empresa_id: X.S.eid, tipo_id: t.id, clase: 'registro', fecha: fd.get('fecha'), tercero_id: fd.get('tercero_id') || null, cotizacion_id: fd.get('cotizacion_id') || null, datos, cantidad_pagada: null, nota: String(fd.get('nota') || '').trim() };
  };
  const f = X.dialogo(`<h2>${r.id ? 'Editar recibo' : 'Nuevo recibo'}</h2>
    <div class="grid2">${X.campo('fecha', 'Fecha', r.fecha, 'type="date" required')}<div><label for="f_op">Operador *</label><select id="f_op" name="tercero_id" required><option value="">Escoge…</option>${ops.map(p => `<option value="${p.id}" ${p.id === r.tercero_id ? 'selected' : ''}>${esc(p.nombre)}${conValor.has(p.id) ? '' : ' (sin valor hora)'}</option>`).join('')}</select></div></div>
    ${proys.length ? `<div class="op-proy"><label for="f_cot">Proyecto *</label><select id="f_cot" name="cotizacion_id" required><option value="">Escoge el proyecto…</option>${proys.map(c => `<option value="${c.id}" ${c.id === r.cotizacion_id ? 'selected' : ''}>${esc(nomProy(c))}${cotizacionVigente(c) ? '' : ' (' + c.estado + ')'}</option>`).join('')}</select><p class="hint" id="mqInfo"></p></div>`
      : '<p class="callout">No hay proyectos abiertos. Crea la cotización del proyecto en <a href="#/cotizacion/nueva-maq">Proyectos › Nuevo proyecto</a>.</p>'}
    <div class="grid2"><div><label for="f_eq">Máquina *</label><select id="f_eq" name="equipo" required><option value="">Escoge…</option>${maqs.map(e => `<option value="${e.id}" ${e.id === r.datos?.equipo ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select>${maqs.length ? '' : '<p class="hint">No hay máquinas: agrégalas en <a href="#/opmaquinas">Máquinas</a>.</p>'}</div>
      ${X.campo('recibo', 'N.º de recibo', r.datos?.recibo || '', 'maxlength="40"')}</div>
    <div class="grid2">${X.campo('ini', 'Horómetro inicial (sale solo)', h.ini ?? '', 'class="mono" readonly tabindex="-1" title="Es el final del recibo anterior de esta máquina, o el horómetro inicial de la máquina si es el primero"')}${X.campo('fin', 'Horómetro final *', h.fin ?? '', 'class="mono" inputmode="decimal" required')}</div>
    <p class="hint err" id="mqIni"></p><p class="op-prev" id="mqPrev"></p>
    <details class="op-cli" ${hcAbierto ? 'open' : ''}><summary>Horas con el cliente: no aceptadas y stand by</summary>
      <p class="hint">Si el cliente no acepta todas las horas del recibo, escribe las que sí acepta y por qué. El stand by acordado se factura al precio de la cotización y se le paga al operador.</p>
      <div class="grid2">${X.campo('h_cliente', 'Horas que acepta el cliente (vacío = todas)', r.datos?.h_cliente ?? '', 'class="mono" inputmode="decimal"')}${X.campo('obs_cliente', 'Observación (por qué no las acepta)', r.datos?.obs_cliente || '', 'maxlength="300"')}</div>
      <div class="grid2">${X.campo('standby', 'Horas de stand by', r.datos?.standby ?? '', 'class="mono" inputmode="decimal"')}${X.campo('obs_standby', 'Observación del stand by', r.datos?.obs_standby || '', 'maxlength="300"')}</div></details>
    ${X.campo('nota', 'Nota (opcional)', r.nota || '', 'maxlength="300"')}${X.pie('Guardar recibo')}`, async fd => {
    const row = leer(fd); delete row.creado_en;
    if (!row.cotizacion_id) throw new Error('Escoge el proyecto del recibo.');
    const maq = elem(row.datos.equipo), enc = encadenar(row, registrosDe(t), maq);
    const errs = [...enc.errores, ...erroresRegistro(row, t)]; if (errs.length) throw new Error([...new Set(errs)].join(' '));
    await guardar('op_registros', row);
    for (const u of enc.actualizar) await X.store.save('op_registros', u);
    if (enc.actualizar.length) await X.cargarEmpresa();
    X.toast(enc.actualizar.length ? `Recibo guardado. El inicial del recibo siguiente quedó en ${cant(row.datos.horometro.fin)}.` : 'Recibo guardado.'); X.route();
  }, { ancho: true });
  const prev = () => {
    const el = X.$('mqPrev'); if (!el) return;
    const row = { ...leer(new FormData(f)), id: r.id || 'nuevo' }, k = calcular(row, t, tar), d = diaDe(row.fecha), v = valorHora(t, row.tercero_id, row.fecha);
    const cli = k.noAceptadas || k.standby ? `<br>Al cliente: <b>${cant(k.cobro, 'h')}</b>${k.noAceptadas ? ` (${cant(k.noAceptadas)} no aceptadas)` : ''}${k.standby ? ` (incluye ${cant(k.standby)} de stand by)` : ''}` : '';
    el.innerHTML = `${NOMBRE_DIA[d] && (d === 'domingo' || d === 'festivo') ? `<span class="tag demo">${NOMBRE_DIA[d]}</span> ` : ''}<b>${cant(k.cantidad, 'h')}</b>${row.tercero_id ? (v ? ` · ${esc(nomT(row.tercero_id))}: ${cant(k.pagadas)} × ${money(v.valor)}${k.recargos.length ? ' + ' + k.recargos.map(x => `${esc(x.nombre.toLowerCase())} ${money(x.valor)}`).join(' + ') : ''} = <b>${money(k.valor)}</b>` : ` · <span class="tag demo">Este operador no tiene valor hora</span>`) : ''}${cli}`;
  };
  const info = () => {
    const el = X.$('mqInfo'); if (!el) return; const cot = proys.find(c => c.id === X.$('f_cot').value);
    if (!cot) { el.textContent = ''; return; }
    const av = avanceCotizacion(cot, X.S.d.op_registros || [], t, cots).filter(x => x.horas && x.proyectado > 0);
    el.innerHTML = [`Factura a <b>${esc(nomT(cot.tercero_id))}</b>`, obraDe(cot) ? `Obra <b>${esc(obraDe(cot))}</b>` : '', ...av.map(x => `${esc(x.descripcion || 'Horas')}: ${cant(x.ejecutado)} de ${cant(x.proyectado, 'h')}${x.saldo <= 0 ? ' <span class="tag demo">Se acabaron: adiciona en el proyecto</span>' : ''}`)].filter(Boolean).join(' · ');
  };
  // Horómetro inicial: donde terminó el último recibo de esa máquina.
  const sugerir = () => { const ini = X.$('f_ini'); if (!ini) return; const maq = elem(X.$('f_eq').value);
    const enc = maq ? encadenar({ ...r, fecha: X.$('f_fecha')?.value || r.fecha, datos: { ...(r.datos || {}), equipo: maq.id, horometro: { ini: '', fin: '' } } }, registrosDe(t), maq) : { ini: null };
    ini.value = enc.ini == null ? '' : String(enc.ini).replace('.', ',');
    const aviso = X.$('mqIni'); if (aviso) aviso.innerHTML = maq && enc.ini == null ? `La máquina no tiene horómetro inicial: ponlo en <a href="#/opmaquinas">Máquinas › Editar</a>.` : ''; };
  X.$('f_eq').addEventListener('change', () => { sugerir(); prev(); });
  X.$('f_fecha')?.addEventListener('change', () => { sugerir(); prev(); });
  if (X.$('f_cot')) X.$('f_cot').addEventListener('change', info);
  f.addEventListener('input', prev); f.addEventListener('change', prev);
  sugerir(); info(); prev();
}

/* ---------- 2. Proyectos ---------- */
let fp = 'abiertos';
export function vProyectos(m) {
  conTipo(m, t => {
    const { esc, money } = X, todos = proyectosDe(t), regs = X.S.d.op_registros || [], cots = X.S.d.cotizaciones || [];
    const ls = todos.filter(c => fp === 'todos' || (fp === 'abiertos') === cotizacionVigente(c));
    const fila = c => {
      const av = avanceCotizacion(c, regs, t, cots).filter(x => x.horas), pro = av.reduce((s, x) => s + x.proyectado, 0), eje = av.reduce((s, x) => s + x.ejecutado, 0), pct = pro > 0 ? Math.round(eje / pro * 100) : 0;
      const sinFac = regs.filter(r => r.tipo_id === t.id && !esCargo(r) && !r.cierre_cobro && cotizacionPara(r, cots)?.id === c.id).length;
      return `<tr class="click" data-c="${c.id}"><td class="mono">${c.numero}</td><td><b>${esc(obraDe(c) || '—')}</b><br><small class="hint">${esc(nomT(c.tercero_id))}</small></td>
        <td style="min-width:180px">${pro > 0 ? `<div class="mono">${cant(eje)} de ${cant(pro, 'h')}</div><div class="op-bar"><i style="width:${Math.min(100, pct)}%" class="${eje >= pro ? 'over' : pct >= 80 ? 'warn' : ''}"></i></div>` : `<span class="mono">${cant(eje, 'h')}</span>`}</td>
        <td class="r">${sinFac ? nRec(sinFac) : ''}</td><td class="r mono">${money(c.total)}</td><td>${cotizacionVigente(c) ? '<span class="tag ok">Abierto</span>' : `<span class="tag">${c.estado === 'cerrada' ? 'Cerrado' : esc(c.estado)}</span>`}</td>
        <td class="r nowrap"><a class="btn sm ghost" href="#/oprecibos?cot=${c.id}" data-stop>Recibos</a>${cotizacionVigente(c) ? `<button class="sm ghost" data-cerrar="${c.id}">Cerrar</button>` : `<button class="sm ghost" data-reab="${c.id}">Reabrir</button>`}</td></tr>`;
    };
    m.innerHTML = encabezado('Proyectos', 'Cada proyecto es una cotización: cliente, obra, condiciones, ítems a facturar y horas proyectadas. Se cierra cuando tú lo cierras.', '<a class="btn primary" href="#/cotizacion/nueva-maq">+ Nuevo proyecto</a>') + `
    <div class="seg" role="tablist">${[['abiertos', 'Abiertos'], ['cerrados', 'Cerrados'], ['todos', 'Todos']].map(([k, n]) => `<button type="button" data-f="${k}" aria-selected="${fp === k}">${n} (${k === 'todos' ? todos.length : todos.filter(c => (k === 'abiertos') === cotizacionVigente(c)).length})</button>`).join('')}</div>
    <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>N.º</th><th>Obra y cliente</th><th>Horas</th><th class="r">Sin facturar</th><th class="r">Cotizado</th><th>Estado</th><th></th></tr></thead><tbody>
    ${ls.map(fila).join('') || `<tr><td colspan="7" class="muted">${fp === 'abiertos' ? 'No hay proyectos abiertos. Crea uno con + Nuevo proyecto.' : 'No hay proyectos.'}</td></tr>`}</tbody></table></div></section>`;
    m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { fp = b.dataset.f; vProyectos(m); });
    m.querySelectorAll('[data-c]').forEach(tr => tr.onclick = ev => { if (ev.target.closest('button,a')) return; location.hash = '#/cotizacion/' + tr.dataset.c; });
    m.querySelectorAll('[data-cerrar]').forEach(b => b.onclick = async () => {
      const c = todos.find(x => x.id === b.dataset.cerrar), ab = regs.filter(r => r.tipo_id === t.id && !esCargo(r) && (!r.cierre_pago || !r.cierre_cobro) && cotizacionPara(r, cots)?.id === c.id).length;
      if (!await X.confirmar(`Cerrar proyecto N.º ${c.numero}`, `${ab ? `${ab === 1 ? 'Queda 1 recibo' : `Quedan ${ab} recibos`} sin programar o facturar: los puedes cerrar después en Programar y Facturar. ` : ''}El proyecto ya no sale para registrar recibos. Puedes reabrirlo.`, 'Cerrar proyecto')) return;
      try { await guardar('cotizaciones', { id: c.id, estado: 'cerrada' }); X.toast(`Proyecto N.º ${c.numero} cerrado.`); X.route(); } catch (e) { X.fail(e); } });
    m.querySelectorAll('[data-reab]').forEach(b => b.onclick = async () => { try { await guardar('cotizaciones', { id: b.dataset.reab, estado: 'aceptada' }); X.toast('Proyecto reabierto.'); X.route(); } catch (e) { X.fail(e); } });
  });
}

/* ---------- 3. Operadores ---------- */
export function vOperadores(m) {
  conTipo(m, t => {
    const { esc, money } = X, c = cfgTipo(t), hoy = X.hoy(), tar = valoresDe(t);
    const servicios = (X.S.d.productos || []).filter(p => p.activo !== false && p.tipo === 'servicio');
    const ids = [...new Set([...tar.map(x => x.criterios.tercero), ...recibosDe(t).map(r => r.tercero_id)])].filter(Boolean).sort((a, b) => nomT(a).localeCompare(nomT(b)));
    const sb = (c.constantes.find(x => x.k === 'salario_base') || {}).valor || 0;
    const ctas = (X.S.d.cuentas || []).filter(x => String(x.codigo).length === 8 && /^[5-7]/.test(x.codigo)).sort((a, b) => a.codigo.localeCompare(b.codigo));
    m.innerHTML = encabezado('Operadores', 'El valor hora máquina negociado con cada operador. Se pone una vez y sirve para todos los proyectos.', '<button class="primary" id="opNP">+ Operador</button>') + `
    <section class="panel stack"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Operador</th><th class="r">Valor hora</th><th>Desde</th><th>Recargo dom. y fest.</th><th>Ítem del documento soporte</th><th></th></tr></thead><tbody>
    ${ids.map(tid => { const v = valorHora(t, tid), hist = tar.filter(x => x.criterios.tercero === tid && x !== v).length; return `<tr><td><b>${esc(nomT(tid))}</b>${hist ? ` <small class="hint">· ${hist} valor${hist === 1 ? '' : 'es'} anterior${hist === 1 ? '' : 'es'}</small>` : ''}</td>
      <td class="r mono">${v ? money(v.valor) : '<span class="tag demo">Sin valor</span>'}</td><td class="hint">${v?.desde ? X.fFecha(v.desde) : v ? 'Siempre' : ''}</td>
      <td><label class="check"><input type="checkbox" data-rec="${tid}" ${c.sin_recargo.includes(tid) ? '' : 'checked'}> ${c.sin_recargo.includes(tid) ? 'No' : 'Sí'}</label></td>
      <td>${esc((X.S.d.productos || []).find(p => p.id === v?.producto_id)?.nombre || '')}</td><td class="r"><button class="sm" data-vp="${tid}">${v ? 'Cambiar valor' : 'Poner valor'}</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Todavía no hay operadores. Agrégalos con su valor hora.</td></tr>'}</tbody></table></div>
    <p class="hint">Si alguien no aparece para agregar, créalo en Terceros. Cambiar el valor desde una fecha deja como estaba lo registrado antes.</p></section>
    <form class="panel stack" id="opRec"><h3>Recargo dominical y festivo</h3><p class="hint">Se suma a los recibos de domingo o festivo de los operadores marcados: horas × salario base ÷ 210 × 190 %.</p>
      <div class="grid2">${X.campo('sb', 'Salario base del recargo', sb ? String(sb) : '', 'class="mono" inputmode="decimal"')}<div><label for="f_cta">Cuenta del documento soporte si el ítem no tiene una</label><select id="f_cta" name="cuenta"><option value="">Escoge una cuenta</option>${ctas.map(x => `<option value="${x.codigo}" ${x.codigo === c.salidas.cuenta ? 'selected' : ''}>${x.codigo} ${esc(x.nombre)}</option>`).join('')}</select></div></div>
      <div class="row end"><button class="primary">Guardar</button></div></form>`;
    const guardarCfg = async (cambios, msg) => { try { await guardar('op_tipos', { id: t.id, config: { ...t.config, ...cambios } }); X.toast(msg); X.route(); } catch (e) { X.fail(e); } };
    m.querySelectorAll('[data-rec]').forEach(ch => ch.onchange = () => { const tid = ch.dataset.rec, s = new Set(c.sin_recargo); if (ch.checked) s.delete(tid); else s.add(tid); guardarCfg({ sin_recargo: [...s] }, ch.checked ? 'Recargo activado.' : 'Recargo quitado.'); });
    X.$('opRec').onsubmit = ev => { ev.preventDefault(); const fd = new FormData(ev.target), v = numIn(fd.get('sb'));
      guardarCfg({ constantes: c.constantes.map(x => x.k === 'salario_base' ? { ...x, valor: v } : x), salidas: { ...c.salidas, cuenta: fd.get('cuenta') || '' } }, 'Guardado.'); };
    const form = tid => { const v = tid ? valorHora(t, tid) : null; X.dialogo(`<h2>${tid ? esc(nomT(tid)) : 'Agregar operador'}</h2>
      ${tid ? `<input type="hidden" name="tercero_id" value="${tid}">` : `<div><label for="f_pt">Operador *</label><select id="f_pt" name="tercero_id" required><option value="">Escoge…</option>${personas().filter(p => !ids.includes(p.id)).map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}</select></div>`}
      <div class="grid2">${X.campo('valor', 'Valor hora máquina *', v?.valor ?? '', 'required class="mono" inputmode="decimal"')}${X.campo('desde', v ? 'Desde (lo registrado antes conserva el valor anterior)' : 'Desde (vacío = siempre)', v ? hoy : '', 'type="date"')}</div>
      <div><label for="f_ps">Ítem de servicio del documento soporte</label><select id="f_ps" name="producto_id"><option value="">Escoge después</option>${servicios.map(p => `<option value="${p.id}" ${p.id === v?.producto_id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.nombre)}</option>`).join('')}</select>${servicios.length ? '' : '<p class="hint">Crea el servicio en Inventario › Productos y servicios (tipo servicio).</p>'}</div>${X.pie()}`, async fd => {
      const terc0 = fd.get('tercero_id'), valor = numIn(fd.get('valor')), desde = fd.get('desde') || null, producto_id = fd.get('producto_id') || null;
      if (!(valor > 0)) throw new Error('El valor debe ser mayor que cero.');
      const act = valorHora(t, terc0, desde || hoy), base = { empresa_id: X.S.eid, tipo_id: t.id, uso: 'pago', modo: 'unidad', criterios: { tercero: terc0 }, valor, producto_id, nota: '' };
      if (act && desde && (!act.desde || act.desde < desde)) { await guardar('op_tarifas', { id: act.id, hasta: X.sumarDias(desde, -1) }); await guardar('op_tarifas', { ...base, desde, hasta: act.hasta || null }); }
      else if (act) await guardar('op_tarifas', { id: act.id, valor, producto_id, desde: desde || act.desde || null });
      else await guardar('op_tarifas', { ...base, desde, hasta: null });
      X.toast('Valor hora guardado.'); X.route();
    }); };
    X.$('opNP').onclick = () => form(null);
    m.querySelectorAll('[data-vp]').forEach(b => b.onclick = () => form(b.dataset.vp));
  });
}

/* ---------- 4. Máquinas ---------- */
export function vMaquinas(m, q) {
  conTipo(m, t => {
    const { esc } = X, desde = q?.get('desde') || mesActual(), hasta = q?.get('hasta') || X.hoy();
    const acc = acumuladoMaquinas(registrosDe(t), t, { desde, hasta }), porId = new Map(acc.map(a => [a.elemento, a]));
    const lista = maquinasDe(t, true).map(e => ({ e, a: porId.get(e.id) }));
    const saltos = acc.flatMap(a => a.saltos.map(s => ({ ...s, elemento: a.elemento }))).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const pmCelda = e => { const p = estadoPM(e, registrosDe(t)); if (!p) return '<span class="hint">Sin programar: Editar</span>';
      const tag = p.estado === 'vencido' ? '<span class="tag bad">Vencido</span>' : p.estado === 'pronto' ? '<span class="tag demo">Pronto</span>' : '<span class="tag ok">Al día</span>';
      return `${tag} <span class="mono">${cant(p.proximo)}</span><br><small class="hint">${p.faltan > 0 ? `faltan ${cant(p.faltan, 'h')}` : `pasado ${cant(-p.faltan, 'h')}`} · cada ${cant(p.cada, 'h')}</small>`; };
    m.innerHTML = encabezado('Máquinas', 'El horómetro acumulado de cada máquina sale de los recibos. Base para controles y mantenimiento.', '<button class="primary" id="mqN">+ Máquina</button>') + `
    <section class="panel row op-fil"><div><label for="mqD">Desde</label><input type="date" id="mqD" value="${desde}"></div><div><label for="mqH">Hasta</label><input type="date" id="mqH" value="${hasta}"></div></section>
    <section class="panel stack"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Máquina</th><th class="r">Horómetro</th><th class="r">Horas del período</th><th class="r">Acumulado</th><th>Control</th><th>Mantenimiento preventivo</th><th></th></tr></thead><tbody>
    ${lista.map(({ e, a }) => `<tr class="${e.activo === false ? 'muted' : ''}"><td><b>${esc(e.nombre)}</b>${e.codigo ? ` <small class="hint">${esc(e.codigo)}</small>` : ''}${e.activo === false ? ' <span class="tag">Inactiva</span>' : ''}${e.datos?.modelo || e.datos?.serie ? `<br><small class="hint">${esc([e.datos?.modelo, e.datos?.serie].filter(Boolean).join(' · '))}</small>` : ''}</td>
      <td class="r mono">${a?.ultimo != null ? cant(a.ultimo) : '—'}${a ? `<br><small class="hint">${X.fFecha(a.fecha)}</small>` : ''}</td><td class="r mono">${a ? cant(a.periodo, 'h') : ''}</td><td class="r mono">${a ? cant(a.total, 'h') : ''}</td>
      <td>${a?.saltos.length ? `<span class="tag demo">${a.saltos.length} salto${a.saltos.length === 1 ? '' : 's'}</span>` : a ? '<span class="tag ok">Empata</span>' : '<span class="hint">Sin recibos</span>'}</td><td>${pmCelda(e)}</td><td class="r nowrap">${estadoPM(e, registrosDe(t)) ? `<button class="sm" data-pm="${e.id}">PM hecho</button>` : ''}<a class="btn sm ghost" href="#/oprecibos" data-maq="${e.id}">Recibos</a><button class="sm" data-em="${e.id}">Editar</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Todavía no hay máquinas. Agrégalas con + Máquina.</td></tr>'}</tbody></table></div>
    <p class="hint">Acumulado = suma de (final − inicial) de todos los recibos. Un salto es un recibo que no empieza donde terminó el anterior de la misma máquina.</p></section>
    ${saltos.length ? `<section class="panel stack"><h3>Saltos para revisar</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Máquina</th><th class="r">Debía empezar en</th><th class="r">Empezó en</th><th class="r">Diferencia</th><th></th></tr></thead><tbody>
    ${saltos.map(s => `<tr><td>${X.fFecha(s.fecha)}</td><td>${esc(elem(s.elemento)?.nombre || '')}</td><td class="r mono">${cant(s.esperado)}</td><td class="r mono">${cant(s.ini)}</td><td class="r mono">${s.dif > 0 ? '+' : ''}${cant(s.dif)}</td><td class="r"><button class="sm" data-er="${s.registro_id}">Ver recibo</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}
    <p class="hint">Mantenimiento preventivo: cuando falte el 10 % del intervalo (mínimo 10 h) y cuando se cumpla, llega el aviso a la campanita. Al hacerlo, regístralo con "PM hecho" y se programa el siguiente.</p>`;
    m.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { const e = elem(b.dataset.pm), p = estadoPM(e, registrosDe(t));
      X.dialogo(`<h2>PM hecho · ${esc(e.nombre)}</h2><p class="hint">El siguiente se programa a las horas de este PM + ${cant(p.cada, 'h')}.</p>
        <div class="grid2">${X.campo('horometro', 'Horómetro al hacer el PM *', p.actual != null ? String(p.actual).replace('.', ',') : '', 'required class="mono" inputmode="decimal"')}${X.campo('fecha', 'Fecha', X.hoy(), 'type="date" required')}</div>
        ${X.campo('nota', 'Nota (opcional)', '', 'maxlength="200" placeholder="Ej.: cambio de aceite y filtros"')}${X.pie('Registrar PM')}`, async fd => {
        const h = numIn(fd.get('horometro')); if (!(h > 0)) throw new Error('Escribe el horómetro.');
        const pm = { ...e.datos.pm, base: h, hist: [...(e.datos.pm.hist || []), { fecha: fd.get('fecha'), horometro: h, nota: String(fd.get('nota') || '').trim() }] };
        await guardar('op_elementos', { id: e.id, datos: { ...e.datos, pm } }); X.toast(`PM registrado. El siguiente es a las ${cant(h + p.cada)} h.`); X.route();
      }); });
    const ir = () => { location.hash = `#/opmaquinas?desde=${X.$('mqD').value || desde}&hasta=${X.$('mqH').value || hasta}`; };
    X.$('mqD').onchange = X.$('mqH').onchange = ir;
    m.querySelectorAll('[data-maq]').forEach(a => a.onclick = () => { fr.maq = a.dataset.maq; fr.e = 'todos'; });
    m.querySelectorAll('[data-er]').forEach(b => b.onclick = () => { const r = registrosDe(t).find(x => x.id === b.dataset.er); if (r && !r.cierre_pago && !r.cierre_cobro) formRecibo(t, r); else X.toast('Ese recibo ya está programado o facturado.', true); });
    const form = e => X.dialogo(`<h2>${e ? 'Editar máquina' : 'Nueva máquina'}</h2>
      <div class="grid2">${X.campo('nombre', 'Nombre *', e?.nombre || '', 'required maxlength="80" placeholder="Motoniveladora 140 K"')}${X.campo('codigo', 'Código interno', e?.codigo || '', 'maxlength="20"')}</div>
      <div class="grid2">${X.campo('modelo', 'Modelo', e?.datos?.modelo || '', 'maxlength="60"')}${X.campo('serie', 'Serie o placa', e?.datos?.serie || '', 'maxlength="40"')}</div>
      ${(() => { const h0 = horometroInicialMaq(e), conRec = e && recibosDe(t).some(r => r.datos?.equipo === e.id);
        return `<div class="grid2">${X.campo('hini', 'Horómetro inicial *', h0 != null ? String(h0).replace('.', ',') : '', `required class="mono" inputmode="decimal"${conRec ? ' readonly' : ''}`)}<p class="hint">${conRec ? 'Ya tiene recibos: el horómetro sigue la cadena de recibos y este dato no se cambia.' : 'El primer recibo de la máquina arranca aquí. Después, cada recibo arranca donde terminó el anterior.'}</p></div>`; })()}
      <h3>Mantenimiento preventivo (PM)</h3>
      ${(() => { const pm = e?.datos?.pm, act = e ? horometroActual(e, registrosDe(t)) : null;
        return pm ? `<div class="grid2">${X.campo('pm_cada', 'Hacer PM cada (horas)', String(pm.cada || ''), 'class="mono" inputmode="decimal"')}<p class="hint">Último PM a las ${cant(pm.base)} h${pm.hist?.length ? ' (' + X.fFecha(pm.hist.at(-1).fecha) + ')' : ''}. Próximo a las ${cant(X.num(pm.base) + X.num(pm.cada))} h.</p></div>`
          : `<p class="hint">Se pregunta una sola vez: cuántas horas lleva desde el último PM. De ahí en adelante se programa solo cada tantas horas.</p>
        <div class="grid2">${X.campo('pm_actual', e ? 'Horómetro actual' : 'Horómetro actual (vacío = el inicial)', act != null ? String(act).replace('.', ',') : '', 'class="mono" inputmode="decimal"')}${X.campo('pm_lleva', 'Horas acumuladas desde el último PM', '', 'class="mono" inputmode="decimal" placeholder="Ej.: 120"')}</div>
        <div class="grid2">${X.campo('pm_cada', 'Hacer PM cada (horas)', '', 'class="mono" inputmode="decimal" placeholder="Ej.: 250"')}<div></div></div>`; })()}
      ${e ? X.check('activo', 'Activa (si no, no sale para nuevos recibos)', e.activo !== false) : ''}${X.pie()}`, async fd => {
      const nombre = String(fd.get('nombre') || '').trim(); if (!nombre) throw new Error('Escribe el nombre de la máquina.');
      const row = { empresa_id: X.S.eid, tipo_id: t.id, lista: 'equipos', nombre, codigo: String(fd.get('codigo') || '').trim(), datos: { ...(e?.datos || {}), modelo: String(fd.get('modelo') || '').trim(), serie: String(fd.get('serie') || '').trim() }, activo: e ? fd.get('activo') === 'on' : true };
      const shi = String(fd.get('hini') ?? '').trim(); if (!shi) throw new Error('Escribe el horómetro inicial de la máquina.');
      const hini = numIn(shi); if (!(hini >= 0)) throw new Error('El horómetro inicial no puede ser negativo.');
      row.datos.horometro_inicial = hini;
      const cada = numIn(fd.get('pm_cada')), pm0 = e?.datos?.pm;
      if (pm0) { if (cada > 0) row.datos.pm = { ...pm0, cada }; else delete row.datos.pm; }
      else if (cada > 0) {
        const s0 = String(fd.get('pm_actual') ?? '').trim() || (e ? '' : shi); if (!s0) throw new Error('Para programar el PM escribe el horómetro actual.');
        const actual = numIn(s0), lleva = numIn(fd.get('pm_lleva'));
        if (lleva < 0) throw new Error('Las horas desde el último PM no pueden ser negativas.');
        row.datos.pm = { cada, base: pmBase(actual, lleva), inicial: actual, hist: [] };
      }
      await guardar('op_elementos', e ? { ...row, id: e.id } : row); X.toast('Máquina guardada.'); X.route();
    });
    X.$('mqN').onclick = () => form(null);
    m.querySelectorAll('[data-em]').forEach(b => b.onclick = () => form(elem(b.dataset.em)));
  });
}

/* ---------- 5. Programar ---------- */
const fg = {}, exclP = new Set();
const CONCEPTOS = ['Transporte', 'Auxilio de alimentación', 'Movilización del operador', 'Ajuste de horas', 'Otro'];
export function vProgramar(m, q) {
  conTipo(m, t => {
    const { esc, money } = X, c = cfgTipo(t), todos = registrosDe(t), tar = tarifasDe(t);
    const pend = todos.filter(r => !r.cierre_pago);
    if (!fg.desde) fg.desde = pend.map(r => r.fecha).sort()[0] || mesActual();
    if (!fg.hasta) fg.hasta = X.hoy();
    const regs = pend.filter(r => r.fecha >= fg.desde && r.fecha <= fg.hasta);
    for (const x of [...exclP]) if (!regs.some(r => r.id === x)) exclP.delete(x);
    // Recibos escogidos para este corte (los cargos y ajustes siempre entran). Los demás siguen pendientes.
    const recDe = tid => regs.filter(r => r.tercero_id === tid && !esCargo(r));
    const sel = volantes(regs.filter(r => esCargo(r) || !exclP.has(r.id)), t, tar, ctxCC());
    const vs = [...new Set(regs.map(r => r.tercero_id))].map(tid => sel.find(v => v.tercero_id === tid) || { tercero_id: tid, lineas: [], registros: [], cantidad: 0, total: 0 })
      .sort((a, b) => nomT(a.tercero_id).localeCompare(nomT(b.tercero_id)));
    const per = { desde: fg.desde, hasta: fg.hasta };
    const suma = (v, fn) => v.lineas.filter(fn).reduce((s, l) => s + l.valor, 0);
    const sinValor = regs.filter(r => !esCargo(r) && !calcular(r, t, tar).tarifa);
    const hechos = new Map(); for (const r of todos.filter(r => r.cierre_pago && r.fecha >= fg.desde && r.fecha <= fg.hasta)) hechos.set(r.cierre_pago, [...(hechos.get(r.cierre_pago) || []), r]);
    const otros = regs.filter(esCargo);
    const total = vs.reduce((s, v) => s + v.total, 0), aGen = vs.filter(v => v.total > 0);
    m.innerHTML = encabezado('Programar', 'Escoge las fechas, revisa lo de cada operador, imprime los volantes y genera los documentos soporte. El pago se hace después con el egreso.',
      `<button id="pgOtro">+ Otro concepto</button>${vs.length ? '<button id="pgImp">Imprimir volantes</button><button id="pgRes">Imprimir resumen</button>' : ''}${aGen.length ? `<button class="primary" id="pgGen">Generar ${aGen.length} documento${aGen.length === 1 ? '' : 's'} soporte</button>` : ''}`) + `
    <section class="panel row op-fil"><div><label for="pgD">Desde</label><input type="date" id="pgD" value="${fg.desde}"></div><div><label for="pgH">Hasta</label><input type="date" id="pgH" value="${fg.hasta}"></div></section>
    ${sinValor.length ? `<section class="panel callout">${nRec(sinValor.length)} de ${[...new Set(sinValor.map(r => nomT(r.tercero_id)))].map(esc).join(', ')} no tiene${sinValor.length === 1 ? '' : 'n'} valor hora y queda${sinValor.length === 1 ? '' : 'n'} en $0. <a href="#/opoperadores">Ponlo en Operadores</a>.</section>` : ''}
    <div class="kpis"><div class="kpi"><span>Operadores</span><b>${vs.length}</b></div><div class="kpi"><span>Horas</span><b>${cant(vs.reduce((s, v) => s + v.cantidad, 0), 'h')}</b></div><div class="kpi"><span>Por programar</span><b>${money(total)}</b></div></div>
    <section class="panel stack"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Operador</th><th class="r">Horas</th><th class="r">Valor horas</th><th class="r">Recargos y ajustes</th><th class="r">Otros</th><th class="r">Total</th><th></th></tr></thead><tbody>
    ${vs.map(v => `<tr><td><b>${esc(nomT(v.tercero_id))}</b><br><small class="hint">${(() => { const k = v.registros.filter(r => !r.cargo && !r.ajuste).length, n0 = recDe(v.tercero_id).length; return k === n0 ? nRec(k) : `<b>${k} de ${n0} recibos</b>`; })()}${v.registros.some(r => r.ajuste) ? ` · ajuste ${cant(v.registros.filter(r => r.ajuste).reduce((s, r) => s + r.pagadas, 0), 'h')}` : ''}</small></td><td class="r mono">${cant(v.cantidad)}</td><td class="r mono">${money(suma(v, l => !l.regla && !l.cargo))}</td><td class="r mono">${money(suma(v, l => l.regla))}</td><td class="r mono">${money(suma(v, l => l.cargo))}</td><td class="r mono"><b>${money(v.total)}</b></td>
      <td class="r nowrap">${recDe(v.tercero_id).length ? `<button class="sm ghost" data-esc="${v.tercero_id}">Escoger recibos</button>` : ''}<button class="sm ghost" data-aj="${v.tercero_id}" title="Agregar o quitar horas por una diferencia con el operador">Ajustar horas</button><button class="sm ghost" data-otro="${v.tercero_id}">+ Otro</button><button class="sm ghost" data-v="${v.tercero_id}">Volante</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No hay nada por programar en estas fechas.</td></tr>'}
    ${vs.length ? `<tr class="grp"><td colspan="5">Total</td><td class="r mono"><b>${money(total)}</b></td><td></td></tr>` : ''}</tbody></table></div></section>
    ${otros.length ? `<section class="panel stack"><h3>Otros conceptos</h3><div class="tbl-wrap"><table class="tbl"><tbody>${otros.map(r => { const aj = esAjusteHoras(r); return `<tr><td>${X.fFecha(r.fecha)}</td><td>${esc(nomT(r.tercero_id))}</td><td>${aj ? `<b>Ajuste de horas</b> ${Number(r.datos.horas) > 0 ? '+' : ''}${cant(r.datos.horas, 'h')}` : esc(r.datos?.concepto || '')}${r.nota ? ` <small class="hint">${esc(r.nota)}</small>` : ''}</td><td class="r mono">${money(aj ? calcular(r, t, tar).valor : r.datos?.valor)}</td><td class="r"><button class="sm ghost" data-bo="${r.id}">Quitar</button></td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
    ${hechos.size ? `<section class="panel stack"><h3>Ya programado en estas fechas</h3><div class="tbl-wrap"><table class="tbl"><tbody>${[...hechos.entries()].map(([id, rs]) => { const cp = compra(id); return `<tr><td>${cp ? `<a href="#/compra/${cp.id}">DS ${cp.numero}</a>${cp.estado === 'anulado' ? ' <span class="tag bad">Anulado</span>' : ''}` : '<span class="tag demo">Documento eliminado</span>'}</td><td>${esc(nomT(rs[0].tercero_id))}</td><td>${nRec(rs.filter(r => !esCargo(r)).length)}</td><td class="r mono">${cp ? money(cp.total ?? cp.base ?? 0) : ''}</td><td class="r">${!cp || cp.estado === 'anulado' ? `<button class="sm" data-lib="${id}">Liberar recibos</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></section>` : ''}`;
    const filtrar = () => { fg.desde = X.$('pgD').value || fg.desde; fg.hasta = X.$('pgH').value || fg.hasta; vProgramar(m); };
    X.$('pgD').onchange = X.$('pgH').onchange = filtrar;
    const imp = lista => { X.$('print').innerHTML = lista.map(v => hojaVolante(v, per, t)).join(''); window.print(); };
    if (X.$('pgImp')) X.$('pgImp').onclick = () => imp(vs);
    if (X.$('pgRes')) X.$('pgRes').onclick = () => { X.$('print').innerHTML = hojaResumen(vs, per, t); window.print(); };
    m.querySelectorAll('[data-v]').forEach(b => b.onclick = () => imp(vs.filter(v => v.tercero_id === b.dataset.v)));
    if (X.$('pgGen')) X.$('pgGen').onclick = async () => { await generarDS(per, t, aGen); if ((X.S.d.op_registros || []).some(r => r.cierre_pago && aGen.some(v => v.registros.some(x => x.id === r.id)))) { for (const v of aGen) for (const r of recDe(v.tercero_id)) exclP.delete(r.id); X.route(); } };
    m.querySelectorAll('[data-esc]').forEach(b => b.onclick = () => escogerRecibos(`Recibos a programar · ${nomT(b.dataset.esc)}`, recDe(b.dataset.esc), exclP, t, () => vProgramar(m)));
    X.$('pgOtro').onclick = () => formOtro(t, '');
    m.querySelectorAll('[data-otro]').forEach(b => b.onclick = () => formOtro(t, b.dataset.otro));
    m.querySelectorAll('[data-aj]').forEach(b => b.onclick = () => formAjuste(t, b.dataset.aj));
    m.querySelectorAll('[data-bo]').forEach(b => b.onclick = async () => { try { await borrar('op_registros', b.dataset.bo); X.toast('Concepto quitado.'); X.route(); } catch (e) { X.fail(e); } });
    m.querySelectorAll('[data-lib]').forEach(b => b.onclick = async () => { try { for (const r of hechos.get(b.dataset.lib)) await X.store.save('op_registros', { id: r.id, cierre_pago: null }); await X.cargarEmpresa(); X.toast('Recibos liberados: se pueden volver a programar.'); X.route(); } catch (e) { X.fail(faltaSql(e)); } });
  });
}
// Diferencia con el operador: horas de más o de menos que salen en su volante y su documento soporte, con nota. El recibo no cambia.
function formAjuste(t, tid) {
  const { esc, money } = X, tar = tarifasDe(t);
  const f = X.dialogo(`<h2>Ajustar horas · ${esc(nomT(tid))}</h2><p class="hint">Para una diferencia con el operador. Las horas se suman (o se restan, con signo menos) a su volante y a su documento soporte, a su valor hora. Los recibos y lo que se le factura al cliente no cambian.</p>
    <div class="grid2">${X.campo('horas', 'Horas *', '', 'required class="mono" inputmode="decimal" placeholder="Ej.: 3 o -2"')}${X.campo('fecha', 'Fecha', fg.hasta || X.hoy(), 'type="date" required')}</div>
    ${X.campo('nota', 'Nota * (por qué se ajusta)', '', 'required maxlength="200"')}<p class="op-prev" id="ajPrev"></p>${X.pie('Agregar ajuste')}`, async fd => {
    const row = { empresa_id: X.S.eid, tipo_id: t.id, clase: 'cargo', fecha: fd.get('fecha'), tercero_id: tid, datos: { concepto: 'Ajuste de horas', horas: numIn(fd.get('horas')) }, nota: String(fd.get('nota') || '').trim() };
    const errs = erroresRegistro(row, t); if (errs.length) throw new Error(errs.join(' '));
    await guardar('op_registros', row); X.toast('Ajuste agregado al volante.'); X.route();
  });
  const prev = () => { const h = numIn(X.$('f_horas').value || '0'), k = calcular({ clase: 'cargo', tipo_id: t.id, tercero_id: tid, fecha: X.$('f_fecha')?.value || fg.hasta || X.hoy(), datos: { horas: h } }, t, tar);
    X.$('ajPrev').innerHTML = !h ? '' : k.tarifa ? `${h > 0 ? '+' : ''}${cant(h, 'h')} × ${money(k.tarifa.valor)} = <b>${money(k.valor)}</b>` : '<span class="tag demo">Este operador no tiene valor hora: ponlo en Operadores.</span>'; };
  f.addEventListener('input', prev);
}
function formOtro(t, tid) {
  const { esc } = X, servicios = (X.S.d.productos || []).filter(p => p.activo !== false && p.tipo === 'servicio');
  const ops = [...new Set([...valoresDe(t).map(x => x.criterios.tercero), ...recibosDe(t).map(r => r.tercero_id)])].filter(Boolean).sort((a, b) => nomT(a).localeCompare(nomT(b)));
  X.dialogo(`<h2>Otro concepto</h2><p class="hint">Transporte, auxilio u horas reconocidas aparte. Sale en el volante y en el documento soporte del operador.</p>
    <div class="grid2"><div><label for="f_ot">Operador *</label><select id="f_ot" name="tercero_id" required><option value="">Escoge…</option>${ops.map(i => `<option value="${i}" ${i === tid ? 'selected' : ''}>${esc(nomT(i))}</option>`).join('')}</select></div>${X.campo('fecha', 'Fecha', fg.hasta || X.hoy(), 'type="date" required')}</div>
    <div class="grid2"><div><label for="f_cc">Concepto *</label><input id="f_cc" name="concepto" list="mqConc" required maxlength="80"><datalist id="mqConc">${CONCEPTOS.map(x => `<option value="${x}">`).join('')}</datalist></div>${X.campo('valor', 'Valor *', '', 'required class="mono" inputmode="decimal"')}</div>
    <div><label for="f_os">Ítem de servicio (opcional)</label><select id="f_os" name="producto_id"><option value="">El del valor hora del operador</option>${servicios.map(p => `<option value="${p.id}">${esc(p.codigo)} · ${esc(p.nombre)}</option>`).join('')}</select></div>
    ${X.campo('nota', 'Nota (opcional)', '', 'maxlength="200"')}${X.pie('Agregar')}`, async fd => {
    const valor = numIn(fd.get('valor')); if (!(valor > 0)) throw new Error('El valor debe ser mayor que cero.');
    await guardar('op_registros', { empresa_id: X.S.eid, tipo_id: t.id, clase: 'cargo', fecha: fd.get('fecha'), tercero_id: fd.get('tercero_id'), datos: { concepto: String(fd.get('concepto') || '').trim(), valor, producto_id: fd.get('producto_id') || null }, nota: String(fd.get('nota') || '').trim() });
    X.toast('Concepto agregado.'); X.route();
  });
}

/* ---------- Horas no aceptadas y stand by (informe para el cliente) ---------- */
// Por proyecto y fechas: cada recibo con horas que el cliente no aceptó o con stand by, con sus observaciones.
const fh = {};
export function vHorasCliente(m, q) {
  conTipo(m, t => {
    const { esc } = X, cots = X.S.d.cotizaciones || [], proys = proyectosDe(t);
    Object.assign(fh, { cot: q?.get('cot') ?? fh.cot ?? '', desde: fh.desde || mesActual(), hasta: fh.hasta || X.hoy() });
    const filas = recibosDe(t).filter(r => r.fecha >= fh.desde && r.fecha <= fh.hasta && (!fh.cot || cotizacionPara(r, cots)?.id === fh.cot))
      .map(r => ({ r, cot: cotizacionPara(r, cots), k: calcular(r, t, []) })).filter(x => x.k.noAceptadas || x.k.standby)
      .sort((a, b) => (a.cot?.numero || 0) - (b.cot?.numero || 0) || a.r.fecha.localeCompare(b.r.fecha));
    const grupos = new Map(); for (const x of filas) { const k = x.cot?.id || ''; grupos.set(k, [...(grupos.get(k) || []), x]); }
    const sum = (xs, f) => xs.reduce((s, x) => s + f(x.k), 0);
    const tabla = xs => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Recibo</th><th>Máquina</th><th>Operador</th><th class="r">Trabajadas</th><th class="r">No aceptadas</th><th class="r">Stand by</th><th class="r">A facturar</th><th>Observaciones</th></tr></thead><tbody>
      ${xs.map(({ r, k }) => `<tr><td class="nowrap">${X.fFecha(r.fecha)}</td><td>${esc(r.datos?.recibo || '')}</td><td>${esc(elem(r.datos?.equipo)?.nombre || '')}</td><td>${esc(nomT(r.tercero_id))}</td><td class="r mono">${cant(k.cantidad)}</td><td class="r mono">${k.noAceptadas ? cant(k.noAceptadas) : ''}</td><td class="r mono">${k.standby ? cant(k.standby) : ''}</td><td class="r mono"><b>${cant(k.cobro)}</b></td>
        <td>${[r.datos?.obs_cliente && k.noAceptadas ? `No aceptadas: ${esc(r.datos.obs_cliente)}` : '', r.datos?.obs_standby && k.standby ? `Stand by: ${esc(r.datos.obs_standby)}` : ''].filter(Boolean).join('<br>')}</td></tr>`).join('')}
      <tr class="grp"><td colspan="4">Total</td><td class="r mono">${cant(sum(xs, k => k.cantidad))}</td><td class="r mono">${cant(sum(xs, k => k.noAceptadas))}</td><td class="r mono">${cant(sum(xs, k => k.standby))}</td><td class="r mono"><b>${cant(sum(xs, k => k.cobro))}</b></td><td></td></tr></tbody></table></div>`;
    const titulo = c => c ? `Proyecto N.º ${c.numero}${obraDe(c) ? ' · ' + obraDe(c) : ''} · ${nomT(c.tercero_id)}` : 'Sin proyecto';
    m.innerHTML = encabezado('Horas no aceptadas y stand by', 'Los recibos con horas que el cliente no aceptó o con stand by, y sus observaciones. Imprímelo o guárdalo en PDF para enviarlo al cliente. Las horas se ajustan en cada recibo (Horas con el cliente).',
      filas.length ? '<button class="primary" id="hcImp">Imprimir o PDF</button>' : '') + `
    <section class="panel row op-fil"><div><label for="hcC">Proyecto</label><select id="hcC"><option value="">Todos</option>${X.opts(proys.map(c => [c.id, `N.º ${c.numero} · ${obraDe(c) || nomT(c.tercero_id)}`]), fh.cot)}</select></div>
      <div><label for="hcD">Desde</label><input type="date" id="hcD" value="${fh.desde}"></div><div><label for="hcH">Hasta</label><input type="date" id="hcH" value="${fh.hasta}"></div></section>
    ${filas.length ? [...grupos.entries()].map(([id, xs]) => `<section class="panel stack"><h3>${esc(titulo(cots.find(c => c.id === id)))}</h3>${tabla(xs)}</section>`).join('')
      : '<section class="panel"><p class="muted">No hay recibos con horas no aceptadas ni stand by en estas fechas.</p></section>'}`;
    const filtrar = () => { Object.assign(fh, { cot: X.$('hcC').value, desde: X.$('hcD').value || fh.desde, hasta: X.$('hcH').value || fh.hasta }); history.replaceState(null, '', '#/ophorascliente'); vHorasCliente(m); };
    ['hcC', 'hcD', 'hcH'].forEach(k => { X.$(k).onchange = filtrar; });
    if (X.$('hcImp')) X.$('hcImp').onclick = () => {
      X.$('print').innerHTML = [...grupos.entries()].map(([id, xs]) => `<article class="desprendible">${X.cabInforme('Horas no aceptadas y stand by', `${esc(titulo(cots.find(c => c.id === id)))}<br><small>Del ${X.fFecha(fh.desde)} al ${X.fFecha(fh.hasta)}</small>`)}${tabla(xs)}</article>`).join('');
      const tt = document.title; document.title = `Horas no aceptadas ${fh.desde} a ${fh.hasta} - ${X.emp().nombre}`; window.print(); document.title = tt;
    };
  });
}
