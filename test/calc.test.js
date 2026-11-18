import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dvOf, parseNit, num, linea, totales, cartera, acreditado, enLetras } from '../src/calc.js';

test('dígito de verificación', () => {
  assert.equal(dvOf('900123456'), 8);
  assert.equal(dvOf('860002964'), 4);
  assert.equal(dvOf('800197268'), 4); // DIAN
  assert.deepEqual(parseNit('800.197.268-4'), { nit: '800197268', dv: 4 });
  assert.deepEqual(parseNit('8001972684'), { nit: '800197268', dv: 4 });
  assert.ok(parseNit('800197268-1').error);
});
test('números', () => { assert.equal(num('1.234,5'), 1234.5); assert.equal(num('1234.56'), 1234.56); assert.equal(num(''), 0); });
test('línea con descuento e IVA', () => {
  assert.deepEqual(linea({ cantidad: 2, precio: 100000, descuento_pct: 10, iva_pct: 19 }), { bruto: 200000, descuento: 20000, base: 180000, iva: 34200, total: 214200 });
});
test('totales y retenciones', () => {
  const t = totales([{ cantidad: 1, precio: 1000000, iva_pct: 19 }, { cantidad: 1, precio: 500000, iva_pct: 0 }], { retefuente_pct: 4, reteiva_pct: 15, reteica_milaje: 9.66 });
  assert.equal(t.base, 1500000); assert.equal(t.iva, 190000); assert.equal(t.total, 1690000);
  assert.equal(t.retefuente, 60000); assert.equal(t.reteiva, 28500); assert.equal(t.reteica, 14490);
  assert.equal(t.neto, 1690000 - 60000 - 28500 - 14490);
  assert.equal(t.porTarifa.length, 2);
});
test('cartera', () => {
  const docs = [
    { id: 'f1', tipo: 'FV', estado: 'emitido', neto: 1000, total: 1000, vence: '2026-01-01' },
    { id: 'n1', tipo: 'NC', estado: 'emitido', neto: 200, total: 200, ref_id: 'f1' },
    { id: 'n2', tipo: 'NC', estado: 'borrador', neto: 300, ref_id: 'f1' },
    { id: 'd1', tipo: 'ND', estado: 'emitido', neto: 50, ref_id: 'f1' },
    { id: 'r1', tipo: 'RC', estado: 'emitido' },
    { id: 'r2', tipo: 'RC', estado: 'anulado' },
  ];
  const c = cartera(docs, [{ recibo_id: 'r1', factura_id: 'f1', valor: 500 }, { recibo_id: 'r2', factura_id: 'f1', valor: 100 }], new Date('2026-01-11T12:00:00'));
  assert.equal(c[0].saldo, 350); assert.equal(c[0].diasVencida, 10);
  assert.equal(acreditado(docs, 'f1'), 200);
});
test('valor en letras', () => {
  assert.equal(enLetras(1690000), 'UN MILLÓN SEISCIENTOS NOVENTA MIL PESOS M/CTE');
  assert.equal(enLetras(2000000), 'DOS MILLONES DE PESOS M/CTE');
  assert.equal(enLetras(121), 'CIENTO VEINTIÚN PESOS M/CTE');
  assert.equal(enLetras(100), 'CIEN PESOS M/CTE');
  assert.equal(enLetras(1001), 'MIL UN PESOS M/CTE');
  assert.equal(enLetras(35450.5), 'TREINTA Y CINCO MIL CUATROCIENTOS CINCUENTA PESOS CON 50/100 M/CTE');
  assert.equal(enLetras(1500000000), 'MIL QUINIENTOS MILLONES DE PESOS M/CTE');
});
