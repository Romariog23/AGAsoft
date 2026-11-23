// Nómina: liquidación por empleado, aportes, provisiones de prestaciones y su contabilización.
// Funciones puras. Los parámetros del año y las cuentas se guardan en empresas.contabilidad.nomina.
// Las tarifas son las de ley en Colombia; el salario mínimo y el auxilio de transporte se escriben cada año.
import { r2, num } from './calc.js';
import { naturaleza, rubroPorDefecto } from './puc.js';

export const AREAS = [['admin', 'Administración', '5105'], ['ventas', 'Ventas', '5205'], ['produccion', 'Producción', '7205']];
export const CONTRATOS = [['indefinido', 'Término indefinido'], ['fijo', 'Término fijo'], ['obra', 'Obra o labor']];
// Clase de riesgo ARL y su tarifa (% del IBC).
export const RIESGOS = [['1', 'Riesgo I · 0,522 %', 0.522], ['2', 'Riesgo II · 1,044 %', 1.044], ['3', 'Riesgo III · 2,436 %', 2.436], ['4', 'Riesgo IV · 4,35 %', 4.35], ['5', 'Riesgo V · 6,96 %', 6.96]];
export const PERIODOS = [['mensual', 'Mensual'], ['quincenal', 'Quincenal']];

// Conceptos de nómina. tipo: dev (devengado), ded (deducción), apo (aporte de la empresa), pro (provisión de prestaciones).
// sub = subcuenta del gasto dentro de 5105, 5205 o 7205; pasivo = cuenta por pagar (o por cobrar, en préstamos).
// entidad = de quién es el saldo por pagar: la EPS, el fondo, la ARL o la caja (si no hay, el empleado).
export const CONCEPTOS = [
  { k: 'salario', nombre: 'Salario', tipo: 'dev', sub: '06' },
  { k: 'horas_extra', nombre: 'Horas extra y recargos', tipo: 'dev', sub: '15', novedad: true },
  { k: 'comisiones', nombre: 'Comisiones', tipo: 'dev', sub: '18', novedad: true },
  { k: 'auxilio', nombre: 'Auxilio de transporte', tipo: 'dev', sub: '27' },
  { k: 'bonificacion', nombre: 'Bonificación no salarial', tipo: 'dev', sub: '48', novedad: true },
  { k: 'salud', nombre: 'Salud (empleado)', tipo: 'ded', pct: 4, pasivo: '23700501', entidad: 'eps' },
  { k: 'pension', nombre: 'Pensión (empleado)', tipo: 'ded', pct: 4, pasivo: '23803001', entidad: 'pension' },
  { k: 'solidaridad', nombre: 'Fondo de solidaridad pensional', tipo: 'ded', pasivo: '23803001', entidad: 'pension' },
  { k: 'retencion', nombre: 'Retención en la fuente', tipo: 'ded', pasivo: '23650501', novedad: true },
  { k: 'prestamo', nombre: 'Préstamos al empleado', tipo: 'ded', pasivo: '13659501', novedad: true },
  { k: 'otros_desc', nombre: 'Libranzas, embargos y otros descuentos', tipo: 'ded', pasivo: '23709501', novedad: true },
  { k: 'salud_emp', nombre: 'Salud (empresa)', tipo: 'apo', pct: 8.5, sub: '69', pasivo: '23700501', entidad: 'eps' },
  { k: 'pension_emp', nombre: 'Pensión (empresa)', tipo: 'apo', pct: 12, sub: '70', pasivo: '23803001', entidad: 'pension' },
  { k: 'arl', nombre: 'ARL', tipo: 'apo', sub: '68', pasivo: '23700601', entidad: 'arl' },
  { k: 'caja', nombre: 'Caja de compensación', tipo: 'apo', pct: 4, sub: '72', pasivo: '23701001', entidad: 'caja' },
  { k: 'icbf', nombre: 'ICBF', tipo: 'apo', pct: 3, sub: '75', pasivo: '23701001', entidad: 'icbf' },
  { k: 'sena', nombre: 'SENA', tipo: 'apo', pct: 2, sub: '78', pasivo: '23701001', entidad: 'sena' },
  { k: 'cesantias', nombre: 'Cesantías', tipo: 'pro', sub: '30', pasivo: '25100501' },
  { k: 'intereses', nombre: 'Intereses sobre cesantías', tipo: 'pro', sub: '33', pasivo: '25150501' },
  { k: 'prima', nombre: 'Prima de servicios', tipo: 'pro', sub: '36', pasivo: '25200501' },
  { k: 'vacaciones', nombre: 'Vacaciones', tipo: 'pro', sub: '39', pasivo: '25250501' },
];
export const CONCEPTO = Object.fromEntries(CONCEPTOS.map(c => [c.k, c]));
export const NOVEDADES = CONCEPTOS.filter(c => c.novedad);
export const CUENTA_NETO = '25050501';

// Horas extra y recargos (códigos de la nómina electrónica de la DIAN). extra: la hora se paga completa más el porcentaje;
// recargo: solo el porcentaje, porque la hora ya va en el salario. Porcentajes por defecto con la Ley 2466 de 2025
// (recargo dominical y festivo de 90 % desde julio de 2026); cada empresa los puede cambiar en Configuración de nómina.
export const TIPOS_HORA = [
  { k: 'HED', nombre: 'Hora extra diurna', pct: 25, extra: true, dian: '1' },
  { k: 'HEN', nombre: 'Hora extra nocturna', pct: 75, extra: true, dian: '2' },
  { k: 'HRN', nombre: 'Recargo nocturno', pct: 35, extra: false, dian: '3' },
  { k: 'HEDDF', nombre: 'Hora extra diurna dominical o festiva', pct: 115, extra: true, dian: '4' },
  { k: 'HRDDF', nombre: 'Recargo diurno dominical o festivo', pct: 90, extra: false, dian: '5' },
  { k: 'HENDF', nombre: 'Hora extra nocturna dominical o festiva', pct: 165, extra: true, dian: '6' },
  { k: 'HRNDF', nombre: 'Recargo nocturno dominical o festivo', pct: 125, extra: false, dian: '7' },
];
export const TIPO_HORA = Object.fromEntries(TIPOS_HORA.map(t => [t.k, t]));
// Valor de las horas de un empleado: hora ordinaria = salario ÷ horas del mes.
// horas: { HED: 3, HRN: 8, ... } → { total, detalle: [{ tipo, nombre, horas, pct, valor }] }
export function valorHoras(salario, horas, P) {
  const hora = num(salario) / (num(P.horas_mes) || 210), detalle = [];
  for (const t of TIPOS_HORA) {
    const h = num(horas?.[t.k]); if (!(h > 0)) continue;
    const pct = P.pct_horas?.[t.k] === undefined || P.pct_horas[t.k] === '' ? t.pct : num(P.pct_horas[t.k]);
    detalle.push({ tipo: t.k, nombre: t.nombre, horas: h, pct, valor: r2(h * hora * ((t.extra ? 100 : 0) + pct) / 100) });
  }
  return { total: r2(detalle.reduce((s, d) => s + d.valor, 0)), detalle };
}
const hayHoras = h => h && Object.values(h).some(x => num(x) > 0);

// Parámetros de la empresa (los guardados o los de fábrica).
export function paramNomina(contab) {
  const g = contab?.nomina || {};
  return {
    smmlv: num(g.smmlv) || 1750905, auxilio: g.auxilio === undefined || g.auxilio === '' ? 249095 : num(g.auxilio),
    periodo: g.periodo === 'quincenal' ? 'quincenal' : 'mensual', exonerada: g.exonerada !== false,
    arl_id: g.arl_id || '', icbf_id: g.icbf_id || '', sena_id: g.sena_id || '',
    cuenta_neto: String(g.cuenta_neto || '').trim() || CUENTA_NETO, cuentas: g.cuentas || {},
    // Horas del mes para el valor de la hora ordinaria (jornada de 42 horas semanales = 210 al mes).
    horas_mes: num(g.horas_mes) || 210, pct_horas: g.pct_horas || {},
  };
}
// Cuenta de gasto de un concepto para el área del empleado; la empresa puede cambiarla por concepto y área.
export function cuentaGasto(P, k, area) {
  const propia = String(P.cuentas?.[k]?.[area] || '').trim();
  if (propia) return propia;
  const pre = (AREAS.find(a => a[0] === area) || AREAS[0])[2];
  return `${pre}${CONCEPTO[k].sub}01`;
}
export const cuentaPasivo = (P, k) => String(P.cuentas?.[k]?.pasivo || '').trim() || CONCEPTO[k].pasivo;

// Porcentaje del fondo de solidaridad según el IBC del mes en salarios mínimos.
export function pctSolidaridad(ibcMes, smmlv) {
  const n = ibcMes / smmlv;
  if (n < 4) return 0;
  if (n < 16) return 1;
  if (n <= 17) return 1.2;
  if (n <= 18) return 1.4;
  if (n <= 19) return 1.6;
  if (n <= 20) return 1.8;
  return 2;
}

// Liquidación de un empleado en un periodo. nov = { dias, horas_extra, horas, comisiones, bonificacion, retencion, prestamo, otros_desc }.
// Si trae horas por tipo ({ HED: 2, ... }), el valor de horas extra sale de ellas (y queda el detalle para la DIAN).
export function liquidar(emp, nov, P) {
  const diasPeriodo = P.periodo === 'quincenal' ? 15 : 30;
  const dias = Math.max(0, Math.min(30, nov?.dias === undefined || nov?.dias === '' ? diasPeriodo : num(nov.dias)));
  const sal = num(emp.salario), H = hayHoras(nov?.horas) ? valorHoras(sal, nov.horas, P) : null;
  const v = k => k === 'horas_extra' && H ? H.total : r2(Math.max(0, num(nov?.[k])));
  const out = { empleado_id: emp.id, tercero_id: emp.tercero_id, area: emp.area || 'admin', dias, items: [] };
  // Sin la entidad configurada, el saldo queda a nombre del empleado (se avisa al liquidar).
  const entidad = e => ({ eps: emp.eps_id, pension: emp.pension_id, caja: emp.caja_id, arl: P.arl_id, icbf: P.icbf_id, sena: P.sena_id }[e] || null);
  const add = (k, valor) => {
    valor = r2(valor); if (!valor) return;
    const c = CONCEPTO[k], it = { k, nombre: c.nombre, tipo: c.tipo, valor };
    if (c.tipo === 'dev') { it.cuenta = cuentaGasto(P, k, out.area); it.tercero_id = emp.tercero_id; }
    else if (c.tipo === 'ded') { it.cuenta = cuentaPasivo(P, k); it.tercero_id = c.entidad ? entidad(c.entidad) : emp.tercero_id; }
    else { it.cuenta = cuentaGasto(P, k, out.area); it.contra = cuentaPasivo(P, k); it.tercero_id = c.entidad ? entidad(c.entidad) : emp.tercero_id; }
    if (k === 'horas_extra' && H) it.horas = H.detalle;
    out.items.push(it);
  };
  const salario = sal * dias / 30;
  add('salario', salario);
  add('horas_extra', v('horas_extra')); add('comisiones', v('comisiones'));
  // Auxilio de transporte: hasta dos salarios mínimos, si el empleado tiene derecho.
  const auxilio = emp.auxilio !== false && sal <= 2 * P.smmlv ? P.auxilio * dias / 30 : 0;
  add('auxilio', auxilio); add('bonificacion', v('bonificacion'));
  // IBC: lo salarial del periodo (no el auxilio ni la bonificación), mínimo el salario mínimo proporcional.
  const salarial = r2(salario + v('horas_extra') + v('comisiones'));
  const ibc = dias ? r2(Math.max(salarial, P.smmlv * dias / 30)) : 0, ibcMes = dias ? ibc * 30 / dias : 0;
  out.ibc = ibc;
  // Pensionado: no cotiza pensión (ni empleado, ni empresa, ni solidaridad); salud sí, completa.
  const pensionado = emp.pensionado === true;
  add('salud', ibc * 0.04);
  if (!pensionado) { add('pension', ibc * 0.04); add('solidaridad', ibc * pctSolidaridad(ibcMes, P.smmlv) / 100); }
  add('retencion', v('retencion')); add('prestamo', v('prestamo')); add('otros_desc', v('otros_desc'));
  // Aportes de la empresa. Exonerada (art. 114-1 E.T.): sin salud 8,5 %, ICBF ni SENA por quien gana menos de 10 mínimos.
  const exon = P.exonerada && ibcMes < 10 * P.smmlv;
  if (!exon) add('salud_emp', ibc * 0.085);
  if (!pensionado) add('pension_emp', ibc * 0.12);
  add('arl', ibc * ((RIESGOS.find(r => r[0] === String(emp.riesgo || '1')) || RIESGOS[0])[2]) / 100);
  add('caja', ibc * 0.04);
  if (!exon) { add('icbf', ibc * 0.03); add('sena', ibc * 0.02); }
  // Provisiones: cesantías y prima sobre lo salarial más el auxilio; vacaciones sobre el salario.
  const basePrest = salarial + auxilio, ces = r2(basePrest / 12);
  add('cesantias', ces); add('intereses', ces * 0.12); add('prima', basePrest / 12); add('vacaciones', salario / 24);
  const suma = t => r2(out.items.filter(i => i.tipo === t).reduce((s, i) => s + i.valor, 0));
  out.devengado = suma('dev'); out.deducciones = suma('ded'); out.neto = r2(out.devengado - out.deducciones);
  out.aportes = suma('apo'); out.provisiones = suma('pro');
  return out;
}

export const totalesNomina = lineas => ['devengado', 'deducciones', 'neto', 'aportes', 'provisiones'].reduce((o, k) => ({ ...o, [k]: r2((lineas || []).reduce((s, l) => s + num(l[k]), 0)) }), {});

// Movimientos contables de una nómina guardada (las cuentas quedan guardadas en cada línea).
// ccEmp: { tercero_id: distribución por centros de costo del empleado } (la línea de la nómina puede traer la suya).
export function asientoNomina(n, ccEmp = {}) {
  // Solo la nómina contabilizada suma (el borrador y la anulada no).
  if (!n || n.estado === 'anulado' || n.estado === 'borrador') return [];
  const ref = `NE ${n.numero}`, out = [];
  let dist = null;
  const mov = (cuenta, debito, credito, tercero_id, detalle) => { debito = r2(debito); credito = r2(credito); if (debito || credito) out.push({ fecha: n.fecha, doc_id: n.id, tipo: 'NE', ref, origen: 'nomina', cuenta, tercero_id: tercero_id || null, detalle, debito, credito, ...(dist?.length ? { _dist: dist } : {}) }); };
  for (const l of n.lineas || []) {
    dist = Array.isArray(l.cc) && l.cc.length ? l.cc : ccEmp[l.tercero_id] || null;
    for (const i of l.items || []) {
      if (i.tipo === 'dev') mov(i.cuenta, i.valor, 0, l.tercero_id, i.nombre);
      // Sin la entidad configurada, el pasivo queda a nombre del empleado (toda línea lleva tercero) y se paga escogiendo la entidad.
      else if (i.tipo === 'ded') mov(i.cuenta, 0, i.valor, i.tercero_id || l.tercero_id, i.nombre);
      else { mov(i.cuenta, i.valor, 0, l.tercero_id, i.nombre); mov(i.contra, 0, i.valor, i.tercero_id || l.tercero_id, i.nombre); }
    }
    mov(n.cuenta_neto || CUENTA_NETO, 0, l.neto, l.tercero_id, 'Neto a pagar');
  }
  return out;
}

// Cuentas que usa una nómina y que faltan en el plan: se crean con su subcuenta y su cuenta si hace falta.
const NOMBRES = {
  '7205': 'Mano de obra (nómina)', '06': 'Sueldos', '15': 'Horas extras y recargos', '18': 'Comisiones', '27': 'Auxilio de transporte', '30': 'Cesantías',
  '33': 'Intereses sobre cesantías', '36': 'Prima de servicios', '39': 'Vacaciones', '48': 'Bonificaciones', '68': 'Aportes a administradoras de riesgos laborales',
  '69': 'Aportes a entidades promotoras de salud', '70': 'Aportes a fondos de pensiones', '72': 'Aportes a cajas de compensación familiar', '75': 'Aportes ICBF', '78': 'SENA',
  '237005': 'Aportes a entidades promotoras de salud', '237006': 'Aportes a administradoras de riesgos laborales', '237010': 'Aportes parafiscales', '237095': 'Otros descuentos de nómina',
  '238030': 'Fondos de cesantías y pensiones', '53': 'No operacionales', '5305': 'Financieros', '530520': 'Intereses', '136595': 'Otras cuentas por cobrar a trabajadores', '236505': 'Salarios y pagos laborales',
};
export function cuentasFaltantes(codigos, cuentas) {
  const hay = new Set((cuentas || []).map(c => c.codigo)), nuevas = [];
  const nombre = cod => NOMBRES[cod] || (/^(5105|5205|7205)/.test(cod) && NOMBRES[cod.slice(4, 6)]) || '';
  for (const cod of [...new Set(codigos)].filter(c => /^\d{8}$/.test(c))) {
    if (hay.has(cod)) continue;
    let ultimo = '';
    for (const n of [2, 4, 6, 8]) {
      const c = cod.slice(0, n);
      if (hay.has(c)) { ultimo = (cuentas.find(x => x.codigo === c) || nuevas.find(x => x.codigo === c))?.nombre || ultimo; continue; }
      const nom = nombre(c) || nombre(cod.slice(0, 6)) || ultimo || 'Nómina';
      nuevas.push({ codigo: c, nombre: nom, naturaleza: naturaleza(c), niif_rubro: rubroPorDefecto(c), niif_codigo: '', activa: true });
      hay.add(c); ultimo = nom;
    }
  }
  return nuevas;
}
// Entidades que faltan para que cada saldo quede a nombre de quien se le paga.
const NOMBRE_ENTIDAD = { eps: 'EPS', pension: 'fondo de pensiones', caja: 'caja de compensación', arl: 'ARL', icbf: 'ICBF', sena: 'SENA' };
export function entidadesFaltantes(lineas) {
  const out = new Set();
  for (const l of lineas || []) for (const i of l.items || []) { const c = CONCEPTO[i.k]; if (c?.entidad && !i.tercero_id) out.add(c.entidad); }
  return [...out].map(e => ({ entidad: e, nombre: NOMBRE_ENTIDAD[e], empresa: ['arl', 'icbf', 'sena'].includes(e) }));
}
export const cuentasDeNomina = lineas => (lineas || []).flatMap(l => (l.items || []).flatMap(i => [i.cuenta, i.contra].filter(Boolean)));

// Saldos por pagar de nómina (salarios, aportes, prestaciones) de un tercero, desde los movimientos contables.
export const CUENTAS_LABORALES = /^(2370|2380|2505|2510|2515|2520|2525)/;
export function porPagarLaboral(movs, tercero_id) {
  const s = {};
  for (const m of movs || []) if (m.tercero_id === tercero_id && CUENTAS_LABORALES.test(m.cuenta)) s[m.cuenta] = r2((s[m.cuenta] || 0) + m.credito - m.debito);
  return Object.entries(s).filter(([, v]) => v > 0.009).map(([cuenta, saldo]) => ({ cuenta, saldo })).sort((a, b) => a.cuenta.localeCompare(b.cuenta));
}

// Contabilización globalizada: una fila por cuenta con la suma de todos los empleados y entidades (como un mini balance).
export function resumenPorCuenta(ms) {
  const g = {};
  for (const m of ms || []) {
    const x = g[m.cuenta] = g[m.cuenta] || { cuenta: m.cuenta, debito: 0, credito: 0, ter: new Set() };
    x.debito = r2(x.debito + m.debito); x.credito = r2(x.credito + m.credito); if (m.tercero_id) x.ter.add(m.tercero_id);
  }
  // Primero los débitos (gastos) y luego los créditos (pasivos), cada grupo por código.
  return Object.values(g).map(({ ter, ...x }) => ({ ...x, terceros: ter.size })).sort((a, b) => (b.debito > b.credito) - (a.debito > a.credito) || a.cuenta.localeCompare(b.cuenta));
}

// Pasivos de nómina que no se pagan con el neto del mes: seguridad social y parafiscales (PILA) y prestaciones sociales.
export const CUENTAS_SS = /^(2370|2380)/;
export const CUENTAS_PREST = /^(2510|2515|2520|2525)/;
export const PRESTACIONES = [['2510', 'Cesantías'], ['2515', 'Intereses sobre cesantías'], ['2520', 'Prima de servicios'], ['2525', 'Vacaciones']];
// Saldo por tercero y cuenta a una fecha de corte (crédito − débito). Solo los terceros con saldo.
export function pasivosNomina(movs, hasta, re) {
  const s = {};
  for (const m of movs || []) if (re.test(m.cuenta) && (!hasta || m.fecha <= hasta)) { const k = (m.tercero_id || '') + '|' + m.cuenta; s[k] = r2((s[k] || 0) + m.credito - m.debito); }
  const por = {};
  for (const [k, v] of Object.entries(s)) {
    if (Math.abs(v) < 0.01) continue;
    const [t, cuenta] = k.split('|'), x = por[t] = por[t] || { tercero_id: t || null, cuentas: [], total: 0 };
    x.cuentas.push({ cuenta, saldo: v }); x.total = r2(x.total + v);
  }
  for (const x of Object.values(por)) x.cuentas.sort((a, b) => a.cuenta.localeCompare(b.cuenta));
  return Object.values(por).sort((a, b) => b.total - a.total);
}
// Cuenta de gasto con que se causó ese pasivo para ese tercero en la nómina más reciente (sirve para llevar ahí la diferencia).
export function cuentaContraSugerida(nominas, tercero_id, pasivo) {
  const ns = (nominas || []).filter(n => n.estado === 'contabilizado').sort((a, b) => b.fecha.localeCompare(a.fecha));
  for (const n of ns) for (const l of n.lineas || []) for (const i of l.items || []) {
    if (i.contra === pasivo && (i.tercero_id || l.tercero_id) === tercero_id) return i.cuenta;
  }
  return '';
}
// Líneas del comprobante que deja cada pasivo en su valor real (la PILA pagada o la prestación consolidada).
// filas: [{ cuenta (pasivo), saldo (en libros), real, contra (cuenta de gasto o ingreso) }]; mora: intereses de mora de la PILA.
export function lineasAjuste({ tercero_id, filas, mora = 0, cuentaMora = '53052001', detalle = 'Ajuste de nómina' }) {
  const out = [], add = (cuenta, debito, credito, det) => out.push({ cuenta, tercero_id: tercero_id || null, detalle: det, debito: r2(debito), credito: r2(credito) });
  for (const f of filas || []) {
    const d = r2(num(f.real) - num(f.saldo));
    if (!d) continue;
    if (!f.contra) throw new Error(`Escribe la cuenta para la diferencia de ${f.cuenta}.`);
    // Se pagó (o se debe) más de lo causado: más gasto. Menos: se devuelve el gasto (o va a recuperaciones).
    if (d > 0) { add(f.contra, d, 0, detalle); add(f.cuenta, 0, d, detalle); } else { add(f.cuenta, -d, 0, detalle); add(f.contra, 0, -d, detalle); }
  }
  mora = r2(num(mora));
  if (mora > 0) {
    const pas = (filas || [])[0]?.cuenta; if (!pas) throw new Error('No hay a qué cuenta cargar los intereses de mora.');
    add(cuentaMora, mora, 0, 'Intereses de mora seguridad social'); add(pas, 0, mora, 'Intereses de mora seguridad social');
  }
  return out;
}

/* ---------- Comprobante de pago de nómina (PN) ---------- */
// Un solo comprobante con varios terceros, como una dispersión bancaria. Tres modos:
//  salarios: el neto (2505) de cada empleado; el banco sale a nombre del empleado.
//  ss: aportes de la PILA (2370 y 2380) por entidad; el banco sale a nombre de la entidad.
//  prest: cesantías, intereses, prima y vacaciones por empleado; las cesantías se consignan al fondo.
export const MODOS_PAGO = [['salarios', 'Pago de salarios', /^2505/], ['ss', 'Pago de seguridad social (PILA)', CUENTAS_SS], ['prest', 'Pago de prestaciones sociales', CUENTAS_PREST]];
// grupos: [{ tercero_pago, nombre, filas: [{ cuenta, tercero_id, saldo, pagar, contra }], mora }]
// ajustar: la diferencia entre lo pagado y lo causado va a la cuenta contra y el pasivo queda en cero.
//          Sin ajustar, solo se abona lo pagado y el resto del pasivo sigue pendiente.
// terceroBanco: si se paga todo en una sola transacción (la PILA por un operador como SOI, Aportes en Línea o Asopagos),
// sale una sola línea de banco a nombre de ese tercero; los pasivos de cada entidad se cancelan igual, cada uno con su tercero.
export function lineasPagoNomina({ grupos, banco, ajustar = false, cuentaMora = '53052001', detalle = 'Pago de nómina', terceroBanco = '', detalleBanco = '' }) {
  if (!banco) throw new Error('Escoge la cuenta de banco o caja con que se paga.');
  let unico = 0;
  const out = [], add = (cuenta, tercero_id, det, debito, credito) => out.push({ cuenta, tercero_id: tercero_id || null, detalle: det, debito: r2(debito), credito: r2(credito) });
  for (const g of grupos || []) {
    if (!g.tercero_pago) throw new Error(`Falta el tercero a quien se le paga${g.nombre ? ` (${g.nombre})` : ''}.`);
    const det = `${detalle}${g.nombre ? ' · ' + g.nombre : ''}`;
    let total = 0;
    for (const f of g.filas || []) {
      const saldo = r2(num(f.saldo)), pagar = r2(num(f.pagar));
      if (pagar < 0) throw new Error('Los valores a pagar no pueden ser negativos.');
      if (!ajustar) {
        if (!pagar) continue;
        if (pagar > saldo + 0.005) throw new Error(`En ${f.cuenta}${g.nombre ? ` de ${g.nombre}` : ''} se paga más de lo que se debe (${saldo}). Marca "Ajustar la diferencia" o corrige el valor.`);
        add(f.cuenta, f.tercero_id, det, pagar, 0);
      } else {
        if (saldo) add(f.cuenta, f.tercero_id, det, saldo > 0 ? saldo : 0, saldo < 0 ? -saldo : 0);
        const d = r2(pagar - saldo);
        if (d) {
          if (!f.contra) throw new Error(`Escribe la cuenta para la diferencia de ${f.cuenta}${g.nombre ? ` de ${g.nombre}` : ''}.`);
          add(f.contra, f.tercero_id, `Diferencia ${det}`, d > 0 ? d : 0, d < 0 ? -d : 0);
        }
      }
      total = r2(total + pagar);
    }
    const mora = r2(num(g.mora));
    if (mora > 0) { add(cuentaMora, g.tercero_pago, `Intereses de mora · ${g.nombre || ''}`.trim(), mora, 0); total = r2(total + mora); }
    if (total > 0 && !terceroBanco) add(banco, g.tercero_pago, det, 0, total);
    unico = r2(unico + total);
  }
  if (terceroBanco && unico > 0) add(banco, terceroBanco, detalleBanco || detalle, 0, unico);
  const d = r2(out.reduce((s, l) => s + l.debito, 0)), c = r2(out.reduce((s, l) => s + l.credito, 0));
  if (!out.length || !c) throw new Error('No hay valores para pagar.');
  if (d !== c) throw new Error(`El pago no cuadra: débitos ${d} y créditos ${c}.`);
  return out;
}
