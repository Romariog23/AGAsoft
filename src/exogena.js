// Medios magnéticos (información exógena DIAN): formatos que salen de la contabilidad por tercero.
// Funciones puras. Los conceptos se asignan por cuenta del PUC; el contador debe revisarlos en el prevalidador de la DIAN.
import { r2 } from './calc.js';

// Concepto de cada formato según la cuenta (el primer prefijo que coincida).
const CONCEPTOS = {
  1001: [['5105', '5001', 'Salarios y demás pagos laborales'], ['5110', '5002', 'Honorarios'], ['5115', '5016', 'Impuestos'], ['5120', '5005', 'Arrendamientos'],
    ['5125', '5016', 'Contribuciones y afiliaciones'], ['5130', '5016', 'Seguros'], ['5135', '5004', 'Servicios'], ['5140', '5016', 'Gastos legales'], ['5145', '5016', 'Mantenimiento'],
    ['5305', '5006', 'Intereses (financieros)'], ['14', '5007', 'Compra de activos movibles (inventarios)'], ['15', '5008', 'Compra de activos fijos'],
    ['6', '5007', 'Costos de venta'], ['7', '5007', 'Costos de producción'], ['5', '5016', 'Demás costos y deducciones']],
  1007: [['4210', '4003', 'Intereses y rendimientos financieros'], ['41', '4001', 'Ingresos brutos de actividades ordinarias'], ['42', '4002', 'Otros ingresos brutos']],
  1008: [['1305', '1315', 'Clientes'], ['1310', '1316', 'Cuentas corrientes comerciales'], ['13', '1318', 'Otras cuentas por cobrar']],
  1009: [['2205', '2201', 'Proveedores'], ['21', '2203', 'Obligaciones financieras'], ['2', '2206', 'Otras cuentas por pagar']],
};
const concepto = (formato, cuenta) => (CONCEPTOS[formato].find(([p]) => cuenta.startsWith(p)) || [])[1] || '';
const NOMBRE_CONCEPTO = Object.fromEntries(Object.values(CONCEPTOS).flat().map(([, c, n]) => [c, n]));

export const FORMATOS = {
  1001: { nombre: 'Pagos o abonos en cuenta y retenciones practicadas', valores: [['pago', 'Pago o abono en cuenta'], ['retefuente', 'Retención en la fuente practicada'], ['reteiva', 'Retención de IVA practicada']] },
  1005: { nombre: 'IVA descontable', valores: [['iva', 'Impuesto descontable']] },
  1006: { nombre: 'IVA generado', valores: [['iva', 'Impuesto generado']] },
  1007: { nombre: 'Ingresos recibidos', valores: [['ingreso', 'Ingresos brutos recibidos'], ['devolucion', 'Devoluciones, rebajas y descuentos']] },
  1008: { nombre: 'Saldos de cuentas por cobrar al 31 de diciembre', valores: [['saldo', 'Saldo de la cuenta por cobrar']] },
  1009: { nombre: 'Saldos de cuentas por pagar al 31 de diciembre', valores: [['saldo', 'Saldo de la cuenta por pagar']] },
};
const RET_PRACTICADAS = /^(2365|2367|2368|24)/; // no van en el 1009: se declaran en sus formularios

// Filas de un formato para el año, por tercero (y concepto cuando el formato lo usa).
export function formato(cod, movs, anio) {
  const ini = `${anio}-01-01`, fin = `${anio}-12-31`, filas = {};
  const del = movs.filter(m => m.tipo !== 'CI' && m.fecha >= ini && m.fecha <= fin && m.tercero_id);
  const sumar = (tercero, conc, k, v) => { if (!v) return; const key = `${tercero}|${conc}`; const f = filas[key] || (filas[key] = { tercero_id: tercero, concepto: conc }); f[k] = r2((f[k] || 0) + v); };
  if (cod === '1001') {
    for (const m of del) if (/^(14|15|5|6|7)/.test(m.cuenta)) sumar(m.tercero_id, concepto(1001, m.cuenta), 'pago', m.debito - m.credito);
    // Retenciones practicadas: al concepto con el mayor pago de ese tercero.
    const principal = t => Object.values(filas).filter(f => f.tercero_id === t).sort((a, b) => (b.pago || 0) - (a.pago || 0))[0]?.concepto || '5016';
    for (const m of del) {
      if (m.cuenta.startsWith('2365')) sumar(m.tercero_id, principal(m.tercero_id), 'retefuente', m.credito - m.debito);
      if (m.cuenta.startsWith('2367')) sumar(m.tercero_id, principal(m.tercero_id), 'reteiva', m.credito - m.debito);
    }
  } else if (cod === '1005') {
    for (const m of del) if (m.cuenta.startsWith('240802')) sumar(m.tercero_id, '', 'iva', m.debito - m.credito);
  } else if (cod === '1006') {
    for (const m of del) if (m.cuenta.startsWith('240801')) sumar(m.tercero_id, '', 'iva', m.credito - m.debito);
  } else if (cod === '1007') {
    for (const m of del) if (/^4/.test(m.cuenta)) {
      if (m.cuenta.startsWith('4175')) sumar(m.tercero_id, '4001', 'devolucion', m.debito - m.credito);
      else sumar(m.tercero_id, concepto(1007, m.cuenta), 'ingreso', m.credito - m.debito);
    }
  } else if (cod === '1008' || cod === '1009') {
    // Saldos acumulados al 31 de diciembre (desde el inicio, no solo el año).
    const hasta = movs.filter(m => m.tipo !== 'CI' && m.fecha <= fin && m.tercero_id);
    for (const m of hasta) {
      if (cod === '1008' && /^13/.test(m.cuenta) && !m.cuenta.startsWith('1355')) sumar(m.tercero_id, concepto(1008, m.cuenta), 'saldo', m.debito - m.credito);
      if (cod === '1009' && /^2[1-8]/.test(m.cuenta) && !RET_PRACTICADAS.test(m.cuenta)) sumar(m.tercero_id, concepto(1009, m.cuenta), 'saldo', m.credito - m.debito);
    }
  }
  return Object.values(filas).filter(f => FORMATOS[cod].valores.some(([k]) => Math.abs(f[k] || 0) >= 0.5))
    .map(f => ({ ...f, nombre_concepto: NOMBRE_CONCEPTO[f.concepto] || '' }))
    .sort((a, b) => a.concepto.localeCompare(b.concepto) || a.tercero_id.localeCompare(b.tercero_id));
}

const TIPO_DOC = { 31: '31', 13: '13', 22: '22', 41: '41', 12: '12', 42: '42', 47: '47', 48: '48' };
// CSV del formato con las columnas de identificación que pide la DIAN (abre en Excel).
export function csvFormato(cod, filas, terceros) {
  const t = Object.fromEntries((terceros || []).map(x => [x.id, x]));
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const conConcepto = ['1001', '1007', '1008', '1009'].includes(cod);
  const head = [...(conConcepto ? ['Concepto'] : []), 'Tipo de documento', 'Número de identificación', 'DV', 'Primer apellido', 'Segundo apellido', 'Primer nombre', 'Otros nombres', 'Razón social', 'Dirección', 'Departamento', 'Municipio', 'País', ...FORMATOS[cod].valores.map(([, n]) => n)];
  const rows = filas.map(f => {
    const x = t[f.tercero_id] || {}, nat = x.tipo_persona === 'natural' || (!x.tipo_persona && x.tipo_id !== '31');
    return [...(conConcepto ? [f.concepto] : []), TIPO_DOC[x.tipo_id] || x.tipo_id || '', x.numero || '', x.dv ?? '',
      nat ? x.primer_apellido || '' : '', nat ? x.segundo_apellido || '' : '', nat ? x.primer_nombre || '' : '', nat ? x.segundo_nombre || '' : '',
      nat ? (x.primer_nombre || x.primer_apellido ? '' : x.nombre || '') : x.razon_social || x.nombre || '',
      x.direccion || '', x.departamento || '', x.ciudad || '', '169', ...FORMATOS[cod].valores.map(([k]) => Math.round(f[k] || 0))];
  });
  return '﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
}
