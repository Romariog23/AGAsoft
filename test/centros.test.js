import test from 'node:test';
import assert from 'node:assert/strict';
import { cfgCC, nivelesActivos, cuentaConCC, erroresCC, limpiarCC, erroresCentro } from '../src/centros.js';
import { asientoComprobante } from '../src/contab.js';

const C = [{ id: 'm1', nivel: 1, codigo: '01', nombre: 'Retroexcavadora 01' }, { id: 'o1', nivel: 2, codigo: '01', nombre: 'Obra Calle 80' }];
const cfg = cfgCC({ cc: { activo: true, niveles: [{ nombre: 'Máquinas' }, { nombre: 'Obras', activo: true }, { nombre: 'Áreas', activo: false }] } });

test('nivel 1 siempre obligatorio; 2 y 3 opcionales; el 3 requiere el 2', () => {
  assert.deepEqual(nivelesActivos(cfg).map(n => n.nombre), ['Máquinas', 'Obras']);
  assert.equal(cfgCC({ cc: { activo: true, niveles: [{}, { activo: false }, { activo: true }] } }).niveles[2].activo, false);
  assert.equal(cfgCC({}).activo, false);
});
test('alcance: solo resultado o balance y resultado', () => {
  assert.equal(cuentaConCC(cfg, '51350501'), true);
  assert.equal(cuentaConCC(cfg, '11100501'), false);
  assert.equal(cuentaConCC({ ...cfg, alcance: 'todo' }, '11100501'), true);
  assert.equal(cuentaConCC({ ...cfg, activo: false }, '51350501'), false);
});
test('sin el nivel 1 en una cuenta del alcance no se deja guardar; el nivel 2 es opcional', () => {
  assert.equal(erroresCC([{ cuenta: '51350501' }], cfg, C).length, 1);
  assert.equal(erroresCC([{ cuenta: '51350501', cc1: 'm1' }], cfg, C).length, 0);
  assert.equal(erroresCC([{ cuenta: '51350501', cc1: 'm1', cc2: 'o1' }], cfg, C).length, 0);
  assert.equal(erroresCC([{ cuenta: '11100501' }], cfg, C).length, 0);
  assert.equal(erroresCC([{ cuenta: '51350501', cc1: 'o1' }], cfg, C).length, 1); // centro de otro nivel
});
test('limpiar y propagar al asiento', () => {
  assert.deepEqual(limpiarCC({ cuenta: '11100501', cc1: 'm1' }, cfg), { cuenta: '11100501' });
  const ms = asientoComprobante({ id: 'x', tipo: 'CC', numero: 1, fecha: '2026-01-01', lineas: [{ cuenta: '51350501', tercero_id: 't', debito: 10, credito: 0, cc1: 'm1', cc2: 'o1' }, { cuenta: '11100501', tercero_id: 't', debito: 0, credito: 10 }] });
  assert.equal(ms[0].cc1, 'm1'); assert.equal(ms[0].cc2, 'o1'); assert.equal(ms[1].cc1, undefined);
  assert.ok(erroresCentro({ nivel: 1, codigo: '01', nombre: 'X' }, C).length);
});
