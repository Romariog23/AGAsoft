import test from 'node:test';
import assert from 'node:assert/strict';
import { conVersion, versionador, inactiva, usosCuenta, trasladarLocal } from '../src/cuentas.js';
import { movimientos } from '../src/contab.js';
import { parametrosDe } from '../src/puc.js';
import { tarifasIva } from '../src/impuestos.js';

const fv = (id, creado_en, extra = {}) => ({ id, empresa_id: 'e', tipo: 'FV', estado: 'emitido', numero: id, fecha: '2026-11-01', tercero_id: 't', base: 100, iva: 19, total: 119, neto: 119, retefuente: 0, reteiva: 0, reteica: 0, creado_en, ...extra });
const item = (documento_id) => ({ documento_id, empresa_id: 'e', cantidad: 1, precio: 100, iva_pct: 19, cuenta: '41350101' });
const movsDe = (contab, documentos, extra = {}) => movimientos({ documentos, items: documentos.filter(d => d.tipo === 'FV').map(d => item(d.id)), aplicaciones: extra.aplicaciones || [], productos: [], comprobantes: [], compras: [], nominas: [], contab, param: parametrosDe(contab), tarifas: tarifasIva(contab), inventario: false });

test('cambiar la cuenta de clientes no cambia lo ya registrado', () => {
  const antes = {};
  const nuevo = conVersion(antes, { clientes: '13050502' }, '2026-11-20T00:00:00Z');
  assert.equal(nuevo.versiones_cta.length, 1);
  assert.equal(nuevo.versiones_cta[0].cfg.clientes, '13050501');
  const ms = movsDe(nuevo, [fv('1', '2026-11-10T00:00:00Z'), fv('2', '2026-11-21T00:00:00Z')]);
  assert.deepEqual(ms.filter(m => m.cuenta.startsWith('1305')).map(m => [m.doc_id, m.cuenta]), [['1', '13050501'], ['2', '13050502']]);
  // Sin cambios en lo que afecta los asientos no se crea versión.
  assert.equal(conVersion(nuevo, { ...nuevo, factura: { logo: 1 } }).versiones_cta.length, 1);
});

test('el recibo abona a la cuenta de clientes de la factura que paga', () => {
  const c = conVersion({}, { clientes: '13050502' }, '2026-11-20T00:00:00Z');
  const rc = { id: 'r', empresa_id: 'e', tipo: 'RC', estado: 'emitido', numero: 1, fecha: '2026-11-22', tercero_id: 't', total: 119, medio_pago: 'efectivo', anticipo: 0, creado_en: '2026-11-22T00:00:00Z' };
  const ms = movsDe(c, [fv('1', '2026-11-10T00:00:00Z'), rc], { aplicaciones: [{ recibo_id: 'r', factura_id: '1', valor: 119 }] });
  assert.equal(ms.find(m => m.doc_id === 'r' && m.credito).cuenta, '13050501');
});

test('versionador sin versiones usa la configuración actual', () => {
  const v = versionador({ clientes: '13050509' });
  assert.equal(v('2020-01-01').param.clientes, '13050509');
});

test('inactiva mira la cuenta y sus cuentas padre', () => {
  const idx = { 1305: { activa: false }, 13050501: {} };
  assert.equal(inactiva('13050501', idx), true);
  assert.equal(inactiva('11050501', idx), false);
});

test('usos de una cuenta en la configuración', () => {
  const u = usosCuenta('13050501', { contab: {}, productos: [{ nombre: 'P', cuenta_ingreso: '13050501' }] });
  assert.ok(u.some(x => x.startsWith('Parámetro')) && u.includes('Producto: P'));
});

test('trasladar en datos locales reescribe documentos y configuración', () => {
  const db = { empresas: [{ id: 'e', contabilidad: { clientes: '13050501', versiones_cta: [{ hasta: 'x', cfg: { clientes: '13050501' } }] } }],
    items: [{ empresa_id: 'e', cuenta: '13050501' }, { empresa_id: 'otra', cuenta: '13050501' }],
    comprobantes: [{ empresa_id: 'e', estado: 'contabilizado', lineas: [{ cuenta: '13050501', debito: 1 }, { cuenta: '11050501', credito: 1, detalle: '13050501' }] }],
    compras: [{ empresa_id: 'e', estado: 'anulado', lineas: [{ cuenta: '13050501' }] }] };
  const n = trasladarLocal(db, 'e', '13050501', '13050502');
  assert.equal(n, 2);
  assert.equal(db.items[0].cuenta, '13050502'); assert.equal(db.items[1].cuenta, '13050501');
  assert.equal(db.comprobantes[0].lineas[0].cuenta, '13050502');
  assert.equal(db.compras[0].lineas[0].cuenta, '13050501');
  assert.equal(db.empresas[0].contabilidad.clientes, '13050502');
  assert.equal(db.empresas[0].contabilidad.versiones_cta[0].cfg.clientes, '13050502');
});
