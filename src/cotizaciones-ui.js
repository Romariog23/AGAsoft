// Cotizaciones (Ventas): no mueven contabilidad. Fijan el precio de cobro y, si se amarran a un tipo de Operación
// (obra, equipo…), las horas registradas se facturan desde Operación con ese precio. Tabla: supabase/038_cotizaciones.sql.
import { cfgTipo, avanceCotizacion, ESTADOS_COT, erroresCotizacion, totalLineaCot, COBRO_LINEA, cobroDeLinea } from './operacion.js';
import { operacionActiva, modoOperacion } from './operacion-ui.js';
import { tipoMaq } from './maquinaria-ui.js';
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
const faltaSql = e => /ajuste_op/i.test(e?.message || '') ? new Error('Para el ajuste al operador falta correr en Supabase el archivo supabase/039_op_ajuste.sql.') : /cotizaciones|schema cache|does not exist/i.test(e?.message || '') ? new Error('Falta correr en Supabase el archivo supabase/038_cotizaciones.sql.') : e;
const ESTADO_TAG = { abierta: 'demo', aceptada: 'ok', rechazada: 'bad', cerrada: '' };
const nomEstado = e => (ESTADOS_COT.find(x => x[0] === e) || [e, e])[1];
const obraDe = c => elem(c?.criterios?.obra)?.nombre || '';
const amarre = c => { const t = tipoById(c.op_tipo_id); if (!t) return ''; const els = Object.values(c.criterios || {}).filter(Boolean).map(id => elem(id)?.nombre).filter(Boolean); return [t.nombre, ...els].join(' · '); };
// Dos diseños: estándar (cualquier empresa) y de maquinaria (solo con Operación activa en modo maquinaria; la amarra op_tipo_id).
export const maqActiva = () => modoOperacion() === 'maquinaria' && !!tipoMaq();
const esMaq = c => !!c?.op_tipo_id;
const COND_MAQ = 'Mínimo de horas: \nOperador: incluido\nCombustible: \nMovilización: \nLas horas se facturan según el horómetro de cada recibo firmado en obra.\nForma de pago: ';
const nuevaLinea = () => ({ producto_id: '', codigo: '', descripcion: '', unidad: 'UND', cantidad: 1, precio: 0, descuento_pct: 0, iva_pct: 19, op: true, criterios: {} });

/* ---------- Lista ---------- */
let filtro = '';
export function vCotizaciones(m) {
  const { esc, money } = X;
  const todas = [...cots()].sort((a, b) => Number(b.numero) - Number(a.numero));
  const ls = todas.filter(c => !filtro || c.estado === filtro);
  const cuenta = e => todas.filter(c => c.estado === e).length;
  m.innerHTML = `<header class="vhead"><div><h2>Cotizaciones</h2><p class="sub">Precios ofrecidos a tus clientes. No mueven la contabilidad. ${maqActiva() ? 'Las de maquinaria son los proyectos de Operación: sus horas se facturan con su precio.' : ''}</p></div><div class="row">${maqActiva() ? '<a class="btn" href="#/cotizacion/nueva-maq">Nueva de maquinaria</a>' : ''}<a class="btn primary" href="#/cotizacion/nueva">Nueva cotización</a></div></header>
  <div class="seg" role="tablist"><button type="button" data-f="" aria-selected="${!filtro}">Todas (${todas.length})</button>${ESTADOS_COT.map(([k, n]) => `<button type="button" data-f="${k}" aria-selected="${filtro === k}">${n} (${cuenta(k)})</button>`).join('')}</div>
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>N.º</th><th>Fecha</th><th>Cliente</th><th>Diseño</th><th class="r">Total</th><th>Estado</th></tr></thead><tbody>
  ${ls.map(c => `<tr class="click" data-c="${c.id}"><td class="mono">${c.numero}</td><td>${X.fFecha(c.fecha)}${c.vence && c.vence < X.hoy() && c.estado === 'abierta' ? ' <span class="tag bad">Vencida</span>' : ''}</td><td><b>${esc(nomT(c.tercero_id))}</b></td><td>${esMaq(c) ? `<span class="tag ok">Maquinaria</span> ${esc(obraDe(c))}` : '<span class="muted">Estándar</span>'}</td><td class="r mono">${money(c.total)}</td><td><span class="tag ${ESTADO_TAG[c.estado] || ''}">${nomEstado(c.estado)}</span></td></tr>`).join('') || `<tr><td colspan="6" class="muted">${todas.length ? 'No hay cotizaciones con ese estado.' : 'Todavía no hay cotizaciones.'}</td></tr>`}
  </tbody></table></div></section>`;
  m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtro = b.dataset.f; vCotizaciones(m); });
  m.querySelectorAll('[data-c]').forEach(tr => tr.onclick = () => { location.hash = '#/cotizacion/' + tr.dataset.c; });
}

/* ---------- Editor ---------- */
export function vCotizacion(m, id) {
  const { esc, money } = X, nueva = id === 'nueva' || id === 'nueva-maq', prev = id && !nueva ? cotById(id) : null;
  if (id && !nueva && !prev) { location.hash = '#/cotizaciones'; return; }
  if (id === 'nueva-maq' && !maqActiva()) { location.hash = '#/cotizacion/nueva'; return; }
  const c = prev ? JSON.parse(JSON.stringify(prev)) : { fecha: X.hoy(), vence: X.sumarDias(X.hoy(), 30), tercero_id: '', estado: 'abierta', op_tipo_id: null, criterios: {}, lineas: [nuevaLinea()], observaciones: '', condiciones: '' };
  c.criterios = c.criterios || {}; c.lineas = (c.lineas || []).map(l => ({ ...nuevaLinea(), ...l, criterios: l.criterios || {} }));
  // Diseño de maquinaria: la cotización es el proyecto de Operación (queda amarrada al tipo de maquinaria).
  if (id === 'nueva-maq') { c.op_tipo_id = tipoMaq().id; c.condiciones = COND_MAQ; c.lineas = [{ ...nuevaLinea(), unidad: 'H' }]; }
  const opOn = esMaq(c);
  c.nuevos = {}; // elementos por crear al guardar (p. ej. la obra nueva del proyecto)
  const clientes = [...X.S.d.terceros].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const prods = (X.S.d.productos || []).filter(p => p.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Avance del proyecto: horas ejecutadas en Operación contra las proyectadas, y adiciones cuando se acaban.
  const tipoP = prev?.op_tipo_id ? tipoById(prev.op_tipo_id) : null;
  const avanceHtml = () => {
    if (!tipoP) return '';
    const u = cfgTipo(tipoP).unidad || '', av = avanceCotizacion(prev, X.S.d.op_registros || [], tipoP, cots()).filter(x => x.horas);
    if (!av.length) return '';
    const f = v => X.num(v).toLocaleString('es-CO', { maximumFractionDigits: 2 });
    return `<section class="panel stack"><header class="vhead"><div><h3>Avance del proyecto</h3><p class="hint">Lo ejecutado sale de los recibos de ${esc(tipoP.nombre)}. Las cantidades cotizadas casi siempre se extienden: cuando se acaben, adiciona las que faltan.</p></div></header>
      ${av.map(x => { const l = prev.lineas[x.i], ad = l.adiciones || []; return `<div class="op-bar-row"><div class="row between"><b>${esc(x.descripcion || 'Línea ' + (x.i + 1))}</b><span class="row"><span class="mono">${f(x.ejecutado)} de ${f(x.proyectado)} ${esc(u)} · saldo ${f(x.saldo)}</span><button type="button" class="sm ${x.saldo <= 0 ? 'primary' : 'ghost'}" data-adi="${x.i}">Adicionar</button></span></div>
        <div class="op-bar"><i style="width:${Math.min(100, x.pct)}%" class="${x.saldo <= 0 ? 'over' : x.pct >= 80 ? 'warn' : ''}"></i></div>
        ${ad.length ? `<p class="hint">Cotizado inicial ${f(x.proyectado - x.adicionado)} ${esc(u)} · ${ad.map(a => `+${f(a.cantidad)} el ${X.fFecha(a.fecha)}${a.nota ? ' (' + esc(a.nota) + ')' : ''}`).join(' · ')}</p>` : ''}</div>`; }).join('')}</section>`;
  };
  const adicionar = i => { const l = prev.lineas[i], av = avanceCotizacion(prev, X.S.d.op_registros || [], tipoP, cots())[i];
    X.dialogo(`<h2>Adicionar a la cotización N.º ${prev.numero}</h2><p class="hint">${esc(l.descripcion || '')}: van ${X.num(av.ejecutado).toLocaleString('es-CO')} de ${X.num(av.proyectado).toLocaleString('es-CO')}.</p>
      <div class="grid2">${X.campo('cantidad', 'Cantidad a adicionar *', av.saldo < 0 ? String(-av.saldo).replace('.', ',') : '', 'required class="mono" inputmode="decimal"')}${X.campo('fecha', 'Fecha', X.hoy(), 'type="date"')}</div>
      ${X.campo('nota', 'Nota (opcional)', '', 'maxlength="200" placeholder="Ej.: aprobado por el cliente por correo"')}${X.pie()}`, async fd => {
      const q = X.num(fd.get('cantidad')); if (!(q > 0)) throw new Error('La cantidad debe ser mayor que cero.');
      const lineas = prev.lineas.map((x, j) => j !== i ? x : { ...x, cantidad: X.num(x.cantidad) + q, adiciones: [...(x.adiciones || []), { fecha: fd.get('fecha') || X.hoy(), cantidad: q, nota: String(fd.get('nota') || '').trim() }] });
      const tt = totales(lineas, {});
      await X.store.save('cotizaciones', { id: prev.id, lineas, bruto: tt.bruto, descuento: tt.descuento, base: tt.base, iva: tt.iva, total: tt.total }); await X.cargarEmpresa();
      X.toast(`Se adicionaron ${q.toLocaleString('es-CO')} a la cotización N.º ${prev.numero}.`); X.route();
    }); };
  const pintar = () => {
    const t = tipoById(c.op_tipo_id), celT = camposEl(t), cel = celT.filter(f => f.k === 'obra'), libres = celT.filter(f => f.k !== 'obra' && !c.criterios[f.k]);
    m.innerHTML = `<header class="vhead"><div><a class="back" href="#/cotizaciones">← Cotizaciones</a><h2>${prev ? `Cotización${opOn ? ' de maquinaria' : ''} N.º ${prev.numero}` : opOn ? 'Nueva cotización de maquinaria' : 'Nueva cotización'}</h2>${prev ? `<p class="sub"><span class="tag ${ESTADO_TAG[prev.estado] || ''}">${nomEstado(prev.estado)}</span></p>` : ''}</div>
      <div class="row">${prev ? `<button class="ghost" id="cqDel">Eliminar</button><button id="cqImp">Imprimir</button>${t && operacionActiva() && cfgTipo(t).salidas.cobro === 'fv' ? `<a class="btn" href="#/opfacturar/${t.id}?cot=${prev.id}">Facturar horas</a>` : ''}` : ''}<button class="primary" id="cqSave">Guardar</button></div></header>
    <p class="err" id="cqErr" hidden></p>
    <section class="panel"><div class="cq-grid">
      <div><label for="cqCli">Cliente</label><select id="cqCli"><option value="">Escoge el cliente</option>${clientes.map(x => `<option value="${x.id}" ${x.id === c.tercero_id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></div>
      <div><label for="cqF">Fecha</label><input id="cqF" type="date" value="${c.fecha || ''}"></div>
      <div><label for="cqV">Válida hasta</label><input id="cqV" type="date" value="${c.vence || ''}"></div>
      <div><label for="cqE">Estado</label><select id="cqE">${X.opts(ESTADOS_COT, c.estado)}</select></div></div></section>
    ${opOn ? `<section class="panel stack"><h3>Proyecto</h3><p class="hint">Esta cotización es el proyecto: aparece de una para escogerla en los recibos y sus horas se facturan con estos valores. Si la obra no existe, escoge "+ Crear obra…" y escribe el nombre.</p>
      <div class="cq-grid">
      ${cel.map(f => `<div><label for="cqC_${f.k}">${esc(f.nombre)}</label><select id="cqC_${f.k}" data-crit="${f.k}"><option value="">Sin ${esc(f.nombre.toLowerCase())}</option>${elementosDe(t, f.lista).map(e => `<option value="${e.id}" ${e.id === c.criterios[f.k] ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}<option value="__nueva" ${c.nuevos[f.k] != null ? 'selected' : ''}>+ Crear ${esc(f.nombre.toLowerCase())}…</option></select>${c.nuevos[f.k] != null ? `<input id="cqN_${f.k}" data-nuevo="${f.k}" value="${esc(c.nuevos[f.k])}" placeholder="Nombre (ej.: CORTEVA)" maxlength="80" style="margin-top:6px">` : ''}</div>`).join('')}</div>
      ${t ? `<div class="cq-grid"><div><label for="cqA">Ajuste adicional al operador por hora (opcional)</label><input id="cqA" class="mono" inputmode="decimal" value="${X.num(c.ajuste_op) ? X.num(c.ajuste_op) : ''}" placeholder="0"></div></div>
      <p class="hint">Se suma a la tarifa de programación de cada operador, solo en los registros de este proyecto. Sale como línea aparte en el volante y el documento soporte. No cambia lo que se le cobra al cliente.</p>` : ''}</section>` : ''}
    <section class="panel stack"><h3>Líneas</h3><div class="tbl-wrap"><table class="tbl cq-lineas"><thead><tr><th>${t ? 'Ítem a facturar' : 'Producto y descripción'}</th>${t ? libres.map(f => `<th>${esc(f.nombre)}</th>`).join('') : ''}<th class="r">${t ? 'Horas proy.' : 'Cant.'}</th><th>Unidad</th><th class="r">${t ? 'Valor hora' : 'Valor unitario'}</th><th class="r">Desc. %</th><th class="r">IVA %</th>${t ? '<th title="Con horas: por las horas registradas. Una vez: en la primera factura (movilización). No: se agrega a mano.">Cobro</th>' : ''}<th class="r">Total</th><th></th></tr></thead><tbody>
      ${c.lineas.map((l, i) => `<tr data-i="${i}"><td><select data-k="producto_id"><option value="">—</option>${prods.map(p => `<option value="${p.id}" ${p.id === l.producto_id ? 'selected' : ''}>${esc(p.codigo)} · ${esc(p.nombre)}</option>`).join('')}</select><input data-k="descripcion" value="${esc(l.descripcion)}" maxlength="300" placeholder="Descripción" style="margin-top:4px"></td>
        ${t ? libres.map(f => `<td><select data-lc="${f.k}"><option value="">${l.op === false ? '—' : 'Cualquiera'}</option>${elementosDe(t, f.lista).map(e => `<option value="${e.id}" ${e.id === l.criterios[f.k] ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></td>`).join('') : ''}
        <td><input data-k="cantidad" type="number" step="any" min="0" class="r" value="${l.cantidad}"></td><td><input data-k="unidad" value="${esc(l.unidad)}" maxlength="10" size="5"></td>
        <td><input data-k="precio" type="number" step="any" min="0" class="r" value="${l.precio}"></td><td><input data-k="descuento_pct" type="number" step="any" min="0" max="100" class="r" value="${l.descuento_pct}"></td>
        <td><input data-k="iva_pct" type="number" step="any" min="0" class="r" value="${l.iva_pct}"></td>
        ${t ? `<td><select data-op>${X.opts(COBRO_LINEA, cobroDeLinea(l))}</select>${l.op === 'fijo' && l.facturado ? '<br><small class="hint">Ya facturada</small>' : ''}</td>` : ''}<td><input data-k="total" data-tot type="number" step="any" min="0" class="r" value="${totalLineaCot(l) || ''}" title="Escribe el total y se calcula el valor unitario"></td><td><button type="button" class="sm ghost" data-del="${i}" title="Quitar línea">✕</button></td></tr>`).join('')}
      </tbody></table></div><div class="row"><button type="button" class="ghost" id="cqAdd">+ Agregar línea</button></div><div id="cqTot"></div></section>
    ${avanceHtml()}
    <section class="panel"><div class="grid2"><div><label for="cqO">Observaciones</label><textarea id="cqO" rows="3" maxlength="2000">${esc(c.observaciones || '')}</textarea></div><div><label for="cqK">${opOn ? 'Condiciones del servicio (una por renglón; las que dejes vacías no se imprimen)' : 'Condiciones (forma de pago, tiempos de entrega…)'}</label><textarea id="cqK" rows="${opOn ? 7 : 3}" maxlength="2000">${esc(c.condiciones || '')}</textarea></div></div></section>`;
    totalesTxt();
    // Encabezado
    X.$('cqCli').onchange = e => { c.tercero_id = e.target.value; };
    X.$('cqF').onchange = e => { c.fecha = e.target.value; }; X.$('cqV').onchange = e => { c.vence = e.target.value; }; X.$('cqE').onchange = e => { c.estado = e.target.value; };
    X.$('cqO').oninput = e => { c.observaciones = e.target.value; }; X.$('cqK').oninput = e => { c.condiciones = e.target.value; };
    if (X.$('cqA')) X.$('cqA').oninput = e => { c.ajuste_op = X.num(e.target.value); };
    m.querySelectorAll('[data-nuevo]').forEach(i => i.oninput = () => { c.nuevos[i.dataset.nuevo] = i.value; });
    m.querySelectorAll('[data-crit]').forEach(s => s.onchange = () => {
      if (s.value === '__nueva') { c.nuevos[s.dataset.crit] = ''; delete c.criterios[s.dataset.crit]; pintar(); X.$('cqN_' + s.dataset.crit)?.focus(); return; }
      delete c.nuevos[s.dataset.crit];
      c.criterios[s.dataset.crit] = s.value || undefined; if (!s.value) delete c.criterios[s.dataset.crit];
      c.lineas.forEach(l => delete l.criterios[s.dataset.crit]);
      const e = elem(s.value); if (e?.tercero_id && !c.tercero_id) c.tercero_id = e.tercero_id; // la obra trae su cliente
      pintar();
    });
    // Líneas
    const tb = m.querySelector('.cq-lineas tbody');
    tb.addEventListener('input', ev => {
      const tr = ev.target.closest('tr'), l = c.lineas[Number(tr.dataset.i)], k = ev.target.dataset.k; if (!k || k === 'producto_id') return;
      if (k === 'total') { // escribe el total: el valor unitario sale de total ÷ (cantidad × (1 − descuento))
        const div = X.num(l.cantidad) * (1 - X.num(l.descuento_pct) / 100);
        if (!div) { if (!X.num(l.cantidad)) { l.cantidad = 1; tr.querySelector('[data-k=cantidad]').value = 1; } }
        const d2 = X.num(l.cantidad) * (1 - X.num(l.descuento_pct) / 100);
        l.precio = d2 ? Math.round(X.num(ev.target.value) / d2 * 1e6) / 1e6 : 0;
        tr.querySelector('[data-k=precio]').value = l.precio; totalesTxt(); return;
      }
      l[k] = ['cantidad', 'precio', 'descuento_pct', 'iva_pct'].includes(k) ? X.num(ev.target.value) : ev.target.value;
      tr.querySelector('[data-tot]').value = totalLineaCot(l) || ''; totalesTxt();
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
    m.querySelectorAll('[data-adi]').forEach(b => b.onclick = () => adicionar(+b.dataset.adi));
    X.$('cqAdd').onclick = () => { c.lineas.push(opOn ? { ...nuevaLinea(), unidad: 'H' } : nuevaLinea()); pintar(); m.querySelector(`tr[data-i="${c.lineas.length - 1}"] [data-k=descripcion]`)?.focus(); };
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
    // Obra (u otro elemento) nueva escrita en la cotización: se crea en la lista del tipo y queda amarrada.
    const tN = tipoById(c.op_tipo_id);
    for (const [k, nombre] of Object.entries(c.nuevos || {})) {
      const f = camposEl(tN).find(x => x.k === k); if (!f) continue;
      const nom = String(nombre || '').trim(); if (!nom) { err.textContent = `Escribe el nombre para crear ${f.nombre.toLowerCase()}.`; err.hidden = false; return; }
      const ya = (X.S.d.op_elementos || []).find(e => e.tipo_id === tN.id && e.lista === f.lista && e.nombre.trim().toLowerCase() === nom.toLowerCase());
      try { const e = ya || await X.store.save('op_elementos', { empresa_id: X.S.eid, tipo_id: tN.id, lista: f.lista, codigo: '', nombre: nom, datos: {}, tercero_id: c.tercero_id || null, activo: true }); c.criterios[k] = e.id; }
      catch (e) { err.textContent = e.message; err.hidden = false; return; }
    }
    c.nuevos = {};
    const { nuevos: _n, ...c2 } = c;
    const row = { ...c2, lineas, criterios: c.op_tipo_id ? c.criterios : {}, op_tipo_id: c.op_tipo_id || null, vence: c.vence || null };
    // ajuste_op (039_op_ajuste.sql): solo se envía si tiene valor o ya existía, para no romper el guardado antes de correr el SQL.
    if (c.op_tipo_id && X.num(c.ajuste_op) > 0) row.ajuste_op = X.num(c.ajuste_op); else if (prev && 'ajuste_op' in prev) row.ajuste_op = 0; else delete row.ajuste_op;
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
// Dos diseños: estándar (producto, cantidad, valor unitario) y de maquinaria (obra, máquina, horas proyectadas, valor hora, condiciones del servicio).
function imprimir(c) {
  const { esc, money } = X, tr = terc(c.tercero_id), tt = totales(c.lineas || [], {}), maq = esMaq(c);
  const cliente = `<div><b>CLIENTE</b><br>${esc(tr?.nombre || '')}<br><span class="muted">${esc(X.docId(tr))}</span>${tr?.direccion ? `<br><span class="muted">${esc(tr.direccion)}${tr.ciudad ? ', ' + esc(tr.ciudad) : ''}</span>` : ''}${tr?.telefono ? `<br><span class="muted">${esc(tr.telefono)}</span>` : ''}</div>`;
  const totHtml = `<dl class="tot"><dt>Subtotal</dt><dd class="mono">${money(tt.bruto)}</dd>${tt.descuento ? `<dt>Descuentos</dt><dd class="mono">−${money(tt.descuento)}</dd>` : ''}${tt.porTarifa.filter(x => x.tarifa > 0).map(x => `<dt>IVA ${x.tarifa}%</dt><dd class="mono">${money(x.iva)}</dd>`).join('')}<dt class="strong">Total</dt><dd class="mono big">${money(tt.total)}</dd></dl><p class="hint letras">${enLetras(tt.total)}</p>`;
  const cant = v => X.num(v).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  const firmas = `<div class="firmas"><span>${esc(X.emp().nombre)}</span><span>Aceptada · ${esc(tr?.nombre || '')}</span></div>`;
  const cab = X.cabInforme(maq ? 'Cotización de alquiler de maquinaria' : 'Cotización', `N.º ${c.numero}<br><small>${X.fFecha(c.fecha)}${c.vence ? ' · válida hasta ' + X.fFecha(c.vence) : ''}</small>`);
  let cuerpo;
  if (maq) {
    const obra = obraDe(c), conds = String(c.condiciones || '').split('\n').map(x => x.trim()).filter(x => x && !/:\s*$/.test(x));
    cuerpo = `<div class="grid2">${cliente}<div><b>OBRA O PROYECTO</b><br>${esc(obra || '—')}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Máquina</th><th>Servicio</th><th class="r">Horas proyectadas</th><th class="r">Valor hora</th>${tt.descuento ? '<th class="r">Desc.</th>' : ''}<th class="r">IVA</th><th class="r">Total</th></tr></thead><tbody>
    ${(c.lineas || []).map(l => { const maqN = elem(l.criterios?.equipo)?.nombre || ''; const unica = l.op === 'fijo'; return `<tr><td>${esc(maqN || (unica ? '—' : 'Según disponibilidad'))}</td><td>${esc(l.descripcion)}${unica ? '<br><small class="muted">Cobro único</small>' : ''}</td><td class="r mono">${unica ? '' : cant(l.cantidad) + ' ' + esc(l.unidad || 'H')}</td><td class="r mono">${unica ? '' : money(l.precio)}</td>${tt.descuento ? `<td class="r">${X.num(l.descuento_pct) ? X.num(l.descuento_pct) + ' %' : ''}</td>` : ''}<td class="r">${X.num(l.iva_pct)} %</td><td class="r mono">${money(totalLineaCot(l))}</td></tr>`; }).join('')}</tbody></table></div>
    ${totHtml}<p class="hint">Las horas proyectadas son de referencia: se factura lo ejecutado según el horómetro de cada recibo firmado en obra.</p>
    ${conds.length ? `<div><b>CONDICIONES DEL SERVICIO</b><ul>${conds.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}${c.observaciones ? `<p class="hint">${esc(c.observaciones).replace(/\n/g, '<br>')}</p>` : ''}`;
  } else {
    cuerpo = `<div class="grid2">${cliente}<div></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Código</th><th>Descripción</th><th class="r">Cant.</th><th>Unidad</th><th class="r">Valor unitario</th>${tt.descuento ? '<th class="r">Desc.</th>' : ''}<th class="r">IVA</th><th class="r">Total</th></tr></thead><tbody>
    ${(c.lineas || []).map(l => `<tr><td class="mono">${esc(l.codigo || '')}</td><td>${esc(l.descripcion)}</td><td class="r mono">${cant(l.cantidad)}</td><td>${esc(l.unidad || '')}</td><td class="r mono">${money(l.precio)}</td>${tt.descuento ? `<td class="r">${X.num(l.descuento_pct) ? X.num(l.descuento_pct) + ' %' : ''}</td>` : ''}<td class="r">${X.num(l.iva_pct)} %</td><td class="r mono">${money(totalLineaCot(l))}</td></tr>`).join('')}</tbody></table></div>
    ${totHtml}${c.condiciones ? `<p><b>Condiciones:</b> ${esc(c.condiciones).replace(/\n/g, '<br>')}</p>` : ''}${c.observaciones ? `<p class="hint">${esc(c.observaciones).replace(/\n/g, '<br>')}</p>` : ''}`;
  }
  X.$('print').innerHTML = `<article class="desprendible">${cab}${cuerpo}${firmas}</article>`;
  const tt0 = document.title; document.title = `Cotización ${c.numero} - ${tr?.nombre || ''}`; window.print(); document.title = tt0;
}
