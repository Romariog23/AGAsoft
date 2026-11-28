// Permisos de los planes (supabase/029_planes_permisos.sql): módulos que se apagan y topes por empresa.
// Sin plan (administrador, prueba gratis o demostración) no hay límites.

// Base que nunca se apaga: ventas (facturas, notas, recibos, cartera), compras y gastos (FC, DS, NA, egresos, CxP),
// comprobantes contables, terceros, productos, configuración y documentos electrónicos.
export const MODULOS = {
  contables: { nombre: 'Informes contables e IVA', rutas: ['esf', 'er', 'balance', 'auxgeneral', 'iva', 'flujoefectivo', 'patrimonio'] },
  calendario: { nombre: 'Calendario tributario', rutas: ['calendario'] },
  conciliacion: { nombre: 'Conciliación bancaria', rutas: ['conciliacion'] },
  activos: { nombre: 'Activos fijos', rutas: ['activos', 'activonuevo', 'activoeditar', 'activostipos', 'depreciar'] },
  cierre: { nombre: 'Cierre contable', rutas: ['cierre'] },
  centros: { nombre: 'Centros de costo', rutas: ['centroscfg'] },
  nomina: { nombre: 'Nómina', rutas: ['nomina', 'nominanueva', 'nominaeditar', 'nominadoc', 'nominacfg', 'nominapasivos', 'nominapagos', 'nominapago', 'empleados'] },
  nominae: { nombre: 'Nómina electrónica', rutas: ['nominae'], requiere: 'nomina' },
  exogena: { nombre: 'Medios magnéticos', rutas: ['exogena', 'exogenacfg'] },
  importar: { nombre: 'Importar plantillas', rutas: ['importar'] },
  informes: { nombre: 'Informes de ventas, compras, cartera y retenciones', rutas: ['auxiliar', 'retpracticadas', 'certificados', 'libroventas', 'ventascliente', 'ventasproducto', 'librocompras', 'comprasproveedor'] },
  avanzados: { nombre: 'Informes avanzados', rutas: ['ercomp', 'ercc', 'flujocaja'] },
  consulta: { nombre: 'Usuarios de solo consulta', rutas: [] },
  // Productos y servicios (catálogo) y unidades de medida no son del módulo: todos los planes los tienen.
  operacion: { nombre: 'Operación', rutas: ['operacion', 'opcfg', 'opregistros', 'opcortes', 'opcorte', 'opfacturar', 'opporcerrar', 'opmaquinas', 'oprecibos', 'opproyectos', 'opoperadores', 'opprogramar'] },
  cotizaciones: { nombre: 'Cotizaciones', rutas: ['cotizaciones', 'cotizacion'] },
  inventario: { nombre: 'Control de inventario', rutas: ['existencias', 'kardex', 'ajustesinv', 'ajusteinvnuevo', 'ajusteinveditar', 'ajusteinv', 'traslados', 'trasladonuevo', 'trasladoeditar', 'traslado', 'costoproducto', 'costoventas', 'inventariocfg'] },
};

// Plan base (Romario, 2026-11-28): ventas, compras, contabilidad, nómina electrónica, informes y configuración.
// La base fija ya trae ventas, compras, comprobantes y configuración; aquí va lo que se suma.
export const PLAN_BASE = ['contables', 'informes', 'conciliacion', 'activos', 'cierre', 'nomina', 'nominae'];
// ¿Está encendido el módulo en una lista {clave: bool, '*': bool}? Sin dato = encendido.
export const modOn = (mods, k) => !mods ? true : Object.hasOwn(mods, k) ? mods[k] !== false : Object.hasOwn(mods, '*') ? mods['*'] !== false : true;

// Lo que todavía no existe y se anuncia aparte (no como incluido).
export const PROXIMAMENTE = ['documento soporte y nota de ajuste electrónicos', 'sedes o sucursales', 'integración por API'];

export const moduloDeRuta = v => Object.keys(MODULOS).find(k => MODULOS[k].rutas.includes(v)) || null;

// Módulos fijados a mano a la cuenta por el administrador (perfiles.modulos, supabase/050_modulos_por_cuenta.sql).
// null = según el plan. {clave: true|false}; '*' = lo que no esté en la lista (p. ej. {'*': false} = solo la base).
// Lo que fija la cuenta gana sobre el plan, para encender o apagar.
let CUENTA = null;
export const fijarModulosCuenta = m => { CUENTA = m && typeof m === 'object' && !Array.isArray(m) ? m : null; };
const enCuenta = mod => !CUENTA ? null : Object.hasOwn(CUENTA, mod) ? CUENTA[mod] !== false : Object.hasOwn(CUENTA, '*') ? CUENTA['*'] !== false : null;
export const apagadoEnCuenta = mod => !!mod && (enCuenta(mod) === false || (!!MODULOS[mod]?.requiere && apagadoEnCuenta(MODULOS[mod].requiere)));
export const tieneModulo = (plan, mod) => {
  if (!mod) return true;
  const r = MODULOS[mod]?.requiere;
  if (r && !tieneModulo(plan, r)) return false;
  const c = enCuenta(mod);
  return c !== null ? c : (!plan || modOn(plan.modulos, mod));
};

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
export const planDesde = (planes, mod) => (planes || []).filter(p => p.activo !== false && modOn(p.modulos, mod)).sort((a, b) => Number(a.precio_mensual) - Number(b.precio_mensual))[0] || null;

// Lo que trae cada plan, en frases cortas para las tarjetas de planes.
// max_usuarios cuenta las personas a las que el dueño da acceso; el dueño es un usuario más.
export function incluye(p) {
  const m = k => modOn(p.modulos, k), l = ['Factura electrónica, notas crédito y débito', 'Cartera, compras y contabilidad automática'];
  if (p.max_documentos_fe_mes != null) l.push(`${p.max_documentos_fe_mes.toLocaleString('es-CO')} documentos electrónicos al mes`);
  else if (p.max_documentos_mes != null) l.push(`${p.max_documentos_mes.toLocaleString('es-CO')} documentos al mes`);
  const u = p.max_usuarios == null ? null : p.max_usuarios + 1;
  l.push(u == null ? 'Usuarios ilimitados' : `${u} usuario${u === 1 ? '' : 's'}`);
  l.push(m('avanzados') ? 'Informes avanzados, flujo de caja y exportar a Excel' : m('informes') ? 'Informes de ventas, compras, retenciones (350) y certificados' : 'Informes básicos e IVA del período (300)');
  if (m('nomina') && p.max_empleados !== 0) l.push(p.max_empleados == null ? 'Nómina sin límite de empleados' : `Nómina hasta ${p.max_empleados} empleados`);
  if (m('inventario')) l.push('Control de inventario: existencias, kardex, bodegas y costo de ventas');
  if (m('exogena')) l.push('Medios magnéticos');
  if (m('importar')) l.push('Importar plantillas de Excel');
  if (m('consulta')) l.push('Usuarios de solo consulta');
  if (!p.por_empresa && p.max_empresas != null) l.push(`Hasta ${p.max_empresas} empresa${p.max_empresas === 1 ? '' : 's'}`);
  return l;
}

// Planes de la demostración (los mismos que crea 029).
export const PLANES_DEMO = [
  { id: 'demo-emp', nombre: 'Emprendedor', precio_mensual: 31000, por_empresa: true, max_documentos_fe_mes: null, max_usuarios: 0, max_empleados: 0, modulos: { nomina: false, exogena: false, importar: false, informes: false, avanzados: false, consulta: false, inventario: false, operacion: false, cotizaciones: true }, descripcion: 'Para facturar electrónicamente y llevar la contabilidad básica. 1 usuario.', activo: true, orden: 10 },
  { id: 'demo-pyme', nombre: 'Pyme', precio_mensual: 69000, por_empresa: true, max_documentos_fe_mes: null, max_usuarios: 2, max_empleados: 5, modulos: { nomina: true, exogena: true, importar: true, informes: true, avanzados: false, consulta: true, inventario: true, operacion: false, cotizaciones: true }, descripcion: 'Suma nómina hasta 5 empleados, medios magnéticos, importar de Excel e informes de ventas y cartera. 3 usuarios.', activo: true, orden: 11 },
  { id: 'demo-empresa', nombre: 'Empresa', precio_mensual: 119000, por_empresa: true, max_documentos_fe_mes: null, max_usuarios: null, max_empleados: null, modulos: { nomina: true, exogena: true, importar: true, informes: true, avanzados: true, consulta: true, inventario: true, operacion: true, cotizaciones: true }, descripcion: 'Todo AGAsoft: informes avanzados, exportar a Excel, nómina y usuarios sin límite.', activo: true, orden: 12 },
];
