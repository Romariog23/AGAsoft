import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liquidar, paramNomina } from '../src/nomina.js';
import { jsonNominaE, totalesNE, erroresNE, avisosNE, lineasDelMes, prestacionesPagadas, fechasPago, jsonNotaNE } from '../src/nominae.js';

const P = { ...paramNomina({}), periodo: 'quincenal' };
const emp = { id: 'e1', tercero_id: 't1', salario: 2100000, contrato: 'indefinido', fecha_ingreso: '2025-01-10', banco: 'Bancolombia', cuenta_bancaria: '123-45' };
const ter = { id: 't1', tipo_id: '13', numero: '1.020.304', nombre: 'Ana María Ruiz Gómez', primer_nombre: 'Ana', segundo_nombre: 'María', primer_apellido: 'Ruiz', segundo_apellido: 'Gómez', direccion: 'Calle 1', ciudad: 'Barranquilla', departamento: 'Atlántico' };
const q1 = liquidar(emp, { horas: { HED: 2 } }, P), q2 = liquidar(emp, { horas: { HED: 1, HRN: 4 }, retencion: 10000 }, P);
const nominas = [
  { id: 'n1', estado: 'contabilizado', periodo: 'quincenal', desde: '2026-10-01', hasta: '2026-10-15', lineas: [q1] },
  { id: 'n2', estado: 'contabilizado', periodo: 'quincenal', desde: '2026-10-16', hasta: '2026-10-31', lineas: [q2] },
  { id: 'n3', estado: 'anulado', periodo: 'quincenal', desde: '2026-10-16', hasta: '2026-10-31', lineas: [q2] },
];
const comps = [
  { tipo: 'PN', estado: 'contabilizado', fecha: '2026-10-31', lineas: [{ cuenta: '25050501', tercero_id: 't1', debito: 900000, credito: 0 }, { cuenta: '25200501', tercero_id: 't1', debito: 500000, credito: 0 }] },
  { tipo: 'CC', estado: 'contabilizado', fecha: '2026-10-31', lineas: [{ cuenta: '25100501', tercero_id: 't1', debito: 7000, credito: 0 }] },
];

test('nómina electrónica del mes: suma las quincenas, horas por tipo y prima pagada', () => {
  const lineas = lineasDelMes(nominas, 't1', 2026, 10);
  assert.equal(lineas.length, 2);
  const prest = prestacionesPagadas(comps, 't1', 2026, 10);
  assert.deepEqual(prest, { prima: 500000 });
  const fechas = fechasPago(comps, 't1', 2026, 10, lineas);
  assert.deepEqual(fechas, ['2026-10-31']);
  const b = jsonNominaE({ ne: { tipo: 'NIE', numero: 7, anio: 2026, mes: 10 }, emp, tercero: ter, lineas, prest, fechas, periodo: 'quincenal' });
  assert.equal(b.reference_code, 'NIE-7');
  assert.equal(b.settlement_period.payroll_period_code, '4');
  assert.equal(b.worker.days_worked, 30);
  assert.equal(b.worker.identification_number, '1020304');
  assert.equal(b.worker.contract_type, '2');
  assert.equal(b.payment.payment_method_code, '47');
  assert.equal(b.accruals.suel.amount, '2100000.00');
  const hed = b.accruals.hora.find(h => h.accrual_type_code === '1');
  assert.equal(hed.quantity, '3.00'); assert.equal(hed.amount, '37500.00');
  assert.equal(b.accruals.hora.find(h => h.accrual_type_code === '3').amount, '14000.00');
  assert.equal(b.accruals.prim.amount, '500000.00');
  assert.equal(b.deductions.rete.amount, '10000.00');
  assert.equal(b.deductions.salu.percentage, '4.00');
  const T = totalesNE(b);
  assert.ok(T.devengado > 2600000 && T.deducciones > 0);
  assert.deepEqual(erroresNE({ emp, tercero: ter, lineas }), []);
  assert.deepEqual(avisosNE({ lineas }), []);
});

test('faltantes y nota de ajuste', () => {
  assert.ok(erroresNE({ emp: { ...emp, fecha_ingreso: '' }, tercero: { ...ter, direccion: '' }, lineas: [] }).length >= 3);
  const viejo = liquidar(emp, { horas_extra: 50000 }, P);
  const ls = [{ nomina: nominas[0], linea: viejo }];
  assert.equal(avisosNE({ lineas: ls }).length, 1);
  const b = jsonNominaE({ ne: { tipo: 'NIE', numero: 1, anio: 2026, mes: 10 }, emp, tercero: ter, lineas: ls });
  assert.equal(b.accruals.otro[0].amount, '50000.00');
  assert.deepEqual(jsonNotaNE({ nota: { tipo: 'NIAE', numero: 2 }, numeroNE: 'NEF5' }), { payroll_number: 'NEF5', reference_code: 'NIAE-2' });
});
