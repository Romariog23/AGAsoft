import test from 'node:test';
import assert from 'node:assert/strict';
import { numeracionPara, motivoNoEliminar } from '../src/store.js';

const nums = [
  { id: 'e', empresa_id: 'x', tipo: 'FV', prefijo: 'FE', desde: 1, hasta: 100, siguiente: 1, activa: true, electronica: true },
  { id: 'n', empresa_id: 'x', tipo: 'FV', prefijo: 'FN', desde: 1, hasta: 999, siguiente: 5, activa: true, electronica: false },
  { id: 'c', empresa_id: 'x', tipo: 'NC', prefijo: 'NC', desde: 1, hasta: 999, siguiente: 1, activa: true },
];

test('cada clase de factura usa su numeración', () => {
  assert.equal(numeracionPara({ empresa_id: 'x', tipo: 'FV', electronica: true, fecha: '2026-11-18' }, nums).id, 'e');
  assert.equal(numeracionPara({ empresa_id: 'x', tipo: 'FV', fecha: '2026-11-18' }, nums).id, 'n');
  assert.throws(() => numeracionPara({ empresa_id: 'x', tipo: 'FV', fecha: '2026-11-18' }, nums.slice(0, 1)), /factura normal/);
  // Las notas usan la que haya aunque no sea de su clase.
  assert.equal(numeracionPara({ empresa_id: 'x', tipo: 'NC', electronica: true, fecha: '2026-11-18' }, nums).id, 'c');
});

test('solo se eliminan facturas y notas normales sin notas ni pagos vigentes', () => {
  const fv = { id: 'f', tipo: 'FV', estado: 'emitido', electronica: false };
  assert.equal(motivoNoEliminar(fv, [fv], []), '');
  assert.match(motivoNoEliminar({ ...fv, electronica: true }, [], []), /electrónicas/);
  assert.match(motivoNoEliminar({ id: 'r', tipo: 'RC', estado: 'emitido' }, [], []), /anulan/);
  const nc = { id: 'nc', tipo: 'NC', estado: 'emitido', ref_id: 'f' };
  assert.match(motivoNoEliminar(fv, [fv, nc], []), /notas/);
  assert.equal(motivoNoEliminar(fv, [fv, { ...nc, estado: 'borrador' }], []), '');
  const rc = { id: 'r', tipo: 'RC', estado: 'emitido' };
  assert.match(motivoNoEliminar(fv, [fv, rc], [{ recibo_id: 'r', factura_id: 'f', valor: 1 }]), /pagos/);
  assert.equal(motivoNoEliminar(fv, [fv, { ...rc, estado: 'anulado' }], [{ recibo_id: 'r', factura_id: 'f', valor: 1 }]), '');
});

test('cada línea del asiento lleva solo débito o solo crédito', async () => {
  const { unLado } = await import('../src/contab.js');
  assert.deepEqual([unLado({ debito: 100, credito: 30 }).debito, unLado({ debito: 100, credito: 30 }).credito], [70, 0]);
  assert.deepEqual([unLado({ debito: 10, credito: 25 }).debito, unLado({ debito: 10, credito: 25 }).credito], [0, 15]);
  assert.equal(unLado({ debito: 5, credito: 0 }).debito, 5);
});
