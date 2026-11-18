// Medios magnéticos (información exógena DIAN): formatos que salen de la contabilidad por tercero.
// Funciones puras. Cada empresa parametriza qué cuenta va a qué formato, concepto y columna
// (se guarda en empresas.contabilidad.exogena); si no ha configurado, se usan las reglas de fábrica.
import { r2 } from './calc.js';

// signo D = débitos menos créditos; C = créditos menos débitos. saldo = los formatos de saldos (cálculo por defecto).
export const FORMATOS = {
  1001: { nombre: 'Pagos o abonos en cuenta y retenciones practicadas', concepto: true, valores: [['pago', 'Pago o abono en cuenta', 'D'], ['retefuente', 'Retención en la fuente practicada', 'C'], ['reteiva', 'Retención de IVA practicada', 'C']] },
  1005: { nombre: 'IVA descontable', concepto: false, valores: [['iva', 'Impuesto descontable', 'D']] },
  1006: { nombre: 'IVA generado', concepto: false, valores: [['iva', 'Impuesto generado', 'C']] },
  1007: { nombre: 'Ingresos recibidos', concepto: true, valores: [['ingreso', 'Ingresos brutos recibidos', 'C'], ['devolucion', 'Devoluciones, rebajas y descuentos', 'D']] },
  1008: { nombre: 'Saldos de cuentas por cobrar al 31 de diciembre', concepto: true, saldo: true, valores: [['saldo', 'Saldo de la cuenta por cobrar', 'D']] },
  1009: { nombre: 'Saldos de cuentas por pagar al 31 de diciembre', concepto: true, saldo: true, valores: [['saldo', 'Saldo de la cuenta por pagar', 'C']] },
};

// Conceptos DIAN más usados (para escoger en la configuración; se puede escribir cualquier otro).
export const CATALOGO = {
  1001: [['5001', 'Salarios y demás pagos laborales'], ['5002', 'Honorarios'], ['5003', 'Comisiones'], ['5004', 'Servicios'], ['5005', 'Arrendamientos'],
    ['5006', 'Intereses y rendimientos financieros'], ['5007', 'Compra de activos movibles'], ['5008', 'Compra de activos fijos'], ['5016', 'Demás costos y deducciones']],
  1007: [['4001', 'Ingresos brutos de actividades ordinarias'], ['4002', 'Otros ingresos brutos'], ['4003', 'Ingresos por intereses y rendimientos financieros']],
  1008: [['1315', 'Clientes'], ['1316', 'Cuentas corrientes comerciales'], ['1318', 'Otras cuentas por cobrar']],
  1009: [['2201', 'Proveedores'], ['2203', 'Obligaciones financieras'], ['2206', 'Otras cuentas por pagar']],
};
const NOMBRE_CONCEPTO = Object.fromEntries(Object.values(CATALOGO).flat());
export const nombreConcepto = c => NOMBRE_CONCEPTO[c] || '';

// Reglas de fábrica: [formato, cuenta (prefijo de cualquier nivel), concepto, columna]. Columna vacía = no reportar.
// En el 1001 las retenciones sin concepto van al concepto principal del tercero (el de mayor pago).
const FABRICA = [
  ...[['5105', '5001'], ['5110', '5002'], ['5115', '5016'], ['5120', '5005'], ['5125', '5016'], ['5130', '5016'], ['5135', '5004'], ['5140', '5016'], ['5145', '5016'],
    ['5305', '5006'], ['14', '5007'], ['15', '5008'], ['5', '5016'], ['6', '5007'], ['7', '5007']].map(([c, k]) => ['1001', c, k, 'pago']),
  ['1001', '2365', '', 'retefuente'], ['1001', '2367', '', 'reteiva'],
  ['1005', '240802', '', 'iva'], ['1006', '240801', '', 'iva'],
  ['1007', '41', '4001', 'ingreso'], ['1007', '42', '4002', 'ingreso'], ['1007', '4210', '4003', 'ingreso'], ['1007', '4175', '4001', 'devolucion'],
  ['1008', '1305', '1315', 'saldo'], ['1008', '1310', '1316', 'saldo'], ['1008', '13', '1318', 'saldo'], ['1008', '1355', '', ''],
  ['1009', '2205', '2201', 'saldo'], ['1009', '21', '2203', 'saldo'], ['1009', '2', '2206', 'saldo'],
  ...['2365', '2367', '2368', '24', '29'].map(c => ['1009', c, '', '']),
];
export function reglasExogena(contab) {
  if (Array.isArray(contab?.exogena)) return contab.exogena;
  return FABRICA.map(([formato, cuenta, concepto, columna], i) => ({ id: `x${i}`, formato, cuenta, concepto, columna }));
}
// La regla que aplica a una cuenta en un formato: la del prefijo más largo (si se repite, la última).
export function reglaDe(reglas, cod, cuenta) {
  let mejor = null;
  for (const r of reglas) if (String(r.formato) === String(cod) && r.cuenta && cuenta.startsWith(r.cuenta) && (!mejor || r.cuenta.length >= mejor.cuenta.length)) mejor = r;
  return mejor && mejor.columna ? mejor : null;
}

// Cómo se calcula el valor de cada regla. El año sale del filtro del informe.
// pago y saldo usan el signo de la columna (D = débitos menos créditos; C = créditos menos débitos);
// saldo se acumula desde el inicio hasta el 31 de diciembre.
export const CALCULOS = [['pago', 'Pago o abono en cuenta'], ['debito', 'Débito'], ['credito', 'Crédito'], ['saldo', 'Saldo']];
export const calculoDe = (r, cod) => CALCULOS.some(([k]) => k === r?.calculo) ? r.calculo : FORMATOS[cod]?.saldo ? 'saldo' : 'pago';

// Filas de un formato para el año, por tercero (y concepto cuando el formato lo usa).
export function formato(cod, movs, anio, reglas = reglasExogena()) {
  const F = FORMATOS[cod], ini = `${anio}-01-01`, fin = `${anio}-12-31`, filas = {}, nombres = {};
  const signo = Object.fromEntries(F.valores.map(([k, , s]) => [k, s]));
  const del = movs.filter(m => m.tipo !== 'CI' && m.tercero_id && m.fecha <= fin);
  const sumar = (tercero, conc, k, v) => { if (!v) return; const key = `${tercero}|${conc}`; const f = filas[key] || (filas[key] = { tercero_id: tercero, concepto: conc }); f[k] = r2((f[k] || 0) + v); };
  const valor = (m, k, calc) => calc === 'debito' ? m.debito : calc === 'credito' ? m.credito : signo[k] === 'C' ? m.credito - m.debito : m.debito - m.credito;
  const sinConcepto = [];
  for (const m of del) {
    const r = reglaDe(reglas, cod, m.cuenta);
    if (!r || !(r.columna in signo)) continue;
    const calc = calculoDe(r, cod);
    if (calc !== 'saldo' && m.fecha < ini) continue;
    if (r.nombre) nombres[r.concepto] = r.nombre;
    const v = valor(m, r.columna, calc);
    if (F.concepto && !r.concepto) sinConcepto.push([m.tercero_id, r.columna, v]); else sumar(m.tercero_id, F.concepto ? r.concepto : '', r.columna, v);
  }
  // Sin concepto (p. ej. retenciones del 1001): al concepto con el mayor valor de la primera columna de ese tercero.
  const k0 = F.valores[0][0];
  const principal = t => Object.values(filas).filter(f => f.tercero_id === t).sort((a, b) => (b[k0] || 0) - (a[k0] || 0))[0]?.concepto || (CATALOGO[cod] || []).at(-1)?.[0] || '';
  for (const [t, k, v] of sinConcepto) sumar(t, principal(t), k, v);
  return Object.values(filas).filter(f => F.valores.some(([k]) => Math.abs(f[k] || 0) >= 0.5))
    .map(f => ({ ...f, nombre_concepto: nombres[f.concepto] || nombreConcepto(f.concepto) }))
    .sort((a, b) => a.concepto.localeCompare(b.concepto) || a.tercero_id.localeCompare(b.tercero_id));
}

const TIPO_DOC = { 31: '31', 13: '13', 22: '22', 41: '41', 12: '12', 42: '42', 47: '47', 48: '48' };
// CSV del formato con las columnas de identificación que pide la DIAN (abre en Excel).
export function csvFormato(cod, filas, terceros) {
  const t = Object.fromEntries((terceros || []).map(x => [x.id, x]));
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const conConcepto = FORMATOS[cod].concepto;
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
