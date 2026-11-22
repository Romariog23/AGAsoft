import test from 'node:test';
import assert from 'node:assert/strict';
import { periodo, periodoDe, informeIva, informeRetenciones, certificado, tercerosConRetencion } from '../src/informes.js';

test('períodos de IVA', () => {
  assert.deepEqual(periodo(2026, 'bimestral', 6), { desde: '2026-11-01', hasta: '2026-12-31' });
  assert.deepEqual(periodo(2026, 'cuatrimestral', 1), { desde: '2026-01-01', hasta: '2026-04-30' });
  assert.deepEqual(periodo(2028, 'mensual', 2), { desde: '2028-02-01', hasta: '2028-02-29' });
  assert.equal(periodoDe('2026-11-20', 'bimestral'), 6);
  assert.equal(periodoDe('2026-05-01', 'cuatrimestral'), 2);
});

const documentos = [
  { id: 'f1', tipo: 'FV', estado: 'emitido', fecha: '2026-11-03', reteiva: 2850 },
  { id: 'n1', tipo: 'NC', estado: 'emitido', fecha: '2026-11-10', reteiva: 0 },
  { id: 'f2', tipo: 'FV', estado: 'borrador', fecha: '2026-11-11' },
  { id: 'f3', tipo: 'FV', estado: 'emitido', fecha: '2026-10-31' },
];
const items = [
  { documento_id: 'f1', cantidad: 1, precio: 100000, iva_pct: 19 },
  { documento_id: 'f1', cantidad: 2, precio: 10000, iva_pct: 0 },
  { documento_id: 'n1', cantidad: 1, precio: 20000, iva_pct: 19 },
  { documento_id: 'f2', cantidad: 1, precio: 999999, iva_pct: 19 },
  { documento_id: 'f3', cantidad: 1, precio: 999999, iva_pct: 19 },
];
const compras = [
  { id: 'c1', tipo: 'FC', estado: 'vigente', fecha: '2026-11-05', tercero_id: 'p1', lineas: [{ base: 50000, iva_pct: 19 }], retefuente_pct: 4, reteiva_pct: 15, reteica_milaje: 0, retenciones: { retefuente: { nombre: 'Servicios en general' }, reteiva: { nombre: 'ReteIVA 15 %' } } },
  { id: 'c2', tipo: 'DS', estado: 'vigente', fecha: '2026-11-06', tercero_id: 'p2', lineas: [{ base: 1000000, iva_pct: 0 }], retefuente_pct: 11, reteica_milaje: 9.66, retenciones: { retefuente: { nombre: 'Honorarios' } } },
  { id: 'c3', tipo: 'FC', estado: 'anulado', fecha: '2026-11-07', tercero_id: 'p1', lineas: [{ base: 80000, iva_pct: 19 }], retefuente_pct: 4 },
];

test('informe de IVA del bimestre', () => {
  const r = informeIva({ documentos, items, compras }, '2026-11-01', '2026-12-31');
  assert.deepEqual(r.ventas, [{ tarifa: 19, base: 80000, iva: 15200 }, { tarifa: 0, base: 20000, iva: 0 }]);
  assert.equal(r.generado, 15200);
  assert.equal(r.descontable, 9500);
  assert.equal(r.reteivaQueLePracticaron, 2850);
  assert.equal(r.saldo, 2850);
  assert.equal(r.aPagar, 2850);
  assert.equal(r.nVentas, 2);
  assert.equal(r.nCompras, 2);
});

test('retenciones practicadas y certificados', () => {
  const movs = [
    { origen: 'nomina', fecha: '2026-11-30', cuenta: '23650501', credito: 120000, debito: 0 },
    { origen: 'compra', fecha: '2026-11-05', cuenta: '23650501', credito: 2000, debito: 0 },
    { origen: 'comp', fecha: '2026-11-15', cuenta: '23680501', credito: 500, debito: 0 },
  ];
  const r = informeRetenciones(compras, movs, '2026-11-01', '2026-11-30');
  assert.equal(r.retefuente, 2000 + 110000 + 120000);
  assert.equal(r.reteiva, 1425);
  assert.equal(r.reteica, 9660 + 500);
  assert.ok(r.grupos.some(g => g.concepto === 'Honorarios' && g.base === 1000000 && g.valor === 110000));
  const c = certificado(compras, 'p1', '2026-01-01', '2026-12-31');
  assert.equal(c.total, 3425);
  assert.equal(c.porTipo.reteiva[0].base, 9500);
  assert.deepEqual(tercerosConRetencion(compras, '2026-01-01', '2026-12-31').sort(), ['p1', 'p2']);
});

test('anexos de IVA y retenciones', async () => {
  const { anexoIva, anexoRetenciones } = await import('../src/informes.js');
  const a = anexoIva({ documentos, items, compras }, '2026-11-01', '2026-12-31');
  assert.equal(a.filter(f => f.seccion === 'ventas').reduce((s, f) => s + f.valor, 0), 15200);
  assert.equal(a.filter(f => f.seccion === 'compras').reduce((s, f) => s + f.valor, 0), 9500);
  assert.equal(a.find(f => f.doc?.id === 'n1').valor, -3800);
  const r = anexoRetenciones(compras, [{ origen: 'nomina', fecha: '2026-11-30', cuenta: '23650501', credito: 120000, debito: 0, ref: 'NE 1' }], '2026-11-01', '2026-11-30');
  assert.equal(r.filter(f => f.tipo === 'retefuente').length, 3);
  assert.equal(r.reduce((s, f) => s + f.valor, 0), 2000 + 1425 + 110000 + 9660 + 120000);
});
