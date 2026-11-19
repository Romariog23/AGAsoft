// Facturación electrónica con MATIAS API (UBL 2.1). Arma el JSON de factura, nota crédito y nota débito.
// Los catálogos de MATIAS usan ids propios: aquí se envían los códigos DIAN y los nombres en campos `_dian`
// y la función de Supabase (supabase/functions/fe-matias) los cambia por los ids de MATIAS antes de enviar.
import { r2, num, linea } from './calc.js';

const TIPO_DOC_FE = { FV: 7, NC: 5, ND: 4 };
const OPERACION_FE = { FV: 1, NC: 12, ND: 14 }; // 1 estándar; 12 y 14: nota que referencia una factura electrónica
const RUTA_FE = { FV: '/invoice', NC: '/notes/credit', ND: '/notes/debit' };
// Medios de pago DIAN: 10 efectivo, 47 transferencia, 42 consignación, 48 tarjeta crédito, 20 cheque.
const MEDIO_FE = { efectivo: 10, transferencia: 47, consignacion: 42, tarjeta: 48, cheque: 20 };
const dinero = v => r2(num(v)).toFixed(2);
const soloDigitos = v => String(v || '').replace(/\D/g, '');

// cufeRef: CUFE de la factura a la que se refiere una nota (de su envío aceptado).
function jsonFE({ doc, items, tercero, numeracion, ref, cufeRef, hora }) {
  const ls = (items || []).map(it => ({ it, l: linea(it) }));
  const porTarifa = {};
  for (const { it, l } of ls) { const k = num(it.iva_pct); porTarifa[k] = porTarifa[k] || { base: 0, iva: 0 }; porTarifa[k].base = r2(porTarifa[k].base + l.base); porTarifa[k].iva = r2(porTarifa[k].iva + l.iva); }
  const base = r2(ls.reduce((s, x) => s + x.l.base, 0)), iva = r2(ls.reduce((s, x) => s + x.l.iva, 0)), total = r2(base + iva);
  const juridica = (tercero.tipo_persona || (tercero.tipo_id === '31' ? 'juridica' : 'natural')) === 'juridica';
  const credito = doc.forma_pago === 'credito';
  const body = {
    resolution_number: String(numeracion?.resolucion || ''),
    prefix: doc.prefijo || numeracion?.prefijo || '',
    document_number: Number(doc.numero),
    date: doc.fecha,
    time: hora || '12:00:00',
    type_document_id: TIPO_DOC_FE[doc.tipo],
    operation_type_id: OPERACION_FE[doc.tipo],
    currency_id: 272, // COP
    graphic_representation: 1,
    send_email: tercero.correo ? 1 : 0,
    notes: String(doc.observaciones || '').slice(0, 500),
    customer: {
      company_name: tercero.nombre,
      dni: soloDigitos(tercero.numero) || String(tercero.numero),
      ...(tercero.tipo_id === '31' && tercero.dv != null ? { dv: String(tercero.dv) } : {}),
      email: tercero.correo || '',
      address: tercero.direccion || '',
      mobile: soloDigitos(tercero.telefono),
      type_organization_id: juridica ? 1 : 2,
      tax_regime_id: tercero.responsable_iva ? 1 : 2,
      tax_level_id: 5, // R-99-PN (no aplica)
      country_id: 45,
      _dian: { identity_document: tercero.tipo_id || '13', city: tercero.ciudad || '', department: tercero.departamento || '' },
    },
    lines: ls.map(({ it, l }) => ({
      code: it.codigo || 'SIN-COD',
      description: it.descripcion || it.codigo || 'Ítem',
      invoiced_quantity: String(num(it.cantidad)),
      base_quantity: String(num(it.cantidad)),
      price_amount: dinero(it.precio),
      line_extension_amount: dinero(l.base),
      quantity_units_id: '70', // 94 = unidad (DIAN); MATIAS: confirmar con el catálogo
      type_item_identifications_id: '4',
      reference_price_id: '1',
      free_of_charge_indicator: false,
      ...(l.descuento ? { allowance_charges: [{ charge_indicator: false, allowance_charge_reason: 'Descuento', amount: dinero(l.descuento), base_amount: dinero(l.bruto) }] } : {}),
      tax_totals: [{ tax_id: '1', tax_amount: dinero(l.iva), taxable_amount: dinero(l.base), percent: String(num(it.iva_pct)) }],
    })),
    tax_totals: Object.entries(porTarifa).map(([k, v]) => ({ tax_id: '1', tax_amount: dinero(v.iva), taxable_amount: dinero(v.base), percent: String(num(k)) })),
    legal_monetary_totals: { line_extension_amount: dinero(base), tax_exclusive_amount: dinero(base), tax_inclusive_amount: dinero(total), allowance_total_amount: '0.00', charge_total_amount: '0.00', payable_amount: dinero(total) },
    payments: [{ payment_method_id: credito ? 2 : 1, means_payment_id: MEDIO_FE[doc.medio_pago] || 10, value_paid: dinero(total), ...(credito && doc.vence ? { payment_due_date: doc.vence } : {}) }],
  };
  if (doc.tipo !== 'FV') {
    const numRef = `${ref?.prefijo || ''}${ref?.numero || ''}`;
    body.billing_reference = { number: numRef, date: ref?.fecha || '', uuid: cufeRef || '', scheme_name: 'CUFE-SHA384' };
    body.discrepancy_response = { reference_id: numRef, response_id: String(doc.concepto || (doc.tipo === 'NC' ? '1' : '4')) };
  }
  return body;
}

// Lo que falta para poder enviar el documento a la DIAN (lista vacía si está listo).
function erroresFE({ doc, tercero, numeracion, ref, cufeRef }) {
  const out = [];
  if (!TIPO_DOC_FE[doc.tipo]) out.push('Solo se envían facturas, notas crédito y notas débito.');
  if (!doc.electronica) out.push('El documento no es electrónico.');
  if (doc.estado !== 'emitido') out.push('Primero emite el documento.');
  if (!String(numeracion?.resolucion || '').trim()) out.push('La numeración no tiene número de resolución.');
  if (!tercero) out.push('El documento no tiene cliente.');
  else {
    if (!tercero.ciudad) out.push('Al cliente le falta el municipio.');
    if (!tercero.direccion) out.push('Al cliente le falta la dirección.');
  }
  if (doc.tipo !== 'FV') { if (!ref) out.push('La nota no tiene la factura de referencia.'); else if (!cufeRef) out.push('La factura de referencia todavía no tiene CUFE (envíala primero a la DIAN).'); }
  return out;
}

// Lee la respuesta de MATIAS: aceptado solo si IsValid es "true" y StatusCode "00" (un rechazo también llega con HTTP 200).
function leerRespuestaFE(r) {
  const res = r?.response || r?.ResponseDian || {};
  const valido = String(res.IsValid ?? r?.IsValid ?? '').toLowerCase() === 'true' && String(res.StatusCode ?? r?.StatusCode ?? '') === '00';
  const cufe = res.XmlDocumentKey || r?.XmlDocumentKey || r?.cufe || '';
  const errores = [].concat(res.ErrorMessage?.string || res.ErrorMessage || r?.errors || r?.message || []).flat().map(x => typeof x === 'string' ? x : JSON.stringify(x)).filter(Boolean);
  return { aceptado: valido, cufe, estado: valido ? 'aceptado' : 'rechazado', mensaje: res.StatusDescription || res.StatusMessage || r?.message || '', errores, pdf: r?.pdf?.url || r?.pdf?.path || '', uuid: r?.uuid || '' };
}

export { jsonFE, erroresFE, leerRespuestaFE, RUTA_FE, TIPO_DOC_FE };
