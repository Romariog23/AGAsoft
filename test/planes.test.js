import test from 'node:test';
import assert from 'node:assert/strict';
import { moduloDeRuta, tieneModulo, docsFeMes, precioCuenta, precioAnual, avisoCupo, planDesde, incluye, PLANES_DEMO } from '../src/planes.js';

const [emprendedor, pyme, empresa] = PLANES_DEMO;

test('módulos apagados por plan', () => {
  assert.equal(moduloDeRuta('nominapago'), 'nomina');
  assert.equal(moduloDeRuta('exogenacfg'), 'exogena');
  assert.equal(moduloDeRuta('FV'), null);
  assert.equal(moduloDeRuta('ercomp'), 'avanzados');
  assert.equal(tieneModulo(pyme, 'avanzados'), false);
  assert.equal(tieneModulo(empresa, 'avanzados'), true);
  assert.equal(tieneModulo(emprendedor, 'consulta'), false);
  assert.equal(tieneModulo(emprendedor, 'nomina'), false);
  assert.equal(tieneModulo(pyme, 'nomina'), true);
  assert.equal(tieneModulo(null, 'nomina'), true, 'sin plan no hay límites');
  assert.equal(tieneModulo(emprendedor, null), true);
});

test('cupo de documentos electrónicos del mes', () => {
  const docs = [
    { tipo: 'FV', electronica: true, estado: 'emitido', fecha: '2026-11-03' },
    { tipo: 'NC', electronica: true, estado: 'anulado', fecha: '2026-11-04' },
    { tipo: 'FV', electronica: true, estado: 'borrador', fecha: '2026-11-05' },
    { tipo: 'FV', electronica: false, estado: 'emitido', fecha: '2026-11-05' },
    { tipo: 'RC', electronica: false, estado: 'emitido', fecha: '2026-11-05' },
    { tipo: 'FV', electronica: true, estado: 'emitido', fecha: '2026-10-31' },
  ];
  assert.equal(docsFeMes(docs, '2026-11'), 2);
  assert.equal(avisoCupo(23, 30), null);
  assert.equal(avisoCupo(24, 30), 'casi');
  assert.equal(avisoCupo(30, 30), 'lleno');
  assert.equal(avisoCupo(500, null), null);
});

test('precio por empresa y plan desde', () => {
  assert.equal(precioCuenta(pyme, 3), 207000);
  assert.equal(precioCuenta(pyme, 0), 69000);
  assert.equal(precioAnual(emprendedor), 310000);
  assert.equal(precioCuenta({ precio_mensual: 100, por_empresa: false }, 4), 100);
  assert.equal(planDesde(PLANES_DEMO, 'nomina').nombre, 'Pyme');
  assert.ok(incluye(emprendedor).includes('1 usuario'));
  assert.ok(!incluye(emprendedor).some(t => /Nómina/.test(t)));
  assert.ok(incluye(pyme).includes('3 usuarios'));
  assert.ok(incluye(pyme).includes('Nómina hasta 5 empleados'));
  assert.ok(incluye(empresa).includes('Usuarios ilimitados'));
});
