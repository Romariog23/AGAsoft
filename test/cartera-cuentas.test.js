import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manejaCartera, carteraComprobantes } from '../src/cuentas.js';

test('manejaCartera: por defecto, heredada y marcada', () => {
  const idx = { '13': { naturaleza: 'D' }, '1380': { cartera: true }, '138005': { cartera: false }, '13050502': { cartera: false } };
  assert.equal(manejaCartera('13050501', idx), true);
  assert.equal(manejaCartera('22050501', idx), true);
  assert.equal(manejaCartera('11100501', idx), false);
  assert.equal(manejaCartera('13809501', idx), true);
  assert.equal(manejaCartera('13800501', idx), false);
  assert.equal(manejaCartera('13050502', idx), false);
});

test('carteraComprobantes: saldo por tercero y documento cruce', () => {
  const idx = { '1305': { naturaleza: 'D' }, '2205': { naturaleza: 'C' } };
  const comps = [
    { id: 'si', fecha: '2026-12-31', estado: 'contabilizado', lineas: [
      { cuenta: '13050501', tercero_id: 'a', cruce: 'FE 10', vence: '2027-01-30', debito: 1000, credito: 0 },
      { cuenta: '13050501', tercero_id: 'a', cruce: 'FE 11', debito: 500, credito: 0 },
      { cuenta: '22050501', tercero_id: 'p', cruce: 'F-9', debito: 0, credito: 300 },
      { cuenta: '31050501', tercero_id: 'x', debito: 0, credito: 1200 }] },
    { id: 'cc', fecha: '2027-01-15', estado: 'contabilizado', lineas: [{ cuenta: '13050501', tercero_id: 'a', cruce: 'FE 10', debito: 0, credito: 400 }] },
    { id: 'an', fecha: '2027-01-16', estado: 'anulado', lineas: [{ cuenta: '13050501', tercero_id: 'a', cruce: 'FE 11', debito: 0, credito: 500 }] },
  ];
  const c = carteraComprobantes(comps, idx, 'cobrar', '2027-02-09');
  const fe10 = c.find(x => x.cruce === 'FE 10');
  assert.deepEqual([fe10.valor, fe10.abonos, fe10.saldo, fe10.vence, fe10.dias, fe10.comp_id], [1000, 400, 600, '2027-01-30', 10, 'si']);
  assert.equal(c.find(x => x.cruce === 'FE 11').saldo, 500);
  assert.equal(c.length, 2);
  const p = carteraComprobantes(comps, idx, 'pagar', '2027-01-01');
  assert.deepEqual(p.map(x => [x.tercero_id, x.cruce, x.saldo]), [['p', 'F-9', 300]]);
});
