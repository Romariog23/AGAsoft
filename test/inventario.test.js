import test from 'node:test';
import assert from 'node:assert/strict';
import { cfgInventario, esInventariable, bodegasDe, erroresBodega, lineaProducto, erroresLineaProducto, entradasCompras } from '../src/inventario.js';
import { asientoCompra, erroresCompra, totalesCompra } from '../src/compras.js';

const cuentas = [{ codigo: '14350501' }, { codigo: '14350502' }, { codigo: '22050501' }, { codigo: '24080201' }, { codigo: '51350501' }];

test('método por defecto promedio; PEPS si se escoge; UEPS no existe', () => {
  assert.equal(cfgInventario({}).metodo, 'promedio');
  assert.equal(cfgInventario({ inventario: { metodo: 'peps' } }).metodo, 'peps');
  assert.equal(cfgInventario({ inventario: { metodo: 'ueps' } }).metodo, 'promedio');
});
test('servicios no son inventariables; los productos viejos sin tipo sí', () => {
  assert.equal(esInventariable({ tipo: 'servicio' }), false);
  assert.equal(esInventariable({}), true);
});
test('bodegas: principal por defecto y solo cuentas 14 auxiliares', () => {
  assert.deepEqual(bodegasDe([], {}).map(b => b.cuenta), ['14350501']);
  assert.equal(erroresBodega({ codigo: '02', nombre: 'Patio', cuenta: '14350502' }, [], cuentas).length, 0);
  assert.ok(erroresBodega({ codigo: '02', nombre: 'Patio', cuenta: '15200501' }, [], cuentas).length);
  assert.ok(erroresBodega({ codigo: '02', nombre: 'Patio', cuenta: '143505' }, [], cuentas).length);
  assert.ok(erroresBodega({ codigo: '01', nombre: 'Otra', cuenta: '14350501' }, [{ id: 'b1', codigo: '01' }], cuentas).length);
});
test('compra por productos: base = cantidad × costo a la cuenta de la bodega', () => {
  const l = lineaProducto({ producto_id: 'p1', cantidad: 10, costo: 1234.5, iva_pct: 19, descripcion: 'Cemento' }, { id: 'b2', cuenta: '14350502' });
  assert.equal(l.base, 12345); assert.equal(l.cuenta, '14350502'); assert.equal(l.bodega_id, 'b2');
  const c = { id: 'c1', tipo: 'FC', numero: 1, fecha: '2026-11-01', tercero_id: 't1', num_proveedor: 'F-1', lineas: [l, { cuenta: '51350501', descripcion: 'Flete', base: 100000, iva_pct: 0 }] };
  Object.assign(c, totalesCompra(c.lineas, c));
  const a = asientoCompra(c, {}, []);
  assert.equal(a.find(m => m.cuenta === '14350502').debito, 12345);
  assert.equal(Math.round(a.reduce((s, m) => s + m.debito - m.credito, 0) * 100), 0);
  assert.deepEqual(erroresCompra(c, cuentas, [{ id: 'p1', nombre: 'Cemento' }]), []);
  assert.equal(entradasCompras([c])[0].cantidad, 10);
});
test('errores de línea de producto', () => {
  const P = [{ id: 'p1', nombre: 'Cemento' }, { id: 's1', nombre: 'Instalación', tipo: 'servicio' }];
  assert.ok(erroresLineaProducto({ producto_id: 's1', cantidad: 1, costo: 1 }, 0, P).length);
  assert.ok(erroresLineaProducto({ producto_id: 'p1', cantidad: 0, costo: 1 }, 0, P).length);
  assert.equal(erroresLineaProducto({ producto_id: 'p1', cantidad: 2, costo: 1 }, 0, P).length, 0);
});

import { movimientosInv, costear, existencias, asientoInventario } from '../src/inventario.js';
const S0 = () => ({
  productos: [{ id: 'p1', nombre: 'Cemento' }, { id: 's1', nombre: 'Instalación', tipo: 'servicio' }],
  bodegas: [{ id: 'b1', cuenta: '14350501' }],
  compras: [
    { id: 'c1', tipo: 'FC', numero: 1, fecha: '2026-01-05', tercero_id: 'tp', lineas: [{ producto_id: 'p1', bodega_id: 'b1', cantidad: 10, costo: 100, base: 1000 }] },
    { id: 'c2', tipo: 'FC', numero: 2, fecha: '2026-01-10', tercero_id: 'tp', lineas: [{ producto_id: 'p1', bodega_id: 'b1', cantidad: 10, costo: 130, base: 1300 }] },
  ],
  documentos: [
    { id: 'f1', tipo: 'FV', estado: 'emitido', prefijo: 'FE', numero: 1, fecha: '2026-01-20', tercero_id: 'tc' },
    { id: 'n1', tipo: 'NC', estado: 'emitido', prefijo: 'NC', numero: 1, fecha: '2026-01-25', tercero_id: 'tc', ref_id: 'f1', concepto: '1' },
    { id: 'n2', tipo: 'NC', estado: 'emitido', prefijo: 'NC', numero: 2, fecha: '2026-01-26', tercero_id: 'tc', ref_id: 'f1', concepto: '3' },
  ],
  items: [{ documento_id: 'f1', producto_id: 'p1', cantidad: 15, orden: 0 }, { documento_id: 'f1', producto_id: 's1', cantidad: 1, orden: 1 }, { documento_id: 'n1', producto_id: 'p1', cantidad: 5, orden: 0 }, { documento_id: 'n2', producto_id: 'p1', cantidad: 5, orden: 0 }],
  inventario_docs: [{ id: 'a1', tipo: 'AI', numero: 1, fecha: '2026-01-01', tercero_id: 'te', cuenta_contra: '37050501', lineas: [{ producto_id: 'p1', bodega_id: 'b1', sentido: 'entrada', cantidad: 5, costo: 90 }] }],
});

test('promedio ponderado: compras, venta, devolución al costo de salida; servicios y rebajas no mueven inventario', () => {
  const S = S0(), ms = costear(movimientosInv(S), 'promedio');
  assert.deepEqual(ms.map(m => m.origen), ['ajuste', 'compra', 'compra', 'venta', 'devolucion']);
  // (5×90 + 10×100 + 10×130) / 25 = 110
  const v = ms.find(m => m.origen === 'venta'); assert.equal(v.costo, 110); assert.equal(v.total, -1650);
  const d = ms.find(m => m.origen === 'devolucion'); assert.equal(d.costo, 110); assert.equal(d.total, 550);
  const e = existencias(ms)[0]; assert.equal(e.cantidad, 15); assert.equal(e.valor, 1650);
});
test('PEPS: la venta consume primero las capas más antiguas', () => {
  const ms = costear(movimientosInv(S0()), 'peps');
  // 5×90 + 10×100 = 1450 (15 unidades)
  assert.equal(ms.find(m => m.origen === 'venta').total, -1450);
  assert.equal(existencias(ms)[0].valor, r2v(10 * 130 + 1450 / 3));
});
function r2v(x) { return Math.round(x * 100) / 100; }
test('asiento del costo: 61 contra 14, devolución al revés, ajuste contra su cuenta, y cuadra', () => {
  const S = S0(), a = asientoInventario(costear(movimientosInv(S)), { productos: S.productos, bodegas: S.bodegas, param: {} });
  const de = (doc, cta) => a.filter(m => m.doc_id === doc && m.cuenta === cta).reduce((s, m) => s + m.debito - m.credito, 0);
  assert.equal(de('f1', '61350501'), 1650); assert.equal(de('f1', '14350501'), -1650);
  assert.equal(de('n1', '14350501'), 550); assert.equal(de('a1', '37050501'), -450);
  assert.equal(Math.round(a.reduce((s, m) => s + m.debito - m.credito, 0) * 100), 0);
  assert.ok(a.every(m => m.tercero_id));
});
test('sin existencias: la salida usa el último costo y el saldo queda negativo', () => {
  const S = S0(); S.items[0].cantidad = 30;
  const ms = costear(movimientosInv(S), 'promedio'), v = ms.find(m => m.origen === 'venta');
  assert.ok(v.saldo < 0); assert.ok(v.total < 0);
});

import { datosDemo } from '../src/demo.js';
import { movimientos } from '../src/contab.js';
test('demo: sin existencias negativas y el inventario cuadra con las cuentas 14', () => {
  for (const hoy of ['2026-03-15', '2026-11-22']) {
    const S = datosDemo(hoy), ms = costear(movimientosInv(S));
    assert.equal(ms.filter(m => m.saldo < 0).length, 0);
    const valor = existencias(ms).reduce((s, e) => s + e.valor, 0);
    const s14 = movimientos({ ...S, param: {} }).filter(m => m.cuenta.startsWith('14')).reduce((s, m) => s + m.debito - m.credito, 0);
    assert.equal(Math.round(valor), Math.round(s14));
  }
});
test('inventario inicial contra la misma cuenta 14: solo cantidades, sin asiento', () => {
  const S = S0(); S.inventario_docs[0].cuenta_contra = '14350501';
  const a = asientoInventario(costear(movimientosInv(S)), { productos: S.productos, bodegas: S.bodegas, param: {} });
  assert.equal(a.filter(m => m.doc_id === 'a1').length, 0);
});

import { kardex, costoPorProducto } from '../src/inventario.js';
test('traslado: mueve cantidades entre bodegas sin cambiar costo ni existencia; asiento solo si las cuentas 14 son distintas', () => {
  const prods = [{ id: 'p', tipo: 'producto' }];
  const bods = [{ id: 'b1', cuenta: '14350501' }, { id: 'b2', cuenta: '14350502' }, { id: 'b3', cuenta: '14350501' }];
  const base = { productos: prods, compras: [{ id: 'c', tipo: 'FC', estado: 'contabilizado', numero: 1, fecha: '2026-01-01', lineas: [{ producto_id: 'p', bodega_id: 'b1', cantidad: 10, costo: 100, cuenta: '14350501', base: 1000 }] }] };
  const tr = (dest, q) => ({ id: 't' + dest, tipo: 'TR', numero: 1, fecha: '2026-01-02', tercero_id: 'x', estado: 'contabilizado', lineas: [{ producto_id: 'p', bodega_id: 'b1', bodega_destino: dest, cantidad: q }] });
  const cs = costear(movimientosInv({ ...base, inventario_docs: [tr('b2', 4)] }));
  const e = existencias(cs)[0];
  assert.equal(e.cantidad, 10); assert.equal(e.valor, 1000); assert.equal(e.bodegas.b1, 6); assert.equal(e.bodegas.b2, 4);
  const a = asientoInventario(cs, { productos: prods, bodegas: bods, param: {} });
  assert.deepEqual(a.map(m => [m.cuenta, m.debito, m.credito]).sort(), [['14350501', 0, 400], ['14350502', 400, 0]]);
  const cs2 = costear(movimientosInv({ ...base, inventario_docs: [tr('b3', 4)] }));
  assert.equal(asientoInventario(cs2, { productos: prods, bodegas: bods, param: {} }).length, 0);
  const k = kardex(cs, 'p', { bodega: 'b2' });
  assert.equal(k.final.cantidad, 4); assert.equal(kardex(cs, 'p').final.cantidad, 10);
});
test('costo de ventas por producto: ventas menos devoluciones, costo y margen', () => {
  const prods = [{ id: 'p', tipo: 'producto' }];
  const S = { productos: prods, compras: [{ id: 'c', tipo: 'FC', estado: 'x', numero: 1, fecha: '2026-01-01', lineas: [{ producto_id: 'p', cantidad: 10, costo: 100, cuenta: '14350501', base: 1000 }] }],
    documentos: [{ id: 'f', tipo: 'FV', estado: 'emitido', numero: 1, fecha: '2026-01-05' }, { id: 'n', tipo: 'NC', estado: 'emitido', numero: 1, fecha: '2026-01-06', concepto: '1', ref_id: 'f' }],
    items: [{ documento_id: 'f', producto_id: 'p', cantidad: 4, precio: 200 }, { documento_id: 'n', producto_id: 'p', cantidad: 1, precio: 200 }] };
  const r = costoPorProducto(costear(movimientosInv(S)), S.items, '2026-01-01', '2026-01-31')[0];
  assert.equal(r.cantidad, 3); assert.equal(r.costo, 300); assert.equal(r.venta, 600); assert.equal(r.margen, 50);
});
