// Unidades de medida de la empresa. Cada una lleva su sigla (la que se ve en facturas e inventario),
// su nombre y el código DIAN (tabla UN/ECE rec. 20) que se envía en la factura electrónica.
// Se guardan en empresas.contabilidad.unidades; si la empresa no ha creado ninguna se usan estas.
export const UNIDADES_DEF = [
  { codigo: 'UND', nombre: 'Unidad', dian: '94' },
  { codigo: 'KG', nombre: 'Kilogramo', dian: 'KGM' },
  { codigo: 'G', nombre: 'Gramo', dian: 'GRM' },
  { codigo: 'LB', nombre: 'Libra', dian: 'LBR' },
  { codigo: 'L', nombre: 'Litro', dian: 'LTR' },
  { codigo: 'GL', nombre: 'Galón', dian: 'GLL' },
  { codigo: 'M', nombre: 'Metro', dian: 'MTR' },
  { codigo: 'M2', nombre: 'Metro cuadrado', dian: 'MTK' },
  { codigo: 'M3', nombre: 'Metro cúbico', dian: 'MTQ' },
  { codigo: 'CJ', nombre: 'Caja', dian: 'BX' },
  { codigo: 'PAQ', nombre: 'Paquete', dian: 'PK' },
  { codigo: 'BULTO', nombre: 'Bulto', dian: 'BG' },
  { codigo: 'ROLLO', nombre: 'Rollo', dian: 'RO' },
  { codigo: 'PAR', nombre: 'Par', dian: 'PR' },
  { codigo: 'DOC', nombre: 'Docena', dian: 'DZN' },
  { codigo: 'HR', nombre: 'Hora', dian: 'HUR' },
  { codigo: 'DIA', nombre: 'Día', dian: 'DAY' },
  { codigo: 'MES', nombre: 'Mes', dian: 'MON' },
  { codigo: 'SERV', nombre: 'Servicio', dian: 'E48' },
];
// Códigos DIAN más usados para escoger al crear una unidad.
export const CODIGOS_DIAN = [['94', '94 · Unidad'], ['KGM', 'KGM · Kilogramo'], ['GRM', 'GRM · Gramo'], ['LBR', 'LBR · Libra'], ['TNE', 'TNE · Tonelada'], ['LTR', 'LTR · Litro'], ['MLT', 'MLT · Mililitro'],
  ['GLL', 'GLL · Galón'], ['MTR', 'MTR · Metro'], ['CMT', 'CMT · Centímetro'], ['MTK', 'MTK · Metro cuadrado'], ['MTQ', 'MTQ · Metro cúbico'], ['BX', 'BX · Caja'], ['PK', 'PK · Paquete'], ['BG', 'BG · Bolsa o bulto'],
  ['RO', 'RO · Rollo'], ['PR', 'PR · Par'], ['DZN', 'DZN · Docena'], ['SET', 'SET · Juego'], ['KT', 'KT · Kit'], ['HUR', 'HUR · Hora'], ['DAY', 'DAY · Día'], ['WEE', 'WEE · Semana'], ['MON', 'MON · Mes'], ['ANN', 'ANN · Año'], ['E48', 'E48 · Unidad de servicio']];
export const unidadesDe = contab => { const u = contab?.unidades; return Array.isArray(u) && u.length ? u : UNIDADES_DEF; };
// Código DIAN de la unidad de una línea (por la sigla); si no se encuentra, 94 (unidad).
export function codigoDian(unidades, sigla) {
  const s = String(sigla || '').trim().toUpperCase();
  return (unidades || UNIDADES_DEF).find(u => String(u.codigo).toUpperCase() === s)?.dian || '94';
}
export function erroresUnidad(u, unidades) {
  const out = [], c = String(u.codigo || '').trim();
  if (!c) out.push('Escribe la sigla.');
  else if (c.length > 10) out.push('La sigla puede tener hasta 10 caracteres.');
  if (!String(u.nombre || '').trim()) out.push('Escribe el nombre.');
  if (!String(u.dian || '').trim()) out.push('Escoge el código DIAN.');
  if ((unidades || []).some((x, i) => i !== u.idx && String(x.codigo).toUpperCase() === c.toUpperCase())) out.push('Ya existe una unidad con esa sigla.');
  return out;
}
