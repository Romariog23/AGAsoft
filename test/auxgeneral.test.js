import test from 'node:test';
import assert from 'node:assert/strict';
import { auxiliarGeneral } from '../src/reportes.js';
import { xlsx } from '../src/xlsx.js';

const M = (fecha, origen, tipo, doc_id, ref, cuenta, debito, credito, tercero_id = 't1') => ({ fecha, origen, tipo, doc_id, ref, cuenta, debito, credito, tercero_id });
const movs = [
  M('2026-11-05', 'doc', 'FV', 'f10', '10', '13050501', 119, 0),
  M('2026-11-03', 'comp', 'CC', 'c2', 'CC 2', '51050601', 50, 0, 't2'),
  M('2026-11-05', 'doc', 'FV', 'f9', '9', '13050501', 238, 0),
  M('2026-11-05', 'doc', 'FV', 'f10', '10', '41350501', 0, 100),
  M('2026-11-03', 'comp', 'CC', 'c2', 'CC 2', '11050501', 0, 50),
  M('2026-11-05', 'doc', 'FV', 'f10', '10', '24080501', 0, 19),
  M('2026-11-05', 'doc', 'FV', 'f9', '9', '41350501', 0, 238),
  M('2026-12-01', 'doc', 'FV', 'f11', '11', '13050501', 5, 0),
];
const etiqueta = m => m.origen === 'doc' ? `FV ${m.ref}` : m.ref;

test('auxiliar general: cronológico y cada comprobante junto', () => {
  const r = auxiliarGeneral(movs, '2026-11-01', '2026-11-30', { etiqueta });
  assert.deepEqual(r.grupos.map(g => g.documento), ['CC 2', 'FV 9', 'FV 10']);
  assert.deepEqual(r.grupos[2].filas.map(m => m.cuenta), ['13050501', '41350501', '24080501']);
  assert.equal(r.debito, 407); assert.equal(r.credito, 407); assert.equal(r.partidas, 7);
  const t = auxiliarGeneral(movs, '2026-11-01', '2026-11-30', { etiqueta, tercero: 't2' });
  assert.deepEqual(t.grupos.map(g => [g.documento, g.filas.length]), [['CC 2', 1]]);
});

test('xlsx: archivo zip válido con las hojas', () => {
  const b = xlsx([{ nombre: 'Auxiliar', filas: [['Fecha', 'Débito'], ['2026-11-05', 1.5]] }]);
  assert.equal(b[0], 0x50); assert.equal(b[1], 0x4b);
  const txt = new TextDecoder().decode(b);
  assert.match(txt, /<sheet name="Auxiliar"/);
  assert.match(txt, /<v>46331<\/v>/); // 5-nov-2026 como fecha de Excel
});

test('auxiliar general de la empresa demo: sumas iguales y todo agrupado', async () => {
  const { datosDemo } = await import('../src/demo.js');
  const { movimientos } = await import('../src/contab.js');
  const { parametrosDe } = await import('../src/puc.js');
  const { tarifasIva } = await import('../src/impuestos.js');
  const { cfgInventario } = await import('../src/inventario.js');
  const { cfgCC } = await import('../src/centros.js');
  const { hojasAuxiliarGeneral } = await import('../src/reportes.js');
  const db = datosDemo('2026-11-22'), e = db.empresas[0], c = e.contabilidad;
  const d = Object.fromEntries(Object.entries(db).map(([k, v]) => [k, Array.isArray(v) ? v.filter(r => !r.empresa_id || r.empresa_id === e.id) : v]));
  const ms = movimientos({ ...d, param: parametrosDe(c), tarifas: tarifasIva(c), metodoInv: cfgInventario(c).metodo, cc: cfgCC(c), inventario: true });
  const r = auxiliarGeneral(ms, null, '2026-11-22');
  assert.ok(r.grupos.length > 50);
  assert.equal(r.debito, r.credito);
  for (const g of r.grupos) assert.ok(Math.abs(g.debito - g.credito) < 0.01, `${g.documento} no cuadra`);
  const fechas = r.grupos.map(g => g.fecha); assert.deepEqual(fechas, [...fechas].sort());
  const h = hojasAuxiliarGeneral(r, { empresa: e, hasta: '2026-11-22' });
  assert.equal(h[0].filas.length, r.partidas + 2);
});
