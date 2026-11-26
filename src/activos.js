// Activos fijos (propiedad, planta y equipo): tipos con vida útil y cuentas, depreciación por línea recta y comprobante mensual (DP).
// - Origen 'nuevo': se compra en AGAsoft; vida útil completa del tipo desde el mes en que empieza a depreciarse.
// - Origen 'saldo': viene de otro programa (saldo inicial); se escriben la depreciación acumulada a esa fecha
//   y la vigencia restante en meses, y AGAsoft deprecia lo que falta en esos meses.
// La cuota de cada mes = lo que falta por depreciar ÷ meses que faltan. Con línea recta da siempre la misma cuota,
// y si se cambia la vida útil (cambios: [{desde:'AAAA-MM', restantes}]) la cuota se recalcula desde ese mes sin tocar lo anterior.
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

// Vida útil sugerida con las tasas máximas fiscales (art. 137 E.T.); cada empresa la cambia.
export const TIPOS_ACTIVO_DEF = [
  { id: 'construcciones', nombre: 'Construcciones y edificaciones', meses: 540, activo: '15160501', dep: '15920501', gasto: '51600501' },
  { id: 'maquinaria', nombre: 'Maquinaria y equipo', meses: 120, activo: '15200501', dep: '15921001', gasto: '51601001' },
  { id: 'oficina', nombre: 'Muebles y equipo de oficina', meses: 120, activo: '15240501', dep: '15921501', gasto: '51601501' },
  { id: 'computo', nombre: 'Equipo de computación y comunicación', meses: 60, activo: '15280501', dep: '15922001', gasto: '51602001' },
  { id: 'transporte', nombre: 'Flota y equipo de transporte', meses: 120, activo: '15400501', dep: '15923501', gasto: '51603501' },
  { id: 'terrenos', nombre: 'Terrenos', meses: 0, activo: '15040501', dep: '', gasto: '' },
];
// Tipos de la empresa; si no los ha guardado, los sugeridos con cada cuenta llevada a una auxiliar que exista en su plan
// (la misma, o la primera de su subcuenta o de su cuenta: por ejemplo 15920501 si no hay 15921001).
export function tiposActivo(contab, codigos = null) {
  if (Array.isArray(contab?.activos_tipos) && contab.activos_tipos.length) return contab.activos_tipos;
  if (!codigos) return TIPOS_ACTIVO_DEF;
  const aux = [...codigos].filter(c => /^\d{8}$/.test(c)).sort(), hay = new Set(aux);
  const fijar = c => !c || hay.has(c) ? c : aux.find(x => x.startsWith(c.slice(0, 6))) || aux.find(x => x.startsWith(c.slice(0, 4))) || c;
  return TIPOS_ACTIVO_DEF.map(t => ({ ...t, activo: fijar(t.activo), dep: fijar(t.dep), gasto: fijar(t.gasto) }));
}
export const depreciable = t => Number(t?.meses) > 0;

export const mesSig = p => { const [y, m] = p.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
export const finDeMes = p => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

// Cuentas del activo: las propias o las de su tipo.
export const cuentasActivo = (a, tipos) => { const t = tipos.find(x => x.id === a.tipo) || {}; return { activo: a.cta_activo || t.activo || '', dep: a.cta_dep || t.dep || '', gasto: a.cta_gasto || t.gasto || '' }; };

// Tabla de depreciación completa: [{periodo, cuota, acumulada, libros}] hasta que no quede nada por depreciar.
export function tablaDepreciacion(a, { tipos = TIPOS_ACTIVO_DEF } = {}) {
  const t = tipos.find(x => x.id === a.tipo);
  if (t && !depreciable(t)) return [];
  const costo = r2(a.costo), residual = r2(a.residual), ini = r2(a.dep_inicial);
  let restantes = Math.round(Number(a.vida_meses) || 0), acum = ini, p = a.inicio;
  const out = [], cambios = Object.fromEntries((a.cambios || []).map(c => [c.desde, Math.round(Number(c.restantes) || 0)]));
  if (!p || !/^\d{4}-\d{2}$/.test(p)) return out;
  const fin = a.estado === 'baja' && a.baja_fecha ? a.baja_fecha.slice(0, 7) : null;
  let fija = null;  // la cuota se fija al empezar y en cada cambio de vida útil; el último mes lleva lo que quede
  for (let i = 0; i < 1200; i++) {
    if (cambios[p] !== undefined) { restantes = cambios[p]; fija = null; }
    const falta = r2(costo - residual - acum);
    if (restantes <= 0 || falta <= 0.004 || (fin && p > fin)) break;
    if (fija === null) fija = r2(falta / restantes);
    const cuota = restantes === 1 ? falta : Math.min(fija, falta);
    acum = r2(acum + cuota); restantes--;
    out.push({ periodo: p, cuota, acumulada: acum, libros: r2(costo - acum) });
    p = mesSig(p);
  }
  return out;
}

// Meses ya contabilizados de cada activo, según los comprobantes DP vigentes: { activoId: Set(periodos) }.
export function mesesContabilizados(comps) {
  const out = {};
  for (const c of comps) {
    if (c.tipo !== 'DP' || c.estado === 'anulado') continue;
    const p = c.periodo || String(c.fecha).slice(0, 7);
    for (const l of c.lineas || []) if (l.activo) (out[l.activo] ||= new Set()).add(l.periodo || p);
  }
  return out;
}

// Situación de un activo a un mes (incluido): depreciación contabilizada y valor en libros.
export function estadoActivo(a, { tipos = TIPOS_ACTIVO_DEF, hechos = {} } = {}) {
  const tabla = tablaDepreciacion(a, { tipos }), h = hechos[a.id] || new Set();
  const contab = tabla.filter(x => h.has(x.periodo));
  const acumulada = r2(r2(a.dep_inicial) + contab.reduce((s, x) => s + x.cuota, 0));
  const pend = tabla.filter(x => !h.has(x.periodo));
  const t = tipos.find(x => x.id === a.tipo);
  const estado = a.estado === 'baja' ? 'baja' : t && !depreciable(t) ? 'no' : pend.length ? 'depreciando' : 'depreciado';
  return { tabla, acumulada, libros: r2(r2(a.costo) - acumulada), pendientes: pend, siguiente: pend[0] || null, estado };
}

// Cuotas de un mes que faltan por contabilizar, y el mes pendiente más antiguo antes de él (si lo hay).
export function cuotasDelMes(activos, periodo, { tipos = TIPOS_ACTIVO_DEF, hechos = {} } = {}) {
  const filas = []; let anterior = null;
  for (const a of activos) {
    if (a.estado === 'baja' && a.baja_fecha && a.baja_fecha.slice(0, 7) < periodo) continue;
    const e = estadoActivo(a, { tipos, hechos });
    for (const x of e.pendientes) {
      if (x.periodo < periodo) { if (!anterior || x.periodo < anterior) anterior = x.periodo; }
      else if (x.periodo === periodo) filas.push({ activo: a, cuota: x.cuota, cuentas: cuentasActivo(a, tipos) });
    }
  }
  return { filas, anterior };
}

// Líneas del comprobante DP: por activo, débito al gasto (con su centro de costo) y crédito a la depreciación acumulada.
export function lineasDepreciacion(filas, periodo, tercero) {
  const out = [];
  for (const { activo: a, cuota, cuentas } of filas) {
    const det = `Depreciación ${a.codigo} ${a.nombre}`.trim();
    out.push({ cuenta: cuentas.gasto, tercero_id: tercero, detalle: det, debito: cuota, credito: 0, activo: a.id, periodo, ...(a.cc1 ? { cc1: a.cc1 } : {}), ...(a.cc2 ? { cc2: a.cc2 } : {}), ...(a.cc3 ? { cc3: a.cc3 } : {}) });
    out.push({ cuenta: cuentas.dep, tercero_id: tercero, detalle: det, debito: 0, credito: cuota, activo: a.id, periodo });
  }
  return out;
}

// Errores al guardar un activo.
export function erroresActivo(a, tipos) {
  const e = [], t = tipos.find(x => x.id === a.tipo);
  if (!String(a.codigo || '').trim()) e.push('Escribe el código del activo.');
  if (!String(a.nombre || '').trim()) e.push('Escribe el nombre del activo.');
  if (!t) e.push('Escoge el tipo de activo.');
  if (!(r2(a.costo) > 0)) e.push('El costo debe ser mayor que cero.');
  if (r2(a.residual) < 0 || r2(a.dep_inicial) < 0) e.push('El valor residual y la depreciación acumulada no pueden ser negativos.');
  if (r2(a.residual) + r2(a.dep_inicial) > r2(a.costo)) e.push('El valor residual más la depreciación acumulada no puede superar el costo.');
  if (t && depreciable(t)) {
    if (!/^\d{4}-\d{2}$/.test(a.inicio || '')) e.push('Escoge el mes en que empieza a depreciarse.');
    if (!(Number(a.vida_meses) > 0) && r2(a.costo - a.residual - a.dep_inicial) > 0) e.push(a.origen === 'saldo' ? 'Escribe los meses de vigencia que le quedan.' : 'Escribe la vida útil en meses.');
  }
  return e;
}
