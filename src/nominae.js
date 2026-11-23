// Nómina electrónica (DIAN por Factus): un documento por empleado y mes con lo devengado y deducido en las nóminas
// contabilizadas del mes, más las prestaciones pagadas en el mes (prima, cesantías, intereses y vacaciones se reportan
// en el mes en que se pagan). Funciones puras.
import { r2, num } from './calc.js';
import { TIPO_HORA } from './nomina.js';

const dinero = v => r2(num(v)).toFixed(2);
const digitos = s => String(s ?? '').replace(/\D/g, '');
export const referenciaNE = n => `${n.tipo}-${n.numero}`;
export const CONTRATO_DIAN = { fijo: '1', indefinido: '2', obra: '3' };
// Cuentas de prestaciones que, al pagarse, se reportan en la nómina electrónica del mes.
export const PREST_NE = [['2510', 'cesantias'], ['2515', 'intereses'], ['2520', 'prima'], ['2525', 'vacaciones']];
const finDeMes = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-${String(new Date(anio, mes, 0).getDate()).padStart(2, '0')}`;
export const mesDe = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`;

// Nóminas contabilizadas del mes (por la fecha final del periodo) y la línea del empleado en cada una.
export function lineasDelMes(nominas, tercero_id, anio, mes) {
  const m = mesDe(anio, mes);
  return (nominas || []).filter(n => n.estado === 'contabilizado' && String(n.hasta).slice(0, 7) === m)
    .sort((a, b) => a.hasta.localeCompare(b.hasta))
    .flatMap(n => (n.lineas || []).filter(l => l.tercero_id === tercero_id).map(l => ({ nomina: n, linea: l })));
}
// Prestaciones pagadas al empleado en el mes: débitos a 2510/2515/2520/2525 a su nombre en los pagos de nómina (PN)
// vigentes (los ajustes de provisión no son pagos y no cuentan). comps: comprobantes con lineas [{cuenta, tercero_id, debito, credito}].
export function prestacionesPagadas(comps, tercero_id, anio, mes) {
  const m = mesDe(anio, mes), out = {};
  for (const c of comps || []) {
    if (c.tipo !== 'PN' || c.estado === 'anulado' || String(c.fecha).slice(0, 7) !== m) continue;
    for (const l of c.lineas || []) {
      if (l.tercero_id !== tercero_id) continue;
      const p = PREST_NE.find(([cta]) => String(l.cuenta).startsWith(cta)); if (!p) continue;
      out[p[1]] = r2((out[p[1]] || 0) + num(l.debito) - num(l.credito));
    }
  }
  for (const k of Object.keys(out)) if (out[k] <= 0) delete out[k];
  return out;
}
// Fechas de pago de los salarios del empleado en el mes (pagos de nómina PN); si no hay, la fecha final de cada nómina.
export function fechasPago(comps, tercero_id, anio, mes, lineas) {
  const m = mesDe(anio, mes);
  const f = (comps || []).filter(c => c.tipo === 'PN' && c.estado !== 'anulado' && String(c.fecha).slice(0, 7) === m
    && (c.lineas || []).some(l => l.tercero_id === tercero_id && /^2505/.test(String(l.cuenta)) && num(l.debito) > 0)).map(c => c.fecha);
  const out = [...new Set(f.length ? f : (lineas || []).map(x => x.nomina.hasta))].sort();
  return out.length ? out : [finDeMes(anio, mes)];
}

// Cuerpo para Factus (POST /v2/payrolls). ne: { tipo:'NIE', numero, anio, mes }; emp: el empleado; tercero: su tercero;
// lineas: lineasDelMes(...); prest: prestacionesPagadas(...); fechas: fechasPago(...).
export function jsonNominaE({ ne, emp, tercero, lineas, prest = {}, fechas = [], periodo = 'mensual' }) {
  const items = lineas.flatMap(x => x.linea.items || []);
  const suma = k => r2(items.filter(i => i.k === k).reduce((s, i) => s + num(i.valor), 0));
  const dias = Math.min(30, lineas.reduce((s, x) => s + num(x.linea.dias), 0));
  const ibc = r2(lineas.reduce((s, x) => s + num(x.linea.ibc), 0));
  const sal = num(emp.salario);
  const acc = { suel: { amount: dinero(suma('salario')) } };
  const tra = suma('auxilio'); if (tra) acc.tra = [{ amount: dinero(tra), accrual_type_code: '1' }];
  // Horas extra: por tipo, con cantidad, porcentaje y valor. Las que se liquidaron sin detalle van como otro concepto salarial.
  const horas = {}; let sinDetalle = 0;
  for (const i of items.filter(i => i.k === 'horas_extra')) {
    if (!i.horas?.length) { sinDetalle = r2(sinDetalle + num(i.valor)); continue; }
    for (const h of i.horas) { const x = horas[h.tipo + '|' + h.pct] = horas[h.tipo + '|' + h.pct] || { tipo: h.tipo, pct: h.pct, horas: 0, valor: 0 }; x.horas = r2(x.horas + num(h.horas)); x.valor = r2(x.valor + num(h.valor)); }
  }
  const hs = Object.values(horas);
  if (hs.length) acc.hora = hs.map(h => ({ quantity: h.horas.toFixed(2), percentage: num(h.pct).toFixed(2), amount: dinero(h.valor), accrual_type_code: TIPO_HORA[h.tipo]?.dian || '1' }));
  const comi = suma('comisiones'); if (comi) acc.comi = [{ amount: dinero(comi) }];
  const boni = suma('bonificacion'); if (boni) acc.boni = [{ amount: dinero(boni), accrual_type_code: '2' }];
  const otro = [];
  if (sinDetalle) otro.push({ amount: dinero(sinDetalle), description: 'Horas extra y recargos', accrual_type_code: '1' });
  if (otro.length) acc.otro = otro;
  // Prestaciones pagadas en el mes. Días de prima y de vacaciones: estimados con el salario (más auxilio en la prima).
  if (prest.prima) acc.prim = { quantity: Math.max(1, Math.min(180, Math.round(prest.prima * 360 / ((sal + (tra ? tra * 30 / Math.max(dias, 1) : 0)) || 1)))), amount: dinero(prest.prima), accrual_type_code: '1' };
  const cesa = [];
  if (prest.cesantias) cesa.push({ amount: dinero(prest.cesantias), accrual_type_code: '1' });
  if (prest.intereses) cesa.push({ amount: dinero(prest.intereses), percentage: '12.00', accrual_type_code: '2' });
  if (cesa.length) acc.cesa = cesa;
  if (prest.vacaciones) acc.vaca = [{ quantity: Math.max(1, Math.round(prest.vacaciones * 30 / (sal || 1))), amount: dinero(prest.vacaciones), accrual_type_code: '1' }];

  const salud = suma('salud'), pension = suma('pension'), soli = suma('solidaridad');
  const ded = {
    salu: { percentage: '4.00', amount: dinero(salud) },
    pens: { percentage: pension ? '4.00' : '0.00', amount: dinero(pension) },
  };
  if (soli) ded.dedu = [{ percentage: (ibc ? r2(soli / ibc * 100) : 1).toFixed(2), amount: dinero(soli), deduction_type_code: '1' }];
  const rete = suma('retencion'); if (rete) ded.rete = { amount: dinero(rete) };
  const deud = suma('prestamo'); if (deud) ded.deud = { amount: dinero(deud) };
  const otra = suma('otros_desc'); if (otra) ded.otra = [{ amount: dinero(otra) }];

  const t = tercero || {}, partes = String(t.nombre || '').trim().split(/\s+/);
  const nombre1 = t.primer_nombre || partes[0] || '', apellido1 = t.primer_apellido || (partes.length > 2 ? partes[partes.length - 2] : partes[1]) || '';
  const apellido2 = t.primer_apellido ? t.segundo_apellido || '' : partes.length > 2 ? partes[partes.length - 1] : '';
  const banco = String(emp.banco || '').trim(), cuenta = digitos(emp.cuenta_bancaria);
  const fin = finDeMes(ne.anio, ne.mes);
  const body = {
    reference_code: referenciaNE(ne),
    observation: `Nómina ${mesDe(ne.anio, ne.mes)}`,
    settlement_period: { month: String(ne.mes), year: String(ne.anio), payroll_period_code: periodo === 'quincenal' ? '4' : '5' },
    payment: banco && cuenta ? { payment_method_code: '47', bank_name: banco, account_type: '2', account_number: cuenta, payment_dates: fechas } : { payment_method_code: '10', payment_dates: fechas },
    worker: {
      identification_document_code: t.tipo_id || '13',
      identification_number: digitos(t.numero) || String(t.numero || ''),
      first_name: nombre1,
      ...(t.segundo_nombre ? { other_names: t.segundo_nombre } : {}),
      first_surname: apellido1,
      ...(apellido2 ? { second_surname: apellido2 } : {}),
      address: t.direccion || '',
      country_code: 'CO',
      _municipio: { ciudad: t.ciudad || '', departamento: t.departamento || '' },
      has_integral_salary: false,
      has_high_risk: false,
      worker_type_code: '01',
      worker_subtype: emp.pensionado === true ? '01' : '00',
      contract_type: CONTRATO_DIAN[emp.contrato] || '2',
      employee_code: digitos(t.numero) || String(t.numero || ''),
      salary: dinero(sal),
      entry_date: emp.fecha_ingreso || '',
      days_worked: dias,
      ...(emp.fecha_retiro && emp.fecha_retiro <= fin ? { retirement_date: emp.fecha_retiro } : {}),
    },
    accruals: acc,
    deductions: ded,
  };
  return body;
}
// Totales del cuerpo (para mostrar y guardar).
export function totalesNE(body) {
  let dev = 0, ded = 0;
  const sumar = (o, f) => { for (const v of Object.values(o || {})) for (const x of Array.isArray(v) ? v : [v]) f(num(x?.amount)); };
  sumar(body?.accruals, v => { dev += v; }); sumar(body?.deductions, v => { ded += v; });
  return { devengado: r2(dev), deducciones: r2(ded), neto: r2(dev - ded) };
}
// Lo que falta para enviar la nómina electrónica de un empleado.
export function erroresNE({ emp, tercero, lineas }) {
  const out = [];
  if (!lineas?.length) out.push('No hay nóminas contabilizadas de este empleado en el mes.');
  if (!emp?.fecha_ingreso) out.push('Al empleado le falta la fecha de ingreso.');
  if (!tercero) { out.push('El empleado no tiene tercero.'); return out; }
  if (!digitos(tercero.numero)) out.push('Al empleado le falta el número de documento.');
  if (!tercero.direccion) out.push('Al empleado le falta la dirección.');
  if (!tercero.ciudad) out.push('Al empleado le falta el municipio.');
  if (!(tercero.primer_nombre && tercero.primer_apellido) && String(tercero.nombre || '').trim().split(/\s+/).length < 2) out.push('Escribe el nombre y el apellido del empleado en su tercero.');
  return out;
}
// Avisos que no impiden enviar.
export function avisosNE({ lineas }) {
  return (lineas || []).some(x => (x.linea.items || []).some(i => i.k === 'horas_extra' && !i.horas?.length))
    ? ['Hay horas extra liquidadas sin detalle de horas: se reportan como otro concepto salarial. Para reportarlas como horas, edita la nómina y escribe las horas por tipo.'] : [];
}
// Cuerpo de la nota de ajuste que elimina una nómina electrónica validada (POST /v2/adjustment-payrolls).
export const jsonNotaNE = ({ nota, numeroNE }) => ({ payroll_number: numeroNE, reference_code: referenciaNE(nota) });
