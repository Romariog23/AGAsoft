import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tablaDepreciacion, estadoActivo, mesesContabilizados, cuotasDelMes, lineasDepreciacion, erroresActivo, TIPOS_ACTIVO_DEF, cuentasActivo } from '../src/activos.js';

const monta = { id: 'a2', codigo: 'AF-002', nombre: 'Montacargas', tipo: 'maquinaria', origen: 'nuevo', inicio: '2026-06', costo: 72000000, residual: 7200000, dep_inicial: 0, vida_meses: 120 };

test('línea recta: (costo − residual) ÷ vida útil, y el último mes cierra exacto', () => {
  const t = tablaDepreciacion(monta);
  assert.equal(t.length, 120); assert.equal(t[0].cuota, 540000); assert.equal(t[0].periodo, '2026-06');
  assert.equal(t[119].periodo, '2036-05'); assert.equal(t[119].libros, 7200000);
  const raro = tablaDepreciacion({ ...monta, costo: 1000, residual: 0, vida_meses: 3 });
  assert.deepEqual(raro.map(x => x.cuota), [333.33, 333.33, 333.34]);
});

test('saldo inicial: lo que falta se reparte en la vigencia restante', () => {
  const a = { id: 's', tipo: 'transporte', origen: 'saldo', inicio: '2026-12', costo: 120000000, residual: 0, dep_inicial: 40000000, vida_meses: 80 };
  const t = tablaDepreciacion(a);
  assert.equal(t.length, 80); assert.equal(t[0].cuota, 1000000); assert.equal(t[0].acumulada, 41000000); assert.equal(t[79].libros, 0);
});

test('terrenos no se deprecian; cambio de vida útil recalcula desde ese mes', () => {
  assert.equal(tablaDepreciacion({ ...monta, tipo: 'terrenos' }).length, 0);
  const c = tablaDepreciacion({ ...monta, residual: 0, costo: 1200, vida_meses: 12, cambios: [{ desde: '2026-08', restantes: 5 }] });
  assert.equal(c[0].cuota, 100); assert.equal(c[1].cuota, 100); assert.equal(c[2].cuota, 200); assert.equal(c.length, 7); assert.equal(c[6].libros, 0);
});

test('meses contabilizados por comprobante DP, estado y cuotas pendientes del mes', () => {
  const comps = [{ tipo: 'DP', fecha: '2026-06-30', estado: 'contabilizado', lineas: [{ activo: 'a2', periodo: '2026-06' }] }, { tipo: 'DP', fecha: '2026-07-31', estado: 'anulado', lineas: [{ activo: 'a2', periodo: '2026-07' }] }];
  const hechos = mesesContabilizados(comps);
  assert.deepEqual([...hechos.a2], ['2026-06']);
  const e = estadoActivo(monta, { hechos });
  assert.equal(e.acumulada, 540000); assert.equal(e.libros, 71460000); assert.equal(e.siguiente.periodo, '2026-07'); assert.equal(e.estado, 'depreciando');
  const r = cuotasDelMes([monta], '2026-08', { hechos });
  assert.equal(r.anterior, '2026-07'); assert.equal(r.filas.length, 1);
  const ls = lineasDepreciacion(r.filas, '2026-08', 't-emp');
  assert.equal(ls.length, 2); assert.equal(ls[0].cuenta, '51601001'); assert.equal(ls[0].debito, 540000); assert.equal(ls[1].cuenta, '15921001'); assert.equal(ls[1].credito, 540000);
  assert.ok(ls.every(l => l.tercero_id === 't-emp' && l.activo === 'a2' && l.periodo === '2026-08'));
});

test('validaciones y cuentas propias', () => {
  assert.equal(erroresActivo(monta, TIPOS_ACTIVO_DEF).length, 0);
  assert.ok(erroresActivo({ ...monta, residual: 80000000 }, TIPOS_ACTIVO_DEF).length);
  assert.ok(erroresActivo({ ...monta, origen: 'saldo', vida_meses: 0 }, TIPOS_ACTIVO_DEF).some(e => /vigencia/.test(e)));
  assert.equal(cuentasActivo({ ...monta, cta_gasto: '52601001' }, TIPOS_ACTIVO_DEF).gasto, '52601001');
});

test('tipos sugeridos se ajustan a las cuentas que existen en el plan', async () => {
  const { tiposActivo } = await import('../src/activos.js');
  const t = tiposActivo({}, ['15200501', '15920501', '51600501']);
  const maq = t.find(x => x.id === 'maquinaria');
  assert.equal(maq.dep, '15920501'); assert.equal(maq.gasto, '51600501'); assert.equal(maq.activo, '15200501');
  assert.equal(tiposActivo({ activos_tipos: [{ id: 'x', nombre: 'X', meses: 1 }] }, []).length, 1);
});

test('repotenciación suma al costo desde su mes y toma la nueva vigencia; tercero propio del activo', async () => {
  const { costoTotal } = await import('../src/activos.js');
  const a = { id: 'r', tipo: 'maquinaria', inicio: '2026-01', costo: 1200, residual: 0, dep_inicial: 0, vida_meses: 12, adiciones: [{ desde: '2026-07', valor: 600, restantes: 12 }] };
  const t = tablaDepreciacion(a);
  assert.equal(t[5].cuota, 100); assert.equal(t[6].periodo, '2026-07'); assert.equal(t[6].cuota, 100); // (1200 − 600 + 600) ÷ 12
  assert.equal(t.length, 18); assert.equal(t[17].libros, 0); assert.equal(costoTotal(a), 1800);
  const ls = lineasDepreciacion([{ activo: a, cuota: 100, cuentas: { gasto: 'g', dep: 'd' } }, { activo: { id: 'b' }, cuota: 5, cuentas: { gasto: 'g', dep: 'd' } }], '2026-07', 'emp', x => x.id === 'r' ? 'prov' : '');
  assert.deepEqual(ls.map(l => l.tercero_id), ['prov', 'prov', 'emp', 'emp']);
});
