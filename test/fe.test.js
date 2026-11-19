import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonFE, erroresFE, leerRespuestaFE, RUTA_FE, contenidoQR, qrSvg } from '../src/fe.js';

const tercero = { id: 't1', tipo_id: '31', numero: '900123456', dv: 8, nombre: 'Cliente S.A.S.', correo: 'c@x.co', direccion: 'Cra 1 # 2-3', ciudad: 'Medellín', departamento: 'Antioquia', telefono: '300 123 4567', tipo_persona: 'juridica', responsable_iva: true };
const numeracion = { id: 'n1', resolucion: '18760000001', prefijo: 'FE' };
const fv = { id: 'd1', tipo: 'FV', estado: 'emitido', electronica: true, prefijo: 'FE', numero: 15, fecha: '2026-11-19', forma_pago: 'credito', vence: '2026-12-19', medio_pago: 'transferencia', observaciones: '' };
const items = [{ codigo: 'A1', descripcion: 'Asesoría', cantidad: 2, precio: 100000, descuento_pct: 10, iva_pct: 19 }, { codigo: 'B2', descripcion: 'Libro', cantidad: 1, precio: 50000, descuento_pct: 0, iva_pct: 0 }];

test('JSON de factura para MATIAS', () => {
  const b = jsonFE({ doc: fv, items, tercero, numeracion, hora: '10:00:00' });
  assert.equal(b.type_document_id, 7); assert.equal(b.document_number, 15); assert.equal(b.prefix, 'FE'); assert.equal(b.resolution_number, '18760000001');
  assert.equal(b.customer.dni, '900123456'); assert.equal(b.customer.dv, '8'); assert.equal(b.customer.type_organization_id, 1); assert.equal(b.customer.mobile, '3001234567');
  assert.deepEqual(b.customer._dian, { identity_document: '31', city: 'Medellín', department: 'Antioquia' });
  // 2 × 100.000 − 10 % = 180.000 + IVA 34.200; libro 50.000 sin IVA.
  assert.equal(b.lines[0].line_extension_amount, '180000.00'); assert.equal(b.lines[0].allowance_charges[0].amount, '20000.00');
  assert.equal(b.lines[0].tax_totals[0].tax_amount, '34200.00');
  assert.equal(b.legal_monetary_totals.line_extension_amount, '230000.00'); assert.equal(b.legal_monetary_totals.payable_amount, '264200.00');
  assert.equal(b.tax_totals.length, 2);
  assert.deepEqual(b.payments[0], { payment_method_id: 2, means_payment_id: 47, value_paid: '264200.00', payment_due_date: '2026-12-19' });
  assert.equal(b.billing_reference, undefined); assert.equal(RUTA_FE.FV, '/invoice');
});

test('nota crédito referencia la factura con su CUFE', () => {
  const nc = { ...fv, id: 'd2', tipo: 'NC', numero: 3, prefijo: 'NC', ref_id: 'd1', concepto: '2', forma_pago: 'contado' };
  const b = jsonFE({ doc: nc, items, tercero, numeracion, ref: fv, cufeRef: 'abc123' });
  assert.equal(b.type_document_id, 5); assert.equal(b.billing_reference.number, 'FE15'); assert.equal(b.billing_reference.uuid, 'abc123');
  assert.equal(b.discrepancy_response.response_id, '2');
  assert.match(erroresFE({ doc: nc, tercero, numeracion, ref: fv, cufeRef: '' }).join(' '), /todavía no tiene CUFE/);
});

test('validación previa y lectura de la respuesta', () => {
  assert.deepEqual(erroresFE({ doc: fv, tercero, numeracion }), []);
  const e = erroresFE({ doc: { ...fv, estado: 'borrador' }, tercero: { ...tercero, ciudad: '' }, numeracion: { resolucion: '' } }).join(' ');
  assert.match(e, /emite/); assert.match(e, /municipio/); assert.match(e, /resolución/);
  assert.equal(leerRespuestaFE({ response: { IsValid: 'true', StatusCode: '00', XmlDocumentKey: 'cufe1' } }).aceptado, true);
  const r = leerRespuestaFE({ response: { IsValid: 'false', StatusCode: '99', ErrorMessage: { string: ['Regla FAD06 rechazo'] } } });
  assert.equal(r.aceptado, false); assert.deepEqual(r.errores, ['Regla FAD06 rechazo']);
});

test('QR de la representación gráfica', () => {
  assert.equal(contenidoQR({ cufe: 'abc', ambiente: 'pruebas' }), 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=abc');
  assert.match(contenidoQR({ cufe: 'abc', ambiente: 'produccion' }), /^https:\/\/catalogo-vpfe\.dian/);
  const q = 'NumFac: FE15\nCUFE: abc\nQRCode: https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=abc';
  assert.equal(contenidoQR({ cufe: 'abc', respuesta: { qr: { qrDian: q } } }), q);
  const svg = qrSvg('https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=abc');
  assert.match(svg, /^<svg/); assert.ok(svg.length > 1000);
});
