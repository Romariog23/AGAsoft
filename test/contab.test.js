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
  productos: [{ id: 'p1', cuenta_ingreso: '41550101' }, { id: 'p2' }], param: {} };
const plan = planInicial();

test('asiento de factura', () => {
  const a = asiento(fv, { ...S, docs: S.documentos });
  assert.ok(cuadra(a));
  const c = Object.fromEntries(a.map(m => [m.cuenta, m]));
  assert.equal(c['13050501'].debito, t.neto); assert.equal(c['13551501'].debito, 44000); assert.equal(c['41550101'].credito, 1000000);
  assert.equal(c['41350101'].credito, 100000); assert.equal(c['24080101'].credito, 190000);
});
test('asiento de nota crédito y recibo', () => {
  const a = asiento(nc, { ...S, docs: S.documentos }); assert.ok(cuadra(a));
  assert.equal(a.find(m => m.cuenta === '41750101').debito, 50000); assert.ok(a.find(m => m.cuenta === '13050501').credito > 0);
  const r = asiento(rc, { ...S, docs: S.documentos }); assert.ok(cuadra(r));
  assert.equal(r.find(m => m.cuenta === '11100501').debito, 600000); assert.equal(r.find(m => m.cuenta === '28050501').credito, 100000);
});
test('balance, auxiliar y estados', () => {
  const ms = movimientos(S);
  assert.equal(ms.filter(m => m.doc_id === 'r2').length, 0);
  const b = balancePrueba(ms, plan, '2026-11-01', '2026-11-30');
  assert.equal(b.debitos, b.creditos);
  const c1 = b.filas.find(f => f.codigo === '1');
  const c13 = b.filas.find(f => f.codigo === '13050501');
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
  const prods = [{ id: 'p1', cuenta_ingreso: '41550101', cuenta_devolucion: '41750201' }];
  const ndIts = [{ id: 'd1', documento_id: 'nd1', cantidad: 1, precio: 10000, iva_pct: 0, producto_id: 'p1' }];
  const nd = { id: 'nd1', tipo: 'ND', estado: 'emitido', prefijo: 'ND', numero: 1, fecha: '2026-11-06', tercero_id: 't1', concepto: '1', ...totales(ndIts, {}) };
  const ncI = [{ id: 'c1', documento_id: 'nc2', cantidad: 1, precio: 20000, iva_pct: 19, producto_id: 'p1' }];
  const nc2 = { id: 'nc2', tipo: 'NC', estado: 'emitido', prefijo: 'NC', numero: 2, fecha: '2026-11-07', tercero_id: 't1', concepto: '1', ...totales(ncI, {}) };
  const ctx = { items: [...ndIts, ...ncI], productos: prods, param: {} };
  const a = asiento(nd, ctx); assert.ok(cuadra(a)); assert.equal(a.find(m => m.cuenta === '41550101').credito, 10000);
  const b = asiento(nc2, ctx); assert.ok(cuadra(b)); assert.equal(b.find(m => m.cuenta === '41750201').debito, 20000);
  assert.equal(b.find(m => m.cuenta === '24080101').debito, 3800);
  // Sin cuenta propia: la nota débito por intereses va a la de intereses de la empresa.
  const c = asiento(nd, { ...ctx, productos: [] }); assert.equal(c.find(m => m.cuenta === '42100501').credito, 10000);
});

test('comprobantes manuales: asiento, validación e informes', () => {
  const plan = planInicial();
  const si = { id: 'c1', tipo: 'SI', numero: 1, fecha: '2026-01-01', descripcion: 'Saldos iniciales', estado: 'contabilizado',
    lineas: [{ cuenta: '11100501', debito: 15000000, credito: 0, tercero_id: 't1' }, { cuenta: '31050501', debito: 0, credito: 15000000, tercero_id: 't1' }] };
  const a = asientoComprobante(si);
  assert.ok(cuadra(a)); assert.equal(a.length, 2); assert.equal(a[0].ref, 'SI 1'); assert.equal(a[1].tercero_id, 't1');
  assert.deepEqual(erroresComprobante(si, plan), []);
  assert.equal(asientoComprobante({ ...si, estado: 'anulado' }).length, 0);
  const malo = { ...si, lineas: [{ cuenta: '111005', debito: 10, credito: 0 }, { cuenta: '99999901', debito: 0, credito: 5 }, { cuenta: '31050501', debito: 1, credito: 1 }] };
  const e = erroresComprobante(malo, plan).join(' | ');
  assert.match(e, /no es auxiliar/); assert.match(e, /no existe/); assert.match(e, /Línea 1: falta el tercero/); assert.match(e, /no los dos/); assert.match(e, /No cuadra/);
  const ms = movimientos({ ...S, comprobantes: [si, { ...si, id: 'c2', numero: 2, estado: 'anulado' }] });
  assert.equal(ms.filter(m => m.origen === 'comp').length, 2);
  const b = balancePrueba(ms, plan, '2026-01-01', '2026-12-31');
  assert.equal(b.debitos, b.creditos);
  assert.equal(b.filas.find(f => f.codigo === '31050501').final, 15000000);
});

test('la cuenta escogida en la línea manda sobre la del producto', () => {
  const items = [{ ...its[0], cuenta: '41400501' }, { ...its[1], cuenta: ' ' }];
  const a = asiento(fv, { ...S, items, docs: S.documentos });
  assert.ok(cuadra(a));
  const c = Object.fromEntries(a.map(m => [m.cuenta, m]));
  assert.equal(c['41400501'].credito, 1000000); assert.equal(c['41550101'], undefined); assert.equal(c['41350101'].credito, 100000);
});

test('plan por niveles: auxiliares de 8 dígitos y parámetros', async () => {
  const { completarPlan, parametrosDe, a8 } = await import('../src/puc.js');
  const plan = planInicial(), cods = new Set(plan.map(c => c.codigo));
  for (const c of plan.filter(c => c.codigo.length === 6)) assert.ok(plan.some(x => x.codigo.length === 8 && x.codigo.startsWith(c.codigo)), c.codigo);
  for (const v of Object.values(parametrosDe({}))) assert.ok(cods.has(v) && v.length === 8, v);
  assert.equal(completarPlan(plan).length, 0);
  // Empresa vieja con subcuentas de 6 dígitos y parámetros guardados en 6 dígitos.
  const viejo = plan.filter(c => c.codigo.length <= 6);
  const faltan = completarPlan(viejo);
  assert.ok(faltan.some(c => c.codigo === '13050501'));
  assert.equal(parametrosDe({ clientes: '130505' }).clientes, '13050501');
  assert.equal(a8('3105'), '31050501');
});

test('compras: factura de proveedor, egreso y cuentas por pagar', async () => {
  const { totalesCompra, asientoCompra, cuentasPorPagar, erroresCompra } = await import('../src/compras.js');
  const plan = planInicial();
  const lineas = [{ cuenta: '51353501', descripcion: 'Internet', base: 1000000, iva_pct: 19 }];
  const ret = { retefuente_pct: 4, reteiva_pct: 15, reteica_milaje: 9.66 };
  const t = totalesCompra(lineas, ret);
  assert.equal(t.iva, 190000); assert.equal(t.retefuente, 40000); assert.equal(t.reteiva, 28500); assert.equal(t.reteica, 9660); assert.equal(t.neto, 1111840);
  const fc = { id: 'k1', tipo: 'FC', numero: 1, num_proveedor: 'FE-88', fecha: '2026-11-01', vence: '2026-11-10', tercero_id: 'p1', lineas, ...ret, ...t, estado: 'contabilizado' };
  const a = asientoCompra(fc, {});
  assert.ok(cuadra(a));
  const c = Object.fromEntries(a.map(m => [m.cuenta, m]));
  assert.equal(c['24080201'].debito, 190000); assert.equal(c['23650501'].credito, 40000); assert.equal(c['22050501'].credito, 1111840);
  const ce = { id: 'k2', tipo: 'CE', numero: 1, fecha: '2026-11-15', tercero_id: 'p1', cuenta_pago: '11100501', aplicaciones: [{ compra_id: 'k1', valor: 1000000 }], anticipo: 50000, estado: 'contabilizado' };
  const e = asientoCompra(ce, {}); assert.ok(cuadra(e));
  assert.equal(e.find(m => m.cuenta === '11100501').credito, 1050000); assert.equal(e.find(m => m.cuenta === '13300501').debito, 50000);
  const cxp = cuentasPorPagar([fc, ce, { ...ce, id: 'k3', estado: 'anulado' }], '2026-11-20');
  assert.equal(cxp[0].saldo, 111840); assert.equal(cxp[0].diasVencida, 10);
  assert.deepEqual(erroresCompra(fc, plan.concat([{ codigo: '51353501' }])), []);
  assert.match(erroresCompra({ ...fc, lineas: [{ cuenta: '5135', base: 0 }] }, plan).join(' '), /no es auxiliar/);
  const ms = movimientos({ ...S, compras: [fc, ce] });
  const b = balancePrueba(ms, plan, '2026-01-01', '2026-12-31'); assert.equal(b.debitos, b.creditos);
});

test('saldos por tercero', async () => {
  const { saldosPorTercero } = await import('../src/contab.js');
  const plan = planInicial();
  const ms = movimientos(S);
  const l = saldosPorTercero(ms, plan, '13050501', '2026-11-01', '2026-11-30');
  assert.equal(l.length, 1); assert.equal(l[0].tercero_id, 't1');
  const b = balancePrueba(ms, plan, '2026-11-01', '2026-11-30');
  assert.equal(l[0].final, b.filas.find(f => f.codigo === '13050501').final);
});

test('forma de pago de contado: la factura va a bancos y no a cartera', async () => {
  const { cartera } = await import('../src/calc.js');
  const fvc = { ...fv, cuenta_pago: '11100501' };
  const a = asiento(fvc, { ...S, docs: [fvc] });
  assert.ok(cuadra(a)); assert.equal(a.find(m => m.cuenta === '11100501').debito, t.neto); assert.ok(!a.some(m => m.cuenta === '13050501'));
  assert.equal(Object.keys(cartera([fvc], [], []) || {}).length, 0);
});
test('forma de pago de compra a un pasivo', async () => {
  const { asientoCompra, cuentasPorPagar } = await import('../src/compras.js');
  const fc = { id: 'c1', tipo: 'FC', numero: 1, num_proveedor: 'A1', fecha: '2026-11-18', tercero_id: 't', estado: 'emitido', lineas: [{ cuenta: '51350501', base: 100000, iva_pct: 19 }], cuenta_pago: '21050501' };
  const a = asientoCompra(fc, {}); assert.ok(cuadra(a)); assert.equal(a.find(m => m.cuenta === '21050501').credito, 119000);
  assert.equal(cuentasPorPagar([fc], '2026-11-18').length, 0);
});

test('auxiliar por rango de cuentas', async () => {
  const { auxiliarRango } = await import('../src/contab.js');
  const ms = movimientos({ ...S, docs: S.documentos });
  const r = auxiliarRango(ms, plan, '1', '1', null, '2026-12-31');
  assert.ok(r.secciones.length >= 2); assert.ok(r.secciones.every(x => x.cuenta.startsWith('1')));
  assert.deepEqual(auxiliarRango(ms, plan, '1305', '1305', null, '2026-12-31').secciones.map(x => x.cuenta), ['13050501']);
  const r2 = auxiliarRango(ms, plan, '1', '2', null, '2026-12-31');
  assert.ok(r2.secciones.some(x => x.cuenta.startsWith('2')) && !r2.secciones.some(x => x.cuenta.startsWith('4')));
});

test('recibo de caja con forma de pago configurada', () => {
  const r = asiento({ ...rc, cuenta_pago: '11200501' }, { ...S, docs: S.documentos });
  assert.ok(cuadra(r)); assert.equal(r.find(m => m.cuenta === '11200501').debito, 600000); assert.ok(!r.some(m => m.cuenta === '11100501'));
});

test('retención con concepto: cuenta propia y la nota crédito al contrario', () => {
  const ret = { retefuente: { concepto: 'x', nombre: 'Servicios', cuenta: '13551502', naturaleza: 'D' } };
  const a = asiento({ ...fv, retenciones: ret }, { ...S, docs: S.documentos });
  assert.ok(cuadra(a)); assert.equal(a.find(m => m.cuenta === '13551502').debito, t.retefuente);
  const n = asiento({ ...nc, retefuente_pct: 4, retefuente: 2000 }, { ...S, docs: [{ ...fv, retenciones: ret }] });
  assert.ok(n.find(m => m.cuenta === '13551502').credito > 0);
});
test('IVA con cuenta propia por tarifa', () => {
  const a = asiento(fv, { ...S, docs: S.documentos, tarifas: [{ tarifa: 19, cuenta_venta: '24080102' }] });
  assert.ok(cuadra(a)); assert.equal(a.find(m => m.cuenta === '24080102').credito, 190000);
});
test('cierre contable del año', async () => {
  const { cierreAnual } = await import('../src/contab.js');
  const ms = movimientos({ ...S, docs: S.documentos });
  const r = cierreAnual(ms, '2026', '36050501', '36100501', 'tEmp');
  assert.ok(r.lineas.every(l => l.tercero_id), 'todas las líneas del cierre llevan tercero');
  assert.equal(r.lineas.at(-1).tercero_id, 'tEmp');
  const d = r.lineas.reduce((s, l) => s + l.debito, 0), c = r.lineas.reduce((s, l) => s + l.credito, 0);
  assert.ok(Math.abs(d - c) < 0.001); assert.ok(r.resultado > 0);
  assert.equal(r.lineas.at(-1).cuenta, '36050501'); assert.equal(r.lineas.at(-1).credito, r.resultado);
  // Con el cierre, el año queda en cero.
  const ci = r.lineas.map(l => ({ ...l, fecha: r.fecha, tipo: 'CI' }));
  const tot = [...ms, ...ci].filter(m => /^[4-7]/.test(m.cuenta)).reduce((s, m) => s + m.debito - m.credito, 0);
  assert.ok(Math.abs(tot) < 0.001);
});
test('medios magnéticos: 1007 ingresos y 1008 saldos por tercero', async () => {
  const { formato } = await import('../src/exogena.js');
  const ms = movimientos({ ...S, docs: S.documentos });
  const f7 = formato('1007', ms, '2026');
  assert.ok(f7.some(f => f.tercero_id === 't1' && f.concepto === '4001' && f.ingreso > 0));
  const f8 = formato('1008', ms, '2026');
  assert.equal(f8.find(f => f.concepto === '1315').tercero_id, 't1');
});
test('medios magnéticos: reglas configuradas por la empresa', async () => {
  const { formato, reglasExogena, reglaDe } = await import('../src/exogena.js');
  const mv = (cuenta, debito, credito, tercero_id = 't9') => ({ cuenta, debito, credito, tercero_id, fecha: '2026-05-01', tipo: 'FC' });
  const ms = [mv('51101001', 1000, 0), mv('23651501', 0, 110), mv('51350501', 300, 0), mv('52100101', 50, 0)];
  // De fábrica: honorarios 5002 y la retención va al concepto principal del tercero.
  const f = formato('1001', ms, '2026');
  assert.deepEqual(f.map(x => [x.concepto, x.pago, x.retefuente || 0]), [['5002', 1000, 110], ['5004', 300, 0], ['5016', 50, 0]]);
  // La empresa manda 5210 a otro concepto (el prefijo más largo gana) y deja de reportar 5135.
  const reglas = [...reglasExogena(), { id: 'a', formato: '1001', cuenta: '5210', concepto: '5003', nombre: 'Comisiones', columna: 'pago' }, { id: 'b', formato: '1001', cuenta: '5135', concepto: '', columna: '' }];
  assert.equal(reglaDe(reglas, '1001', '52100101').concepto, '5003');
  assert.equal(reglaDe(reglas, '1001', '51350501'), null);
  const g = formato('1001', ms, '2026', reglas);
  assert.deepEqual(g.map(x => x.concepto), ['5002', '5003']);
});
test('medios magnéticos: cálculo débito, crédito, saldo o pago por regla', async () => {
  const { formato, reglasExogena } = await import('../src/exogena.js');
  const mv = (cuenta, debito, credito, fecha) => ({ cuenta, debito, credito, tercero_id: 't9', fecha, tipo: 'CC' });
  const ms = [mv('51101001', 1000, 0, '2026-03-01'), mv('51101001', 0, 200, '2026-04-01'), mv('51101001', 500, 0, '2025-06-01')];
  const con = calculo => formato('1001', ms, '2026', [...reglasExogena(), { id: 'z', formato: '1001', cuenta: '5110', concepto: '5002', columna: 'pago', calculo }])[0].pago;
  assert.equal(con('pago'), 800);
  assert.equal(con('debito'), 1000);
  assert.equal(con('credito'), 200);
  assert.equal(con('saldo'), 1300); // acumulado desde el inicio
});

test('la caja o banco del recibo lleva el tercero del recibo', () => {
  const ms = asiento(rc, { aplicaciones: [], docs: [], param: {} });
  assert.ok(ms.length && ms.every(m => m.tercero_id === 't1'));
});

test('resumen del panel: ingresos y gastos por mes, utilidad del año, cartera por edades', async () => {
  const { resumenMensual, carteraEdades } = await import('../src/contab.js');
  const ms = [
    { fecha: '2026-10-05', cuenta: '41350501', debito: 0, credito: 1000, tipo: 'FV' },
    { fecha: '2026-11-03', cuenta: '41350501', debito: 0, credito: 3000, tipo: 'FV' },
    { fecha: '2026-11-03', cuenta: '41750501', debito: 500, credito: 0, tipo: 'NC' },
    { fecha: '2026-11-10', cuenta: '51050601', debito: 800, credito: 0, tipo: 'NO' },
    { fecha: '2025-12-20', cuenta: '41350501', debito: 0, credito: 9000, tipo: 'FV' },
    { fecha: '2025-12-31', cuenta: '41350501', debito: 9000, credito: 0, tipo: 'CI' },
    { fecha: '2026-11-25', cuenta: '41350501', debito: 0, credito: 7000, tipo: 'FV' },
    { fecha: '2026-11-03', cuenta: '13050501', debito: 3000, credito: 0, tipo: 'FV' },
  ];
  const r = resumenMensual(ms, '2026-11-19', 12);
  assert.equal(r.meses.length, 12); assert.equal(r.meses[0], '2025-12'); assert.equal(r.meses.at(-1), '2026-11');
  assert.equal(r.ingresos.at(-1), 2500); assert.equal(r.gastos.at(-1), 800); assert.equal(r.ingresos.at(-2), 1000);
  assert.equal(r.ingresos[0], 9000, 'el cierre no resta');
  assert.equal(r.utilidad, 2700, 'solo el año de la fecha y hasta la fecha');
  const e = carteraEdades([{ saldo: 100, diasVencida: 0 }, { saldo: 50, diasVencida: 10 }, { saldo: 20, diasVencida: 45 }, { saldo: 5, diasVencida: 90 }, { saldo: 0, diasVencida: 90 }]);
  assert.deepEqual(e.map(x => x[1]), [100, 50, 20, 5]);
});
test('excedente de nota crédito y recibo sobre el saldo de cartera', async () => {
  const { cartera } = await import('../src/calc.js');
  const exc = 20000, nc2 = { ...nc, id: 'n1x', retenciones: { excedente: { cuenta: '42509501', valor: exc } } };
  const a = asiento(nc2, { ...S, items: [...S.items, ...ncIts.map(i => ({ ...i, documento_id: 'n1x' }))], docs: S.documentos }); assert.ok(cuadra(a));
  assert.equal(a.find(m => m.cuenta === '42509501').credito, exc);
  assert.equal(a.find(m => m.cuenta === '13050501').credito, Math.round((nc.neto - exc) * 100) / 100);
  // La cartera solo baja lo que no fue excedente.
  const base = cartera([fv], []).find(c => c.factura.id === 'f1').saldo;
  const con = cartera([fv, nc2], []).find(c => c.factura.id === 'f1').saldo;
  assert.equal(Math.round((base - con) * 100) / 100, Math.round((nc.neto - exc) * 100) / 100);
  const rc2 = { ...rc, id: 'r3', total: 650000, retenciones: { excedente: { cuenta: '42509501', valor: 50000 } } };
  const r = asiento(rc2, { ...S, aplicaciones: [{ recibo_id: 'r3', factura_id: 'f1', valor: 500000 }], docs: S.documentos }); assert.ok(cuadra(r));
  assert.equal(r.find(m => m.cuenta === '42509501').credito, 50000);
});
