// Cotizaciones (Ventas): no mueven contabilidad. Fijan el precio de cobro y, si se amarran a un tipo de Operación
// (obra, equipo…), las horas registradas se facturan desde Operación con ese precio. Tabla: supabase/038_cotizaciones.sql.
import { cfgTipo, ESTADOS_COT, erroresCotizacion, totalLineaCot, COBRO_LINEA, cobroDeLinea } from './operacion.js';
import { operacionActiva, tiposOp } from './operacion-ui.js';
import { totales, enLetras } from './calc.js';

let X = null; // mismo contexto que Operación (main.js)
export const iniciarCotizaciones = ctx => { X = ctx; };

const cots = () => X.S.d.cotizaciones || [];
const cotById = id => cots().find(c => c.id === id);
const terc = id => X.S.d.terceros.find(t => t.id === id);
const nomT = id => terc(id)?.nombre || '—';
const elem = id => (X.S.d.op_elementos || []).find(e => e.id === id);
const tipoById = id => (X.S.d.op_tipos || []).find(t => t.id === id);
const camposEl = t => t ? cfgTipo(t).campos.filter(f => f.tipo === 'elemento') : [];
const elementosDe = (t, lista) => (X.S.d.op_elementos || []).filter(e => e.tipo_id === t.id && e.lista === lista && e.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
const faltaSql = e => /cotizaciones|schema cache|does not exist/i.test(e?.message || '') ? new Error('Falta correr en Supabase el archivo supabase/038_cotizaciones.sql.') : e;
const ESTADO_TAG = { abierta: 'demo', aceptada: 'ok', rechazada: 'bad', cerrada: '' };
const nomEstado = e => (ESTADOS_COT.find(x => x[0] === e) || [e, e])[1];
const amarre = c => { const t = tipoById(c.op_tipo_id); if (!t) return ''; const els = Object.values(c.criterios || {}).filter(Boolean).map(id => elem(id)?.nombre).filter(Boolean); return [t.nombre, ...els].join(' · '); };
const nuevaLinea = () => ({ producto_id: '', codigo: '', descripcion: '', unidad: 'UND', cantidad: 1, precio: 0, descuento_pct: 0, iva_pct: 19, op: true, criterios: {} });

/* ---------- Lista ---------- */
let filtro = '';
export function vCotizaciones(m) {
  const { esc, money } = X;
  const todas = [...cots()].sort((a, b) => Number(b.numero) - Number(a.numero));
  const ls = todas.filter(c => !filtro || c.estado === filtro);
  const cuenta = e => todas.filter(c => c.estado === e).length;
  m.innerHTML = `<header class="vhead"><div><h2>Cotizaciones</h2><p class="sub">Precios ofrecidos a tus clientes. No mueven la contabilidad. Si amarras una cotización a Operación, las horas de esa obra se facturan con su precio.</p></div><a class="btn primary" href="#/cotizacion/nueva">Nueva cotización</a></header>
  <div class="seg" role="tablist"><button type="button" data-f="" aria-selected="${!filtro}">Todas (${todas.length})</button>${ESTADOS_COT.map(([k, n]) => `<button type="button" data-f="${k}" aria-selected="${filtro === k}">${n} (${cuenta(k)})</button>`).join('')}</div>
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>N.º</th><th>Fecha</th><th>Cliente</th><th>Amarrada a</th><th class="r">Total</th><th>Estado</th></tr></thead><tbody>
  ${ls.map(c => `<tr class="click" data-c="${c.id}"><td class="mono">${c.numero}</td><td>${X.fFecha(c.fecha)}${c.vence && c.vence < X.hoy() && c.estado === 'abierta' ? ' <span class="tag bad">Vencida</span>' : ''}</td><td><b>${esc(nomT(c.tercero_id))}</b></td><td>${esc(amarre(c)) || '<span class="muted">—</span>'}</td><td class="r mono">${money(c.total)}</td><td><span class="tag ${ESTADO_TAG[c.estado] || ''}">${nomEstado(c.estado)}</span></td></tr>`).join('') || `<tr><td colspan="6" class="muted">${todas.length ? 'No hay cotizaciones con ese estado.' : 'Todavía no hay cotizaciones.'}</td></tr>`}
  </tbody></table></div></section>`;
  m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; vCotizaciones(m); });
  m.querySelectorAll('[data-c]').forEach(tr => tr.onclick = () => { location.hash = '#/cotizacion/' + tr.dataset.c; });
}

/* ---------- Editor ---------- */
export function vCotizacion(m, id) {
  const { esc, money } = X, prev = id && id !== 'nueva' ? cotById(id) : null;
  if (id && id !== 'nueva' && !prev) { location.hash = '#/cotizaciones'; return; }
  const c = prev ? JSON.parse(JSON.stringify(prev)) : { fecha: X.hoy(), vence: X.sumarDias(X.hoy(), 30), tercero_id: '', estado: 'abierta', op_tipo_id: null, criterios: {}, lineas: [nuevaLinea()], observaciones: '', condiciones: '' };
  c.criterios = c.criterios || {}; c.lineas = (c.lineas || []).map(l => ({ ...nuevaLinea(), ...l, criterios: l.criterios || {} }));
  const opOn = operacionActiva() && tiposOp().length;
  const clientes = [...X.S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const prods = (X.S.d.productos || []).filter(p => p.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const pintar = () => {
    const t = tipoById(c.op_tipo_id), cel = camposEl(t), libres = cel.filter(f => !c.criterios[f.k]);
    m.innerHTML = `<header class="vhead"><div><a class="back" href="#/cotizaciones">← Cotizaciones</a><h2>${prev ? `Cotización N.º ${prev.numero}` : 'Nueva cotización'}</h2>${prev ? `<p class="sub"><span class="tag ${ESTADO_TAG[prev.estado] || ''}">${nomEstado(prev.estado)}</span></p>` : ''}</div>
      <div class="row">${prev ? `<button class="ghost" id="cqDel">Eliminar</button><button id="cqImp">Imprimir</button>${t && operacionActiva() && cfgTipo(t).salidas.cobro === 'fv' ? `<a class="btn" href="#/opfacturar/${t.id}?cot=${prev.id}">Facturar horas</a>` : ''}` : ''}<button class="primary" id="cqSave">Guardar</button></div></header>
    <p class="err" id="cqErr" hidden></p>
    <section class="panel"><div class="cq-grid">
      <div><label for="cqCli">Cliente</label><select id="cqCli"><option value="">Escoge el cliente</option>${clientes.map(x => `<option value="${x.id}" ${x.id === c.tercero_id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
      <div><label for="cqF">Fecha</label><input id="cqF" type="date" value="${c.fecha || ''}"></div>
      <div><label for="cqV">Válida hasta</label><input id="cqV" type="date" value="${c.vence || ''}"></div>
      <div><label for="cqE">Estado</label><select id="cqE">${X.opts(ESTADOS_COT, c.estado)}</select></div></div></section>
    ${opOn ? `<section class="panel stack"><h3>Amarrar a Operación</h3><p class="hint">Las horas registradas en Operación con estos datos se facturan con los precios de esta cotización. Deja "Todas" para que aplique a cualquiera.</p>
      <div class="cq-grid"><div><label for="cqT">Tipo de operación</label><select id="cqT"><option value="">No se amarra</option>${tiposOp().map(x => `<option value="${x.id}" ${x.id === c.op_tipo_id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
      ${cel.map(f => `<div><label for="cqC_${f.k}">${esc(f.nombre)}</label><select id="cqC_${f.k}" data-crit="${f.k}"><option value="">Todas</option>${elementosDe(t, f.lista).map(e => `<option value="${e.id}" ${e.id === c.criterios[f.k] ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></div>`).join('')}</div></section>` : ''}
    <section class="panel stack"><h3>Líneas</h3><div class="tbl-wrap"><table class="tbl cq-lineas"><thead><tr><th>Producto o servicio</th><th>Descripción</th>${t ? libres.map(f => `<th>${esc(f.nombre)}</th>`).join('') : ''}<th class="r">Cant.</th><th>Unidad</th><th class="r">Precio</th><th class="r">Desc. %</th><th class="r">IVA %</th>${t ? '<th title="Con horas: por las horas registradas. Una vez: en la primera factura (movilización). No: se agrega a mano.">Cobro desde Operación</th>' : ''}<th class="r">Total</th><th></th></tr></thead><tbody>
      ${c.lineas.map((l, i) => `<tr data-i="${i}"><td><select data-k="producto_id"><option value="">—</option>${prods.map(p => `<option value="${p.id}" ${p.id === l.producto_id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.nombre)}</option>`).join('')}</select></td>
        <td><input data-k="descripcion" value="${esc(l.descripcion)}" maxlength="300"></td>
        ${t ? libres.map(f => `<td><select data-lc="${f.k}"><option value="">${l.op === false ? '—' : 'Cualquiera'}</option>${elementosDe(t, f.lista).map(e => `<option value="${e.id}" ${e.id === l.criterios[f.k] ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></td>`).join('') : ''}
        <td><input data-k="cantidad" type="number" step="any" min="0" class="r" value="${l.cantidad}"></td><td><input data-k="unidad" value="${esc(l.unidad)}" maxlength="10" size="5"></td>
        <td><input data-k="precio" type="number" step="any" min="0" class="r" value="${l.precio}"></td><td><input data-k="descuento_pct" type="number" step="any" min="0" max="100" class="r" value="${l.descuento_pct}"></td>
        <td><input data-k="iva_pct" type="number" step="any" min="0" class="r" value="${l.iva_pct}"></td>
        ${t ? `<td><select data-op>${X.opts(COBRO_LINEA, cobroDeLinea(l))}</select>${l.op === 'fijo' && l.facturado ? '<br><small class="hint">Ya facturada</small>' : ''}</td>` : ''}<td class="r mono" data-tot>${money(totalLineaCot(l))}</td><td><button type="button" class="sm ghost" data-del="${i}" title="Quitar línea">✕</button></td></tr>`).join('')}
      </tbody></table></div><div class="row"><button type="button" class="ghost" id="cqAdd">+ Agregar línea</button></div><div id="cqTot"></div></section>
    <section class="panel"><div class="grid2"><div><label for="cqO">Observaciones</label><textarea id="cqO" rows="3" maxlength="2000">${esc(c.observaciones || '')}</textarea></div><div><label for="cqK">Condiciones (forma de pago, mínimos, movilización…)</label><textarea id="cqK" rows="3" maxlength="2000">${esc(c.condiciones || '')}</textarea></div></div></section>`;
    totalesTxt();
    // Encabezado
    X.$('cqCli').onchange = e => { c.tercero_id = e.target.value; };
    X.$('cqF').onchange = e => { c.fecha = e.target.value; }; X.$('cqV').onchange = e => { c.vence = e.target.value; }; X.$('cqE').onchange = e => { c.estado = e.target.value; };
    X.$('cqO').oninput = e => { c.observaciones = e.target.value; }; X.$('cqK').oninput = e => { c.condiciones = e.target.value; };
    if (X.$('cqT')) X.$('cqT').onchange = e => { c.op_tipo_id = e.target.value || null; c.criterios = {}; c.lineas.forEach(l => { l.criterios = {}; }); pintar(); };
    m.querySelectorAll('[data-crit]').forEach(s => s.onchange = () => {
      c.criterios[s.dataset.crit] = s.value || undefined; if (!s.value) delete c.criterios[s.dataset.crit];
      c.lineas.forEach(l => delete l.criterios[s.dataset.crit]);
      const e = elem(s.value); if (e?.tercero_id && !c.tercero_id) c.tercero_id = e.tercero_id; // la obra trae su cliente
      pintar();
    });
    // Líneas
    const tb = m.querySelector('.cq-lineas tbody');
    tb.addEventListener('input', ev => {
      const tr = ev.target.closest('tr'), l = c.lineas[Number(tr.dataset.i)], k = ev.target.dataset.k; if (!k || k === 'producto_id') return;
      l[k] = ['cantidad', 'precio', 'descuento_pct', 'iva_pct'].includes(k) ? X.num(ev.target.value) : ev.target.value;
      tr.querySelector('[data-tot]').textContent = money(totalLineaCot(l)); totalesTxt();
    });
    tb.addEventListener('change', ev => {
      const tr = ev.target.closest('tr'); if (!tr) return; const l = c.lineas[Number(tr.dataset.i)];
      if (ev.target.dataset.k === 'producto_id') {
        const p = prods.find(x => x.id === ev.target.value); l.producto_id = p?.id || '';
        if (p) Object.assign(l, { codigo: p.codigo || '', descripcion: p.nombre, unidad: p.unidad || 'UND', precio: X.num(p.precio), iva_pct: X.num(p.iva_pct) });
        pintar();
      }
      if (ev.target.dataset.lc) { if (ev.target.value) l.criterios[ev.target.dataset.lc] = ev.target.value; else delete l.criterios[ev.target.dataset.lc]; }
      if (ev.target.dataset.op !== undefined) { l.op = ev.target.value === 'horas' ? true : ev.target.value === 'fijo' ? 'fijo' : false; if (l.op !== 'fijo') delete l.facturado; }
    });
    tb.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { c.lineas.splice(Number(b.dataset.del), 1); if (!c.lineas.length) c.lineas.push(nuevaLinea()); pintar(); });
    X.$('cqAdd').onclick = () => { c.lineas.push(nuevaLinea()); pintar(); m.querySelector(`tr[data-i="${c.lineas.length - 1}"] [data-k=descripcion]`)?.focus(); };
    X.$('cqSave').onclick = guardar;
    if (X.$('cqImp')) X.$('cqImp').onclick = () => imprimir(prev);
    if (X.$('cqDel')) X.$('cqDel').onclick = async () => {
      if (!await X.confirmar('Eliminar cotización', `Se elimina la cotización N.º ${prev.numero}. Las facturas ya hechas no cambian.`, 'Eliminar')) return;
      try { await X.store.remove('cotizaciones', prev.id); await X.cargarEmpresa(); X.toast('Cotización eliminada.'); location.hash = '#/cotizaciones'; } catch (e) { X.fail(faltaSql(e)); }
    };
  };
  const totalesTxt = () => {
    const tt = totales(c.lineas, {});
    X.$('cqTot').innerHTML = `<dl class="tot"><dt>Subtotal</dt><dd class="mono">${money(tt.bruto)}</dd>${tt.descuento ? `<dt>Descuentos</dt><dd class="mono">−${money(tt.descuento)}</dd>` : ''}${tt.porTarifa.filter(x => x.tarifa > 0).map(x => `<dt>IVA ${x.tarifa}%</dt><dd class="mono">${money(x.iva)}</dd>`).join('')}<dt class="strong">Total</dt><dd class="mono strong">${money(tt.total)}</dd></dl>${c.op_tipo_id ? '<p class="hint">"Con horas" se cobra por las horas reales registradas en Operación (la cantidad aquí es de referencia). "Una vez" sale sola en la primera factura de esta cotización, por ejemplo la movilización.</p>' : ''}`;
  };
  const guardar = async () => {
    const err = X.$('cqErr'); err.hidden = true;
    const lineas = c.lineas.filter(l => String(l.descripcion).trim() || X.num(l.precio)).map(l => ({ ...l, descripcion: String(l.descripcion).trim(), cantidad: X.num(l.cantidad), precio: X.num(l.precio), descuento_pct: X.num(l.descuento_pct), iva_pct: X.num(l.iva_pct), producto_id: l.producto_id || null, op: c.op_tipo_id ? (l.op === 'fijo' ? 'fijo' : l.op !== false) : false, criterios: c.op_tipo_id ? l.criterios : {} }));
    const row = { ...c, lineas, criterios: c.op_tipo_id ? c.criterios : {}, op_tipo_id: c.op_tipo_id || null, vence: c.vence || null };
    const errores = erroresCotizacion(row); if (errores.length) { err.textContent = errores[0]; err.hidden = false; return; }
    const tt = totales(lineas, {});
    Object.assign(row, { bruto: tt.bruto, descuento: tt.descuento, base: tt.base, iva: tt.iva, total: tt.total, empresa_id: X.S.eid });
    if (!prev) row.numero = Math.max(0, ...cots().map(x => Number(x.numero) || 0)) + 1;
    try { const g = await X.store.save('cotizaciones', row); await X.cargarEmpresa(); X.toast(prev ? 'Cotización guardada.' : `Cotización N.º ${g.numero} creada.`); location.hash = '#/cotizacion/' + g.id; if (prev) X.route(); }
    catch (e) { err.textContent = faltaSql(e).message; err.hidden = false; }
  };
  pintar();
}

/* ---------- Impresión ---------- */
function imprimir(c) {
  const { esc, money } = X, tr = terc(c.tercero_id), tt = totales(c.lineas || [], {}), am = amarre(c);
  X.$('print').innerHTML = `<article class="desprendible">${X.cabInforme('Cotización', `N.º ${c.numero}<br><small>${X.fFecha(c.fecha)}${c.vence ? ' · válida hasta ' + X.fFecha(c.vence) : ''}</small>`)}
    <div class="grid2"><div><b>CLIENTE</b><br>${esc(tr?.nombre || '')}<br><span class="muted">${esc(X.docId(tr))}</span>${tr?.direccion ? `<br><span class="muted">${esc(tr.direccion)}${tr.ciudad ? ', ' + esc(tr.ciudad) : ''}</span>` : ''}</div><div>${am ? `<b>Aplica a:</b> ${esc(am)}` : ''}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Descripción</th><th class="r">Cant.</th><th>Unidad</th><th class="r">Precio</th>${tt.descuento ? '<th class="r">Desc.</th>' : ''}<th class="r">IVA</th><th class="r">Total</th></tr></thead><tbody>
    ${(c.lineas || []).map(l => { const crit = Object.values(l.criterios || {}).map(x => elem(x)?.nombre).filter(Boolean).join(', '); return `<tr><td>${esc(l.descripcion)}${crit ? `<br><small class="muted">${esc(crit)}</small>` : ''}</td><td class="r mono">${X.num(l.cantidad).toLocaleString('es-CO')}</td><td>${esc(l.unidad || '')}</td><td class="r mono">${money(l.precio)}</td>${tt.descuento ? `<td class="r">${X.num(l.descuento_pct) ? X.num(l.descuento_pct) + ' %' : ''}</td>` : ''}<td class="r">${X.num(l.iva_pct)} %</td><td class="r mono">${money(totalLineaCot(l))}</td></tr>`; }).join('')}</tbody></table></div>
    <dl class="tot"><dt>Subtotal</dt><dd class="mono">${money(tt.base)}</dd>${tt.porTarifa.filter(x => x.tarifa > 0).map(x => `<dt>IVA ${x.tarifa}%</dt><dd class="mono">${money(x.iva)}</dd>`).join('')}<dt class="strong">Total</dt><dd class="mono big">${money(tt.total)}</dd></dl><p class="hint letras">${enLetras(tt.total)}</p>
    ${c.condiciones ? `<p><b>Condiciones:</b> ${esc(c.condiciones).replace(/\n/g, '<br>')}</p>` : ''}${c.observaciones ? `<p class="hint">${esc(c.observaciones).replace(/\n/g, '<br>')}</p>` : ''}
    <div class="firmas"><span>${esc(X.emp().nombre)}</span><span>Aceptada · ${esc(tr?.nombre || '')}</span></div></article>`;
  const tt0 = document.title; document.title = `Cotización ${c.numero} - ${tr?.nombre || ''}`; window.print(); document.title = tt0;
}
