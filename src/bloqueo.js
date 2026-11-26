// Bloqueo de periodos (no es el comprobante de cierre): nada con fecha hasta "bloqueado_hasta" se crea, edita, anula ni elimina.
// La base de datos lo hace cumplir con triggers (043_bloqueo_periodos.sql); esto es lo mismo para el modo demostración y los avisos.
export const TABLAS_BLOQUEO = ['documentos', 'compras', 'comprobantes', 'nominas', 'inventario_docs'];
const dmy = f => String(f || '').slice(0, 10).split('-').reverse().join('/');
export const mensajeBloqueo = (hasta, fecha) => `El periodo está bloqueado hasta el ${dmy(hasta)}: no se puede crear, modificar, anular ni eliminar un documento con fecha ${dmy(fecha)}. El dueño puede desbloquearlo en Configuración › Bloqueo de periodos.`;
// ¿La fila cae en el periodo bloqueado? (los borradores de ventas no cuentan: no tienen contabilidad)
const cuenta = (t, r) => r && r.fecha && !(t === 'documentos' && r.estado === 'borrador');
export function revisarBloqueo(t, viejo, nuevo, hasta) {
  if (!hasta || !TABLAS_BLOQUEO.includes(t)) return;
  for (const r of [viejo, nuevo]) if (cuenta(t, r) && String(r.fecha).slice(0, 10) <= hasta) throw new Error(mensajeBloqueo(hasta, r.fecha));
}
// Último día de un mes 'AAAA-MM'.
export const finDeMes = ym => { const [a, m] = ym.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
// Bloquear hasta un mes: todo lo anterior queda bloqueado. Desbloquear un mes: queda bloqueado hasta el mes anterior.
export const hastaAlBloquear = ym => finDeMes(ym);
export function hastaAlDesbloquear(ym) { const [a, m] = ym.split('-').map(Number); return m === 1 ? (a > 1 ? `${a - 1}-12-31` : null) : finDeMes(`${a}-${String(m - 1).padStart(2, '0')}`); }
