import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANTILLAS, csvPlantilla, leerFilas, prepararTerceros, prepararVentas, prepararCompras, parseFecha, leerId } from '../src/importar.js';
import { totalesCompra } from '../src/compras.js';
import { planInicial } from '../src/puc.js';

const filasDe = (cual, txt) => leerFilas(cual, txt.replace(/^﻿/, '').split('\r\n').map(l => l.split(';').map(v => v.replace(/^"|"$/g, ''))));
const ctx = { terceros: [{ id: 't1', numero: '900123456', nombre: 'Cliente Ejemplo' }], documentos: [], cuentas: planInicial(), productos: [], compras: [] };

test('fechas e identificaciones', () => {
  assert.equal(parseFecha('05/10/2026'), '2026-10-05');
  assert.equal(parseFecha('2026-10-05'), '2026-10-05');
  assert.equal(parseFecha('31/02/2026'), '');
  assert.deepEqual(leerId('900123456-8'), { tipo_id: '31', numero: '900123456', dv: 8 });
  assert.equal(leerId('1045678901').tipo_id, '13');
  assert.ok(leerId('900123456-1').error);
});

test('las plantillas de ejemplo se leen completas', () => {
  for (const k of Object.keys(PLANTILLAS)) {
    const r = filasDe(k, csvPlantilla(k));
    assert.deepEqual(r.faltan, [], k);
    assert.equal(r.filas.length, 2, k);
  }
});

test('ventas: agrupa líneas por factura, crea el cliente que falta y no duplica', () => {
  const { filas } = filasDe('ventas', csvPlantilla('ventas'));
  const r = prepararVentas(filas, ctx);
  assert.deepEqual(r.errores, []);
  assert.equal(r.docs.length, 1);
  assert.equal(r.docs[0].items.length, 2);
  assert.equal(r.docs[0].doc.base, 1237000);
  assert.equal(r.docs[0].doc.forma_pago, 'credito');
  assert.equal(r.terceros.length, 0); // el cliente ya existe
  const r2 = prepararVentas(filas, { ...ctx, documentos: [{ tipo: 'FV', prefijo: 'FE', numero: 101 }] });
  assert.equal(r2.docs.length, 0); assert.match(r2.errores[0], /ya existe/);
});

test('compras: valida cuentas y crea proveedores nuevos', () => {
  const { filas } = filasDe('compras', csvPlantilla('compras'));
  const r = prepararCompras(filas, ctx, totalesCompra);
  assert.deepEqual(r.errores, []);
  assert.equal(r.docs.length, 2);
  assert.equal(r.terceros.length, 2);
  assert.equal(r.docs[0].compra.neto, 287500);
  const malo = prepararCompras([{ ...filas[0], cuenta: '5135' }], ctx, totalesCompra);
  assert.match(malo.errores[0], /auxiliar/);
});

test('terceros: nuevos y existentes', () => {
  const { filas } = filasDe('terceros', csvPlantilla('terceros'));
  const r = prepararTerceros(filas, ctx);
  assert.equal(r.terceros.length, 1); // el NIT 900123456 ya existe
  assert.equal(r.terceros[0].tipo_id, '13');
});
