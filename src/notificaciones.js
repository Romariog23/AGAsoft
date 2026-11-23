// Bandeja de Notificaciones: avisos que se calculan con los datos de la empresa (configuración que falta y operación)
// y con los vencimientos de AGA Calendar. Lo único que se guarda es cuándo la persona leyó cada aviso.
//  - repetir (días): si el problema sigue, el aviso vuelve a salir ese tiempo después de leído.
//  - sin repetir: la clave ya incluye la etapa (por ejemplo "faltan 7 días" y "vence mañana" son avisos distintos).
import { cartera } from './calc.js';
import { cuentasPorPagar } from './compras.js';
import { estadoPM } from './operacion.js';

const dd = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const plural = (n, s, p = s + 's') => `${n} ${n === 1 ? s : p}`;
const fCorta = f => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

// ctx: { empresa, d (datos de la empresa), hoy, local (modo demostración), diasPrueba }
export function avisosEmpresa({ empresa: e, d, hoy, local = false, diasPrueba = null }) {
  if (!e || !d) return [];
  const out = [], id = e.id, C = e.contabilidad || {};
  const add = (clave, tipo, titulo, texto, enlace, nivel = 'info', repetir = 7) => out.push({ clave: `${id}|${clave}`, tipo, titulo, texto, enlace, nivel, repetir, empresa: e.nombre });

  /* ---------- Configuración que falta ---------- */
  const numFV = (d.numeraciones || []).filter(n => n.tipo === 'FV' && n.activa && n.electronica);
  if (!numFV.length) add('cfg-numeracion', 'config', 'Falta la numeración de facturas', 'Registra la resolución de facturación electrónica de la DIAN para poder facturar.', '#/numeraciones', 'alerta');
  for (const n of numFV) {
    const total = Number(n.hasta) - Number(n.desde) + 1, usadas = Number(n.siguiente) - Number(n.desde);
    if (total > 0 && usadas / total >= 0.9) add(`cfg-rango-${n.id}`, 'config', 'Se está acabando el rango de facturación', `Usaste ${usadas} de ${total} números de la resolución ${n.prefijo || ''}. Pide una nueva resolución a la DIAN.`, '#/numeraciones', 'alerta');
    if (n.vigencia_hasta) {
      const r = dd(hoy, n.vigencia_hasta);
      if (r >= 0 && r <= 30) add(`cfg-vigencia-${n.id}`, 'config', 'La resolución de facturación está por vencer', `La resolución ${n.prefijo || ''} vence el ${fCorta(n.vigencia_hasta)} (${plural(r, 'día')}). Pide la nueva antes de esa fecha.`, '#/numeraciones', 'alerta');
      else if (r < 0) add(`cfg-vencida-${n.id}`, 'config', 'La resolución de facturación venció', `La resolución ${n.prefijo || ''} venció el ${fCorta(n.vigencia_hasta)}. No se pueden emitir facturas con ella.`, '#/numeraciones', 'alerta');
    }
  }
  if (!local && C.fe_habilitada !== true) add('cfg-factus', 'config', 'Conecta la facturación electrónica', 'Conecta tu cuenta de Factus para enviar las facturas a la DIAN.', '#/habilitacion', 'alerta');
  if (!String(C.factura?.logo || '').startsWith('data:image/')) add('cfg-logo', 'config', 'Agrega el logo de la empresa', 'Sale en las facturas, notas e informes.', '#/disenofactura', 'info', 30);
  if (!String(e.correo || '').trim()) add('cfg-correo', 'config', 'Falta el correo de la empresa', 'Se usa en las facturas y para recibir las respuestas de la DIAN.', '#/empresa');
  const empleados = (d.empleados || []).filter(x => x.activo !== false);
  if (empleados.length) {
    const sinEnt = empleados.filter(x => !x.eps_id || (!x.pension_id && x.pensionado !== true) || !x.caja_id);
    if (sinEnt.length) add('cfg-entidades', 'config', 'Empleados sin entidades de seguridad social', `${plural(sinEnt.length, 'empleado')} sin EPS, fondo de pensiones o caja. Sus aportes quedarían a nombre del empleado.`, '#/empleados', 'alerta');
    if (!C.nomina?.arl_id) add('cfg-arl', 'config', 'Falta la ARL de la empresa', 'Escógela en Configuración de nómina para que los aportes de riesgos queden a su nombre.', '#/nominacfg', 'alerta');
  }
  if (diasPrueba !== null && diasPrueba <= 3) add(`cfg-prueba-${diasPrueba}`, 'config', diasPrueba ? `Tu prueba gratis termina en ${plural(diasPrueba, 'día')}` : 'Hoy es el último día de tu prueba gratis', 'Escoge tu plan para seguir trabajando sin interrupciones.', '#/miplan', 'alerta', null);

  /* ---------- Operación ---------- */
  try {
    const venc = cartera(d.documentos || [], d.aplicaciones || []).filter(x => x.saldo > 0.5 && x.diasVencida > 0);
    if (venc.length) add(`op-cartera-${hoy.slice(0, 7)}`, 'operacion', 'Facturas de venta vencidas', `${plural(venc.length, 'factura')} por cobrar ya vencieron. Revisa la cartera y haz el seguimiento.`, '#/cartera', 'alerta');
  } catch (_) { /* sin datos de cartera */ }
  try {
    const cxp = cuentasPorPagar(d.compras || [], hoy).filter(x => x.saldo > 0.5 && x.diasVencida > 0);
    if (cxp.length) add(`op-cxp-${hoy.slice(0, 7)}`, 'operacion', 'Cuentas por pagar vencidas', `${plural(cxp.length, 'factura')} de proveedores ya vencieron.`, '#/cxp', 'alerta');
  } catch (_) { /* sin compras */ }
  const borr = (d.documentos || []).filter(x => x.estado === 'borrador' && x.fecha && dd(x.fecha, hoy) > 3);
  if (borr.length) add('op-borradores', 'operacion', 'Documentos en borrador', `${plural(borr.length, 'documento')} lleva${borr.length === 1 ? '' : 'n'} más de 3 días sin emitir.`, '#/FV');
  if (empleados.length) {
    const mesAnt = (() => { const [y, m] = hoy.split('-').map(Number); const x = new Date(y, m - 2, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; })();
    const liquidada = (d.nominas || []).some(n => n.estado !== 'anulado' && String(n.hasta || '').slice(0, 7) === mesAnt);
    if (!liquidada && Number(hoy.slice(8)) >= 3) add(`op-nomina-${mesAnt}`, 'operacion', 'Nómina sin liquidar', `No hay nómina del mes anterior (${mesAnt}). Liquídala para causar salarios y aportes.`, '#/nomina', 'alerta', null);
  }
  // Mantenimiento preventivo de las máquinas (Operación › Máquinas): aviso cuando se acerca y cuando ya se cumplió.
  if (C.operacion?.activo === true) {
    const fh = v => Number(v).toLocaleString('es-CO', { maximumFractionDigits: 1 });
    for (const m of (d.op_elementos || []).filter(x => x.lista === 'equipos' && x.activo !== false && x.datos?.pm)) {
      const pm = estadoPM(m, d.op_registros || []); if (!pm || pm.estado === 'ok') continue;
      if (pm.estado === 'vencido') add(`op-pm-${m.id}-${pm.proximo}-vencido`, 'operacion', `Mantenimiento preventivo: ${m.nombre}`, `Le tocaba el PM a las ${fh(pm.proximo)} h y el horómetro va en ${fh(pm.actual)} h${pm.faltan < 0 ? ` (pasada ${fh(-pm.faltan)} h)` : ''}. Hazlo y regístralo en Máquinas.`, '#/opmaquinas', 'alerta', 3);
      else add(`op-pm-${m.id}-${pm.proximo}-pronto`, 'operacion', `Se acerca el PM de ${m.nombre}`, `Faltan ${fh(pm.faltan)} h: el próximo mantenimiento preventivo es a las ${fh(pm.proximo)} h (va en ${fh(pm.actual)} h).`, '#/opmaquinas', 'alerta', null);
    }
  }
  return out;
}

// Vencimientos de AGA Calendar como avisos: 7 días antes, 1 día antes, el mismo día y vencida sin presentar.
export function avisosVencimientos(lista) {
  const out = [];
  for (const v of lista || []) {
    if (v.presentada) continue;
    const etapa = v.dias < 0 ? 'vencida' : v.dias === 0 ? 'hoy' : v.dias === 1 ? '1' : v.dias <= 7 ? '7' : null;
    if (!etapa || v.dias < -30) continue;
    const cuando = etapa === 'vencida' ? `venció el ${fCorta(v.fecha)}` : etapa === 'hoy' ? 'vence hoy' : etapa === '1' ? 'vence mañana' : `vence el ${fCorta(v.fecha)} (${plural(v.dias, 'día')})`;
    out.push({ clave: `cal|${v.clave}|${etapa}`, tipo: 'vencimiento', titulo: `${v.obligacion}${v.formulario ? ' · ' + v.formulario : ''}`, texto: `${v.empresa}: ${v.periodo} ${cuando}.`,
      enlace: '#/calendario', nivel: etapa === '7' ? 'info' : 'alerta', repetir: null, empresa: v.empresa });
  }
  return out;
}

// Quita los leídos. leidas: { clave: 'fecha ISO de lectura' }.
export function pendientes(avisos, leidas, ahora = new Date()) {
  return avisos.filter(a => { const l = leidas[a.clave]; if (!l) return true; return a.repetir ? (ahora - new Date(l)) / 864e5 >= a.repetir : false; });
}
