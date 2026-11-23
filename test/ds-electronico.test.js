import test from 'node:test';
import assert from 'node:assert/strict';
import { asientoCompra, cuentasPorPagar, totalesCompra, ajustableDS, erroresCompra } from '../src/compras.js';
import { jsonDS, erroresDS } from '../src/fe.js';
import { movimientosInv, costear, asientoInventario } from '../src/inventario.js';

const lineas = [{ cuenta: '51352001', descripcion: 'Mantenimiento', base: 1000000, iva_pct: 0 }, { producto_id: 'p1', bodega_id: '', cantidad: 4, costo: 25000, base: 100000, cuenta: '14350501', iva_pct: 19 }];
const ds = { id: 'd1', tipo: 'DS', numero: 7, fecha: '2026-11-10', tercero_id: 't1', electronica: true, cuenta_pago: '', vence: '2026-12-10', lineas, retefuente_pct: 4, ...totalesCompra(lineas, { retefuente_pct: 4 }) };
const lnNA = [{ ...lineas[1], cantidad: 2, base: 50000 }];
const na = { id: 'n1', tipo: 'NA', numero: 1, fecha: '2026-11-12', tercero_id: 't1', electronica: true, ref_id: 'd1', concepto: '1', cuenta_pago: '', lineas: lnNA, retefuente_pct: 4, ...totalesCompra(lnNA, { retefuente_pct: 4 }) };
const sum = (ms, f) => Math.round(ms.filter(f).reduce((s, m) => s + m.debito - m.credito, 0) * 100) / 100;

test('nota de ajuste: asiento al revés del documento soporte y baja el saldo por pagar', () => {
  const a = asientoCompra(na, {}, []);
  assert.equal(sum(a, m => m.cuenta === '14350501'), -50000);
  assert.equal(Math.abs(sum(a, () => true)), 0);
  assert.ok(a.every(m => m.tipo === 'NA'));
  const s = cuentasPorPagar([ds, na], '2026-11-20').find(x => x.compra.id === 'd1');
  assert.equal(s.saldo, Math.round((ds.neto - na.neto) * 100) / 100);
  assert.equal(ajustableDS(ds, [ds, na]), Math.round((ds.total - na.total) * 100) / 100);
  assert.ok(erroresCompra({ ...na, concepto: '9' }, [{ codigo: '14350501' }], [{ id: 'p1', tipo: 'producto' }]).some(e => /concepto/.test(e)));
});
test('nota de ajuste: los productos devueltos salen del inventario al costo de compra, sin asiento de costo', () => {
  const ms = costear(movimientosInv({ compras: [ds, na], productos: [{ id: 'p1', tipo: 'producto' }], documentos: [], items: [] }));
  const dev = ms.find(m => m.origen === 'devcompra');
  assert.equal(dev.cantidad, -2); assert.equal(dev.total, -50000); assert.equal(dev.saldo, 2); assert.equal(dev.valor, 50000);
  assert.equal(asientoInventario(ms, { productos: [{ id: 'p1' }], bodegas: [], param: {} }).length, 0);
});
test('JSON del documento soporte y de la nota de ajuste para Factus', () => {
  const tercero = { tipo_id: '13', numero: '72.186.455', nombre: 'Carlos Rojas', direccion: 'Calle 1', ciudad: 'Barranquilla', departamento: 'Atlántico' };
  const b = jsonDS({ c: ds, tercero, productos: [{ id: 'p1', codigo: 'CEM-50', unidad: 'UND' }], unidades: [] });
  assert.equal(b.reference_code, 'DS-7'); assert.equal(b.provider.legal_organization_code, '2'); assert.equal(b.provider.names, 'Carlos Rojas');
  assert.equal(b.payment_details[0].payment_form, '2'); assert.equal(b.payment_details[0].amount, ds.total.toFixed(2));
  assert.deepEqual(b.items.map(i => [i.code_reference, i.quantity, i.price]), [['51352001', '1.00', '1000000.00'], ['CEM-50', '4.00', '25000.00']]);
  assert.deepEqual(b.items[0].withholding_taxes, [{ code: '06', rate: '4.00' }]); assert.equal(b.items[0].period.generation_mode, '1');
  const n = jsonDS({ c: na, tercero, productos: [], unidades: [], numeroRef: 'SEDS1' });
  assert.equal(n.support_document_number, 'SEDS1'); assert.equal(n.correction_concept_code, '1'); assert.equal(n.items[0].period, undefined);
  assert.ok(erroresDS({ c: na, tercero, ref: ds, numeroRef: '' }).some(e => /validado/.test(e)));
  assert.deepEqual(erroresDS({ c: ds, tercero }), []);
});

test('DS: proveedor con cédula va como NIT con DV; extranjero conserva su documento', async () => {
  const { jsonDS } = await import('../src/fe.js');
  const c = { tipo: 'DS', numero: 1, fecha: '2026-11-23', lineas: [{ base: 10000, iva_pct: 0, descripcion: 'x' }] };
  const b = jsonDS({ c, tercero: { tipo_id: '13', numero: '1.020.304.050', nombre: 'Ana Ruiz', tipo_persona: 'natural' }, productos: [], unidades: [] });
  assert.equal(b.provider.identification_document_code, '31');
  assert.equal(b.provider.identification, '1020304050');
  assert.match(b.provider.dv, /^\d$/);
  const e = jsonDS({ c, tercero: { tipo_id: '41', numero: 'AB123', nombre: 'John Doe', tipo_persona: 'natural' }, productos: [], unidades: [] });
  assert.equal(e.provider.identification_document_code, '41');
  assert.equal(e.provider.dv, undefined);
});
