import test from 'node:test';
import assert from 'node:assert/strict';
import { compilar, evaluar, diaDe, nuevoTipo, calcular, resumen, avisos, tarifaPara, erroresTipo, erroresRegistro, ultimaLectura, claveDe } from '../src/operacion.js';

// Datos del corte del 7 al 20 de noviembre de 2026 (volantes de horas adicionales).
const tipo = { id: 'maq', ...nuevoTipo('maquinaria', 'e1') };
const reg = (id, fecha, tercero_id, equipo, obra, ini, fin, extra = {}) => ({ id, tipo_id: 'maq', fecha, tercero_id, datos: { equipo, obra, soporte: 'Recibo firmado', horometro: { ini, fin }, ...(extra.datos || {}) }, ...extra, ...(extra.datos ? { datos: { equipo, obra, soporte: 'Recibo firmado', horometro: { ini, fin }, ...extra.datos } } : {}) });
const tarifas = [
  { id: 'ta', tipo_id: 'maq', uso: 'pago', criterios: { tercero: 'antonio' }, modo: 'unidad', valor: 7000, desde: '2026-11-01' },
  { id: 'tc', tipo_id: 'maq', uso: 'pago', criterios: { tercero: 'antonio', obra: 'corteva' }, modo: 'fijo', valor: 200000, desde: '2026-11-01' },
  { id: 'tw', tipo_id: 'maq', uso: 'pago', criterios: { tercero: 'waldy' }, modo: 'unidad', valor: 6000, desde: '2026-11-01' },
  { id: 'te', tipo_id: 'maq', uso: 'pago', criterios: { tercero: 'eliecer' }, modo: 'registro', valor: 65000, desde: '2026-10-01' },
];

test('fórmulas seguras', () => {
  assert.equal(evaluar('pagadas * tarifa', { pagadas: 12.7, tarifa: 7000 }), 88900);
  assert.equal(evaluar('max(0, a - 8) * 2 + 10%', { a: 10 }), 4.1);
  assert.equal(evaluar('redondear(1/3, 2)', {}), 0.33);
  assert.deepEqual(compilar('horas * tarifa').vars, ['horas', 'tarifa']);
  assert.throws(() => compilar('alert(1)'), /función/);
  assert.throws(() => compilar('a +'), /incompleta/);
  assert.throws(() => compilar('a ; b'), /entiende/);
});

test('días: domingo y festivo de Colombia', () => {
  assert.equal(diaDe('2026-11-15'), 'domingo');
  assert.equal(diaDe('2026-11-16'), 'festivo'); // Independencia de Cartagena
  assert.equal(diaDe('2026-11-14'), 'sabado');
  assert.equal(diaDe('2026-11-17'), 'habil');
});

test('la tarifa más específica gana: Antonio, fijo en Corteva y por hora en Malambo', () => {
  const r1 = reg('1', '2026-11-13', 'antonio', 'mot140k', 'corteva', 13118.5, 13124);
  const r2 = reg('2', '2026-11-19', 'antonio', 'mot140k', 'malambo', 13133.1, 13138.1);
  assert.equal(tarifaPara(r1, tarifas).id, 'tc');
  assert.equal(tarifaPara(r2, tarifas).id, 'ta');
  assert.equal(tarifaPara({ ...r2, fecha: '2026-10-30' }, tarifas), null); // antes de la vigencia
  const regs = [r1, reg('3', '2026-11-17', 'antonio', 'mot140k', 'corteva', 13124, 13130), reg('4', '2026-11-18', 'antonio', 'mot140k', 'corteva', 13130, 13132.6), r2, reg('5', '2026-11-20', 'antonio', 'mot140k', 'malambo', 13138.1, 13145.8)];
  const [p] = resumen(regs, tipo, tarifas);
  assert.equal(p.cantidad, 26.8);
  assert.equal(p.total, 288900);
  assert.equal(p.lineas.find(l => l.modo === 'fijo').cantidad, 14.1);
});

test('Waldy: horas a $6.000 más recargo dominical y festivo del 90 %', () => {
  const regs = [reg('a', '2026-11-14', 'waldy', 'bull', 'guac', 125.3, 131.3), reg('b', '2026-11-15', 'waldy', 'bull', 'guac', 131.3, 135.9), reg('c', '2026-11-16', 'waldy', 'bull', 'guac', 135.9, 140.3)];
  const c = calcular(regs[1], tipo, tarifas);
  assert.equal(c.pagadas, 4.6); assert.equal(c.base, 27600); assert.equal(c.recargos.length, 1);
  const [p] = resumen(regs, tipo, tarifas);
  const rec = p.lineas.find(l => l.regla);
  assert.equal(rec.cantidad, 9);
  assert.equal(Math.round(rec.valor), 142574); // 9 h × (1.750.905 ÷ 210) × 190 %
  assert.equal(calcular(regs[0], tipo, tarifas).recargos.length, 0);
});

test('regla solo para algunas personas y pago por día', () => {
  const t2 = { ...tipo, config: { ...tipo.config, reglas: [{ ...tipo.config.reglas[0], terceros: ['waldy'] }] } };
  assert.equal(calcular(reg('j', '2026-11-15', 'jose', 'exc', 'fugon', 8346.1, 8357.3), t2, tarifas).recargos.length, 0);
  const e = reg('e', '2026-11-02', 'eliecer', 'vibro', 'mecamet', '', '', { datos: { horometro: { ini: '', fin: '' } } });
  assert.equal(calcular(e, tipo, tarifas).valor, 65000); // día pagado aunque no se trabajó
});

test('horas pagadas distintas al horómetro, lecturas que no empatan y soporte pendiente', () => {
  const regs = [reg('1', '2026-11-18', 'antonio', 'mot140k', 'corteva', 13130, 13132.6), reg('2', '2026-11-19', 'antonio', 'mot140k', 'malambo', 13133.1, 13138.1),
    { ...reg('3', '2026-11-13', 'jose', 'exc', 'fugon', 8301.8, 8312.5), cantidad_pagada: 10.5 },
    reg('4', '2026-11-20', 'waldy', 'bull', 'guac', 164.5, 172.5, { datos: { soporte: 'Foto horómetro' } })];
  assert.equal(calcular(regs[2], tipo, tarifas).pagadas, 10.5);
  assert.equal(calcular(regs[2], tipo, tarifas).cantidad, 10.7);
  const a = avisos(regs, tipo, tarifas);
  assert.ok(a.some(x => x.clase === 'lectura' && x.registro_id === '2' && /0,5/.test(x.texto)));
  assert.ok(a.some(x => x.clase === 'pagadas' && x.registro_id === '3'));
  assert.ok(!avisos([{ ...regs[2], nota: 'Se paga según recibo' }], tipo, tarifas).some(x => x.clase === 'pagadas'));
  assert.ok(a.some(x => x.clase === 'pendiente' && x.registro_id === '4'));
  assert.ok(a.some(x => x.clase === 'tarifa' && x.registro_id === '3')); // Jose no tiene tarifa en el ejemplo
  assert.equal(ultimaLectura(regs, tipo, 'mot140k'), 13138.1);
});

test('validaciones del tipo y del registro', () => {
  assert.deepEqual(erroresTipo(tipo), []);
  assert.ok(erroresTipo({ ...tipo, config: { ...tipo.config, formulas: { cantidad: 'horometro', valor: 'pagadas * precio' } } }).some(e => /precio/.test(e)));
  assert.ok(erroresTipo({ ...tipo, config: { ...tipo.config, campos: [...tipo.config.campos, { k: 'tarifa', nombre: 'X', tipo: 'numero' }] } }).some(e => /reservada/.test(e)));
  assert.deepEqual(erroresTipo({ id: 'v', ...nuevoTipo('viajes', 'e1') }), []);
  assert.deepEqual(erroresTipo({ id: 'l', ...nuevoTipo('libre', 'e1') }), []);
  assert.ok(erroresRegistro({ fecha: '2026-11-13', datos: {} }, tipo).length >= 3);
  assert.ok(erroresRegistro(reg('x', '2026-11-13', 'w', 'e', 'o', 10, 5), tipo).some(e => /menor/.test(e)));
  assert.deepEqual(erroresRegistro(reg('x', '2026-11-13', 'w', 'e', 'o', 5, 10), tipo), []);
  assert.equal(claveDe('Horas máquina 2'), 'horas_maquina_2');
});

import { volantes, elegiblesCorte, dsDeVolante } from '../src/operacion.js';
test('corte: elegibles, volantes con centro de costo y documento soporte', () => {
  const regs = [reg('a', '2026-11-14', 'waldy', 'bull', 'guac', 125.3, 131.3), reg('b', '2026-11-15', 'waldy', 'bull', 'guac', 131.3, 135.9), reg('c', '2026-11-16', 'waldy', 'bull', 'guac', 135.9, 140.3),
    reg('d', '2026-11-20', 'waldy', 'bull', 'guac', 164.5, 172.5, { datos: { soporte: 'Foto horómetro' } }), { ...reg('e', '2026-11-13', 'waldy', 'bull', 'guac', 117.5, 125.3), cierre_pago: 'ds1' }];
  assert.deepEqual(elegiblesCorte(regs, tipo, '2026-11-07', '2026-11-20').map(r => r.id), ['a', 'b', 'c']);
  assert.equal(elegiblesCorte(regs, tipo, '2026-11-07', '2026-11-20', true).length, 4);
  const elementos = [{ id: 'bull', centro_id: 'm1' }, { id: 'guac', centro_id: 'o1' }], centros = [{ id: 'm1', nivel: 1 }, { id: 'o1', nivel: 2 }];
  const [v] = volantes(regs.slice(0, 3), tipo, tarifas, { elementos, centros });
  assert.equal(v.lineas.length, 2);
  assert.deepEqual(v.lineas[0].cc, [{ cc1: 'm1', cc2: 'o1', pct: 100 }]);
  assert.equal(v.lineas[0].detalle, '15 h × $ 6.000');
  const { errores, compra } = dsDeVolante(v, { empresa_id: 'e1', fecha: '2026-11-20', periodo: '07 al 20 nov 2026', tipoNombre: 'Maquinaria', productos: [{ id: 'p', cuenta_costo: '73559501' }], cuentaDefecto: '', conCC: true });
  assert.ok(errores.length); // las tarifas del ejemplo no tienen ítem ni hay cuenta por defecto
  const ok = dsDeVolante(v, { empresa_id: 'e1', fecha: '2026-11-20', periodo: 'x', tipoNombre: 'Maquinaria', cuentaDefecto: '73559501', conCC: true });
  assert.deepEqual(ok.errores, []);
  assert.equal(ok.compra.lineas.reduce((s, l) => s + l.base, 0), v.total);
  assert.equal(ok.compra.lineas[1].cc[0].cc1, 'm1');
  assert.equal(compra.tipo, 'DS');
});
