import test from 'node:test';
import assert from 'node:assert/strict';
import { numTxt, moneyTxt, cantTxt, formatoDe } from '../src/formato.js';

test('formato por defecto: punto de miles y dos decimales', () => {
  assert.equal(moneyTxt(1234567.891, formatoDe({})), '$ 1.234.567,89');
  assert.equal(moneyTxt(-1500, formatoDe(null)), '-$ 1.500,00');
  assert.equal(moneyTxt(-0.001, formatoDe({})), '$ 0,00');
});
test('coma de miles y sin decimales', () => {
  const f = formatoDe({ formato_num: { decimales: false, miles: ',' } });
  assert.equal(moneyTxt(1234567.5, f), '$ 1,234,568');
  assert.equal(numTxt(999, f), '999');
  assert.equal(moneyTxt(1234.5, formatoDe({ formato_num: { miles: ',' } })), '$ 1,234.50');
});
test('cantidades', () => {
  assert.equal(cantTxt(2.4), '2,4');
  assert.equal(cantTxt(1500), '1.500');
  assert.equal(cantTxt(1500.125, formatoDe({ formato_num: { miles: ',', decimales: false } })), '1,500.125');
});
