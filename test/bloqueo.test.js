import test from 'node:test';
import assert from 'node:assert/strict';
import { revisarBloqueo, hastaAlBloquear, hastaAlDesbloquear } from '../src/bloqueo.js';

test('bloqueo de periodos', () => {
  const h = '2026-10-31';
  assert.throws(() => revisarBloqueo('compras', null, { fecha: '2026-10-15' }, h), /bloqueado hasta el 31\/10\/2026/);
  assert.throws(() => revisarBloqueo('documentos', { fecha: '2026-10-15', estado: 'emitido' }, { fecha: '2026-11-02', estado: 'emitido' }, h));
  assert.doesNotThrow(() => revisarBloqueo('documentos', null, { fecha: '2026-10-15', estado: 'borrador' }, h));
  assert.doesNotThrow(() => revisarBloqueo('compras', null, { fecha: '2026-11-01' }, h));
  assert.doesNotThrow(() => revisarBloqueo('terceros', null, { fecha: '2020-01-01' }, h));
  assert.doesNotThrow(() => revisarBloqueo('compras', null, { fecha: '2020-01-01' }, null));
  assert.equal(hastaAlBloquear('2026-02'), '2026-02-28');
  assert.equal(hastaAlDesbloquear('2026-03'), '2026-02-28');
  assert.equal(hastaAlDesbloquear('2026-01'), '2025-12-31');
});
