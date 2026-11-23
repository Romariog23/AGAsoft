// Facturación electrónica con Factus (proveedor tecnológico autorizado por la DIAN). Arma el JSON de factura,
// nota crédito y nota débito con los códigos DIAN que usa Factus. La función de Supabase (supabase/functions/fe-factus)
// pone el código DANE del municipio (_municipio) y el rango de numeración antes de enviar.
import { codigoDian } from './unidades.js';
import { r2, num, linea, dvOf } from './calc.js';
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

/* ---------- Documento soporte (DS) y nota de ajuste (NA) ---------- */
const referenciaDS = c => `${c.tipo}-${c.numero}`;
// Medio de pago del documento soporte: a crédito sin cuenta; de contado según la cuenta (caja = efectivo, si no transferencia).
const medioDS = cuenta => /^1105/.test(String(cuenta || '')) ? '10' : '47';
const EXTRANJEROS = ['21', '22', '41', '42', '47', '50'];
function provDoc(t) {
  const numero = soloDigitos(t.numero) || String(t.numero || '');
  if (EXTRANJEROS.includes(String(t.tipo_id))) return { identification_document_code: String(t.tipo_id), identification: String(t.numero || '').replace(/[^A-Za-z0-9]/g, '') };
  const dv = t.tipo_id === '31' && t.dv != null && t.dv !== '' ? String(t.dv) : String(dvOf(numero));
  return { identification_document_code: '31', identification: numero, dv };
}
// c: la compra (DS o NA) con sus totales; tercero: el proveedor; productos y unidades para código y unidad de cada línea.
// numeroRef: número con que la DIAN validó el documento soporte que ajusta la nota.
function jsonDS({ c, tercero, productos, unidades, nomCuenta, numeroRef }) {
  const prods = Object.fromEntries((productos || []).map(p => [p.id, p]));
  const juridica = (tercero.tipo_persona || (tercero.tipo_id === '31' ? 'juridica' : 'natural')) === 'juridica';
  const contado = !!String(c.cuenta_pago || '').trim();
  const total = r2((c.lineas || []).reduce((s, l) => s + r2(num(l.base)) + r2(r2(num(l.base)) * num(l.iva_pct) / 100), 0));
  const ret = [];
  if (num(c.retefuente_pct)) ret.push({ code: '06', rate: num(c.retefuente_pct).toFixed(2) });
  if (num(c.reteiva_pct)) ret.push({ code: '05', rate: num(c.reteiva_pct).toFixed(2) });
  if (num(c.reteica_milaje)) ret.push({ code: '07', rate: (num(c.reteica_milaje) / 10).toFixed(2) });
  const body = {
    reference_code: referenciaDS(c),
    observation: String(c.observaciones || '').slice(0, 500),
    payment_details: [{ payment_form: contado ? '1' : '2', payment_method_code: contado ? medioDS(c.cuenta_pago) : '10', amount: dinero(total), ...(!contado ? { due_date: c.vence || c.fecha } : {}) }],
    // La DIAN exige que el proveedor residente en Colombia vaya con NIT: la persona natural con cédula usa
    // su número como NIT con su dígito de verificación. Los extranjeros conservan su documento.
    provider: {
      ...provDoc(tercero),
      legal_organization_code: juridica ? '1' : '2',
      names: tercero.nombre,
      ...(juridica ? { company: tercero.nombre } : {}),
      address: tercero.direccion || '',
      country_code: 'CO',
      email: tercero.correo || '',
      phone: soloDigitos(tercero.telefono),
      _municipio: { ciudad: tercero.ciudad || '', departamento: tercero.departamento || '' },
    },
    items: (c.lineas || []).map(l => {
      const p = l.producto_id ? prods[l.producto_id] : null, base = r2(num(l.base));
      // Con cantidad y costo (producto o línea por cuenta con costo unitario) van tal cual; si no, una unidad por el valor.
      const q = num(l.cantidad) && num(l.costo) ? num(l.cantidad) : 1, precio = q === 1 ? base : num(l.costo);
      return {
        code_reference: p?.codigo || l.cuenta || 'SIN-COD',
        name: String(l.descripcion || p?.nombre || nomCuenta?.(l.cuenta) || 'Ítem').slice(0, 300),
        quantity: q.toFixed(2),
        discount_rate: '0.00',
        price: dinero(precio),
        unit_measure_code: codigoDian(unidades, p?.unidad || 'UND'),
        standard_code: '999',
        ...(ret.length ? { withholding_taxes: ret } : {}),
        taxes: [{ code: '01', rate: num(l.iva_pct).toFixed(2) }],
        ...(c.tipo === 'DS' ? { period: { generation_mode: '1', start_date: c.fecha } } : {}),
      };
    }),
  };
  if (c.tipo === 'NA') Object.assign(body, { support_document_number: numeroRef || '', correction_concept_code: String(c.concepto || '5') });
  return body;
}
// Lo que falta para enviar un documento soporte o nota de ajuste.
function erroresDS({ c, tercero, ref, numeroRef }) {
  const out = [];
  if (!['DS', 'NA'].includes(c.tipo)) out.push('Solo se envían documentos soporte y notas de ajuste.');
  if (!c.electronica) out.push('El documento no es electrónico.');
  if (c.estado === 'anulado') out.push('El documento está anulado.');
  if (!tercero) out.push('El documento no tiene proveedor.');
  else {
    if (!tercero.ciudad) out.push('Al proveedor le falta el municipio.');
    if (!tercero.direccion) out.push('Al proveedor le falta la dirección.');
  }
  if ((c.lineas || []).some(l => num(l.cantidad) && num(l.costo) && Math.abs(r2(num(l.cantidad) * num(l.costo)) - r2(num(l.base))) > 0.01)) out.push('Hay una línea cuyo valor no es cantidad × costo unitario.');
  if (c.tipo === 'NA') { if (!ref) out.push('La nota no tiene el documento soporte que ajusta.'); else if (!numeroRef) out.push('El documento soporte todavía no está validado por la DIAN (envíalo primero).'); }
  return out;
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
  const d0 = r?.data || {}, de = [d0.credit_note, d0.debit_note, d0.bill, d0.support_document, d0.adjustment_note].find(v => v && typeof v === 'object') || {};
  const d = { ...d0, ...de, links: { ...(d0.links || {}), ...(de.links || {}) } };
  d.cufe = d.cufe || d.cude || d.cuds || d.cune || '';
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

export { jsonDS, erroresDS, referenciaDS, contenidoQR, qrSvg, jsonFE, erroresFE, leerRespuestaFE, referenciaFE, TIPOS_FE };
