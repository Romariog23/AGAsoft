// Operación: registros operativos configurables por empresa que NO generan movimientos contables.
// Cada empresa arma sus "tipos de operación" (maquinaria amarilla, viajes, jornales…) con seis piezas:
// listas, campos, fórmulas, tarifas, reglas de día y salidas. Aquí solo hay lógica pura (sin pantalla).
// Tablas: supabase/037_operacion.sql (op_tipos, op_elementos, op_tarifas, op_registros, op_cortes).
import { holidays } from './calendario/engine.js';
import { distPonderada, normDist } from './centros.js';

const fx = x => String(r2(x)).replace('.', ',');
const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const n = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return 0; const t = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s; const x = Number(t); return Number.isFinite(x) ? x : 0; };

/* ---------- Piezas ---------- */
export const TIPOS_CAMPO = [
  ['numero', 'Número'], ['lectura', 'Lectura inicial y final (horómetro, odómetro)'], ['texto', 'Texto'],
  ['lista', 'Lista de opciones'], ['sino', 'Sí / No'], ['elemento', 'Elemento de una lista (equipo, obra…)'],
];
export const MODOS_TARIFA = [['unidad', 'Por unidad (hora, viaje, kg)'], ['registro', 'Por registro (día o servicio)'], ['fijo', 'Valor fijo por corte']];
export const USOS_TARIFA = [['pago', 'Programación (lo que se le reconoce a la persona)'], ['cobro', 'Cobro (lo que se le cobra al cliente)']];
export const CUANDO = [['dominical_festivo', 'Domingo o festivo'], ['domingo', 'Solo domingo'], ['festivo', 'Solo festivo'], ['sabado', 'Sábado'], ['siempre', 'Siempre']];
export const SALIDAS_PAGO = [['ninguno', 'No se programa (solo control)'], ['ds', 'Documento soporte'], ['nomina', 'Novedad de nómina']];
export const SALIDAS_COBRO = [['ninguno', 'No se factura'], ['fv', 'Factura de venta']];
const FUNCIONES = { min: Math.min, max: Math.max, redondear: (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; } };
export const VARIABLES_FIJAS = ['cantidad', 'pagadas', 'tarifa'];

/* ---------- Plantillas ---------- */
// Tipos ya armados. La empresa copia la plantilla y la cambia a su gusto.
export const PLANTILLAS = {
  maquinaria: {
    nombre: 'Maquinaria amarilla', icono: 'maquina',
    descripcion: 'Recibos de horas máquina por operador y máquina, amarrados a la cotización del proyecto. Valor hora por operador, acumulado de horómetro y recargo de domingo y festivo.',
    config: {
      persona: 'Operador', unidad: 'h',
      listas: [
        { k: 'equipos', nombre: 'Equipos', campos: [{ k: 'modelo', nombre: 'Modelo', tipo: 'texto' }, { k: 'serie', nombre: 'Serie o placa', tipo: 'texto' }], nivel_cc: null },
        { k: 'obras', nombre: 'Obras', campos: [{ k: 'lugar', nombre: 'Lugar', tipo: 'texto' }], nivel_cc: null },
      ],
      campos: [
        { k: 'equipo', nombre: 'Equipo', tipo: 'elemento', lista: 'equipos', obligatorio: true },
        { k: 'obra', nombre: 'Obra', tipo: 'elemento', lista: 'obras', obligatorio: true },
        { k: 'soporte', nombre: 'Soporte', tipo: 'lista', opciones: ['Recibo firmado', 'Foto horómetro', 'Reporte del operador', 'Sin soporte'] },
        { k: 'recibo', nombre: 'N.º de recibo', tipo: 'texto' },
        { k: 'actividad', nombre: 'Actividad', tipo: 'texto' },
        { k: 'horometro', nombre: 'Horómetro', tipo: 'lectura' },
      ],
      formulas: { cantidad: 'horometro', valor: 'pagadas * tarifa' },
      editar_pagadas: true,
      continuidad: { lectura: 'horometro', por: 'equipo' },
      pendiente: { campo: 'soporte', valores: ['Foto horómetro', 'Reporte del operador', 'Sin soporte'] },
      tarifa_por: ['tercero', 'equipo', 'obra'],
      constantes: [{ k: 'salario_base', nombre: 'Salario base del recargo', valor: 1750905 }],
      reglas: [{ nombre: 'Recargo dominical y festivo', cuando: 'dominical_festivo', formula: 'pagadas * salario_base / 210 * 1.9', terceros: [] }],
      salidas: { pago: 'ds', cobro: 'fv' },
    },
  },
  viajes: {
    nombre: 'Volquetas y viajes', icono: 'camion',
    descripcion: 'Viajes por vehículo y ruta, con metros cúbicos o toneladas. Pago y cobro por viaje.',
    config: {
      persona: 'Conductor', unidad: 'viajes',
      listas: [{ k: 'vehiculos', nombre: 'Vehículos', campos: [{ k: 'placa', nombre: 'Placa', tipo: 'texto' }], nivel_cc: null }, { k: 'rutas', nombre: 'Rutas', campos: [], nivel_cc: null }],
      campos: [
        { k: 'vehiculo', nombre: 'Vehículo', tipo: 'elemento', lista: 'vehiculos', obligatorio: true },
        { k: 'ruta', nombre: 'Ruta', tipo: 'elemento', lista: 'rutas', obligatorio: true },
        { k: 'viajes', nombre: 'Viajes', tipo: 'numero', obligatorio: true },
        { k: 'm3', nombre: 'm³ por viaje', tipo: 'numero' },
        { k: 'remision', nombre: 'Remisión', tipo: 'texto' },
      ],
      formulas: { cantidad: 'viajes', valor: 'pagadas * tarifa' },
      editar_pagadas: false, continuidad: null, pendiente: null,
      tarifa_por: ['tercero', 'vehiculo', 'ruta'], constantes: [], reglas: [], salidas: { pago: 'ds', cobro: 'fv' },
    },
  },
  libre: {
    nombre: 'Operación desde cero', icono: 'mas',
    descripcion: 'Un tipo vacío: escoges las listas, los campos, la fórmula y las tarifas.',
    config: { persona: 'Persona', unidad: 'und', listas: [], campos: [{ k: 'cantidad_reg', nombre: 'Cantidad', tipo: 'numero', obligatorio: true }], formulas: { cantidad: 'cantidad_reg', valor: 'pagadas * tarifa' },
      editar_pagadas: false, continuidad: null, pendiente: null, tarifa_por: ['tercero'], constantes: [], reglas: [], salidas: { pago: 'ninguno', cobro: 'ninguno' } },
  },
};
export const nuevoTipo = (plantilla, empresa_id) => {
  const p = PLANTILLAS[plantilla] || PLANTILLAS.libre;
  return { empresa_id, nombre: p.nombre, plantilla: plantilla in PLANTILLAS ? plantilla : 'libre', config: JSON.parse(JSON.stringify(p.config)), activo: true };
};
// Configuración con todo lo que pueda faltar (tipos guardados antes de un cambio).
export function cfgTipo(t) {
  const c = t?.config || {};
  return { persona: c.persona || 'Persona', unidad: c.unidad || 'und', listas: c.listas || [], campos: c.campos || [], formulas: { cantidad: '0', valor: 'pagadas * tarifa', ...(c.formulas || {}) },
    editar_pagadas: !!c.editar_pagadas, continuidad: c.continuidad || null, pendiente: c.pendiente || null, tarifa_por: c.tarifa_por || ['tercero'],
    constantes: c.constantes || [], reglas: c.reglas || [], salidas: { pago: 'ninguno', cobro: 'ninguno', ...(c.salidas || {}) },
    // Proyecto (cotización) al registrar: obligatorio si el tipo factura, salvo que la empresa diga otra cosa.
    proyecto: c.proyecto || ((c.salidas || {}).cobro === 'fv' ? 'obligatorio' : 'opcional'),
    // Personas a las que no se les aplica el recargo dominical y festivo (se marca por operador).
    sin_recargo: c.sin_recargo || [] };
}
export const MODOS_PROYECTO = [['obligatorio', 'Obligatorio'], ['opcional', 'Opcional'], ['no', 'No se pide']];

/* ---------- Fórmulas ---------- */
// Calculadora segura (sin eval): números, variables, + - * / ( ), y min, max, redondear.
export function compilar(src) {
  const s = String(src ?? '').trim(); if (!s) throw new Error('La fórmula está vacía.');
  const tk = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; const v = Number(s.slice(i, j)); if (!Number.isFinite(v)) throw new Error(`Número mal escrito: ${s.slice(i, j)}`); tk.push({ t: 'n', v }); i = j; continue; }
    if (/[a-záéíóúñ_]/i.test(c)) { let j = i; while (j < s.length && /[a-z0-9áéíóúñ_]/i.test(s[j])) j++; tk.push({ t: 'id', v: s.slice(i, j).toLowerCase() }); i = j; continue; }
    if ('+-*/(),%'.includes(c)) { tk.push({ t: c }); i++; continue; }
    throw new Error(`No se entiende "${c}" en la fórmula.`);
  }
  let p = 0; const vars = new Set();
  const ver = t => tk[p]?.t === t, toma = t => { if (!ver(t)) throw new Error(`Falta "${t}" en la fórmula.`); p++; };
  const prim = () => {
    const x = tk[p];
    if (!x) throw new Error('La fórmula está incompleta.');
    if (x.t === 'n') { p++; return () => x.v; }
    if (x.t === '-') { p++; const a = prim(); return v => -a(v); }
    if (x.t === '(') { p++; const a = suma(); toma(')'); return a; }
    if (x.t === 'id') {
      p++;
      if (ver('(')) {
        const f = FUNCIONES[x.v]; if (!f) throw new Error(`No existe la función ${x.v}.`);
        p++; const args = []; if (!ver(')')) { args.push(suma()); while (ver(',')) { p++; args.push(suma()); } } toma(')');
        return v => f(...args.map(a => a(v)));
      }
      vars.add(x.v); return v => { if (!(x.v in v)) throw new Error(`La variable ${x.v} no existe.`); return Number(v[x.v]) || 0; };
    }
    throw new Error('La fórmula está mal armada.');
  };
  const pct = () => { const a = prim(); if (ver('%')) { p++; return v => a(v) / 100; } return a; };
  const prod = () => { let a = pct(); while (ver('*') || ver('/')) { const op = tk[p++].t, b = pct(), x = a; a = op === '*' ? v => x(v) * b(v) : v => { const d = b(v); return d ? x(v) / d : 0; }; } return a; };
  const suma = () => { let a = prod(); while (ver('+') || ver('-')) { const op = tk[p++].t, b = prod(), x = a; a = op === '+' ? v => x(v) + b(v) : v => x(v) - b(v); } return a; };
  const fn = suma(); if (p < tk.length) throw new Error('Sobra algo al final de la fórmula.');
  return { fn, vars: [...vars] };
}
export const evaluar = (src, vars) => compilar(src).fn(vars);

/* ---------- Días ---------- */
export function diaDe(fecha) {
  const d = new Date(fecha + 'T12:00:00'); if (Number.isNaN(d.getTime())) return 'habil';
  if (holidays(d.getFullYear()).has(fecha)) return 'festivo';
  return d.getDay() === 0 ? 'domingo' : d.getDay() === 6 ? 'sabado' : 'habil';
}
export const NOMBRE_DIA = { habil: '', sabado: 'Sábado', domingo: 'Domingo', festivo: 'Festivo' };
const aplicaDia = (cuando, dia) => cuando === 'siempre' || cuando === dia || (cuando === 'dominical_festivo' && (dia === 'domingo' || dia === 'festivo'));

/* ---------- Valores de un registro ---------- */
// Variables de la fórmula: cada campo numérico, de lectura (fin − inicio) o sí/no (1 o 0), y las constantes.
export function variables(r, cfg) {
  const v = {};
  for (const k of cfg.constantes) v[k.k] = n(k.valor);
  for (const c of cfg.campos) {
    const x = r.datos?.[c.k];
    if (c.tipo === 'numero') v[c.k] = n(x);
    else if (c.tipo === 'lectura') v[c.k] = x && x.ini !== '' && x.fin !== '' && x.ini != null && x.fin != null ? r2(n(x.fin) - n(x.ini)) : 0;
    else if (c.tipo === 'sino') v[c.k] = x ? 1 : 0;
  }
  return v;
}
const valorCriterio = (r, k) => k === 'tercero' ? r.tercero_id : k === 'cotizacion' ? r.cotizacion_id : r.datos?.[k];
// La tarifa más específica que aplica al registro: todos sus criterios coinciden; gana la que tenga más criterios y, si empatan, la más reciente.
const tarifasQueAplican = (r, tarifas, uso) => (tarifas || []).filter(t => t.tipo_id === r.tipo_id && (t.uso || 'pago') === uso && (!t.desde || t.desde <= r.fecha) && (!t.hasta || r.fecha <= t.hasta)
  && Object.entries(t.criterios || {}).every(([k, val]) => !val || valorCriterio(r, k) === val));
// Ajuste adicional al operador escrito en la cotización (proyecto): +valor por unidad liquidada, solo en los registros de ese proyecto.
// Se vuelve una tarifa interna 'adicional' que se suma a la tarifa base del operador; no se guarda en op_tarifas.
export const ajustesDeCotizaciones = (cotizaciones, tipoId) => (cotizaciones || []).filter(c => c.op_tipo_id === tipoId && n(c.ajuste_op) > 0)
  .map(c => ({ id: 'aj-' + c.id, sintetica: true, tipo_id: tipoId, uso: 'pago', modo: 'adicional', valor: n(c.ajuste_op), criterios: { cotizacion: c.id }, nota: `Ajuste proyecto N.º ${c.numero}`, producto_id: null }));
// Ajustes adicionales de programación: se suman a la tarifa base, no la reemplazan.
export const ajustesPara = (r, tarifas) => tarifasQueAplican(r, tarifas, 'pago').filter(t => t.modo === 'adicional');
export function tarifaPara(r, tarifas, uso = 'pago') {
  const ok = tarifasQueAplican(r, tarifas, uso).filter(t => t.modo !== 'adicional');
  const peso = t => Object.values(t.criterios || {}).filter(Boolean).length;
  return ok.sort((a, b) => peso(b) - peso(a) || String(b.desde || '').localeCompare(String(a.desde || '')))[0] || null;
}
// Cantidad, horas pagadas, tarifa, valor y recargos de un registro (lo que se le paga a la persona).
export const esCargo = r => r?.clase === 'cargo';
export const esAjusteHoras = r => r?.clase === 'cargo' && r.datos?.horas != null && r.datos.horas !== '';
const vacio = x => x === '' || x == null;
// datos.h_cliente = horas que el cliente acepta (vacío = todas); datos.obs_cliente = por qué no acepta las demás.
// datos.standby = horas de stand by acordadas con el cliente; datos.obs_standby = observación.
export function horasCliente(r, trabajadas) {
  const d = r?.datos || {}, aceptadas = vacio(d.h_cliente) ? trabajadas : r2(Math.min(trabajadas, Math.max(0, n(d.h_cliente))));
  return { trabajadas, aceptadas, noAceptadas: r2(trabajadas - aceptadas), standby: r2(Math.max(0, n(d.standby))), obs: String(d.obs_cliente || '').trim(), obsStandby: String(d.obs_standby || '').trim() };
}
export function calcular(r, tipo, tarifas, uso = 'pago') {
  const dia0 = diaDe(r.fecha);
  // Cargo suelto (transporte, auxilio…): un valor fijo para la persona, sin cantidad ni recargos. Solo cuenta para el pago.
  // Ajuste de horas del operador (desde Programar): horas de más o de menos al valor hora de la persona, sin recargos.
  // Se suma a la línea de horas del volante y del documento soporte. No va al cliente.
  if (esAjusteHoras(r)) { const h = uso === 'pago' ? r2(n(r.datos.horas)) : 0, t = h ? tarifaPara(r, tarifas, 'pago') : null, base = t && (t.modo || 'unidad') === 'unidad' ? r2(h * n(t.valor)) : 0;
    return { cantidad: 0, pagadas: h, cobro: 0, standby: 0, noAceptadas: 0, dia: dia0, tarifa: t, modo: 'unidad', base, recargos: [], valor: base, fijo: false, ajuste: true }; }
  if (esCargo(r)) { const val = uso === 'pago' ? r2(n(r.datos?.valor)) : 0; return { cantidad: 0, pagadas: 0, cobro: 0, standby: 0, noAceptadas: 0, dia: dia0, tarifa: null, modo: 'cargo', base: val, recargos: [], valor: val, fijo: false, cargo: String(r.datos?.concepto || 'Cargo') }; }
  const cfg = cfgTipo(tipo), v = variables(r, cfg), dia = dia0;
  let cantidad = 0; try { cantidad = r2(evaluar(cfg.formulas.cantidad, v)); } catch (_) { cantidad = 0; }
  // Horas con el cliente: las que acepta (vacío = todas las trabajadas) más las de stand by. El stand by también se le paga a la persona.
  const { aceptadas, standby } = horasCliente(r, cantidad);
  // Cantidad pagada vacía o en 0 = la de la fórmula (horómetro). Solo un número mayor que cero la reemplaza.
  const pagadas = r2((cfg.editar_pagadas && n(r.cantidad_pagada) > 0 ? r2(n(r.cantidad_pagada)) : cantidad) + standby);
  const t = tarifaPara(r, tarifas, uso), tarifa = t ? n(t.valor) : 0, modo = t?.modo || 'unidad';
  const vv = { ...v, cantidad, pagadas, tarifa };
  let base = 0;
  if (t && modo === 'unidad') { try { base = r2(evaluar(cfg.formulas.valor, vv)); } catch (_) { base = 0; } }
  else if (t && modo === 'registro') base = r2(tarifa);
  const recargos = uso !== 'pago' ? [] : cfg.reglas.filter(g => aplicaDia(g.cuando, dia) && (!g.terceros?.length || g.terceros.includes(r.tercero_id)) && !cfg.sin_recargo.includes(r.tercero_id) && pagadas > 0)
    .map(g => { let x = 0; try { x = r2(evaluar(g.formula, vv)); } catch (_) { x = 0; } return { nombre: g.nombre, valor: x }; }).filter(x => x.valor);
  if (uso === 'pago' && pagadas > 0) for (const a of ajustesPara(r, tarifas)) recargos.push({ nombre: a.nota || 'Ajuste adicional', valor: r2(pagadas * n(a.valor)), producto_id: a.producto_id || null });
  const valor = r2(base + recargos.reduce((s, x) => s + x.valor, 0));
  return { cantidad, pagadas, cobro: r2(aceptadas + standby), standby, noAceptadas: r2(cantidad - aceptadas), dia, tarifa: t, modo, base, recargos, valor, fijo: modo === 'fijo' };
}

/* ---------- Resumen por persona (lo que será el volante) ---------- */
// Agrupa por persona y por tarifa. Las tarifas de valor fijo se cuentan una vez por persona en el periodo.
export function resumen(registros, tipo, tarifas) {
  const out = new Map();
  for (const r of registros) {
    const c = calcular(r, tipo, tarifas);
    const p = out.get(r.tercero_id) || { tercero_id: r.tercero_id, lineas: new Map(), cantidad: 0, total: 0 };
    p.cantidad = r2(p.cantidad + c.pagadas);
    const kt = c.cargo ? 'cargo:' + c.cargo : c.tarifa?.id || 'sin-tarifa';
    const l = p.lineas.get(kt) || { tarifa: c.tarifa, modo: c.modo, cargo: c.cargo, cantidad: 0, registros: 0, valor: 0 };
    l.cantidad = r2(l.cantidad + c.pagadas); l.registros++; l.valor = c.fijo ? r2(n(c.tarifa.valor)) : r2(l.valor + c.base);
    p.lineas.set(kt, l);
    for (const g of c.recargos) { const k = 'regla:' + g.nombre, x = p.lineas.get(k) || { regla: g.nombre, cantidad: 0, registros: 0, valor: 0 }; x.cantidad = r2(x.cantidad + c.pagadas); x.registros++; x.valor = r2(x.valor + g.valor); p.lineas.set(k, x); }
    out.set(r.tercero_id, p);
  }
  return [...out.values()].map(p => { const lineas = [...p.lineas.values()]; return { ...p, lineas, total: r2(lineas.reduce((s, l) => s + l.valor, 0)) }; });
}

/* ---------- Avisos ---------- */
// Lo que conviene revisar antes de cortar: lecturas que no empatan, horas pagadas distintas sin nota, soportes pendientes y registros sin tarifa.
export function avisos(registros, tipo, tarifas) {
  const cfg = cfgTipo(tipo), out = [];
  registros = registros.filter(r => !esCargo(r));
  const co = cfg.continuidad;
  if (co?.lectura && co?.por) {
    const grupos = new Map();
    for (const r of registros) { const x = r.datos?.[co.lectura]; if (!x || x.ini === '' || x.ini == null) continue; const k = r.datos?.[co.por] || ''; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(r); }
    for (const l of grupos.values()) {
      l.sort((a, b) => a.fecha.localeCompare(b.fecha) || n(a.datos[co.lectura].ini) - n(b.datos[co.lectura].ini));
      for (let i = 1; i < l.length; i++) {
        const fin = n(l[i - 1].datos[co.lectura].fin), ini = n(l[i].datos[co.lectura].ini), dif = r2(ini - fin);
        if (Math.abs(dif) > 0.001) out.push({ clase: 'lectura', registro_id: l[i].id, fecha: l[i].fecha, texto: dif > 0 ? `La lectura salta ${fx(dif)} desde el registro anterior (${fx(fin)} → ${fx(ini)}).` : `La lectura empieza ${fx(-dif)} antes de donde terminó el registro anterior (${fx(fin)} → ${fx(ini)}).` });
      }
    }
  }
  for (const r of registros) {
    const c = calcular(r, tipo, tarifas), v = variables(r, cfg);
    if (cfg.editar_pagadas && Math.abs(c.pagadas - c.standby - c.cantidad) > 0.001 && !String(r.nota || '').trim()) out.push({ clase: 'pagadas', registro_id: r.id, fecha: r.fecha, texto: `Se liquidan ${fx(c.pagadas)} y la fórmula da ${fx(c.cantidad)}: escribe una nota con el motivo.` });
    if (cfg.pendiente?.campo && (cfg.pendiente.valores || []).includes(r.datos?.[cfg.pendiente.campo])) out.push({ clase: 'pendiente', registro_id: r.id, fecha: r.fecha, texto: `Soporte pendiente: ${r.datos[cfg.pendiente.campo]}.` });
    if (!c.tarifa && c.pagadas > 0) out.push({ clase: 'tarifa', registro_id: r.id, fecha: r.fecha, texto: 'No hay tarifa de programación que aplique a este registro.' });
    for (const k of cfg.campos.filter(x => x.tipo === 'lectura')) { const x = r.datos?.[k.k]; if (x && x.ini !== '' && x.fin !== '' && x.ini != null && x.fin != null && v[k.k] < 0) out.push({ clase: 'lectura', registro_id: r.id, fecha: r.fecha, texto: `${k.nombre}: la lectura final es menor que la inicial.` }); }
  }
  return out;
}
// Última lectura final de un elemento (para proponer la inicial del registro nuevo).
export function ultimaLectura(registros, tipo, elemento, antesDe) {
  const co = cfgTipo(tipo).continuidad; if (!co?.lectura || !elemento) return null;
  const l = registros.filter(r => r.datos?.[co.por] === elemento && r.datos?.[co.lectura]?.fin != null && r.datos[co.lectura].fin !== '' && (!antesDe || r.fecha <= antesDe))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || n(b.datos[co.lectura].fin) - n(a.datos[co.lectura].fin));
  return l.length ? n(l[0].datos[co.lectura].fin) : null;
}

/* ---------- Validaciones ---------- */
const CLAVE = /^[a-z][a-z0-9_]{0,29}$/;
export const claveDe = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'c$1').slice(0, 30) || 'campo';
export function erroresTipo(tipo) {
  const c = cfgTipo(tipo), e = [];
  if (!String(tipo.nombre || '').trim()) e.push('Escribe el nombre del tipo de operación.');
  const ks = new Set();
  for (const l of c.listas) { if (!CLAVE.test(l.k)) e.push(`La lista "${l.nombre}" tiene una clave inválida.`); if (!String(l.nombre || '').trim()) e.push('Una lista no tiene nombre.'); }
  for (const f of c.campos) {
    if (!CLAVE.test(f.k)) e.push(`El campo "${f.nombre}" tiene una clave inválida (solo minúsculas, números y _).`);
    if (ks.has(f.k)) e.push(`Hay dos campos con la clave ${f.k}.`); ks.add(f.k);
    if (VARIABLES_FIJAS.includes(f.k) || f.k === 'tercero') e.push(`La clave ${f.k} está reservada: usa otra.`);
    if (!String(f.nombre || '').trim()) e.push('Un campo no tiene nombre.');
    if (f.tipo === 'elemento' && !c.listas.some(l => l.k === f.lista)) e.push(`El campo "${f.nombre}" usa una lista que no existe.`);
    if (f.tipo === 'lista' && !(f.opciones || []).length) e.push(`El campo "${f.nombre}" necesita opciones.`);
  }
  for (const k of c.constantes) { if (!CLAVE.test(k.k)) e.push(`La constante "${k.nombre}" tiene una clave inválida.`); if (ks.has(k.k)) e.push(`La clave ${k.k} se repite.`); ks.add(k.k); }
  const validas = new Set([...ks, ...VARIABLES_FIJAS]);
  const revisar = (src, donde, permitidas) => { try { const { vars } = compilar(src); const malas = vars.filter(x => !permitidas.has(x)); if (malas.length) e.push(`${donde}: no existe ${malas.join(', ')}.`); } catch (er) { e.push(`${donde}: ${er.message}`); } };
  const sinCalc = new Set([...ks]);
  revisar(c.formulas.cantidad, 'Fórmula de la cantidad', sinCalc);
  revisar(c.formulas.valor, 'Fórmula del valor', validas);
  for (const g of c.reglas) { if (!String(g.nombre || '').trim()) e.push('Una regla no tiene nombre.'); revisar(g.formula, `Regla "${g.nombre}"`, validas); }
  for (const k of c.tarifa_por) if (k !== 'tercero' && !c.campos.some(f => f.k === k)) e.push(`La tarifa depende de "${k}", que no es un campo.`);
  if (c.continuidad?.lectura && !c.campos.some(f => f.k === c.continuidad.lectura && f.tipo === 'lectura')) e.push('El control de lecturas usa un campo que no es de lectura.');
  return e;
}
export function erroresRegistro(r, tipo) {
  const c = cfgTipo(tipo), e = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha || '')) e.push('Escribe la fecha.');
  if (!r.tercero_id) e.push(`Escoge el ${c.persona.toLowerCase()}.`);
  if (esAjusteHoras(r)) { if (!n(r.datos.horas)) e.push('Escribe las horas del ajuste (con signo menos si son de menos).'); if (!String(r.nota || '').trim()) e.push('Escribe la nota del ajuste: por qué se ajustan las horas.'); return e; }
  if (esCargo(r)) { if (!String(r.datos?.concepto || '').trim()) e.push('Escribe el concepto del cargo.'); if (!(n(r.datos?.valor) > 0)) e.push('El valor del cargo debe ser mayor que cero.'); return e; }
  for (const f of c.campos) {
    const x = r.datos?.[f.k];
    if (f.tipo === 'lectura') { const a = x?.ini, b = x?.fin, hay = v => v !== '' && v != null; if (hay(a) !== hay(b)) e.push(`${f.nombre}: escribe la lectura inicial y la final.`); else if (hay(a) && n(b) < n(a)) e.push(`${f.nombre}: la final no puede ser menor que la inicial.`); if (f.obligatorio && !hay(a)) e.push(`${f.nombre} es obligatorio.`); continue; }
    if (f.obligatorio && f.tipo !== 'sino' && (x == null || String(x).trim() === '')) e.push(`${f.nombre} es obligatorio.`);
  }
  if (c.editar_pagadas && r.cantidad_pagada != null && r.cantidad_pagada !== '' && n(r.cantidad_pagada) < 0) e.push('Las cantidades pagadas no pueden ser negativas.');
  const d = r.datos || {};
  if (!vacio(d.h_cliente) || n(d.standby)) {
    const trab = calcular(r, tipo, []).cantidad, hc = n(d.h_cliente);
    if (!vacio(d.h_cliente) && hc < 0) e.push('Las horas que acepta el cliente no pueden ser negativas.');
    else if (!vacio(d.h_cliente) && hc > trab + 0.001) e.push(`El cliente no puede aceptar más horas de las trabajadas (${fx(trab)}). Las de más van como stand by.`);
    else if (!vacio(d.h_cliente) && hc < trab - 0.001 && !String(d.obs_cliente || '').trim()) e.push('Escribe la observación: por qué el cliente no acepta esas horas.');
    if (n(d.standby) < 0) e.push('Las horas de stand by no pueden ser negativas.');
    else if (n(d.standby) > 0 && !String(d.obs_standby || '').trim()) e.push('Escribe la observación del stand by.');
  }
  return e;
}
export function erroresTarifa(t) {
  const e = [];
  if (!(n(t.valor) > 0)) e.push('El valor de la tarifa debe ser mayor que cero.');
  if (!MODOS_TARIFA.some(m => m[0] === t.modo)) e.push('Escoge el modo de la tarifa.');
  if (t.desde && t.hasta && t.hasta < t.desde) e.push('La vigencia termina antes de empezar.');
  return e;
}

/* ---------- Corte de pago ---------- */
// Un registro está cerrado cuando ya hizo todos los cierres que su tipo pide: programación (DS) si el tipo programa,
// y factura si el tipo cobra con FV (los cargos solo se programan). Sin cierres configurados, cierra con su corte.
export function estaCerrado(r, cfg, corte) {
  const pago = cfg?.salidas?.pago && cfg.salidas.pago !== 'ninguno', cobro = cfg?.salidas?.cobro === 'fv' && !esCargo(r);
  if (!pago && !cobro) return corte?.estado === 'cerrado';
  return (!pago || !!r.cierre_pago) && (!cobro || !!r.cierre_cobro);
}
export const esPendiente = (r, tipo) => { const p = cfgTipo(tipo).pendiente; return !!(p?.campo && (p.valores || []).includes(r.datos?.[p.campo])); };
// Registros que pueden entrar a un corte nuevo: del periodo, sin pagar y sin otro corte.
export const elegiblesCorte = (registros, tipo, desde, hasta, incluirPendientes = false) =>
  registros.filter(r => r.tipo_id === tipo.id && r.fecha >= desde && r.fecha <= hasta && !r.cierre_pago && !r.corte_id && (incluirPendientes || !esPendiente(r, tipo)));
// Centro de costo de un registro: el de cada elemento escogido (equipo, obra…), cada uno en su nivel.
export function ccDeRegistro(r, tipo, elementos, centros) {
  const cc = {};
  for (const f of cfgTipo(tipo).campos.filter(x => x.tipo === 'elemento')) {
    const e = (elementos || []).find(x => x.id === r.datos?.[f.k]), c = e?.centro_id && (centros || []).find(x => x.id === e.centro_id);
    if (c && !cc['cc' + c.nivel]) cc['cc' + c.nivel] = c.id;
  }
  return Object.keys(cc).length ? [{ ...cc, pct: 100 }] : [];
}
// Volante de cada persona: líneas (por tarifa y por regla) con su ítem de servicio y su reparto por centro de costo, y el detalle de registros.
export function volantes(registros, tipo, tarifas, { elementos = [], centros = [] } = {}) {
  const cfg = cfgTipo(tipo), out = new Map();
  for (const r of [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const c = calcular(r, tipo, tarifas), dist = ccDeRegistro(r, tipo, elementos, centros);
    const v = out.get(r.tercero_id) || { tercero_id: r.tercero_id, lineas: new Map(), registros: [] };
    const kt = c.cargo ? 'cargo:' + c.cargo : c.tarifa?.id || 'sin-tarifa';
    const l = v.lineas.get(kt) || { clave: kt, cargo: c.cargo || undefined, tarifa_id: c.tarifa?.id || null, producto_id: c.cargo ? r.datos?.producto_id || null : c.tarifa?.producto_id || null, modo: c.modo, tarifa: c.tarifa ? n(c.tarifa.valor) : 0, nota: c.tarifa?.nota || '', cantidad: 0, registros: 0, valor: 0, partes: [] };
    l.cantidad = r2(l.cantidad + c.pagadas); l.registros++;
    l.valor = c.fijo ? r2(n(c.tarifa.valor)) : r2(l.valor + c.base);
    l.partes.push({ dist, valor: c.fijo ? c.pagadas || 1 : c.base });
    v.lineas.set(kt, l);
    for (const g of c.recargos) {
      const k = 'regla:' + g.nombre, x = v.lineas.get(k) || { clave: k, regla: g.nombre, producto_id: g.producto_id || c.tarifa?.producto_id || null, cantidad: 0, registros: 0, valor: 0, partes: [] };
      x.cantidad = r2(x.cantidad + c.pagadas); x.registros++; x.valor = r2(x.valor + g.valor); x.partes.push({ dist, valor: g.valor }); v.lineas.set(k, x);
    }
    v.registros.push({ id: r.id, cargo: c.cargo || undefined, ajuste: c.ajuste || undefined, standby: c.standby || 0, fecha: r.fecha, dia: c.dia, datos: r.datos, nota: r.nota || '', cantidad: c.cantidad, pagadas: c.pagadas, valor: c.fijo ? 0 : c.valor, fijo: c.fijo, recargo: r2(c.recargos.reduce((s, x) => s + x.valor, 0)) });
    out.set(r.tercero_id, v);
  }
  return [...out.values()].map(v => {
    const lineas = [...v.lineas.values()].filter(l => l.valor || l.cantidad).map(({ partes, ...l }) => ({ ...l, cc: normDist(distPonderada(partes.filter(p => p.dist.length)) || []), detalle: detalleLinea(l, cfg.unidad) }));
    return { tercero_id: v.tercero_id, lineas, registros: v.registros, cantidad: r2(v.registros.reduce((s, x) => s + x.pagadas, 0)), total: r2(lineas.reduce((s, l) => s + l.valor, 0)) };
  });
}
const pesos = x => '$ ' + Math.round(x).toLocaleString('es-CO');
export function detalleLinea(l, unidad = '') {
  const u = unidad ? ' ' + unidad : '';
  if (l.cargo) return l.registros > 1 ? `${l.cargo} (${l.registros})` : l.cargo;
  if (l.regla) return `${l.regla} · ${fx(l.cantidad)}${u}`;
  if (!l.tarifa_id) return `Sin tarifa · ${fx(l.cantidad)}${u}`;
  if (l.modo === 'fijo') return `Pago fijo${l.nota ? ' ' + l.nota : ''} (${fx(l.cantidad)}${u})`;
  if (l.modo === 'registro') return `${l.registros} × ${pesos(l.tarifa)}`;
  return `${fx(l.cantidad)}${u} × ${pesos(l.tarifa)}`;
}
// Documento soporte de un volante. Cuenta de cada línea: la del ítem de servicio o la de Salidas del tipo.
export function dsDeVolante(v, { empresa_id, fecha, periodo, tipoNombre, productos = [], cuentaDefecto = '', tercero = {}, conCC = false }) {
  const errores = [];
  const lineas = v.lineas.filter(l => l.valor > 0).map(l => {
    const p = productos.find(x => x.id === l.producto_id), cuenta = String(p?.cuenta_costo || cuentaDefecto || '').trim();
    if (!cuenta) errores.push(`Falta la cuenta de "${p?.nombre || l.regla || 'la tarifa'}": ponla en el ítem de servicio o en Configurar › Salidas.`);
    return { cuenta, descripcion: `${p?.nombre ? p.nombre + " · " : l.regla || l.cargo ? "" : tipoNombre + " · "}${l.detalle} · ${periodo}`.slice(0, 300), base: r2(l.valor), iva_pct: 0, ...(conCC && l.cc?.length ? { cc: l.cc } : {}) };
  });
  if (!lineas.length) errores.push('El volante no tiene valores para programar.');
  return { errores, compra: { empresa_id, tipo: 'DS', fecha, vence: null, tercero_id: v.tercero_id, num_proveedor: '', lineas,
    retefuente_pct: n(tercero.ret_compra_fuente_pct), reteiva_pct: n(tercero.ret_compra_iva_pct), reteica_milaje: n(tercero.ret_compra_ica_milaje), cuenta_retefuente: '', retenciones: {},
    cuenta_pago: '', aplicaciones: [], anticipo: 0, observaciones: `Generado desde Operación · ${tipoNombre} · ${periodo}` } };
}

/* ---------- Cobro: factura desde cotización ---------- */
// La cotización fija el precio de cobro. Se amarra a un tipo de operación y, si quiere, a elementos (obra, equipo…);
// cada línea puede pedir más elementos. Sin cotización que coincida se usa la tarifa de cobro, si existe.
export const ESTADOS_COT = [['abierta', 'Abierta'], ['aceptada', 'Aceptada'], ['rechazada', 'Rechazada'], ['cerrada', 'Cerrada']];
// Nombre corto del proyecto (cotización) para listas.
export const nombreProyecto = (c, nomT, nomEl) => [`N.º ${c.numero}`, ...Object.values(c.criterios || {}).filter(Boolean).map(nomEl).filter(Boolean), nomT(c.tercero_id)].join(' · ');
export const cotizacionVigente = c => !!c && (c.estado === 'abierta' || c.estado === 'aceptada');
const coincide = (criterios, r) => Object.entries(criterios || {}).every(([k, v]) => !v || r.datos?.[k] === v);
const pesoCrit = c => Object.values(c || {}).filter(Boolean).length;
export function cotizacionPara(r, cotizaciones) {
  if (r.cotizacion_id) return (cotizaciones || []).find(c => c.id === r.cotizacion_id) || null;
  return (cotizaciones || []).filter(c => cotizacionVigente(c) && c.op_tipo_id === r.tipo_id && coincide(c.criterios, r))
    .sort((a, b) => pesoCrit(b.criterios) - pesoCrit(a.criterios) || String(b.fecha || '').localeCompare(String(a.fecha || '')))[0] || null;
}
export const lineaCotPara = (r, cot) => (cot?.lineas || []).map((l, i) => ({ ...l, i })).filter(l => l.op !== false && l.op !== 'fijo' && coincide(l.criterios, r))
  .sort((a, b) => pesoCrit(b.criterios) - pesoCrit(a.criterios) || a.i - b.i)[0] || null;
// Cliente de un registro sin cotización: el tercero del primer elemento escogido que tenga uno (la obra, por lo general).
export function clienteDe(r, tipo, elementos) {
  for (const f of cfgTipo(tipo).campos.filter(x => x.tipo === 'elemento')) { const e = (elementos || []).find(x => x.id === r.datos?.[f.k]); if (e?.tercero_id) return e.tercero_id; }
  return null;
}
export const totalLineaCot = l => r2(n(l.cantidad) * n(l.precio) * (1 - n(l.descuento_pct) / 100));
// Registros sin facturar agrupados en facturas: una por cotización (o por cliente con tarifa de cobro).
// Líneas de la cotización: op true = se cobra con las horas; 'fijo' = una vez, en la primera factura (movilización); false = no sale desde Operación.
export const COBRO_LINEA = [['horas', 'Con horas'], ['fijo', 'Una vez'], ['no', 'No']];
export const cobroDeLinea = l => l.op === 'fijo' ? 'fijo' : l.op === false ? 'no' : 'horas';
export function facturables(registros, tipo, { cotizaciones = [], tarifas = [], elementos = [], centros = [], productos = [], fijoPendiente = (cot, i) => !cot.lineas?.[i]?.facturado } = {}) {
  const cfg = cfgTipo(tipo), grupos = new Map(), sinPrecio = [];
  for (const r of [...registros].filter(x => x.tipo_id === tipo.id && !x.cierre_cobro && !esCargo(x)).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const k = calcular(r, tipo, tarifas), q = cfg.salidas.cobrar === 'pagadas' ? k.pagadas : k.cobro;
    const cot = cotizacionPara(r, cotizaciones), lc = cot && lineaCotPara(r, cot);
    let cliente = null, clave = null, linea = null, motivo = '';
    if (lc) {
      cliente = cot.tercero_id; clave = 'c:' + cot.id;
      linea = { clave: 'l' + lc.i, producto_id: lc.producto_id || null, codigo: lc.codigo || '', descripcion: lc.descripcion || '', unidad: lc.unidad || 'UND', precio: n(lc.precio), descuento_pct: n(lc.descuento_pct), iva_pct: n(lc.iva_pct), modo: 'unidad' };
    } else {
      const t = tarifaPara(r, tarifas, 'cobro'); cliente = cot ? cot.tercero_id : clienteDe(r, tipo, elementos);
      if (t && cliente) {
        const p = productos.find(x => x.id === t.producto_id); clave = cot ? 'c:' + cot.id : 't:' + cliente;
        linea = { clave: 't' + t.id, producto_id: t.producto_id || null, codigo: p?.codigo || '', descripcion: p?.nombre || tipo.nombre, unidad: p?.unidad || 'UND', precio: n(t.valor), descuento_pct: 0, iva_pct: p ? n(p.iva_pct) : 0, modo: t.modo || 'unidad' };
      } else motivo = cot ? 'La cotización no tiene una línea para este registro' : t ? 'La obra no tiene cliente' : 'Sin cotización ni tarifa de cobro';
    }
    if (!linea) { sinPrecio.push({ registro: r, motivo, cantidad: q }); continue; }
    const g = grupos.get(clave) || { clave, tercero_id: cliente, cotizacion: clave.startsWith('c:') ? cot : null, lineas: new Map(), registros: [], desde: r.fecha, hasta: r.fecha };
    const l = g.lineas.get(linea.clave) || { ...linea, cantidad: 0, registros: 0, partes: [] };
    l.cantidad = linea.modo === 'fijo' ? 1 : linea.modo === 'registro' ? l.cantidad + 1 : r2(l.cantidad + q);
    l.registros++; l.partes.push({ dist: ccDeRegistro(r, tipo, elementos, centros), valor: linea.modo === 'unidad' ? q : 1 });
    g.lineas.set(linea.clave, l); g.registros.push({ id: r.id, fecha: r.fecha, datos: r.datos, tercero_id: r.tercero_id, cantidad: q });
    if (r.fecha > g.hasta) g.hasta = r.fecha;
    grupos.set(clave, g);
  }
  // Líneas de una sola vez de cada cotización que todavía no se han facturado.
  for (const g of grupos.values()) if (g.cotizacion) (g.cotizacion.lineas || []).forEach((l, i) => {
    if (l.op === 'fijo' && fijoPendiente(g.cotizacion, i)) g.lineas.set('f' + i, { clave: 'f' + i, fijo_i: i, producto_id: l.producto_id || null, codigo: l.codigo || '', descripcion: l.descripcion || '', unidad: l.unidad || 'UND', precio: n(l.precio), descuento_pct: n(l.descuento_pct), iva_pct: n(l.iva_pct), modo: 'fijo', cantidad: n(l.cantidad) || 1, registros: 0, partes: [] });
  });
  return {
    grupos: [...grupos.values()].map(g => {
      const lineas = [...g.lineas.values()].filter(l => l.cantidad > 0).map(({ partes, ...l }) => ({ ...l, cc: normDist(distPonderada(partes.filter(p => p.dist.length)) || []), valor: totalLineaCot(l) }));
      return { ...g, lineas, cantidad: r2(g.registros.reduce((s, x) => s + x.cantidad, 0)), total: r2(lineas.reduce((s, l) => s + l.valor, 0)) };
    }),
    sinPrecio,
  };
}
// Ítems de la factura de venta para un grupo (mismas columnas de la tabla items).
export const itemsDeGrupo = (g, { periodo = '', conCC = false, bodega = () => null } = {}) => g.lineas.map(l => ({
  producto_id: l.producto_id || null, bodega_id: bodega(l.producto_id) || null, codigo: l.codigo || '', descripcion: `${l.descripcion}${periodo && l.fijo_i == null ? ' · ' + periodo : ''}`.slice(0, 300), unidad: l.unidad || 'UND',
  cantidad: l.cantidad, precio: l.precio, descuento_pct: l.descuento_pct || 0, iva_pct: l.iva_pct || 0, cuenta: '', ...(conCC && l.cc?.length ? { cc: l.cc } : {}),
}));
export function erroresCotizacion(c) {
  const e = [];
  if (!c.tercero_id) e.push('Escoge el cliente.');
  if (!c.fecha) e.push('Escribe la fecha.');
  if (c.vence && c.fecha && c.vence < c.fecha) e.push('La fecha de vencimiento es anterior a la fecha de la cotización.');
  const ls = c.lineas || [];
  if (!ls.length) e.push('Agrega al menos una línea.');
  ls.forEach((l, i) => { if (!String(l.descripcion || '').trim()) e.push(`La línea ${i + 1} necesita una descripción.`); if (!(n(l.precio) >= 0)) e.push(`El precio de la línea ${i + 1} no puede ser negativo.`); });
  return e;
}

/* ---------- Horas por cerrar ---------- */
// Lo que falta pagar (sin cierre_pago) y lo que falta facturar (sin cierre_cobro) hasta una fecha. Valores estimados con las tarifas vigentes.
export function porCerrar(registros, tipo, { hasta = '9999-12-31', tarifas = [], cotizaciones = [], elementos = [], centros = [], productos = [] } = {}) {
  const cfg = cfgTipo(tipo), regs = registros.filter(r => r.tipo_id === tipo.id && r.fecha <= hasta);
  const conPago = cfg.salidas.pago !== 'ninguno', conCobro = cfg.salidas.cobro !== 'ninguno';
  const sinPago = conPago ? regs.filter(r => !r.cierre_pago) : [], sinCobro = conCobro ? regs.filter(r => !r.cierre_cobro && !esCargo(r)) : [];
  const personas = resumen(sinPago, tipo, tarifas).map(p => {
    const rs = sinPago.filter(r => r.tercero_id === p.tercero_id);
    return { tercero_id: p.tercero_id, registros: rs.length, cantidad: p.cantidad, valor: p.total, desde: rs.reduce((m, r) => r.fecha < m ? r.fecha : m, rs[0]?.fecha || ''), enCorte: rs.filter(r => r.corte_id).length, pendientes: rs.filter(r => esPendiente(r, tipo)).length };
  }).sort((a, b) => b.valor - a.valor);
  const cobro = conCobro ? facturables(sinCobro, tipo, { cotizaciones, tarifas, elementos, centros, productos }) : { grupos: [], sinPrecio: [] };
  return {
    conPago, conCobro,
    pago: { personas, registros: sinPago.length, valor: r2(personas.reduce((s, p) => s + p.valor, 0)) },
    cobro: { ...cobro, registros: sinCobro.length, valor: r2(cobro.grupos.reduce((s, g) => s + g.total, 0)) },
    pagadoSinFacturar: conPago && conCobro ? regs.filter(r => r.cierre_pago && !r.cierre_cobro && !esCargo(r)).length : 0,
    facturadoSinPagar: conPago && conCobro ? regs.filter(r => r.cierre_cobro && !r.cierre_pago).length : 0,
  };
}

/* ---------- Avance de la cotización y acumulado por máquina ---------- */
// Cantidad de cada línea "con horas" de la cotización: proyectada (con adiciones), ejecutada en Operación y saldo.
export const adicionado = l => r2((l.adiciones || []).reduce((s, a) => s + n(a.cantidad), 0));
export function avanceCotizacion(cot, registros, tipo, cotizaciones) {
  const cfg = cfgTipo(tipo), out = (cot?.lineas || []).map((l, i) => ({ i, descripcion: l.descripcion, unidad: l.unidad, horas: l.op !== false && l.op !== 'fijo', proyectado: n(l.cantidad), adicionado: adicionado(l), ejecutado: 0, registros: 0 }));
  for (const r of (registros || []).filter(x => x.tipo_id === tipo?.id && !esCargo(x))) {
    if (cotizacionPara(r, cotizaciones || [cot])?.id !== cot.id) continue;
    const lc = lineaCotPara(r, cot); if (!lc) continue;
    const k = calcular(r, tipo, [], 'cobro'), q = cfg.salidas.cobrar === 'pagadas' ? k.pagadas : k.cobro;
    out[lc.i].ejecutado = r2(out[lc.i].ejecutado + q); out[lc.i].registros++;
  }
  return out.map(x => ({ ...x, saldo: r2(x.proyectado - x.ejecutado), pct: x.proyectado > 0 ? Math.round(x.ejecutado / x.proyectado * 100) : 0 }));
}
// Acumulado de lecturas por máquina (elemento de continuidad): último horómetro, horas del período y totales, y saltos.
export function acumuladoMaquinas(registros, tipo, { desde, hasta } = {}) {
  const co = cfgTipo(tipo).continuidad; if (!co?.lectura || !co?.por) return [];
  const g = new Map();
  for (const r of (registros || []).filter(x => x.tipo_id === tipo.id && !esCargo(x))) {
    const el = r.datos?.[co.por], x = r.datos?.[co.lectura]; if (!el) continue;
    if (!g.has(el)) g.set(el, []); g.get(el).push({ r, ini: x?.ini === '' || x?.ini == null ? null : n(x.ini), fin: x?.fin === '' || x?.fin == null ? null : n(x.fin) });
  }
  return [...g.entries()].map(([elemento, l]) => {
    l.sort((a, b) => a.r.fecha.localeCompare(b.r.fecha) || (a.ini ?? 0) - (b.ini ?? 0));
    const saltos = []; let total = 0, periodo = 0, recibosPer = 0;
    l.forEach((x, i) => {
      const h = x.ini != null && x.fin != null ? r2(x.fin - x.ini) : 0; total = r2(total + h);
      if ((!desde || x.r.fecha >= desde) && (!hasta || x.r.fecha <= hasta)) { periodo = r2(periodo + h); recibosPer++; }
      const prev = l[i - 1]; if (prev && prev.fin != null && x.ini != null && Math.abs(x.ini - prev.fin) > 0.001) saltos.push({ registro_id: x.r.id, fecha: x.r.fecha, esperado: prev.fin, ini: x.ini, dif: r2(x.ini - prev.fin) });
    });
    const ult = [...l].reverse().find(x => x.fin != null);
    return { elemento, ultimo: ult ? ult.fin : null, fecha: ult ? ult.r.fecha : l[l.length - 1].r.fecha, total, periodo, recibos: l.length, recibosPeriodo: recibosPer, saltos };
  });
}

/* ---------- Maquinaria: configuración fija ---------- */
// Operación quedó hecha para horas máquina: recibo = operador + proyecto (cotización) + máquina + horómetro.
// Horas = final − inicial, valor = horas × valor hora del operador, recargo dominical y festivo por operador,
// programación por documento soporte y cobro por factura con la cotización. Conserva las listas, constantes y
// datos que ya existan (las claves de la plantilla), y pone fijo lo demás.
export function configMaquinaria(actual) {
  const base = PLANTILLAS.maquinaria.config, c = { ...JSON.parse(JSON.stringify(base)), ...(actual || {}) };
  const listas = [...(c.listas || [])];
  for (const l of base.listas) if (!listas.some(x => x.k === l.k)) listas.push(JSON.parse(JSON.stringify(l)));
  const campos = [
    { k: 'equipo', nombre: 'Máquina', tipo: 'elemento', lista: 'equipos', obligatorio: true },
    { k: 'obra', nombre: 'Obra', tipo: 'elemento', lista: 'obras' },
    { k: 'recibo', nombre: 'N.º de recibo', tipo: 'texto' },
    { k: 'horometro', nombre: 'Horómetro', tipo: 'lectura', obligatorio: true },
  ];
  const constantes = [...(c.constantes || [])]; if (!constantes.some(x => x.k === 'salario_base')) constantes.push({ ...base.constantes[0] });
  const recargo = (c.reglas || []).find(g => g.cuando === 'dominical_festivo') || base.reglas[0];
  return { ...c, persona: 'Operador', unidad: 'h', listas, campos, constantes, reglas: [{ ...recargo, nombre: recargo.nombre || 'Recargo dominical y festivo', terceros: [] }],
    formulas: { cantidad: 'horometro', valor: 'pagadas * tarifa' }, editar_pagadas: false, continuidad: { lectura: 'horometro', por: 'equipo' }, pendiente: null,
    tarifa_por: ['tercero'], proyecto: 'obligatorio', sin_recargo: c.sin_recargo || [],
    salidas: { ...(c.salidas || {}), pago: 'ds', cobro: 'fv', cobrar: 'cantidad', titulo: (c.salidas || {}).titulo || 'Horas adicionales' } };
}

/* ---------- Mantenimiento preventivo (PM) por horas ---------- */
// datos.pm de la máquina: { cada, base, inicial, hist[] }. base = horómetro del último PM (al configurar: horómetro actual − horas que
// ya llevaba desde el último PM, que se pregunta una sola vez). Próximo PM = base + cada. Cada PM registrado mueve la base.
export const pmBase = (actual, lleva) => r2(n(actual) - n(lleva));
export function horometroActual(maq, registros) {
  let h = maq?.datos?.pm?.inicial != null && maq.datos.pm.inicial !== '' ? n(maq.datos.pm.inicial) : null;
  for (const r of registros || []) {
    if (esCargo(r) || r.datos?.equipo !== maq?.id) continue;
    const f = r.datos?.horometro?.fin; if (f === '' || f == null) continue;
    if (h == null || n(f) > h) h = n(f);
  }
  return h;
}
export function estadoPM(maq, registros) {
  const pm = maq?.datos?.pm; if (!pm || !(n(pm.cada) > 0) || pm.base === '' || pm.base == null) return null;
  const actual = horometroActual(maq, registros), proximo = r2(n(pm.base) + n(pm.cada));
  const usadas = actual == null ? 0 : r2(actual - n(pm.base)), faltan = r2(proximo - (actual ?? n(pm.base)));
  const margen = Math.max(10, r2(n(pm.cada) * 0.1)); // aviso previo: 10 % del intervalo, mínimo 10 h
  return { actual, proximo, cada: n(pm.cada), usadas, faltan, estado: faltan <= 0 ? 'vencido' : faltan <= margen ? 'pronto' : 'ok', ultimo: (pm.hist || []).slice(-1)[0] || null };
}

/* ---------- Horómetro encadenado por máquina ---------- */
// El primer recibo de una máquina arranca en su horómetro inicial (datos.horometro_inicial, o el inicial del PM en máquinas viejas).
// Cada recibo siguiente arranca donde terminó el anterior de esa máquina (por fecha; el mismo día, por lectura). El inicial no se escribe.
export function horometroInicialMaq(maq) {
  const d = maq?.datos || {}, v = !vacio(d.horometro_inicial) ? d.horometro_inicial : !vacio(d.pm?.inicial) ? d.pm.inicial : null;
  return v == null ? null : n(v);
}
const lect = r => r?.datos?.horometro || {};
const cerradoR = r => !!(r?.cierre_pago || r?.cierre_cobro);
const nomRecibo = r => `recibo${r.datos?.recibo ? ' ' + r.datos.recibo : ''} del ${r.fecha.split('-').reverse().join('/')}`;
const cadenaDe = (registros, maqId, sinId) => (registros || []).filter(r => !esCargo(r) && r.datos?.equipo === maqId && r.id !== sinId && !vacio(lect(r).fin))
  .sort((a, b) => a.fecha.localeCompare(b.fecha) || n(lect(a).ini) - n(lect(b).ini) || String(a.id).localeCompare(String(b.id)));
// Vecinos de una posición (fecha + lectura de desempate) dentro de la cadena.
const vecinos = (lista, fecha, desempate) => {
  const antes = x => x.fecha < fecha || (x.fecha === fecha && n(lect(x).ini) <= desempate);
  return { prev: lista.filter(antes).at(-1) || null, next: lista.find(x => !antes(x)) || null };
};
const conIni = (r, ini) => ({ id: r.id, datos: { ...r.datos, horometro: { ...lect(r), ini } } });
// Para guardar `row` (nuevo o editado): inicial que le toca, errores y los recibos vecinos que hay que reencadenar.
export function encadenar(row, registros, maq) {
  const errores = [], actualizar = [], orig = row.id ? (registros || []).find(r => r.id === row.id) : null;
  const lista = cadenaDe(registros, maq?.id, row.id), base = horometroInicialMaq(maq);
  const mismaPos = orig && orig.datos?.equipo === maq?.id && orig.fecha === row.fecha;
  const { prev, next } = vecinos(lista, row.fecha, mismaPos ? n(lect(orig).ini) : Infinity);
  const ini = prev ? n(lect(prev).fin) : base;
  if (ini == null) { errores.push(`La máquina ${maq?.nombre || ''} no tiene horómetro inicial: ponlo en Máquinas › Editar.`.replace('  ', ' ')); return { ini, errores, actualizar }; }
  const fin = vacio(lect(row).fin) ? null : n(lect(row).fin);
  if (fin == null) errores.push('Escribe el horómetro final.');
  else if (fin < ini) errores.push(`El horómetro final no puede ser menor que el inicial (${fx(ini)}).`);
  else if (next) {
    if (fin > n(lect(next).fin)) errores.push(`El final (${fx(fin)}) no puede pasar el final del ${nomRecibo(next)}, que sigue (${fx(lect(next).fin)}).`);
    else if (n(lect(next).ini) !== fin) { if (cerradoR(next)) errores.push(`El ${nomRecibo(next)} ya está programado o facturado y empieza en ${fx(lect(next).ini)}: este recibo debe terminar en ${fx(lect(next).ini)}.`); else actualizar.push(conIni(next, fin)); }
  }
  // Si el recibo cambia de máquina o de fecha, el que lo seguía antes queda pegado a su anterior.
  if (orig && !mismaPos && !vacio(lect(orig).fin)) {
    const q = quitarDeCadena(orig, registros, orig.datos?.equipo === maq?.id ? maq : { id: orig.datos?.equipo, datos: {} }, { baseMaq: orig.datos?.equipo === maq?.id ? base : undefined });
    errores.push(...q.errores); for (const u of q.actualizar) if (!actualizar.some(a => a.id === u.id) && !(next && u.id === next.id)) actualizar.push(u);
  }
  return { ini, errores, actualizar };
}
// Al borrar (o mover) un recibo: el siguiente arranca donde terminó el anterior.
export function quitarDeCadena(r, registros, maq, { baseMaq } = {}) {
  const lista = cadenaDe(registros, r.datos?.equipo, r.id), { prev, next } = vecinos(lista, r.fecha, n(lect(r).ini));
  const errores = [], actualizar = []; if (!next) return { errores, actualizar };
  const ini = prev ? n(lect(prev).fin) : baseMaq !== undefined ? baseMaq : horometroInicialMaq(maq);
  if (ini == null || n(lect(next).ini) === ini) return { errores, actualizar };
  if (ini > n(lect(next).fin)) errores.push(`No se puede: el ${nomRecibo(next)} quedaría con el final menor que el inicial.`);
  else if (cerradoR(next)) errores.push(`No se puede: el ${nomRecibo(next)} ya está programado o facturado y tendría que empezar en ${fx(ini)}.`);
  else actualizar.push(conIni(next, ini));
  return { errores, actualizar };
}
