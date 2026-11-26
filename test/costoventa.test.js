import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movimientosInv, costear, costoPorVenta } from '../src/inventario.js';

test('costo detallado por venta: venta, costo, utilidad y margen por línea; la devolución resta', () => {
  const S = {
    productos: [{ id: 'p', tipo: 'producto' }, { id: 's', tipo: 'servicio' }],
    compras: [{ id: 'c1', tipo: 'FC', numero: 1, fecha: '2026-01-01', estado: 'emitido', lineas: [{ producto_id: 'p', cantidad: 10, costo: 100 }] }],
    documentos: [
      { id: 'f1', tipo: 'FV', prefijo: 'FE', numero: 5, fecha: '2026-01-10', estado: 'emitido', tercero_id: 't' },
      { id: 'n1', tipo: 'NC', prefijo: 'NC', numero: 1, fecha: '2026-01-12', estado: 'emitido', tercero_id: 't', concepto: '1', ref_id: 'f1' }],
    items: [
      { id: 'i1', documento_id: 'f1', producto_id: 'p', cantidad: 4, precio: 200, descuento_pct: 10, orden: 0 },
      { id: 'i2', documento_id: 'f1', producto_id: 's', cantidad: 1, precio: 50, orden: 1 },
      { id: 'i3', documento_id: 'n1', producto_id: 'p', cantidad: 1, precio: 180, orden: 0 }],
  };
  const r = costoPorVenta(costear(movimientosInv(S)), S.items, '2026-01-01', '2026-01-31');
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].ref, r[0].cantidad, r[0].venta, r[0].costo, r[0].utilidad, r[0].margen], ['FE 5', 4, 720, 400, 320, 44.44]);
  assert.deepEqual([r[1].tipo, r[1].cantidad, r[1].venta, r[1].costo, r[1].utilidad], ['NC', -1, -180, -100, -80]);
});
