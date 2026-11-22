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
