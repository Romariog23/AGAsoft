import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosDemo } from '../src/demo.js';
import { totales } from '../src/calc.js';

for (const hoy of ['2026-11-22', '2027-01-03', '2026-06-30']) {
  test(`demo del ${hoy}: comprobantes cuadrados, cuentas existentes y nada con fecha futura`, () => {
    const db = datosDemo(hoy);
    const ctas = new Set(db.cuentas.map(c => c.codigo));
    for (const c of db.comprobantes) {
      const d = c.lineas.reduce((s, l) => s + l.debito, 0), k = c.lineas.reduce((s, l) => s + l.credito, 0);
      assert.ok(Math.abs(d - k) < 0.01, `${c.tipo} ${c.numero} no cuadra`);
      for (const l of c.lineas) { assert.ok(ctas.has(l.cuenta), `falta la cuenta ${l.cuenta}`); assert.ok(l.tercero_id, 'toda línea lleva tercero'); }
    }
    for (const c of db.compras) for (const l of c.lineas) assert.ok(ctas.has(l.cuenta), `falta la cuenta ${l.cuenta}`);
    assert.equal([...db.documentos, ...db.compras, ...db.comprobantes, ...db.nominas].filter(x => x.fecha > hoy).length, 0);
    for (const d of db.documentos.filter(x => x.tipo === 'FV' || x.tipo === 'NC')) {
      const t = totales(db.items.filter(i => i.documento_id === d.id), d);
      assert.equal(t.neto, d.neto, 'el neto guardado es el calculado');
    }
    assert.ok(db.documentos.filter(d => d.tipo === 'FV').length >= 30);
    assert.ok(db.nominas.length >= 4);
  });
}
