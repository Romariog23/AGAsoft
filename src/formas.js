// Formas de pago configurables por empresa (se guardan en empresas.contabilidad.formas_pago).
// A crédito: usa la cuenta de clientes (ventas) o proveedores (compras) y queda en cartera o cuentas por pagar.
// De contado (u otra cuenta): va a la cuenta escogida (caja, bancos o un pasivo en compras) y no queda pendiente.
export function formasPago(contab, P, uso) {
  const propias = Array.isArray(contab?.formas_pago) ? contab.formas_pago : null;
  const base = propias || [
    { id: 'v-credito', uso: 'venta', nombre: 'Crédito (cartera)', credito: true, cuenta: '' },
    { id: 'v-efectivo', uso: 'venta', nombre: 'Contado en efectivo', credito: false, cuenta: P.caja },
    { id: 'v-banco', uso: 'venta', nombre: 'Contado en bancos', credito: false, cuenta: P.bancos },
    { id: 'c-credito', uso: 'compra', nombre: 'Crédito con el proveedor', credito: true, cuenta: '' },
    { id: 'c-efectivo', uso: 'compra', nombre: 'Contado en efectivo', credito: false, cuenta: P.caja },
    { id: 'c-banco', uso: 'compra', nombre: 'Contado en bancos', credito: false, cuenta: P.bancos },
  ];
  return uso ? base.filter(f => f.uso === uso) : base;
}
// Forma que corresponde a un documento ya guardado (por su cuenta de pago).
export function formaDe(formas, credito, cuenta) {
  if (credito) return formas.find(f => f.credito) || formas[0];
  // Contado sin cuenta: documentos de antes de las formas de pago; se propone la primera de contado.
  return (cuenta && formas.find(f => !f.credito && f.cuenta === cuenta)) || formas.find(f => !f.credito) || formas[0];
}
