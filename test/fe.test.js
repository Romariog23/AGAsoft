import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonFE, erroresFE, leerRespuestaFE, referenciaFE, contenidoQR, qrSvg } from '../src/fe.js';

const tercero = { id: 't1', tipo_id: '31', numero: '900123456', dv: 8, nombre: 'Cliente S.A.S.', correo: 'c@x.co', direccion: 'Cra 1 # 2-3', ciudad: 'Medellín', departamento: 'Antioquia', telefono: '300 123 4567', tipo_persona: 'juridica', responsable_iva: true };
const numeracion = { id: 'n1', resolucion: '18760000001', prefijo: 'FE' };
const fv = { id: 'd1', tipo: 'FV', estado: 'emitido', electronica: true, prefijo: 'FE', numero: 15, fecha: '2026-11-19', forma_pago: 'credito', vence: '2026-12-19', medio_pago: 'transferencia', observaciones: '' };
const items = [{ codigo: 'A1', descripcion: 'Asesoría', cantidad: 2, precio: 100000, descuento_pct: 10, iva_pct: 19 }, { codigo: 'B2', descripcion: 'Libro', cantidad: 1, precio: 50000, descuento_pct: 0, iva_pct: 0 }];

test('JSON de factura para Factus', () => {
  const b = jsonFE({ doc: fv, items, tercero, numeracion });
  assert.equal(b.reference_code, 'FV-FE15'); assert.equal(referenciaFE(fv), 'FV-FE15');
  assert.equal(b.document, '01'); assert.equal(b.operation_type, '10');
  assert.equal(b.customer.identification_document_code, '31'); assert.equal(b.customer.identification, '900123456'); assert.equal(b.customer.dv, '8');
  assert.equal(b.customer.legal_organization_code, '1'); assert.equal(b.customer.company, 'Cliente S.A.S.'); assert.equal(b.customer.names, undefined);
  assert.equal(b.customer.tribute_code, '01'); assert.equal(b.customer.phone, '3001234567');
  assert.deepEqual(b.customer._municipio, { ciudad: 'Medellín', departamento: 'Antioquia' });
  // Precio sin IVA y antes del descuento; Factus calcula 2 × 100.000 − 10 % + IVA. Total 264.200.
  assert.deepEqual(b.items[0], { code_reference: 'A1', name: 'Asesoría', quantity: '2', discount_rate: '10.00', price: '100000.00', unit_measure_code: '94', standard_code: '999', taxes: [{ code: '01', rate: '19.00' }] });
  assert.equal(b.items[1].taxes[0].rate, '0.00');
  assert.deepEqual(b.payment_details, [{ payment_form: '2', payment_method_code: '47', amount: '264200.00', due_date: '2026-12-19' }]);
  assert.equal(b.bill_number, undefined);
  // Persona natural: va en names.
  const nat = jsonFE({ doc: { ...fv, forma_pago: 'contado' }, items, tercero: { ...tercero, tipo_id: '13', tipo_persona: 'natural', nombre: 'Ana Ruiz', responsable_iva: false }, numeracion });
  assert.equal(nat.customer.names, 'Ana Ruiz'); assert.equal(nat.customer.legal_organization_code, '2'); assert.equal(nat.customer.tribute_code, 'ZZ'); assert.equal(nat.customer.dv, undefined);
  assert.equal(nat.payment_details[0].payment_form, '1'); assert.equal(nat.payment_details[0].due_date, undefined);
});

test('notas crédito y débito referencian el número de la factura en Factus', () => {
  const nc = { ...fv, id: 'd2', tipo: 'NC', numero: 3, prefijo: 'NC', ref_id: 'd1', concepto: '2', forma_pago: 'contado' };
  const b = jsonFE({ doc: nc, items, tercero, numeracion, ref: fv, numeroRef: 'SETP990000550' });
  assert.equal(b.reference_code, 'NC-NC3'); assert.equal(b.bill_number, 'SETP990000550'); assert.equal(b.correction_concept_code, '2'); assert.equal(b.customization_id, '20'); assert.equal(b.document, undefined);
  assert.equal(jsonFE({ doc: nc, items, tercero, numeracion, ref: fv }).bill_number, 'FE15');
  const nd = jsonFE({ doc: { ...nc, tipo: 'ND', concepto: '' }, items, tercero, numeracion, ref: fv });
  assert.equal(nd.correction_concept_code, '4'); assert.equal(nd.customization_id, '30');
  assert.match(erroresFE({ doc: nc, tercero, numeracion: { resolucion: '' }, ref: fv, cufeRef: '' }).join(' '), /todavía no tiene CUFE/);
  assert.doesNotMatch(erroresFE({ doc: nc, tercero, numeracion: { resolucion: '' }, ref: fv, cufeRef: 'x' }).join(' '), /resolución/);
});

test('validación previa y lectura de la respuesta de Factus', () => {
  assert.deepEqual(erroresFE({ doc: fv, tercero, numeracion }), []);
  const e = erroresFE({ doc: { ...fv, estado: 'borrador' }, tercero: { ...tercero, ciudad: '' }, numeracion: { resolucion: '' } }).join(' ');
  assert.match(e, /guarda el documento/); assert.match(e, /municipio/); assert.match(e, /resolución/);
  const ok = leerRespuestaFE({ status: 'Created', message: 'validado con éxito', data: { number: 'SETP990000550', cufe: 'cufe1', is_validated: true, errors: {}, links: { qr: 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=cufe1', public_url: 'https://x' } } });
  assert.equal(ok.aceptado, true); assert.equal(ok.cufe, 'cufe1'); assert.equal(ok.numero, 'SETP990000550'); assert.match(ok.qr, /searchqr/);
  const nc = leerRespuestaFE({ message: 'Documento con el código de referencia NC-NC1 registrado y validado con éxito', data: { credit_note: { number: 'NC1', cufe: 'cude1', is_validated: true, links: { qr: 'q' } }, errors: { CBF02: 'Notificación' } } });
  assert.equal(nc.aceptado, true); assert.equal(nc.cufe, 'cude1'); assert.equal(nc.numero, 'NC1');
  const r = leerRespuestaFE({ message: 'Error', data: { is_validated: false, errors: { FAJ44b: 'Regla FAJ44b rechazo' } } });
  assert.equal(r.aceptado, false); assert.deepEqual(r.errores, ['Regla FAJ44b rechazo']);
});

test('QR de la representación gráfica', () => {
  assert.equal(contenidoQR({ cufe: 'abc', ambiente: 'pruebas' }), 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=abc');
  assert.match(contenidoQR({ cufe: 'abc', ambiente: 'produccion' }), /^https:\/\/catalogo-vpfe\.dian/);
  const q = 'NumFac: FE15\nCUFE: abc\nQRCode: https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=abc';
  assert.equal(contenidoQR({ cufe: 'abc', respuesta: { qr: { qrDian: q } } }), q);
  const f = 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=abc';
  assert.equal(contenidoQR({ cufe: 'abc', respuesta: { data: { links: { qr: f } } } }), f);
  const svg = qrSvg('https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=abc');
  assert.match(svg, /^<svg/); assert.ok(svg.length > 1000);
});
