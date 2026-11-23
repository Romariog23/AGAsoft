import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valorHoras, liquidar, paramNomina } from '../src/nomina.js';

test('horas extra por tipo: extra = hora completa + %, recargo = solo %', () => {
  const P = paramNomina({});
  const r = valorHoras(2100000, { HED: 2, HRN: 4, HRDDF: 8 }, P); // hora = 10.000
  assert.equal(r.detalle.find(d => d.tipo === 'HED').valor, 25000);
  assert.equal(r.detalle.find(d => d.tipo === 'HRN').valor, 14000);
  assert.equal(r.detalle.find(d => d.tipo === 'HRDDF').valor, 72000);
  assert.equal(r.total, 111000);
  const P2 = paramNomina({ nomina: { horas_mes: 240, pct_horas: { HED: 30 } } });
  assert.equal(valorHoras(2400000, { HED: 1 }, P2).total, 13000);
});

test('liquidar usa las horas y deja el detalle en el concepto', () => {
  const P = paramNomina({});
  const l = liquidar({ id: 'e', tercero_id: 't', salario: 2100000 }, { horas: { HED: 2 }, horas_extra: 999999 }, P);
  const it = l.items.find(i => i.k === 'horas_extra');
  assert.equal(it.valor, 25000);
  assert.equal(it.horas[0].tipo, 'HED');
  const viejo = liquidar({ id: 'e', tercero_id: 't', salario: 2100000 }, { horas_extra: 50000 }, P);
  assert.equal(viejo.items.find(i => i.k === 'horas_extra').valor, 50000);
});
