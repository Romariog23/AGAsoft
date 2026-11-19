import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidar, paramNomina, asientoNomina, cuentasFaltantes, cuentasDeNomina, porPagarLaboral, pctSolidaridad, totalesNomina, resumenPorCuenta, pasivosNomina, CUENTAS_SS, CUENTAS_PREST, cuentaContraSugerida, lineasAjuste } from '../src/nomina.js';
import { asientoCompra } from '../src/compras.js';
import { planInicial } from '../src/puc.js';

const P = paramNomina({ nomina: { smmlv: 1750905, auxilio: 249095, exonerada: true, arl_id: 'arl' } });
const emp = { id: 'e1', tercero_id: 't1', salario: 3000000, area: 'admin', riesgo: '1', auxilio: false, eps_id: 'eps', pension_id: 'afp', caja_id: 'caja' };
const val = (l, k) => l.items.find(i => i.k === k)?.valor || 0;

test('nómina: liquidación de un mes con empresa exonerada', () => {
  const l = liquidar(emp, {}, P);
  assert.equal(l.dias, 30);
  assert.equal(val(l, 'salario'), 3000000);
  assert.equal(val(l, 'salud'), 120000);
  assert.equal(val(l, 'pension'), 120000);
  assert.equal(l.neto, 2760000);
  assert.equal(val(l, 'salud_emp'), 0); // exonerada
  assert.equal(val(l, 'pension_emp'), 360000);
  assert.equal(val(l, 'arl'), 15660);
  assert.equal(val(l, 'caja'), 120000);
  assert.equal(val(l, 'cesantias'), 250000);
  assert.equal(val(l, 'intereses'), 30000);
  assert.equal(val(l, 'prima'), 250000);
  assert.equal(val(l, 'vacaciones'), 125000);
  // Las deducciones y aportes quedan a nombre de la entidad.
  assert.equal(l.items.find(i => i.k === 'salud').tercero_id, 'eps');
  assert.equal(l.items.find(i => i.k === 'arl').tercero_id, 'arl');
});
test('nómina: auxilio de transporte, novedades, quincena y no exonerada', () => {
  const l = liquidar({ ...emp, salario: 1750905, auxilio: true }, { dias: 15, horas_extra: 100000, prestamo: 50000 }, { ...P, periodo: 'quincenal', exonerada: false });
  assert.equal(val(l, 'salario'), 875452.5);
  assert.equal(val(l, 'auxilio'), 124547.5);
  assert.equal(l.ibc, 975452.5);
  assert.equal(val(l, 'salud_emp'), 82913.46);
  assert.equal(val(l, 'icbf'), 29263.58);
  assert.equal(l.neto, r(875452.5 + 100000 + 124547.5 - 39018.1 - 39018.1 - 50000));
  // Cesantías sobre lo salarial más el auxilio.
  assert.equal(val(l, 'cesantias'), r((975452.5 + 124547.5) / 12));
});
const r = v => Math.round(v * 100) / 100;
test('nómina: fondo de solidaridad desde 4 salarios mínimos', () => {
  assert.equal(pctSolidaridad(3.9 * 1e6, 1e6), 0);
  assert.equal(pctSolidaridad(4 * 1e6, 1e6), 1);
  assert.equal(pctSolidaridad(16.5 * 1e6, 1e6), 1.2);
  assert.equal(pctSolidaridad(25 * 1e6, 1e6), 2);
  const l = liquidar({ ...emp, salario: 8000000 }, {}, P);
  assert.equal(val(l, 'solidaridad'), 80000);
});
test('nómina: el asiento cuadra y crea las cuentas que faltan', () => {
  const ls = [liquidar(emp, {}, P), liquidar({ ...emp, id: 'e2', tercero_id: 't2', area: 'ventas', salario: 1750905, auxilio: true }, {}, P)];
  const ms = asientoNomina({ id: 'n1', numero: 1, fecha: '2026-11-30', lineas: ls, estado: 'contabilizado' });
  const d = ms.reduce((s, m) => s + m.debito, 0), c = ms.reduce((s, m) => s + m.credito, 0);
  assert.ok(Math.abs(d - c) < 0.001);
  assert.ok(ms.some(m => m.cuenta === '52050601' && m.tercero_id === 't2'));
  assert.equal(ms.filter(m => m.cuenta === '25050501').reduce((s, m) => s + m.credito, 0), totalesNomina(ls).neto);
  const plan = planInicial(), nuevas = cuentasFaltantes(cuentasDeNomina(ls), plan);
  assert.ok(nuevas.some(x => x.codigo === '510506' && x.nombre === 'Sueldos'));
  assert.ok(nuevas.some(x => x.codigo === '51050601'));
  assert.ok(!nuevas.some(x => x.codigo === '25100501')); // ya existe en el plan
  const todas = new Set([...plan, ...nuevas].map(x => x.codigo));
  for (const cod of cuentasDeNomina(ls)) assert.ok(todas.has(cod), cod);
  assert.equal(asientoNomina({ lineas: ls, estado: 'anulado' }).length, 0);
});
test('nómina: el egreso paga saldos de nómina por cuenta', () => {
  const ms = asientoNomina({ id: 'n1', numero: 1, fecha: '2026-11-30', lineas: [liquidar(emp, {}, P)], estado: 'contabilizado' });
  const pend = porPagarLaboral(ms, 't1');
  assert.deepEqual(pend.find(x => x.cuenta === '25050501'), { cuenta: '25050501', saldo: 2760000 });
  const ce = asientoCompra({ id: 'c1', tipo: 'CE', numero: 1, fecha: '2026-12-01', tercero_id: 't1', cuenta_pago: '11100501', aplicaciones: [{ cuenta: '25050501', valor: 2760000, ref: 'Salarios' }] }, {});
  assert.deepEqual(ce.map(m => [m.cuenta, m.debito, m.credito]), [['25050501', 2760000, 0], ['11100501', 0, 2760000]]);
  assert.equal(porPagarLaboral([...ms, ...ce], 't1').find(x => x.cuenta === '25050501'), undefined);
});

test('pensionado: sin pensión ni solidaridad, salud completa', () => {
  const P = paramNomina({ nomina: { exonerada: false } });
  const l = liquidar({ id: 'e', tercero_id: 't', salario: 8000000, pensionado: true, eps_id: 'eps' }, {}, P);
  const k = l.items.map(i => i.k);
  assert.ok(!k.includes('pension') && !k.includes('pension_emp') && !k.includes('solidaridad'));
  assert.equal(l.items.find(i => i.k === 'salud').valor, 320000);
  assert.equal(l.items.find(i => i.k === 'salud_emp').valor, 680000);
});

test('borrador no contabiliza', () => {
  const P = paramNomina({});
  const l = liquidar({ id: 'e', tercero_id: 't', salario: 2000000 }, {}, P);
  const n = { id: 'n', numero: 1, fecha: '2026-11-30', lineas: [l], cuenta_neto: P.cuenta_neto };
  assert.equal(asientoNomina({ ...n, estado: 'borrador' }).length, 0);
  assert.ok(asientoNomina({ ...n, estado: 'contabilizado' }).length > 0);
});

test('nómina: contabilización globalizada por cuenta y pasivos por tercero', () => {
  const emp2 = { ...emp, id: 'e2', tercero_id: 't2' };
  const n = { id: 'n1', numero: 1, fecha: '2026-01-31', estado: 'contabilizado', lineas: [liquidar(emp, {}, P), liquidar(emp2, {}, P)] };
  const ms = asientoNomina(n), R = resumenPorCuenta(ms);
  // Una fila por cuenta, con las mismas sumas que el asiento detallado.
  assert.equal(R.length, new Set(ms.map(m => m.cuenta)).size);
  assert.equal(R.reduce((s, r) => s + r.debito, 0), ms.reduce((s, m) => s + m.debito, 0));
  const sueldos = R.find(r => r.cuenta === '51050601');
  assert.equal(sueldos.debito, 6000000); assert.equal(sueldos.terceros, 2);
  assert.ok(R[0].debito > 0 && R.at(-1).credito > 0);
  // Pasivos: la EPS debe la salud de los dos empleados; las prestaciones quedan por empleado.
  const ss = pasivosNomina(ms, '2026-12-31', CUENTAS_SS);
  assert.equal(ss.find(x => x.tercero_id === 'eps').total, 240000);
  const pr = pasivosNomina(ms, '2026-12-31', CUENTAS_PREST);
  assert.equal(pr.find(x => x.tercero_id === 't1').total, 655000);
  assert.equal(pasivosNomina(ms, '2025-12-31', CUENTAS_SS).length, 0);
  assert.equal(cuentaContraSugerida([n], 'afp', '23803001'), '51057001');
  assert.equal(cuentaContraSugerida([n], 't1', '25100501'), '51053001');
});
test('nómina: ajuste de la PILA a su valor real, con intereses de mora', () => {
  const ls = lineasAjuste({ tercero_id: 'afp', filas: [{ cuenta: '23803001', saldo: 960000, real: 960100, contra: '51057001' }], mora: 5000 });
  assert.deepEqual(ls.map(l => [l.cuenta, l.debito, l.credito]), [['51057001', 100, 0], ['23803001', 0, 100], ['53052001', 5000, 0], ['23803001', 0, 5000]]);
  assert.ok(ls.every(l => l.tercero_id === 'afp'));
  // Se causó de más: se devuelve el gasto.
  const menos = lineasAjuste({ tercero_id: 'eps', filas: [{ cuenta: '23700501', saldo: 240000, real: 239900, contra: '51056901' }] });
  assert.deepEqual(menos.map(l => [l.cuenta, l.debito, l.credito]), [['23700501', 100, 0], ['51056901', 0, 100]]);
  assert.throws(() => lineasAjuste({ filas: [{ cuenta: '23700501', saldo: 1, real: 2, contra: '' }] }));
  assert.equal(lineasAjuste({ filas: [{ cuenta: '23700501', saldo: 5, real: 5 }] }).length, 0);
});
