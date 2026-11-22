// Inventario: productos inventariables (los servicios no llevan existencias), bodegas con su cuenta 14 y
// método de costeo de la empresa (promedio ponderado o PEPS; UEPS no lo permiten las NIIF).
import { r2, num } from './calc.js';
import { esAuxiliar, parametrosDe } from './puc.js';

export const METODOS = [['promedio', 'Promedio ponderado'], ['peps', 'PEPS (primero en entrar, primero en salir)']];
export const cfgInventario = c => {
  const i = c?.inventario || {};
  return { metodo: i.metodo === 'peps' ? 'peps' : 'promedio', negativo: i.negativo === 'bloquear' ? 'bloquear' : 'avisar' };
};
export const esInventariable = p => !!p && p.tipo !== 'servicio';
export const TIPOS_ITEM = [['producto', 'Producto (inventariable)'], ['servicio', 'Servicio (sin inventario)']];

// Bodegas activas; si la empresa no ha creado ninguna, la principal con la cuenta de inventario de la empresa (sin id: se crea al usarla).
export function bodegasDe(bodegas, contab) {
  const l = (bodegas || []).filter(b => b.activa !== false).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  return l.length ? l : [{ id: '', codigo: '01', nombre: 'Bodega principal', cuenta: parametrosDe(contab?.parametros).inventario, activa: true }];
}
export function erroresBodega(b, bodegas, cuentas) {
  const out = [], codigo = String(b.codigo || '').trim(), cuenta = String(b.cuenta || '').trim();
  if (!codigo) out.push('Escribe el código de la bodega.');
  if (!String(b.nombre || '').trim()) out.push('Escribe el nombre de la bodega.');
  if ((bodegas || []).some(x => x.id !== b.id && String(x.codigo).toLowerCase() === codigo.toLowerCase())) out.push('Ya existe una bodega con ese código.');
  if (!/^14/.test(cuenta) || !esAuxiliar(cuenta)) out.push('La cuenta de la bodega debe ser una auxiliar de 8 dígitos de la clase 14 (inventarios).');
  else if (cuentas && !cuentas.some(c => c.codigo === cuenta)) out.push(`La cuenta ${cuenta} no existe en el plan de cuentas.`);
  return out;
}

// Línea de compra por producto: el valor antes de IVA es cantidad × costo unitario y va a la cuenta 14 de la bodega.
export const esLineaProducto = l => !!l?.producto_id;
export function lineaProducto(l, bodega) {
  const cantidad = num(l.cantidad), costo = num(l.costo);
  return { ...l, cantidad, costo, base: r2(cantidad * costo), cuenta: bodega?.cuenta || l.cuenta || '', bodega_id: bodega?.id ?? l.bodega_id ?? '' };
}
export function erroresLineaProducto(l, i, productos) {
  const out = [], p = (productos || []).find(x => x.id === l.producto_id), n = `Línea ${i + 1}`;
  if (!p) out.push(`${n}: el producto no existe.`);
  else if (!esInventariable(p)) out.push(`${n}: ${p.nombre} es un servicio; regístralo por cuenta.`);
  if (num(l.cantidad) <= 0) out.push(`${n}: la cantidad debe ser mayor que cero.`);
  if (num(l.costo) <= 0) out.push(`${n}: el costo unitario debe ser mayor que cero.`);
  return out;
}

// Entradas de inventario de las compras vigentes (FC y DS por producto), base para el kardex.
export function entradasCompras(compras) {
  const out = [];
  for (const c of compras || []) {
    if (c.estado === 'anulado' || c.tipo === 'CE') continue;
    (c.lineas || []).forEach((l, i) => { if (esLineaProducto(l)) out.push({ fecha: c.fecha, doc_id: c.id, tipo: c.tipo, numero: c.numero, linea: i, producto_id: l.producto_id, bodega_id: l.bodega_id || '', cantidad: num(l.cantidad), costo: num(l.costo), total: r2(num(l.base)) }); });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
