import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totales } from '../src/calc.js';
import { planInicial } from '../src/puc.js';
import { asiento, asientoComprobante, erroresComprobante, movimientos, balancePrueba, libroAuxiliar, estadoResultados, situacionFinanciera } from '../src/contab.js';

const cuadra = ms => Math.abs(ms.reduce((s, m) => s + m.debito - m.credito, 0)) < 0.001;
const its = [{ id: 'i1', documento_id: 'f1', cantidad: 1, precio: 1000000, iva_pct: 19, producto_id: 'p1' }, { id: 'i2', documento_id: 'f1', cantidad: 2, precio: 50000, iva_pct: 0, producto_id: 'p2' }];
const ret = { retefuente_pct: 4, reteiva_pct: 15, reteica_milaje: 9.66 };
const t = totales(its, ret);
const fv = { id: 'f1', tipo: 'FV', estado: 'emitido', prefijo: 'FE', numero: 1, fecha: '2026-11-02', tercero_id: 't1', ...ret, ...t };
const ncIts = [{ id: 'i3', documento_id: 'n1', cantidad: 1, precio: 50000, iva_pct: 0 }];
const nc = { id: 'n1', tipo: 'NC', estado: 'emitido', prefijo: 'NC', numero: 1, fecha: '2026-11-05', tercero_id: 't1', ref_id: 'f1', concepto: '1', ...ret, ...totales(ncIts, ret) };
const rc = { id: 'r1', tipo: 'RC', estado: 'emitido', prefijo: 'RC', numero: 1, fecha: '2026-11-20', tercero_id: 't1', medio_pago: 'transferencia', total: 600000, anticipo: 100000 };
const S = { documentos: [fv, nc, rc, { ...rc, id: 'r2', estado: 'anulado' }], items: [...its, ...ncIts], aplicaciones: [{ recibo_id: 'r1', factura_id: 'f1', valor: 500000 }],
  productos: [{ id: 'p1', cuenta_ingreso: '415501' }, { id: 'p2' }], param: {} };
const plan = planInicial();

test('asiento de factura', () => {
  const a = asiento(fv, { ...S, docs: S.documentos });
  assert.ok(cuadra(a));
  const c = Object.fromEntries(a.map(m => [m.cuenta, m]));
  assert.equal(c['130505'].debito, t.neto); assert.equal(c['135515'].debito, 44000); assert.equal(c['415501'].credito, 1000000);
  assert.equal(c['413501'].credito, 100000); assert.equal(c['240801'].credito, 190000);
});
test('asiento de nota crédito y recibo', () => {
  const a = asiento(nc, { ...S, docs: S.documentos }); assert.ok(cuadra(a));
  assert.equal(a.find(m => m.cuenta === '417501').debito, 50000); assert.ok(a.find(m => m.cuenta === '130505').credito > 0);
  const r = asiento(rc, { ...S, docs: S.documentos }); assert.ok(cuadra(r));
  assert.equal(r.find(m => m.cuenta === '111005').debito, 600000); assert.equal(r.find(m => m.cuenta === '280505').credito, 100000);
});
test('balance, auxiliar y estados', () => {
  const ms = movimientos(S);
  assert.equal(ms.filter(m => m.doc_id === 'r2').length, 0);
  const b = balancePrueba(ms, plan, '2026-11-01', '2026-11-30');
  assert.equal(b.debitos, b.creditos);
  const c1 = b.filas.find(f => f.codigo === '1');
  const c13 = b.filas.find(f => f.codigo === '130505');
  assert.equal(c13.final, r2x(t.neto - nc.neto - 500000));
  assert.ok(c1.final > 0);
  const aux = libroAuxiliar(ms, plan, '1305', '2026-11-03', '2026-11-30');
  assert.equal(aux.inicial, t.neto); assert.equal(aux.final, c13.final);
  const er = estadoResultados(ms, plan, '2026-11-01', '2026-11-30');
  assert.equal(er.neta, 1100000 - 50000);
  const esf = situacionFinanciera(ms, plan, '2026-11-30');
  assert.ok(esf.cuadra, JSON.stringify([esf.activo, esf.pasivo, esf.patrimonio]));
  assert.equal(esf.patrimonio, 1050000);
});
function r2x(n) { return Math.round(n * 100) / 100; }

test('cuentas propias del producto en nota débito y nota crédito', () => {
  const prods = [{ id: 'p1', cuenta_ingreso: '415501', cuenta_devolucion: '417502' }];
  const ndIts = [{ id: 'd1', documento_id: 'nd1', cantidad: 1, precio: 10000, iva_pct: 0, producto_id: 'p1' }];
  const nd = { id: 'nd1', tipo: 'ND', estado: 'emitido', prefijo: 'ND', numero: 1, fecha: '2026-11-06', tercero_id: 't1', concepto: '1', ...totales(ndIts, {}) };
  const ncI = [{ id: 'c1', documento_id: 'nc2', cantidad: 1, precio: 20000, iva_pct: 19, producto_id: 'p1' }];
  const nc2 = { id: 'nc2', tipo: 'NC', estado: 'emitido', prefijo: 'NC', numero: 2, fecha: '2026-11-07', tercero_id: 't1', concepto: '1', ...totales(ncI, {}) };
  const ctx = { items: [...ndIts, ...ncI], productos: prods, param: {} };
  const a = asiento(nd, ctx); assert.ok(cuadra(a)); assert.equal(a.find(m => m.cuenta === '415501').credito, 10000);
  const b = asiento(nc2, ctx); assert.ok(cuadra(b)); assert.equal(b.find(m => m.cuenta === '417502').debito, 20000);
  assert.equal(b.find(m => m.cuenta === '240801').debito, 3800);
  // Sin cuenta propia: la nota débito por intereses va a la de intereses de la empresa.
  const c = asiento(nd, { ...ctx, productos: [] }); assert.equal(c.find(m => m.cuenta === '421005').credito, 10000);
});

test('comprobantes manuales: asiento, validación e informes', () => {
  const plan = planInicial();
  const si = { id: 'c1', tipo: 'SI', numero: 1, fecha: '2026-01-01', descripcion: 'Saldos iniciales', estado: 'contabilizado',
    lineas: [{ cuenta: '111005', debito: 15000000, credito: 0 }, { cuenta: '3105', debito: 0, credito: 15000000, tercero_id: 't1' }] };
  const a = asientoComprobante(si);
  assert.ok(cuadra(a)); assert.equal(a.length, 2); assert.equal(a[0].ref, 'SI 1'); assert.equal(a[1].tercero_id, 't1');
  assert.deepEqual(erroresComprobante(si, plan), []);
  assert.equal(asientoComprobante({ ...si, estado: 'anulado' }).length, 0);
  const malo = { ...si, lineas: [{ cuenta: '1110', debito: 10, credito: 0 }, { cuenta: '999999', debito: 0, credito: 5 }, { cuenta: '3105', debito: 1, credito: 1 }] };
  const e = erroresComprobante(malo, plan).join(' | ');
  assert.match(e, /subcuentas/); assert.match(e, /no existe/); assert.match(e, /no los dos/); assert.match(e, /No cuadra/);
  const ms = movimientos({ ...S, comprobantes: [si, { ...si, id: 'c2', numero: 2, estado: 'anulado' }] });
  assert.equal(ms.filter(m => m.origen === 'comp').length, 2);
  const b = balancePrueba(ms, plan, '2026-01-01', '2026-12-31');
  assert.equal(b.debitos, b.creditos);
  assert.equal(b.filas.find(f => f.codigo === '3105').final, 15000000);
});

test('la cuenta escogida en la línea manda sobre la del producto', () => {
  const items = [{ ...its[0], cuenta: '414005' }, { ...its[1], cuenta: ' ' }];
  const a = asiento(fv, { ...S, items, docs: S.documentos });
  assert.ok(cuadra(a));
  const c = Object.fromEntries(a.map(m => [m.cuenta, m]));
  assert.equal(c['414005'].credito, 1000000); assert.equal(c['415501'], undefined); assert.equal(c['413501'].credito, 100000);
});
