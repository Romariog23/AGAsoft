// Facturación electrónica con Factus (proveedor tecnológico autorizado por la DIAN). Arma el JSON de factura,
// nota crédito y nota débito con los códigos DIAN que usa Factus. La función de Supabase (supabase/functions/fe-factus)
// pone el código DANE del municipio (_municipio) y el rango de numeración antes de enviar.
import { codigoDian } from './unidades.js';
import { r2, num, linea } from './calc.js';
import qrcode from 'qrcode-generator';

const TIPOS_FE = ['FV', 'NC', 'ND'];
// Medios de pago DIAN: 10 efectivo, 47 transferencia, 42 consignación, 48 tarjeta crédito, 20 cheque.
const MEDIO_FE = { efectivo: '10', transferencia: '47', consignacion: '42', tarjeta: '48', cheque: '20' };
const dinero = v => r2(num(v)).toFixed(2);
const soloDigitos = v => String(v || '').replace(/\D/g, '');
// Referencia única del documento en Factus (la cuenta de Factus es de una sola empresa).
const referenciaFE = d => `${d.tipo}-${d.prefijo || ''}${d.numero}`;

// numeroRef: número con que Factus validó la factura a la que se refiere una nota.
function jsonFE({ doc, items, tercero, ref, numeroRef, unidades }) {
  const ls = (items || []).map(it => ({ it, l: linea(it) }));
  const total = r2(ls.reduce((s, x) => s + x.l.base + x.l.iva, 0));
  const juridica = (tercero.tipo_persona || (tercero.tipo_id === '31' ? 'juridica' : 'natural')) === 'juridica';
  const credito = doc.forma_pago === 'credito';
  const body = {
    reference_code: referenciaFE(doc),
    observation: String(doc.observaciones || '').slice(0, 250),
    payment_details: [{ payment_form: credito ? '2' : '1', payment_method_code: MEDIO_FE[doc.medio_pago] || '10', amount: dinero(total), ...(credito && doc.vence ? { due_date: doc.vence } : {}) }],
    customer: {
      identification_document_code: tercero.tipo_id || '13',
      identification: soloDigitos(tercero.numero) || String(tercero.numero),
      ...(tercero.tipo_id === '31' && tercero.dv != null && tercero.dv !== '' ? { dv: String(tercero.dv) } : {}),
      legal_organization_code: juridica ? '1' : '2',
      tribute_code: tercero.responsable_iva ? '01' : 'ZZ',
      ...(juridica ? { company: tercero.nombre } : { names: tercero.nombre }),
      address: tercero.direccion || '',
      email: tercero.correo || '',
      phone: soloDigitos(tercero.telefono),
      country_code: 'CO',
      _municipio: { ciudad: tercero.ciudad || '', departamento: tercero.departamento || '' },
    },
    items: ls.map(({ it }) => ({
      code_reference: it.codigo || 'SIN-COD',
      name: it.descripcion || it.codigo || 'Ítem',
      quantity: String(num(it.cantidad)),
      discount_rate: num(it.descuento_pct).toFixed(2),
      price: dinero(it.precio), // sin IVA y antes del descuento
      unit_measure_code: codigoDian(unidades, it.unidad), // código DIAN de la unidad de medida (94 = unidad)
      standard_code: '999', // estándar de adopción del contribuyente
      taxes: [{ code: '01', rate: num(it.iva_pct).toFixed(2) }],
    })),
  };
  if (doc.tipo === 'FV') Object.assign(body, { document: '01', operation_type: '10' });
  else {
    body.bill_number = numeroRef || `${ref?.prefijo || ''}${ref?.numero || ''}`;
    body.correction_concept_code = String(doc.concepto || (doc.tipo === 'NC' ? '2' : '4'));
    body.customization_id = doc.tipo === 'NC' ? '20' : '30';
  }
  return body;
}

// Lo que falta para poder enviar el documento a la DIAN (lista vacía si está listo).
function erroresFE({ doc, tercero, numeracion, ref, cufeRef }) {
  const out = [];
  if (!TIPOS_FE.includes(doc.tipo)) out.push('Solo se envían facturas, notas crédito y notas débito.');
  if (!doc.electronica) out.push('El documento no es electrónico.');
  if (doc.estado !== 'emitido') out.push('Primero guarda el documento.');
  if (doc.tipo === 'FV' && !String(numeracion?.resolucion || '').trim()) out.push('La numeración no tiene número de resolución.');
  if (!tercero) out.push('El documento no tiene cliente.');
  else {
    if (!tercero.ciudad) out.push('Al cliente le falta el municipio.');
    if (!tercero.direccion) out.push('Al cliente le falta la dirección.');
  }
  if (doc.tipo !== 'FV') { if (!ref) out.push('La nota no tiene la factura de referencia.'); else if (!cufeRef) out.push('La factura de referencia todavía no tiene CUFE (envíala primero a la DIAN).'); }
  return out;
}

// Lee la respuesta de Factus (en data o dentro de data.credit_note / debit_note / bill): aceptado solo si viene validado y con CUFE.
function leerRespuestaFE(r) {
  const d0 = r?.data || {}, de = [d0.credit_note, d0.debit_note, d0.bill].find(v => v && typeof v === 'object') || {};
  const d = { ...d0, ...de, links: { ...(d0.links || {}), ...(de.links || {}) } };
  const valido = (de.is_validated === true || d0.is_validated === true) && !!d.cufe;
  const errores = [];
  const add = x => { if (x == null) return; if (Array.isArray(x)) x.forEach(add); else if (typeof x === 'object') Object.values(x).forEach(add); else errores.push(String(x)); };
  add(d.errors); add(r?.errors);
  return { aceptado: valido, cufe: d.cufe || '', numero: d.number || '', estado: valido ? 'aceptado' : 'rechazado', mensaje: r?.message || '', errores, qr: d.links?.qr || '', url: d.links?.public_url || '' };
}

// Contenido del QR de la representación gráfica: el enlace de la DIAN que devuelve Factus o, si no viene, la consulta del CUFE.
function contenidoQR(envio) {
  const q = envio?.respuesta?.data?.links?.qr || envio?.respuesta?.qr?.qrDian || '';
  if (typeof q === 'string' && q.length > 20 && !q.includes('omitidos')) return q;
  const host = envio?.ambiente === 'produccion' ? 'catalogo-vpfe.dian.gov.co' : 'catalogo-vpfe-hab.dian.gov.co';
  return `https://${host}/document/searchqr?documentkey=${envio?.cufe || ''}`;
}
// QR como SVG (sin dependencias de red): sirve en pantalla y al imprimir.
function qrSvg(texto, tam = 132) {
  const q = qrcode(0, 'M'); q.addData(texto); q.make();
  const n = q.getModuleCount(), m = 2, k = n + m * 2; let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${k} ${k}" width="${tam}" height="${tam}" shape-rendering="crispEdges" role="img" aria-label="Código QR de la DIAN"><rect width="${k}" height="${k}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export { contenidoQR, qrSvg, jsonFE, erroresFE, leerRespuestaFE, referenciaFE, TIPOS_FE };
