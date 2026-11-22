import test from 'node:test';
import assert from 'node:assert/strict';
import { libroVentas, ventasPorCliente, ventasPorProducto, libroCompras, comprasPorProveedor, flujoEfectivo, cambiosPatrimonio, flujoCaja, enlacesPagos } from '../src/reportes.js';

const documentos = [
  { id: 'f1', tipo: 'FV', estado: 'emitido', fecha: '2026-11-03', tercero_id: 'a', numero: 1 },
  { id: 'f2', tipo: 'FV', estado: 'emitido', fecha: '2026-11-05', tercero_id: 'b', numero: 2 },
  { id: 'n1', tipo: 'NC', estado: 'emitido', fecha: '2026-11-10', tercero_id: 'a', numero: 1 },
  { id: 'x', tipo: 'FV', estado: 'anulado', fecha: '2026-11-10', tercero_id: 'a', numero: 3 },
];
const items = [
  { documento_id: 'f1', producto_id: 'p1', cantidad: 2, precio: 100000, iva_pct: 19 },
  { documento_id: 'f2', producto_id: 'p2', cantidad: 1, precio: 50000, iva_pct: 0 },
  { documento_id: 'n1', producto_id: 'p1', cantidad: 1, precio: 100000, iva_pct: 19 },
  { documento_id: 'x', producto_id: 'p1', cantidad: 9, precio: 100000, iva_pct: 19 },
];

test('libro de ventas y ventas por cliente y producto', () => {
  const lv = libroVentas({ documentos, items }, '2026-11-01', '2026-11-30');
  assert.equal(lv.filas.length, 3);
  assert.equal(lv.base, 150000); assert.equal(lv.iva, 19000); assert.equal(lv.total, 169000);
  const pc = ventasPorCliente({ documentos, items }, '2026-11-01', '2026-11-30');
  assert.deepEqual(pc.filas.map(f => [f.tercero_id, f.base, f.facturas, f.notas]), [['a', 100000, 1, 1], ['b', 50000, 1, 0]]);
  assert.equal(pc.filas[0].pct, 66.67);
  const pp = ventasPorProducto({ documentos, items }, '2026-11-01', '2026-11-30');
  assert.deepEqual(pp.filas.map(f => [f.producto_id, f.cantidad, f.base]), [['p1', 1, 100000], ['p2', 1, 50000]]);
});

test('libro de compras y compras por proveedor', () => {
  const compras = [
    { id: 'c1', tipo: 'FC', estado: 'vigente', fecha: '2026-11-02', tercero_id: 'p', numero: 1, retefuente_pct: 2.5, lineas: [{ base: 200000, iva_pct: 19 }] },
    { id: 'c2', tipo: 'DS', estado: 'vigente', fecha: '2026-11-04', tercero_id: 'q', numero: 1, lineas: [{ base: 100000, iva_pct: 0 }] },
    { id: 'c3', tipo: 'FC', estado: 'anulado', fecha: '2026-11-04', tercero_id: 'p', numero: 2, lineas: [{ base: 999, iva_pct: 0 }] },
    { id: 'e1', tipo: 'CE', estado: 'vigente', fecha: '2026-11-04', tercero_id: 'p', numero: 1 },
  ];
  const lc = libroCompras(compras, '2026-11-01', '2026-11-30');
  assert.equal(lc.filas.length, 2); assert.equal(lc.base, 300000); assert.equal(lc.iva, 38000); assert.equal(lc.retenciones, 5000);
  const pp = comprasPorProveedor(compras, '2026-11-01', '2026-11-30');
  assert.deepEqual(pp.filas.map(f => [f.tercero_id, f.base, f.neto]), [['p', 200000, 233000], ['q', 100000, 100000]]);
});

// Asientos: saldos iniciales, venta a crédito, cobro, compra de contado de un activo, depreciación y préstamo.
const mv = (fecha, ref, cuenta, debito, credito, extra = {}) => ({ fecha, ref, doc_id: ref, cuenta, debito, credito, ...extra });
const movs = [
  mv('2026-01-01', 'SI1', '11050501', 1000000, 0, { origen: 'comp', tipo: 'SI' }), mv('2026-01-01', 'SI1', '31050501', 0, 1000000, { origen: 'comp', tipo: 'SI' }),
  mv('2026-02-10', 'F1', '13050501', 119000, 0), mv('2026-02-10', 'F1', '41350501', 0, 100000), mv('2026-02-10', 'F1', '24080101', 0, 19000),
  mv('2026-02-20', 'R1', '11100501', 119000, 0), mv('2026-02-20', 'R1', '13050501', 0, 119000),
  mv('2026-03-01', 'C1', '15240501', 300000, 0, { origen: 'compra' }), mv('2026-03-01', 'C1', '11050501', 0, 300000, { origen: 'compra' }),
  mv('2026-03-31', 'D1', '51600501', 10000, 0, { origen: 'comp' }), mv('2026-03-31', 'D1', '15920501', 0, 10000, { origen: 'comp' }),
  mv('2026-03-15', 'P1', '11100501', 500000, 0, { origen: 'comp' }), mv('2026-03-15', 'P1', '21050501', 0, 500000, { origen: 'comp' }),
];

test('estado de flujos de efectivo cuadra con el efectivo', () => {
  const f = flujoEfectivo(movs, '2026-01-01', '2026-03-31');
  assert.equal(f.utilidad, 90000);
  assert.deepEqual(f.ajustes.map(x => [x.codigo, x.valor]), [['1592', 10000]]);
  assert.deepEqual(f.capital.map(x => [x.codigo, x.valor]), [['2408', 19000]]);
  assert.equal(f.operacion, 119000); assert.equal(f.totalInversion, -300000); assert.equal(f.totalFinanciacion, 500000);
  assert.equal(f.inicial, 1000000); assert.equal(f.final, 1319000); assert.ok(f.cuadra);
});

test('cambios en el patrimonio cuadran con el balance', () => {
  const p = cambiosPatrimonio(movs, '2026-01-01', '2026-03-31');
  assert.deepEqual(p.filas.map(x => [x.codigo, x.inicial, x.aumentos, x.disminuciones, x.final]), [['3105', 1000000, 0, 0, 1000000], ['sin', 0, 90000, 0, 90000]]);
  assert.equal(p.final, 1090000);
});

test('flujo de caja por mes', () => {
  const r = flujoCaja(movs, [{ desde: '2026-02-01', hasta: '2026-02-28' }, { desde: '2026-03-01', hasta: '2026-03-31' }]);
  assert.deepEqual(r[0].entradas, { clientes: 119000 }); assert.equal(r[0].inicial, 1000000); assert.equal(r[0].final, 1119000);
  assert.deepEqual(r[1].entradas, { prestamos: 500000 }); assert.deepEqual(r[1].salidas, { activos: 300000 });
  assert.ok(r.every(x => x.cuadra));
});

test('el pago de una factura de proveedor sale como el gasto que se causó', () => {
  const ms = [
    mv('2026-01-01', 'SI1', '11100501', 5000000, 0, { origen: 'comp', tipo: 'SI' }), mv('2026-01-01', 'SI1', '31050501', 0, 5000000, { origen: 'comp', tipo: 'SI' }),
    // Factura de proveedor: arriendo 1.000.000 + IVA 190.000, retención 35.000.
    mv('2026-02-01', 'FC1', '51200501', 1000000, 0, { origen: 'compra', doc_id: 'fc1' }), mv('2026-02-01', 'FC1', '24080201', 190000, 0, { origen: 'compra', doc_id: 'fc1' }),
    mv('2026-02-01', 'FC1', '23651501', 0, 35000, { origen: 'compra', doc_id: 'fc1' }), mv('2026-02-01', 'FC1', '22050501', 0, 1155000, { origen: 'compra', doc_id: 'fc1' }),
    // Egreso que la paga.
    mv('2026-02-15', 'CE1', '22050501', 1155000, 0, { origen: 'compra', doc_id: 'ce1' }), mv('2026-02-15', 'CE1', '11100501', 0, 1155000, { origen: 'compra', doc_id: 'ce1' }),
  ];
  const enlaces = enlacesPagos({ compras: [{ id: 'ce1', tipo: 'CE', aplicaciones: [{ compra_id: 'fc1', valor: 1155000 }] }] });
  const [r] = flujoCaja(ms, [{ desde: '2026-02-01', hasta: '2026-02-28' }], enlaces);
  assert.deepEqual(r.salidas, { gastos: 1155000 });
  assert.deepEqual(r.detalleSalidas, { gastos: { 5120: 1155000 } });
  assert.ok(r.cuadra);
});

test('flujo de caja filtrado por tercero', () => {
  const ms = [
    mv('2026-02-10', 'R1', '11100501', 300000, 0, { tercero_id: 'a' }), mv('2026-02-10', 'R1', '41350501', 0, 300000, { tercero_id: 'a' }),
    mv('2026-02-12', 'G1', '51350501', 100000, 0, { origen: 'comp', tercero_id: 'b' }), mv('2026-02-12', 'G1', '11100501', 0, 100000, { origen: 'comp', tercero_id: 'b' }),
  ];
  const [r] = flujoCaja(ms, [{ desde: '2026-02-01', hasta: '2026-02-28' }], {}, 'b');
  assert.deepEqual(r.entradas, {}); assert.deepEqual(r.salidas, { gastos: 100000 });
  assert.deepEqual(r.tercerosSalidas, { 'gastos|5135': { b: 100000 } });
});
