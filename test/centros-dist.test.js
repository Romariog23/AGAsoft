import test from 'node:test';
import assert from 'node:assert/strict';
import { totales } from '../src/calc.js';
import { cfgCC, normDist, distPonderada, repartirMov, aplicarCC, erroresDist, sinCentro, textoDist } from '../src/centros.js';
import { movimientos } from '../src/contab.js';
import { asientoNomina } from '../src/nomina.js';

const C = [{ id: 'm1', nivel: 1, codigo: '01', nombre: 'Retro 01' }, { id: 'm2', nivel: 1, codigo: '02', nombre: 'Volqueta' }, { id: 'o1', nivel: 2, codigo: '01', nombre: 'Obra 80' }];
const res = cfgCC({ cc: { activo: true, niveles: [{ nombre: 'Máquinas' }, { nombre: 'Obras', activo: true }] } });
const todo = cfgCC({ cc: { activo: true, alcance: 'todo', niveles: [{ nombre: 'Máquinas' }] } });
const cuadra = ms => Math.abs(ms.reduce((s, m) => s + m.debito - m.credito, 0)) < 0.001;
const suma = (ms, f) => Math.round(ms.filter(f).reduce((s, m) => s + m.debito - m.credito, 0) * 100) / 100;

test('distribución: un centro es 100 %, ponderada por valor', () => {
  assert.deepEqual(normDist([{ cc1: 'm1', pct: 30 }]), [{ cc1: 'm1', pct: 100 }]);
  const p = distPonderada([{ dist: [{ cc1: 'm1' }], valor: 300 }, { dist: [{ cc1: 'm2' }], valor: 100 }]);
  assert.deepEqual(p, [{ cc1: 'm1', pct: 75 }, { cc1: 'm2', pct: 25 }]);
  assert.equal(textoDist(p, C), 'Retro 01 75 % · Volqueta 25 %');
});
test('reparto de un movimiento: los centavos van al último y suma igual', () => {
  const ms = repartirMov({ cuenta: '51', debito: 100, credito: 0 }, [{ cc1: 'm1', pct: 33.3333 }, { cc1: 'm2', pct: 66.6667 }]);
  assert.equal(ms.length, 2); assert.equal(ms[0].debito + ms[1].debito, 100); assert.equal(ms[0].cc1, 'm1');
});
test('errores de distribución', () => {
  assert.deepEqual(erroresDist([{ cc1: 'm1', pct: 50 }, { cc1: 'm2', pct: 40 }], res, C).length, 1);
  assert.match(erroresDist([{ cc2: 'o1', pct: 100 }], res, C)[0], /Máquinas/);
  assert.deepEqual(erroresDist([{ cc1: 'm1', cc2: 'o1' }], res, C), []);
});

const its = [{ id: 'i1', documento_id: 'f1', cantidad: 1, precio: 1000000, iva_pct: 19, producto_id: 'p1', cc: [{ cc1: 'm1', pct: 60 }, { cc1: 'm2', pct: 40 }] },
  { id: 'i2', documento_id: 'f1', cantidad: 2, precio: 50000, iva_pct: 0, producto_id: 'p2' }];
const ret = { retefuente_pct: 4 };
const fv = { id: 'f1', tipo: 'FV', estado: 'emitido', prefijo: 'FE', numero: 1, fecha: '2026-11-02', tercero_id: 't1', cc: [{ cc1: 'm2', cc2: 'o1' }], ...ret, ...totales(its, ret) };
const rc = { id: 'r1', tipo: 'RC', estado: 'emitido', prefijo: 'RC', numero: 1, fecha: '2026-11-20', tercero_id: 't1', medio_pago: 'transferencia', total: 500000 };
const S = { documentos: [fv, rc], items: its, aplicaciones: [{ recibo_id: 'r1', factura_id: 'f1', valor: 500000 }], productos: [{ id: 'p1' }, { id: 'p2' }], param: {} };

test('factura: la línea manda sobre el general; solo resultado lleva centro', () => {
  const ms = movimientos({ ...S, cc: res });
  assert.ok(cuadra(ms));
  const ing = ms.filter(m => m.cuenta.startsWith('4'));
  assert.equal(suma(ing, m => m.cc1 === 'm1'), -600000);
  assert.equal(suma(ing, m => m.cc1 === 'm2'), -500000); // 400.000 de la línea 1 + 100.000 de la línea 2 (general)
  assert.equal(suma(ing, m => m.cc2 === 'o1'), -100000);
  assert.deepEqual(sinCentro(ms, res), []);
  assert.ok(ms.filter(m => m.cuenta.startsWith('13')).every(m => !m.cc1));
});
test('balance y resultado: clientes, IVA y recibos siguen el centro del documento', () => {
  const ms = movimientos({ ...S, cc: todo });
  assert.ok(cuadra(ms));
  // El general del documento manda para clientes e IVA.
  assert.ok(ms.filter(m => m.doc_id === 'f1' && !m.cuenta.startsWith('4')).every(m => m.cc1 === 'm2'));
  // El recibo sigue el de su factura.
  assert.ok(ms.filter(m => m.doc_id === 'r1').every(m => m.cc1 === 'm2'));
  // Cada centro cuadra la suma total.
  assert.equal(suma(ms, () => true), suma(ms, m => !!m.cc1));
});
test('sin centro de costo activo los movimientos no llevan centros', () => {
  const ms = movimientos({ ...S, cc: cfgCC({}) });
  assert.ok(ms.every(m => !m.cc1 && !m._dist));
});
test('compras: centro de la línea o el general; egreso sigue la factura', () => {
  const fc = { id: 'c1', tipo: 'FC', estado: 'emitido', numero: 1, fecha: '2026-11-03', tercero_id: 'pr', cc: [{ cc1: 'm1' }],
    lineas: [{ cuenta: '51450501', base: 800000, iva_pct: 19 }, { cuenta: '51350501', base: 200000, iva_pct: 0, cc: [{ cc1: 'm2' }] }] };
  const ce = { id: 'e1', tipo: 'CE', estado: 'emitido', numero: 1, fecha: '2026-11-10', tercero_id: 'pr', cuenta_pago: '11100501', aplicaciones: [{ compra_id: 'c1', valor: 500000 }] };
  const ms = movimientos({ ...S, documentos: [], compras: [fc, ce], cc: todo });
  assert.ok(cuadra(ms));
  assert.equal(suma(ms, m => m.cuenta === '51450501' && m.cc1 === 'm1'), 800000);
  assert.equal(suma(ms, m => m.cuenta === '51350501' && m.cc1 === 'm2'), 200000);
  assert.deepEqual(sinCentro(ms, todo), []);
  assert.ok(ms.filter(m => m.doc_id === 'e1').every(m => m.cc1 === 'm1'));
});
test('nómina: cada empleado con su distribución', () => {
  const n = { id: 'n1', numero: 1, fecha: '2026-11-30', estado: 'contabilizado', lineas: [{ tercero_id: 'e1', neto: 900000, items: [{ tipo: 'dev', cuenta: '72050601', valor: 1000000, nombre: 'Sueldo' }, { tipo: 'ded', cuenta: '23700501', valor: 100000, nombre: 'Salud' }] }] };
  const ms = aplicarCC(asientoNomina(n, { e1: [{ cc1: 'm1', pct: 70 }, { cc1: 'm2', pct: 30 }] }), res);
  assert.equal(suma(ms, m => m.cc1 === 'm1'), 700000); assert.equal(suma(ms, m => m.cc1 === 'm2'), 300000);
  assert.ok(ms.filter(m => m.cuenta.startsWith('2')).every(m => !m.cc1));
});
