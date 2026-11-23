import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisosEmpresa, avisosVencimientos, pendientes } from '../src/notificaciones.js';
import { vencimientos } from '../src/calendario.js';
import { DEFAULT_RULES } from '../src/calendario/rules.js';
import { datosDemo } from '../src/demo.js';

test('avisos de la empresa demo: vencidas y configuración, sin Factus en modo demostración', () => {
  const db = datosDemo('2026-11-22'), e = db.empresas[0];
  const l = avisosEmpresa({ empresa: e, d: db, hoy: '2026-11-22', local: true });
  const claves = l.map(a => a.clave.split('|')[1]);
  assert.ok(claves.includes('op-cartera-2026-11'));
  assert.ok(claves.includes('op-cxp-2026-11'));
  assert.ok(claves.includes('cfg-logo'));
  assert.ok(!claves.includes('cfg-factus'));
  assert.ok(!claves.includes('cfg-numeracion'));
});
test('falta numeración, ARL y entidades', () => {
  const e = { id: 'e', nombre: 'X', correo: '', contabilidad: {} };
  const d = { numeraciones: [], empleados: [{ id: 'm', activo: true }], documentos: [], aplicaciones: [], compras: [], nominas: [] };
  const c = avisosEmpresa({ empresa: e, d, hoy: '2026-11-22' }).map(a => a.clave.split('|')[1]);
  for (const k of ['cfg-numeracion', 'cfg-factus', 'cfg-correo', 'cfg-entidades', 'cfg-arl', 'op-nomina-2026-10']) assert.ok(c.includes(k), k);
});
test('leídos: los que se repiten vuelven a los 7 días; los de etapa no', () => {
  const a = [{ clave: 'a', repetir: 7 }, { clave: 'b', repetir: null }, { clave: 'c', repetir: 7 }];
  const ahora = new Date('2026-11-22T12:00:00Z');
  const l = pendientes(a, { a: '2026-11-20T12:00:00Z', b: '2026-10-01T12:00:00Z', c: '2026-11-10T12:00:00Z' }, ahora).map(x => x.clave);
  assert.deepEqual(l, ['c']);
});
test('vencimientos de AGA Calendar con estado y avisos por etapa', () => {
  const datos = { empresas: [{ id: 'x', nombre: 'Cliente Uno S.A.S.', nit: '900123451', dv: 0, regimen: 'ordinario_pj', extras: {}, mia: true }], aprob: [], reglas: DEFAULT_RULES };
  const v = vencimientos(datos, '2026-11-01', '2026-12-31');
  const ret = v.find(x => /Retenci/.test(x.obligacion) && x.fecha === '2026-11-11');
  assert.ok(ret, 'retención de octubre vence el 11 de noviembre para NIT terminado en 1');
  assert.ok(['vencida', 'pronto', 'futura'].includes(ret.estado));
  const datos2 = { ...datos, aprob: [{ empresa_id: 'x', clave: ret.clave.slice(2) }] };
  assert.equal(vencimientos(datos2, '2026-11-01', '2026-12-31').find(x => x.clave === ret.clave).estado, 'presentada');
  const av = avisosVencimientos([{ ...ret, dias: 1, estado: 'pronto', presentada: null }, { ...ret, clave: 'k2', dias: 20, presentada: null }]);
  assert.equal(av.length, 1); assert.match(av[0].texto, /vence mañana/);
});
test('el calendario muestra solo la empresa con el NIT de la empresa abierta', () => {
  const base = { regimen: 'ordinario_pj', extras: {} };
  const datos = { empresas: [{ ...base, id: 'a', nombre: 'Otra', nit: '800111222', mia: true }, { ...base, id: 'b', nombre: 'La abierta', nit: '900123451', mia: false, comoResp: true }], aprob: [], reglas: DEFAULT_RULES };
  const v = vencimientos(datos, '2026-11-01', '2026-12-31', { nit: '900.123.451' });
  assert.ok(v.length > 0);
  assert.ok(v.every(x => x.empresa_id === 'b'));
  assert.equal(vencimientos(datos, '2026-11-01', '2026-12-31', { nit: '111' }).length, 0);
});

test('aviso de mantenimiento preventivo en la campanita', () => {
  const empresa = { id: 'e1', nombre: 'Maq', correo: 'a@b.co', contabilidad: { operacion: { activo: true } } };
  const d = { op_elementos: [{ id: 'm1', lista: 'equipos', nombre: 'Retro 320', datos: { pm: { cada: 250, base: 900, inicial: 1000, hist: [] } } }], op_registros: [{ datos: { equipo: 'm1', horometro: { ini: 1000, fin: 1160 } } }] };
  const a = avisosEmpresa({ empresa, d, hoy: '2026-11-22', local: true }).filter(x => x.clave.includes('op-pm'));
  assert.equal(a.length, 1); assert.match(a[0].titulo, /Retro 320/); assert.match(a[0].clave, /1150-vencido/);
});
