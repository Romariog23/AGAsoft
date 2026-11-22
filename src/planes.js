// Permisos de los planes (supabase/029_planes_permisos.sql): módulos que se apagan y topes por empresa.
// Sin plan (administrador, prueba gratis o demostración) no hay límites.

export const MODULOS = {
  nomina: { nombre: 'Nómina', rutas: ['nomina', 'nominanueva', 'nominaeditar', 'nominadoc', 'nominacfg', 'nominapasivos', 'nominapagos', 'nominapago', 'empleados'] },
  exogena: { nombre: 'Medios magnéticos', rutas: ['exogena', 'exogenacfg'] },
  importar: { nombre: 'Importar plantillas', rutas: ['importar'] },
  informes: { nombre: 'Informes de ventas y cartera', rutas: ['auxiliar'] },
  avanzados: { nombre: 'Informes avanzados', rutas: ['ercomp'] },
  consulta: { nombre: 'Usuarios de solo consulta', rutas: [] },
};

// Lo que todavía no existe y se anuncia aparte (no como incluido).
export const PROXIMAMENTE = ['documento soporte y nota de ajuste electrónicos', 'cotizaciones', 'inventario', 'sedes o sucursales', 'integración por API'];

export const moduloDeRuta = v => Object.keys(MODULOS).find(k => MODULOS[k].rutas.includes(v)) || null;
export const tieneModulo = (plan, mod) => !plan || !mod || plan.modulos?.[mod] !== false;

// Facturas y notas electrónicas que ya gastaron cupo en el mes (los anulados también: ya se enviaron).
export const docsFeMes = (documentos, mes) => (documentos || []).filter(d => d.electronica && d.estado !== 'borrador' && ['FV', 'NC', 'ND'].includes(d.tipo) && String(d.fecha).startsWith(mes)).length;

// Lo que paga la cuenta al mes: los planes por empresa se multiplican por las empresas creadas.
export const precioCuenta = (plan, empresas) => plan ? Number(plan.precio_mensual || 0) * (plan.por_empresa ? Math.max(1, empresas || 0) : 1) : 0;

// Pago anual anticipado: 10 meses (2 gratis).
export const precioAnual = p => Number(p?.precio_mensual || 0) * 10;

// Nivel del aviso de cupo: null, 'casi' (80 % o más) o 'lleno'.
export function avisoCupo(usados, max) {
  if (max === null || max === undefined) return null;
  if (usados >= max) return 'lleno';
  return usados >= Math.ceil(max * 0.8) ? 'casi' : null;
}

// Plan más barato que incluye un módulo (para decir "Disponible desde el plan Pyme").
export const planDesde = (planes, mod) => (planes || []).filter(p => p.activo !== false && p.modulos?.[mod] !== false).sort((a, b) => Number(a.precio_mensual) - Number(b.precio_mensual))[0] || null;

// Lo que trae cada plan, en frases cortas para las tarjetas de planes.
// max_usuarios cuenta las personas a las que el dueño da acceso; el dueño es un usuario más.
export function incluye(p) {
  const m = k => p.modulos?.[k] !== false, l = ['Factura electrónica, notas crédito y débito', 'Cartera, compras y contabilidad automática'];
  if (p.max_documentos_fe_mes != null) l.push(`${p.max_documentos_fe_mes.toLocaleString('es-CO')} documentos electrónicos al mes`);
  else if (p.max_documentos_mes != null) l.push(`${p.max_documentos_mes.toLocaleString('es-CO')} documentos al mes`);
  const u = p.max_usuarios == null ? null : p.max_usuarios + 1;
  l.push(u == null ? 'Usuarios ilimitados' : `${u} usuario${u === 1 ? '' : 's'}`);
  l.push(m('avanzados') ? 'Informes avanzados y exportar a Excel' : m('informes') ? 'Informes de ventas y cartera' : 'Informes básicos');
  if (m('nomina') && p.max_empleados !== 0) l.push(p.max_empleados == null ? 'Nómina sin límite de empleados' : `Nómina hasta ${p.max_empleados} empleados`);
  if (m('exogena')) l.push('Medios magnéticos');
  if (m('importar')) l.push('Importar plantillas de Excel');
  if (m('consulta')) l.push('Usuarios de solo consulta');
  if (!p.por_empresa && p.max_empresas != null) l.push(`Hasta ${p.max_empresas} empresa${p.max_empresas === 1 ? '' : 's'}`);
  return l;
}

// Planes de la demostración (los mismos que crea 029).
export const PLANES_DEMO = [
  { id: 'demo-emp', nombre: 'Emprendedor', precio_mensual: 31000, por_empresa: true, max_documentos_fe_mes: null, max_usuarios: 0, max_empleados: 0, modulos: { nomina: false, exogena: false, importar: false, informes: false, avanzados: false, consulta: false }, descripcion: 'Para facturar electrónicamente y llevar la contabilidad básica. 1 usuario.', activo: true, orden: 10 },
  { id: 'demo-pyme', nombre: 'Pyme', precio_mensual: 69000, por_empresa: true, max_documentos_fe_mes: null, max_usuarios: 2, max_empleados: 5, modulos: { nomina: true, exogena: true, importar: true, informes: true, avanzados: false, consulta: true }, descripcion: 'Suma nómina hasta 5 empleados, medios magnéticos, importar de Excel e informes de ventas y cartera. 3 usuarios.', activo: true, orden: 11 },
  { id: 'demo-empresa', nombre: 'Empresa', precio_mensual: 119000, por_empresa: true, max_documentos_fe_mes: null, max_usuarios: null, max_empleados: null, modulos: { nomina: true, exogena: true, importar: true, informes: true, avanzados: true, consulta: true }, descripcion: 'Todo AGAsoft: informes avanzados, exportar a Excel, nómina y usuarios sin límite.', activo: true, orden: 12 },
];
