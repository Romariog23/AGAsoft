import test from 'node:test';
import assert from 'node:assert/strict';
import { unidadesDe, codigoDian, erroresUnidad, UNIDADES_DEF } from '../src/unidades.js';
import { jsonFE } from '../src/fe.js';
test('unidades: lista inicial, código DIAN por sigla y errores', () => {
  assert.equal(unidadesDe({}), UNIDADES_DEF);
  const u = [{ codigo: 'BULTO', nombre: 'Bulto', dian: 'BG' }];
  assert.equal(codigoDian(u, 'bulto'), 'BG'); assert.equal(codigoDian(u, 'XYZ'), '94');
  assert.equal(erroresUnidad({ codigo: 'bulto', nombre: 'x', dian: 'BG' }, u).length, 1);
  const b = jsonFE({ doc: { tipo: 'FV' }, items: [{ cantidad: 1, precio: 10, unidad: 'BULTO' }], tercero: {}, unidades: u });
  assert.equal(b.items[0].unit_measure_code, 'BG');
});
