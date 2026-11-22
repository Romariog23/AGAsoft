// Operación: registros operativos configurables por empresa que NO generan movimientos contables.
// Cada empresa arma sus "tipos de operación" (maquinaria amarilla, viajes, jornales…) con seis piezas:
// listas, campos, fórmulas, tarifas, reglas de día y salidas. Aquí solo hay lógica pura (sin pantalla).
// Tablas: supabase/037_operacion.sql (op_tipos, op_elementos, op_tarifas, op_registros, op_cortes).
import { holidays } from './calendario/engine.js';

const fx = x => String(r2(x)).replace('.', ',');
const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const n = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return 0; const t = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s; const x = Number(t); return Number.isFinite(x) ? x : 0; };

/* ---------- Piezas ---------- */
export const TIPOS_CAMPO = [
  ['numero', 'Número'], ['lectura', 'Lectura inicial y final (horómetro, odómetro)'], ['texto', 'Texto'],
  ['lista', 'Lista de opciones'], ['sino', 'Sí / No'], ['elemento', 'Elemento de una lista (equipo, obra…)'],
];
export const MODOS_TARIFA = [['unidad', 'Por unidad (hora, viaje, kg)'], ['registro', 'Por registro (día o servicio)'], ['fijo', 'Valor fijo por corte']];
export const USOS_TARIFA = [['pago', 'Pago (lo que se le paga a la persona)'], ['cobro', 'Cobro (lo que se le cobra al cliente)']];
export const CUANDO = [['dominical_festivo', 'Domingo o festivo'], ['domingo', 'Solo domingo'], ['festivo', 'Solo festivo'], ['sabado', 'Sábado'], ['siempre', 'Siempre']];
export const SALIDAS_PAGO = [['ninguno', 'No genera pago (solo control)'], ['ds', 'Documento soporte'], ['nomina', 'Novedad de nómina']];
export const SALIDAS_COBRO = [['ninguno', 'No se factura'], ['fv', 'Factura de venta']];
const FUNCIONES = { min: Math.min, max: Math.max, redondear: (x, d = 0) => { const p = 10 ** d; return Math.round(x * p) / p; } };
export const VARIABLES_FIJAS = ['cantidad', 'pagadas', 'tarifa'];

/* ---------- Plantillas ---------- */
// Tipos ya armados. La empresa copia la plantilla y la cambia a su gusto.
export const PLANTILLAS = {
  maquinaria: {
    nombre: 'Maquinaria amarilla', icono: 'maquina',
    descripcion: 'Horas máquina por operador, equipo y obra. Pago por hora, por día o fijo por obra, con recargo de domingo y festivo.',
    config: {
      persona: 'Operador', unidad: 'h',
      listas: [
        { k: 'equipos', nombre: 'Equipos', campos: [{ k: 'modelo', nombre: 'Modelo', tipo: 'texto' }, { k: 'serie', nombre: 'Serie o placa', tipo: 'texto' }], nivel_cc: null },
        { k: 'obras', nombre: 'Obras', campos: [{ k: 'lugar', nombre: 'Lugar', tipo: 'texto' }], nivel_cc: null },
      ],
      campos: [
        { k: 'equipo', nombre: 'Equipo', tipo: 'elemento', lista: 'equipos', obligatorio: true },
        { k: 'obra', nombre: 'Obra', tipo: 'elemento', lista: 'obras', obligatorio: true },
        { k: 'soporte', nombre: 'Soporte', tipo: 'lista', opciones: ['Recibo firmado', 'Foto horómetro', 'Reporte del operador', 'Sin soporte'], obligatorio: true },
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
    constantes: c.constantes || [], reglas: c.reglas || [], salidas: { pago: 'ninguno', cobro: 'ninguno', ...(c.salidas || {}) } };
}

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
const valorCriterio = (r, k) => k === 'tercero' ? r.tercero_id : r.datos?.[k];
// La tarifa más específica que aplica al registro: todos sus criterios coinciden; gana la que tenga más criterios y, si empatan, la más reciente.
export function tarifaPara(r, tarifas, uso = 'pago') {
  const ok = (tarifas || []).filter(t => t.tipo_id === r.tipo_id && (t.uso || 'pago') === uso && (!t.desde || t.desde <= r.fecha) && (!t.hasta || r.fecha <= t.hasta)
    && Object.entries(t.criterios || {}).every(([k, val]) => !val || valorCriterio(r, k) === val));
  const peso = t => Object.values(t.criterios || {}).filter(Boolean).length;
  return ok.sort((a, b) => peso(b) - peso(a) || String(b.desde || '').localeCompare(String(a.desde || '')))[0] || null;
}
// Cantidad, horas pagadas, tarifa, valor y recargos de un registro (lo que se le paga a la persona).
export function calcular(r, tipo, tarifas, uso = 'pago') {
  const cfg = cfgTipo(tipo), v = variables(r, cfg), dia = diaDe(r.fecha);
  let cantidad = 0; try { cantidad = r2(evaluar(cfg.formulas.cantidad, v)); } catch (_) { cantidad = 0; }
  const pagadas = cfg.editar_pagadas && r.cantidad_pagada != null && r.cantidad_pagada !== '' ? r2(n(r.cantidad_pagada)) : cantidad;
  const t = tarifaPara(r, tarifas, uso), tarifa = t ? n(t.valor) : 0, modo = t?.modo || 'unidad';
  const vv = { ...v, cantidad, pagadas, tarifa };
  let base = 0;
  if (t && modo === 'unidad') { try { base = r2(evaluar(cfg.formulas.valor, vv)); } catch (_) { base = 0; } }
  else if (t && modo === 'registro') base = r2(tarifa);
  const recargos = uso !== 'pago' ? [] : cfg.reglas.filter(g => aplicaDia(g.cuando, dia) && (!g.terceros?.length || g.terceros.includes(r.tercero_id)) && pagadas > 0)
    .map(g => { let x = 0; try { x = r2(evaluar(g.formula, vv)); } catch (_) { x = 0; } return { nombre: g.nombre, valor: x }; }).filter(x => x.valor);
  const valor = r2(base + recargos.reduce((s, x) => s + x.valor, 0));
  return { cantidad, pagadas, dia, tarifa: t, modo, base, recargos, valor, fijo: modo === 'fijo' };
}

/* ---------- Resumen por persona (lo que será el volante) ---------- */
// Agrupa por persona y por tarifa. Las tarifas de valor fijo se cuentan una vez por persona en el periodo.
export function resumen(registros, tipo, tarifas) {
  const out = new Map();
  for (const r of registros) {
    const c = calcular(r, tipo, tarifas);
    const p = out.get(r.tercero_id) || { tercero_id: r.tercero_id, lineas: new Map(), cantidad: 0, total: 0 };
    p.cantidad = r2(p.cantidad + c.pagadas);
    const kt = c.tarifa?.id || 'sin-tarifa';
    const l = p.lineas.get(kt) || { tarifa: c.tarifa, modo: c.modo, cantidad: 0, registros: 0, valor: 0 };
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
    if (cfg.editar_pagadas && Math.abs(c.pagadas - c.cantidad) > 0.001 && !String(r.nota || '').trim()) out.push({ clase: 'pagadas', registro_id: r.id, fecha: r.fecha, texto: `Se pagan ${fx(c.pagadas)} y la fórmula da ${fx(c.cantidad)}: escribe una nota con el motivo.` });
    if (cfg.pendiente?.campo && (cfg.pendiente.valores || []).includes(r.datos?.[cfg.pendiente.campo])) out.push({ clase: 'pendiente', registro_id: r.id, fecha: r.fecha, texto: `Soporte pendiente: ${r.datos[cfg.pendiente.campo]}.` });
    if (!c.tarifa && c.pagadas > 0) out.push({ clase: 'tarifa', registro_id: r.id, fecha: r.fecha, texto: 'No hay tarifa de pago que aplique a este registro.' });
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
  for (const f of c.campos) {
    const x = r.datos?.[f.k];
    if (f.tipo === 'lectura') { const a = x?.ini, b = x?.fin, hay = v => v !== '' && v != null; if (hay(a) !== hay(b)) e.push(`${f.nombre}: escribe la lectura inicial y la final.`); else if (hay(a) && n(b) < n(a)) e.push(`${f.nombre}: la final no puede ser menor que la inicial.`); if (f.obligatorio && !hay(a)) e.push(`${f.nombre} es obligatorio.`); continue; }
    if (f.obligatorio && f.tipo !== 'sino' && (x == null || String(x).trim() === '')) e.push(`${f.nombre} es obligatorio.`);
  }
  if (c.editar_pagadas && r.cantidad_pagada != null && r.cantidad_pagada !== '' && n(r.cantidad_pagada) < 0) e.push('Las cantidades pagadas no pueden ser negativas.');
  return e;
}
export function erroresTarifa(t) {
  const e = [];
  if (!(n(t.valor) > 0)) e.push('El valor de la tarifa debe ser mayor que cero.');
  if (!MODOS_TARIFA.some(m => m[0] === t.modo)) e.push('Escoge el modo de la tarifa.');
  if (t.desde && t.hasta && t.hasta < t.desde) e.push('La vigencia termina antes de empezar.');
  return e;
}
