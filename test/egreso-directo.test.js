import test from 'node:test';
import assert from 'node:assert/strict';
import { asientoCompra, totalEgreso, erroresCompra } from '../src/compras.js';

test('egreso con pago directo a una cuenta', () => {
  const ce = { id: 'e1', tipo: 'CE', numero: 3, fecha: '2026-11-26', tercero_id: 't1', cuenta_pago: '11100501', aplicaciones: [], anticipo: 0,
    lineas: [{ cuenta: '51359501', descripcion: 'Aseo', base: 120000 }, { cuenta: '23359501', base: 30000 }] };
  assert.equal(totalEgreso(ce), 150000);
  const a = asientoCompra(ce, {});
  assert.deepEqual(a.map(m => [m.cuenta, m.debito, m.credito, m.tercero_id]), [['51359501', 120000, 0, 't1'], ['23359501', 30000, 0, 't1'], ['11100501', 0, 150000, 't1']]);
  const cuentas = ['51359501', '23359501', '11100501'].map(codigo => ({ codigo }));
  assert.deepEqual(erroresCompra(ce, cuentas), []);
  assert.ok(erroresCompra({ ...ce, lineas: [{ cuenta: '5135', base: 1 }] }, cuentas).some(e => /Pago directo 1/.test(e)));
  assert.equal(asientoCompra({ ...ce, observaciones: 'Pago aseo noviembre\nfactura en trámite' }, {}).at(-1).detalle, 'Pago aseo noviembre');
  // Las facturas de compra no suman sus líneas al total del egreso.
  assert.equal(totalEgreso({ tipo: 'FC', lineas: [{ base: 10 }] }), 0);
});

test('recibo de caja que abona un saldo inicial', async () => {
  const { asiento } = await import('../src/contab.js');
  const rc = { id: 'r1', tipo: 'RC', estado: 'emitido', prefijo: 'RC', numero: 1, fecha: '2026-11-26', tercero_id: 'c1', medio_pago: 'efectivo', cuenta_pago: '11050501', total: 200000, anticipo: 0,
    cruces: [{ cuenta: '13050501', cruce: '', valor: 200000, ref: 'Saldos iniciales 2' }] };
  const a = asiento(rc, {}, { aplicaciones: [], docs: [] });
  assert.deepEqual(a.map(m => [m.cuenta, m.debito, m.credito]), [['11050501', 200000, 0], ['13050501', 0, 200000]]);
  assert.equal(a[1].detalle, 'Abono Saldos iniciales 2');
  assert.equal(a[1].tercero_id, 'c1');
});
