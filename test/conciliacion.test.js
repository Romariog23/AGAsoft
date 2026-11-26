import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esCuentaBanco, movimientosLibro, leerExtracto, valorBanco, autoCruzar, cuadraCruce, estadoConciliacion, lineasContabilizar, finMes, mesAnterior } from '../src/conciliacion.js';

const M = (doc_id, fecha, debito, credito, extra = {}) => ({ cuenta: '11100501', doc_id, origen: 'comp', ref: doc_id, fecha, debito, credito, ...extra });
const movs = [
  M('si', '2026-10-31', 10000000, 0),
  M('rc41', '2026-11-03', 5200000, 0),
  M('rc42', '2026-11-29', 4800000, 0),
  M('ce88', '2026-11-10', 0, 2000000),
  M('ce89', '2026-11-27', 0, 1200000),
  { ...M('otro', '2026-11-05', 999, 0), cuenta: '13050501' },
];

test('cuentas de bancos y meses', () => {
  assert.ok(esCuentaBanco('11100501')); assert.ok(esCuentaBanco('11200501'));
  assert.ok(!esCuentaBanco('110505')); assert.ok(!esCuentaBanco('13050501'));
  assert.equal(finMes('2026-02'), '2026-02-28'); assert.equal(mesAnterior('2026-01'), '2025-12');
});

test('el libro trae solo la cuenta, con clave estable y valor débito − crédito', () => {
  const l = movimientosLibro(movs, '11100501');
  assert.equal(l.length, 5); assert.equal(l.find(x => x.doc_id === 'ce88').valor, -2000000);
  assert.equal(l[0].key, 'si|0');
});

test('leer extracto por títulos, con débito/crédito o valor con signo', () => {
  const r = leerExtracto([['Banco X'], ['Fecha', 'Descripción', 'Débitos', 'Créditos'], ['03/11/2026', 'Consignación', '', '5.200.000'], ['30/11/2026', 'GMF 4x1000', '43.080', ''], ['xx', 'Mal', '1', '']]);
  assert.equal(r.lineas.length, 2); assert.equal(r.lineas[0].fecha, '2026-11-03'); assert.equal(valorBanco(r.lineas[1]), -43080); assert.equal(r.errores.length, 1);
  const v = leerExtracto([['Fecha', 'Concepto', 'Valor'], ['2026-11-04', 'Pago', '-150000']]);
  assert.equal(v.lineas[0].debito, 150000);
  assert.deepEqual(leerExtracto([['a', 'b']]).faltan.length, 2);
});

test('cruce automático por valor y fecha cercana, y por marca de contabilización', () => {
  const l = movimientosLibro(movs, '11100501');
  const b = [{ id: 'b1', fecha: '2026-11-04', debito: 0, credito: 5200000 }, { id: 'b2', fecha: '2026-11-11', debito: 2000000, credito: 0 }, { id: 'b3', fecha: '2026-11-30', debito: 43080, credito: 0 }];
  const c = autoCruzar(l, b);
  assert.equal(c.length, 2);
  const conGmf = [...l, { ...M('cc25', '2026-11-30', 0, 43080, { conc: 'b3' }), key: 'cc25|0', valor: -43080 }];
  assert.equal(autoCruzar(conGmf, b).length, 3);
  assert.ok(cuadraCruce([{ valor: 100 }, { valor: 50 }], [{ debito: 0, credito: 150 }]));
  assert.ok(!cuadraCruce([{ valor: 100 }], [{ debito: 0, credito: 150 }]));
});

test('estado: tránsito, no cobrados, notas del banco y diferencia cero', () => {
  const libro = movimientosLibro(movs, '11100501');
  const extracto = [{ id: 'b1', fecha: '2026-11-04', debito: 0, credito: 5200000 }, { id: 'b2', fecha: '2026-11-11', debito: 2000000, credito: 0 }, { id: 'b3', fecha: '2026-11-30', descripcion: 'GMF 4x1000', debito: 43080, credito: 0 }];
  const prev = { id: 'p', periodo: '2026-10', saldo_extracto: 10000000, extracto: [{ id: 'o1', fecha: '2026-10-31', debito: 0, credito: 10000000 }], cruces: [{ l: ['si|0'], b: ['o1'] }], estado: 'cerrada' };
  const actual = { id: 'a', periodo: '2026-11', saldo_extracto: 13156920, extracto, cruces: [] };
  actual.cruces = autoCruzar(estadoConciliacion(libro, [prev], actual).pendL, extracto);
  const e = estadoConciliacion(libro, [prev], actual);
  assert.ok(!e.libro.some(x => x.key === 'si|0'), 'lo cruzado en octubre no vuelve');
  assert.equal(e.saldoLibros, 16800000); assert.equal(e.transito, 4800000); assert.equal(e.noCobrados, 1200000); assert.equal(e.ndBanco, 43080);
  assert.equal(e.segunBanco, 16756920); assert.equal(e.segunLibros, 16756920); assert.equal(e.diferencia, 0);
  // Contabilizar la partida del banco: la línea de bancos va marcada con la línea del extracto.
  const ls = lineasContabilizar(e.pendB, '11100501', { cuentas: [{ codigo: '53050501' }], tercero: 't-banco' });
  assert.equal(ls.length, 2); assert.equal(ls[0].conc, 'b3'); assert.equal(ls[0].credito, 43080); assert.equal(ls[1].debito, 43080); assert.equal(ls[1].tercero_id, 't-banco');
  assert.equal(ls[1].cuenta, '53050501');
});

test('lo pendiente del extracto de un mes pasa al siguiente', () => {
  const libro = movimientosLibro(movs, '11100501');
  const oct = { id: 'p', periodo: '2026-10', saldo_extracto: 0, extracto: [{ id: 'x', fecha: '2026-10-20', debito: 5000, credito: 0 }], cruces: [] };
  const e = estadoConciliacion(libro, [oct], { id: 'a', periodo: '2026-11', saldo_extracto: 0, extracto: [], cruces: [] });
  assert.equal(e.banco.length, 1); assert.equal(e.banco[0].anterior, '2026-10');
});
