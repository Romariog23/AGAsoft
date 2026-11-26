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
