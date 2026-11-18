// Módulo de impuestos: conceptos de retención y tarifas de IVA de cada empresa (se guardan en empresas.contabilidad).
// Funciones puras: no tocan la base de datos.
import { r2, num } from './calc.js';

export const TIPOS_RET = {
  retefuente: { nombre: 'Retención en la fuente', corto: 'Retefuente', unidad: '%', ayuda: 'Porcentaje sobre la base (antes de IVA).' },
  reteiva: { nombre: 'Retención de IVA', corto: 'ReteIVA', unidad: '%', ayuda: 'Porcentaje sobre el IVA.' },
  reteica: { nombre: 'Retención de ICA', corto: 'ReteICA', unidad: 'por mil', ayuda: 'Por mil sobre la base (antes de IVA).' },
};
// En ventas la retención que practica el cliente es un anticipo de impuestos (débito);
// en compras la que practica la empresa es una cuenta por pagar (crédito). La nota crédito la lleva al contrario.
export const naturalezaRet = uso => (uso === 'compra' ? 'C' : 'D');

// Conceptos de retención: los que la empresa configuró o, si no ha configurado, unos básicos.
export function conceptosRet(contab, P, uso, tipo) {
  const propios = Array.isArray(contab?.retenciones) ? contab.retenciones : null;
  const base = propios || [
    { id: 'v-rf-serv', uso: 'venta', tipo: 'retefuente', nombre: 'Servicios en general', tarifa: 4, base_minima: 0, cuenta: P.retefuente },
    { id: 'v-rf-hon', uso: 'venta', tipo: 'retefuente', nombre: 'Honorarios', tarifa: 11, base_minima: 0, cuenta: P.retefuente },
    { id: 'v-rf-comp', uso: 'venta', tipo: 'retefuente', nombre: 'Compras (venta de bienes)', tarifa: 2.5, base_minima: 0, cuenta: P.retefuente },
    { id: 'v-ri-15', uso: 'venta', tipo: 'reteiva', nombre: 'ReteIVA 15 %', tarifa: 15, base_minima: 0, cuenta: P.reteiva },
    { id: 'v-rica', uso: 'venta', tipo: 'reteica', nombre: 'ReteICA', tarifa: 0, base_minima: 0, cuenta: P.reteica },
    { id: 'c-rf-serv', uso: 'compra', tipo: 'retefuente', nombre: 'Servicios en general', tarifa: 4, base_minima: 0, cuenta: P.retefuente_pagar },
    { id: 'c-rf-hon', uso: 'compra', tipo: 'retefuente', nombre: 'Honorarios', tarifa: 11, base_minima: 0, cuenta: P.retefuente_pagar },
    { id: 'c-rf-comp', uso: 'compra', tipo: 'retefuente', nombre: 'Compras', tarifa: 2.5, base_minima: 0, cuenta: P.retefuente_pagar },
    { id: 'c-rf-arr', uso: 'compra', tipo: 'retefuente', nombre: 'Arrendamientos', tarifa: 3.5, base_minima: 0, cuenta: P.retefuente_pagar },
    { id: 'c-ri-15', uso: 'compra', tipo: 'reteiva', nombre: 'ReteIVA 15 %', tarifa: 15, base_minima: 0, cuenta: P.reteiva_pagar },
    { id: 'c-rica', uso: 'compra', tipo: 'reteica', nombre: 'ReteICA', tarifa: 0, base_minima: 0, cuenta: P.reteica_pagar },
  ];
  return base.filter(c => (!uso || c.uso === uso) && (!tipo || c.tipo === tipo)).map(c => ({ ...c, naturaleza: naturalezaRet(c.uso) }));
}

// Tarifas de IVA: las de la empresa o las de ley (0, 5 y 19 %). Cada una puede llevar su propia cuenta.
export function tarifasIva(contab) {
  const propias = Array.isArray(contab?.tarifas_iva) && contab.tarifas_iva.length ? contab.tarifas_iva : null;
  return (propias || [
    { id: 'iva-0', nombre: 'Excluido o exento (0 %)', tarifa: 0, cuenta_venta: '', cuenta_compra: '' },
    { id: 'iva-5', nombre: 'IVA 5 %', tarifa: 5, cuenta_venta: '', cuenta_compra: '' },
    { id: 'iva-19', nombre: 'IVA 19 %', tarifa: 19, cuenta_venta: '', cuenta_compra: '' },
  ]).slice().sort((a, b) => num(a.tarifa) - num(b.tarifa));
}
// Cuenta del IVA de una tarifa (la propia o la de los parámetros).
export function cuentaIva(tarifas, pct, uso, P) {
  const t = (tarifas || []).find(x => num(x.tarifa) === num(pct));
  const c = String((uso === 'compra' ? t?.cuenta_compra : t?.cuenta_venta) || '').trim();
  return c || (uso === 'compra' ? P.iva_descontable : P.iva);
}

// Tarifa que aplica un concepto según la base: si la base no llega a la base mínima, no se retiene.
export function tarifaAplicada(concepto, base) {
  if (!concepto) return 0;
  return num(concepto.base_minima) > 0 && r2(num(base)) < num(concepto.base_minima) ? 0 : num(concepto.tarifa);
}

// Lo que se guarda en el documento: el concepto y la cuenta de cada retención, para que la contabilidad no cambie
// si después se edita el concepto.
export function fotoRet(concepto) {
  return concepto ? { concepto: concepto.id, nombre: concepto.nombre, cuenta: concepto.cuenta, naturaleza: concepto.naturaleza || naturalezaRet(concepto.uso) } : null;
}
