// Permisos de los planes (supabase/029_planes_permisos.sql): módulos que se apagan y topes por empresa.
// Sin plan (administrador, prueba gratis o demostración) no hay límites.

export const MODULOS = {
  nomina: { nombre: 'Nómina', rutas: ['nomina', 'nominanueva', 'nominaeditar', 'nominadoc', 'nominacfg', 'nominapasivos', 'nominapagos', 'nominapago', 'empleados'] },
  exogena: { nombre: 'Medios magnéticos', rutas: ['exogena', 'exogenacfg'] },
  importar: { nombre: 'Importar plantillas', rutas: ['importar'] },
};

export const moduloDeRuta = v => Object.keys(MODULOS).find(k => MODULOS[k].rutas.includes(v)) || null;
export const tieneModulo = (plan, mod) => !plan || !mod || plan.modulos?.[mod] !== false;

// Facturas y notas electrónicas que ya gastaron cupo en el mes (los anulados también: ya se enviaron).
export const docsFeMes = (documentos, mes) => (documentos || []).filter(d => d.electronica && d.estado !== 'borrador' && ['FV', 'NC', 'ND'].includes(d.tipo) && String(d.fecha).startsWith(mes)).length;

// Lo que paga la cuenta al mes: los planes por empresa se multiplican por las empresas creadas.
export const precioCuenta = (plan, empresas) => plan ? Number(plan.precio_mensual || 0) * (plan.por_empresa ? Math.max(1, empresas || 0) : 1) : 0;

// Nivel del aviso de cupo: null, 'casi' (80 % o más) o 'lleno'.
export function avisoCupo(usados, max) {
  if (max === null || max === undefined) return null;
  if (usados >= max) return 'lleno';
  return usados >= Math.ceil(max * 0.8) ? 'casi' : null;
}

// Plan más barato que incluye un módulo (para decir "Disponible desde el plan Pyme").
export const planDesde = (planes, mod) => (planes || []).filter(p => p.activo !== false && p.modulos?.[mod] !== false).sort((a, b) => Number(a.precio_mensual) - Number(b.precio_mensual))[0] || null;

// Lo que trae cada plan, en frases cortas para las tarjetas de planes.
export function incluye(p) {
  const l = [];
  if (p.max_documentos_fe_mes != null) l.push(`${p.max_documentos_fe_mes.toLocaleString('es-CO')} documentos electrónicos al mes`);
  else if (p.max_documentos_mes != null) l.push(`${p.max_documentos_mes.toLocaleString('es-CO')} documentos al mes`);
  else l.push('Documentos sin límite');
  l.push(p.max_usuarios == null ? 'Usuarios sin límite' : `${p.max_usuarios} usuario${p.max_usuarios === 1 ? '' : 's'}`);
  if (p.modulos?.nomina === false || p.max_empleados === 0) l.push('Sin nómina');
  else l.push(p.max_empleados == null ? 'Nómina sin límite de empleados' : `Nómina hasta ${p.max_empleados} empleados`);
  if (p.modulos?.exogena !== false) l.push('Medios magnéticos');
  if (p.modulos?.importar !== false) l.push('Importar plantillas de Excel');
  if (!p.por_empresa && p.max_empresas != null) l.push(`Hasta ${p.max_empresas} empresa${p.max_empresas === 1 ? '' : 's'}`);
  return l;
}

// Planes de la demostración (los mismos que crea 029).
export const PLANES_DEMO = [
  { id: 'demo-emp', nombre: 'Emprendedor', precio_mensual: 39900, por_empresa: true, max_documentos_fe_mes: 30, max_usuarios: 1, max_empleados: 0, modulos: { nomina: false, exogena: false, importar: false }, descripcion: 'Para empezar a facturar: 30 documentos electrónicos al mes, firma digital incluida.', activo: true, orden: 10 },
  { id: 'demo-pyme', nombre: 'Pyme', precio_mensual: 79900, por_empresa: true, max_documentos_fe_mes: 100, max_usuarios: 2, max_empleados: 5, modulos: { nomina: true, exogena: true, importar: true }, descripcion: '100 documentos electrónicos al mes, nómina hasta 5 empleados y medios magnéticos.', activo: true, orden: 11 },
  { id: 'demo-empresa', nombre: 'Empresa', precio_mensual: 129900, por_empresa: true, max_documentos_fe_mes: 300, max_usuarios: 5, max_empleados: 25, modulos: { nomina: true, exogena: true, importar: true }, descripcion: '300 documentos electrónicos al mes, nómina hasta 25 empleados y 5 usuarios.', activo: true, orden: 12 },
  { id: 'demo-plus', nombre: 'Empresa Plus', precio_mensual: 209900, por_empresa: true, max_documentos_fe_mes: 1000, max_usuarios: null, max_empleados: null, modulos: { nomina: true, exogena: true, importar: true }, descripcion: '1.000 documentos electrónicos al mes, usuarios y nómina sin límite.', activo: true, orden: 13 },
];
