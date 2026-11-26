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
    assert.equal(r.filas.length, PLANTILLAS[k].ejemplo.length, k);
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

test('terceros: persona natural con dos nombres y dos apellidos, jurídica con razón social', async () => {
  const { nombreTercero } = await import('../src/nombres.js');
  const r = prepararTerceros(filasDe('terceros', csvPlantilla('terceros')).filas, { ...ctx, terceros: [] });
  assert.deepEqual(r.errores, []);
  const [j, n] = r.terceros;
  assert.equal(j.tipo_persona, 'juridica'); assert.equal(j.nombre, 'Cliente Ejemplo S.A.S.'); assert.equal(j.razon_social, 'Cliente Ejemplo S.A.S.');
  assert.equal(n.tipo_persona, 'natural'); assert.equal(n.nombre, 'María José Pérez Gómez'); assert.equal(n.primer_apellido, 'Pérez'); assert.equal(n.razon_social, '');
  assert.ok(nombreTercero({ tipo_persona: 'Jurídica' }, '31').error);
  assert.ok(nombreTercero({ tipo_persona: 'Natural', primer_nombre: 'Ana' }, '13').error);
  assert.equal(nombreTercero({ razon_social: 'Pedro Ruiz' }, '13').nombre, 'Pedro Ruiz'); // plantilla vieja con el nombre en una casilla
  const c = prepararCompras(filasDe('compras', csvPlantilla('compras')).filas, ctx, totalesCompra);
  assert.equal(c.terceros.find(t => t.numero === '1045678901').nombre, 'María José Pérez Gómez');
});

test('plantilla de saldos iniciales', async () => {
  const { PLANTILLAS, leerFilas, prepararSaldos } = await import('../src/importar.js');
  const rows = [PLANTILLAS.saldos.cols.map(c => c[1]), ...PLANTILLAS.saldos.ejemplo, ['130505', '', '900123456-8', '', '', '', '', '', '', '', '', '', '(500)', ''], ['99999999', '', '900123456-8', '', '', '', '', '', '', '', '', '', '1', '']];
  const { filas } = leerFilas('saldos', rows);
  const r = prepararSaldos(filas, { cuentas: [{ codigo: '111005', naturaleza: 'D' }, { codigo: '11100501' }, { codigo: '310505', naturaleza: 'C' }, { codigo: '13050501' }], terceros: [{ numero: '900123456' }] });
  assert.equal(r.lineas.length, 4);
  assert.deepEqual(r.lineas[1], { cuenta: '13050501', tercero: '900123456', detalle: 'Factura pendiente', debito: 2500000, credito: 0, cruce: 'FE 1520', vence: '2027-01-31' });
  assert.deepEqual(r.lineas[3], { cuenta: '13050501', tercero: '900123456', detalle: 'Saldo inicial', debito: 0, credito: 500 });
  assert.equal(r.cuentasNuevas[0].codigo, '31050501');
  assert.equal(r.diferencia, -500);
  assert.equal(r.errores.length, 1);
  assert.deepEqual(r.faltantes, [{ cuenta: '99999999', nombre: '' }]);
  // La cuenta se toma de los dígitos del comienzo aunque el nombre tenga números.
  const r2 = prepararSaldos(leerFilas('saldos', [PLANTILLAS.saldos.cols.map(c => c[1]), ['11100501 Banco cuenta 123', '', '900123456-8', '', '', '', '', '', '', '', '', '', '1', '']]).filas, { cuentas: [{ codigo: '11100501' }], terceros: [{ numero: '900123456' }] });
  assert.equal(r2.lineas[0].cuenta, '11100501');
});
