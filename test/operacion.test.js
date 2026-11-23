import test from 'node:test';
import assert from 'node:assert/strict';
import { compilar, evaluar, diaDe, nuevoTipo, calcular, resumen, avisos, tarifaPara, erroresTipo, erroresRegistro, ultimaLectura, claveDe, estaCerrado } from '../src/operacion.js';

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

import { facturables, cotizacionPara, itemsDeGrupo, erroresCotizacion } from '../src/operacion.js';
test('cobro: la cotización fija el precio por obra y equipo; sin cotización, la tarifa de cobro', () => {
  const cot = { id: 'q1', estado: 'aceptada', op_tipo_id: 'maq', tercero_id: 'strabag', criterios: { obra: 'guac' }, fecha: '2026-11-01',
    lineas: [{ descripcion: 'Hora bulldozer', criterios: { equipo: 'bull' }, precio: 150000, iva_pct: 19, producto_id: 'ph' }, { descripcion: 'Movilización', op: false, precio: 500000 }] };
  const regs = [reg('a', '2026-11-14', 'waldy', 'bull', 'guac', 125.3, 131.3), reg('b', '2026-11-15', 'waldy', 'bull', 'guac', 131.3, 135.9), reg('c', '2026-11-16', 'waldy', 'bull', 'guac', 135.9, 140.3),
    reg('x', '2026-11-16', 'jose', 'exc', 'guac', 1, 3), reg('j', '2026-11-13', 'jose', 'exc', 'fugon', 8301.8, 8312.5), reg('y', '2026-11-13', 'eliecer', 'vibro', 'otra', 1, 2), { ...reg('z', '2026-11-12', 'waldy', 'bull', 'guac', 117.5, 125.3), cierre_cobro: 'fv1' }];
  assert.equal(cotizacionPara(regs[0], [cot]).id, 'q1');
  assert.equal(cotizacionPara(regs[4], [cot]), null);
  const tarCobro = [...tarifas, { id: 'cj', tipo_id: 'maq', uso: 'cobro', criterios: { equipo: 'exc' }, modo: 'unidad', valor: 120000, producto_id: 'pe' }];
  const elementos = [{ id: 'fugon', tercero_id: 'cli2', centro_id: 'o2' }, { id: 'bull', centro_id: 'm1' }], centros = [{ id: 'm1', nivel: 1 }, { id: 'o2', nivel: 2 }];
  const { grupos, sinPrecio } = facturables(regs, tipo, { cotizaciones: [cot], tarifas: tarCobro, elementos, centros, productos: [{ id: 'pe', nombre: 'Hora excavadora', iva_pct: 19, codigo: 'HE' }] });
  const g = grupos.find(x => x.cotizacion?.id === 'q1');
  assert.equal(g.tercero_id, 'strabag'); assert.equal(g.lineas[0].cantidad, 15); assert.equal(g.lineas[0].valor, 2250000);
  assert.deepEqual(g.registros.map(r => r.id).sort(), ['a', 'b', 'c', 'x']); // el ya facturado no vuelve
  assert.deepEqual(g.lineas[0].cc, [{ cc1: 'm1', pct: 100 }]);
  // En la obra de la cotización, la excavadora no tiene línea pero sí tarifa de cobro: entra a la misma factura.
  assert.equal(g.lineas.length, 2); assert.equal(g.total, 2250000 + 240000);
  const t = grupos.find(x => x.tercero_id === 'cli2');
  assert.equal(t.cotizacion, null); assert.equal(t.lineas[0].cantidad, 10.7); assert.equal(t.lineas[0].descripcion, 'Hora excavadora'); assert.equal(t.total, 1284000);
  assert.equal(sinPrecio.length, 1); assert.equal(sinPrecio[0].registro.id, 'y'); assert.match(sinPrecio[0].motivo, /Sin cotización/);
  const items = itemsDeGrupo(t, { periodo: '1 al 15 nov', conCC: true });
  assert.equal(items[0].descripcion, 'Hora excavadora · 1 al 15 nov'); assert.equal(items[0].iva_pct, 19); assert.equal(items[0].cc[0].cc2, 'o2');
  assert.ok(erroresCotizacion({ lineas: [] }).length >= 3);
  assert.deepEqual(erroresCotizacion(cot), []);
});

import { porCerrar } from '../src/operacion.js';
test('horas por cerrar: falta pagar y falta facturar, cada lado por separado', () => {
  const t2 = { ...tipo, config: { ...tipo.config, salidas: { pago: 'ds', cobro: 'fv' } } };
  const cot = { id: 'q1', estado: 'abierta', op_tipo_id: 'maq', tercero_id: 'strabag', criterios: { obra: 'guac' }, lineas: [{ descripcion: 'Hora', precio: 100000, iva_pct: 19 }] };
  const regs = [{ ...reg('a', '2026-11-14', 'waldy', 'bull', 'guac', 125.3, 131.3), cierre_pago: 'ds1' }, { ...reg('b', '2026-11-15', 'waldy', 'bull', 'guac', 131.3, 135.9), cierre_cobro: 'fv1' },
    reg('c', '2026-11-16', 'waldy', 'bull', 'guac', 135.9, 140.3), reg('d', '2026-11-30', 'waldy', 'bull', 'guac', 140.3, 150)];
  const x = porCerrar(regs, t2, { hasta: '2026-11-20', tarifas, cotizaciones: [cot] });
  assert.equal(x.pago.registros, 2); assert.equal(x.pago.personas[0].cantidad, 9); // b y c (d es posterior)
  assert.equal(x.cobro.registros, 2); assert.equal(x.cobro.valor, 1040000); // a y c: 10,4 h × 100.000
  assert.equal(x.pagadoSinFacturar, 1); assert.equal(x.facturadoSinPagar, 1);
  const soloPago = porCerrar(regs, { ...tipo, config: { ...tipo.config, salidas: { pago: 'ds', cobro: 'ninguno' } } }, { tarifas });
  assert.equal(soloPago.conCobro, false); assert.equal(soloPago.cobro.registros, 0);
});

test('cargos sueltos en el volante y líneas de una sola vez en la factura', () => {
  const cargo = { id: 'k1', tipo_id: 'maq', clase: 'cargo', fecha: '2026-11-16', tercero_id: 'waldy', datos: { concepto: 'Transporte', valor: 40000, producto_id: 'pt' } };
  const regs = [reg('a', '2026-11-14', 'waldy', 'bull', 'guac', 125.3, 131.3), cargo];
  const [v] = volantes(regs, tipo, tarifas);
  const lc = v.lineas.find(l => l.cargo);
  assert.equal(lc.valor, 40000); assert.equal(lc.detalle, 'Transporte'); assert.equal(lc.producto_id, 'pt');
  assert.equal(v.total, 36000 + 40000); assert.equal(v.cantidad, 6); assert.equal(v.registros.length, 2);
  assert.deepEqual(avisos(regs, tipo, tarifas).filter(a => a.registro_id === 'k1'), []);
  assert.ok(erroresRegistro({ ...cargo, datos: { concepto: '', valor: 0 } }, tipo).length === 2);
  assert.deepEqual(erroresRegistro(cargo, tipo), []);
  const ds = dsDeVolante(v, { empresa_id: 'e1', fecha: '2026-11-20', periodo: 'x', tipoNombre: 'Maquinaria', cuentaDefecto: '73559501' });
  assert.ok(ds.compra.lineas.some(l => /Transporte/.test(l.descripcion) && l.base === 40000));
  const cot = { id: 'q1', estado: 'abierta', op_tipo_id: 'maq', tercero_id: 'strabag', criterios: {}, lineas: [{ descripcion: 'Hora', precio: 100000 }, { descripcion: 'Movilización', op: 'fijo', cantidad: 1, precio: 800000 }] };
  let { grupos } = facturables(regs, tipo, { cotizaciones: [cot] });
  assert.equal(grupos[0].registros.length, 1); // el cargo no se factura
  assert.equal(grupos[0].total, 600000 + 800000);
  ({ grupos } = facturables(regs, tipo, { cotizaciones: [{ ...cot, lineas: [cot.lineas[0], { ...cot.lineas[1], facturado: 'fv1' }] }] }));
  assert.equal(grupos[0].total, 600000);
});

test('pagadas en 0 o vacías: se paga la cantidad del horómetro', () => {
  const r = reg('h', '2026-11-20', 'antonio', 'mot140k', 'malambo', 1000, 1008);
  assert.equal(calcular({ ...r, cantidad_pagada: 0 }, tipo, tarifas).valor, 56000);
  assert.equal(calcular({ ...r, cantidad_pagada: '' }, tipo, tarifas).pagadas, 8);
  assert.equal(calcular({ ...r, cantidad_pagada: 7.5 }, tipo, tarifas).valor, 52500);
});

test('estaCerrado: abierto hasta hacer todos los cierres del tipo', () => {
  const ambos = { salidas: { pago: 'ds', cobro: 'fv' } };
  assert.equal(estaCerrado({ cierre_pago: 'x' }, ambos), false);
  assert.equal(estaCerrado({ cierre_pago: 'x', cierre_cobro: 'y' }, ambos), true);
  assert.equal(estaCerrado({ clase: 'cargo', cierre_pago: 'x' }, ambos), true);
  assert.equal(estaCerrado({ cierre_pago: 'x' }, { salidas: { pago: 'ds', cobro: 'ninguno' } }), true);
  assert.equal(estaCerrado({}, { salidas: { pago: 'ninguno', cobro: 'ninguno' } }, { estado: 'cerrado' }), true);
  assert.equal(estaCerrado({}, { salidas: { pago: 'ninguno', cobro: 'ninguno' } }, null), false);
});

test('ajuste al operador desde la cotización (proyecto): se suma a la tarifa base', async () => {
  const { calcular, nuevoTipo, ajustesDeCotizaciones } = await import('../src/operacion.js');
  const t = { id: 'T', ...nuevoTipo('maquinaria') }; t.config = { ...t.config, formulas: { cantidad: '8', valor: 'pagadas * tarifa' }, reglas: [] };
  const tar = [{ tipo_id: 'T', uso: 'pago', modo: 'unidad', valor: 7000, criterios: { tercero: 'ana' } },
    ...ajustesDeCotizaciones([{ id: 'c1', numero: 4, op_tipo_id: 'T', ajuste_op: 1000 }, { id: 'c2', numero: 5, op_tipo_id: 'T', ajuste_op: 0 }], 'T')];
  const enProy = calcular({ tipo_id: 'T', tercero_id: 'ana', fecha: '2026-11-20', cotizacion_id: 'c1', datos: {} }, t, tar);
  assert.equal(enProy.base, 56000); assert.equal(enProy.valor, 64000); assert.equal(enProy.recargos[0].nombre, 'Ajuste proyecto N.º 4');
  assert.equal(enProy.tarifa.valor, 7000);
  const otro = calcular({ tipo_id: 'T', tercero_id: 'ana', fecha: '2026-11-20', cotizacion_id: 'c2', datos: {} }, t, tar);
  assert.equal(otro.valor, 56000);
});

test('avance de la cotización y acumulado por máquina', async () => {
  const { avanceCotizacion, acumuladoMaquinas, nuevoTipo } = await import('../src/operacion.js');
  const t = { id: 'T', ...nuevoTipo('maquinaria') };
  const cot = { id: 'c1', op_tipo_id: 'T', estado: 'aceptada', criterios: { obra: 'o1' }, lineas: [{ descripcion: 'Hora máquina', cantidad: 12, op: true, criterios: {}, adiciones: [{ cantidad: 2 }] }, { descripcion: 'Movilización', cantidad: 1, op: 'fijo' }] };
  const reg = (id, fecha, ini, fin, eq = 'm1') => ({ id, tipo_id: 'T', fecha, tercero_id: 'a', cotizacion_id: 'c1', datos: { equipo: eq, obra: 'o1', horometro: { ini, fin } } });
  const regs = [reg('1', '2026-11-01', 1000, 1008), reg('2', '2026-11-02', 1008, 1014), reg('3', '2026-11-03', 1020, 1022)];
  const av = avanceCotizacion(cot, regs, t, [cot]);
  assert.equal(av[0].ejecutado, 16); assert.equal(av[0].saldo, -4); assert.equal(av[0].adicionado, 2); assert.equal(av[1].horas, false);
  const mq = acumuladoMaquinas(regs, t, { desde: '2026-11-02', hasta: '2026-11-30' });
  assert.equal(mq.length, 1); assert.equal(mq[0].ultimo, 1022); assert.equal(mq[0].total, 16); assert.equal(mq[0].periodo, 8); assert.equal(mq[0].saltos.length, 1); assert.equal(mq[0].saltos[0].dif, 6);
});
