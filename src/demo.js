// Empresa de demostración para www.agasoft.co/demo: datos ficticios ya diligenciados (seis meses de operación)
// para que cada pantalla y cada informe tenga qué mostrar. Se arma con las mismas funciones de cálculo de la app,
// así los totales guardados cuadran con la contabilidad. Todos los nombres, documentos y valores son inventados.
import { r2, totales, dvOf } from './calc.js';
import { totalesCompra } from './compras.js';
import { planInicial, completarPlan, parametrosPorDefecto } from './puc.js';
import { paramNomina, liquidar, totalesNomina, cuentasFaltantes, cuentasDeNomina, lineasPagoNomina, CUENTAS_SS } from './nomina.js';

export const EMPRESA_DEMO = 'Ferretería El Progreso S.A.S.';

// Fecha local de hoy (AAAA-MM-DD).
export function hoyLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const finMes = mes => { const [y, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const sumarMes = (mes, n) => { const [y, m] = mes.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return hoyLocal(d); };

export function datosDemo(hoy = hoyLocal()) {
  let n = 0;
  const id = p => `demo-${p}-${++n}`;
  const ahora = new Date().toISOString();
  const db = { empresas: [], cuentas: [], terceros: [], productos: [], numeraciones: [], documentos: [], items: [], aplicaciones: [], miembros: [], comprobantes: [], compras: [], empleados: [], nominas: [], fe_envios: [], bodegas: [], inventario_docs: [] };
  const eid = 'demo-empresa';
  const add = (t, r) => { const row = { id: id(t.slice(0, 3)), empresa_id: eid, creado_en: r.fecha ? `${r.fecha}T${String(10 + (n % 9)).padStart(2, '0')}:00:00.000Z` : ahora, ...r }; db[t].push(row); return row; };

  // Seis meses de operación: del primer día de hace cinco meses hasta hoy. Nada queda con fecha futura.
  const mesHoy = hoy.slice(0, 7), meses = [-5, -4, -3, -2, -1, 0].map(k => sumarMes(mesHoy, k));
  const inicio = `${meses[0]}-01`;
  const dia = (i, d) => { const f = `${meses[i]}-${String(Math.min(d, Number(finMes(meses[i]).slice(8)))).padStart(2, '0')}`; return f > hoy ? null : f; };

  /* ---------- Empresa ---------- */
  const P = parametrosPorDefecto();
  const T = {}; // terceros por clave
  const ter = (k, r) => {
    const natural = r.tipo_id !== '31';
    const base = { dv: r.tipo_id === '31' ? dvOf(r.numero) : null, tipo_persona: natural ? 'natural' : 'juridica', razon_social: natural ? '' : r.nombre,
      primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '', direccion: 'Calle 72 # 45-18', departamento: 'Atlántico', ciudad: 'Barranquilla',
      telefono: '605 360 0000', correo: '', responsable_iva: !natural, retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0, plazo_dias: 0,
      es_cliente: false, es_proveedor: false, ret_compra_fuente_pct: 0, ret_compra_iva_pct: 0, ret_compra_ica_milaje: 0 };
    if (natural) { const [a, b, c, d] = r.partes; Object.assign(base, { primer_nombre: a, segundo_nombre: b || '', primer_apellido: c, segundo_apellido: d || '' }); r.nombre = [a, b, c, d].filter(Boolean).join(' '); }
    delete r.partes;
    T[k] = add('terceros', { ...base, ...r });
    return T[k];
  };

  /* Clientes */
  ter('c1', { tipo_id: '31', numero: '901458223', nombre: 'Constructora Horizonte Caribe S.A.S.', direccion: 'Carrera 53 # 98-40', correo: 'compras@horizontecaribe.example', es_cliente: true, plazo_dias: 30, retefuente_pct: 2.5 });
  ter('c2', { tipo_id: '31', numero: '900877412', nombre: 'Inversiones La Ceiba S.A.S.', direccion: 'Calle 85 # 50-21', correo: 'pagos@laceiba.example', es_cliente: true, plazo_dias: 30 });
  ter('c3', { tipo_id: '13', numero: '72186455', partes: ['Carlos', 'Andrés', 'Rojas', 'Mejía'], direccion: 'Calle 45 # 21-10', correo: 'carlos.rojas@correo.example', es_cliente: true });
  ter('c4', { tipo_id: '31', numero: '900334156', nombre: 'Conjunto Residencial Altos del Prado P.H.', direccion: 'Carrera 46 # 76-15', correo: 'administracion@altosdelprado.example', responsable_iva: false, es_cliente: true, plazo_dias: 15 });
  ter('c5', { tipo_id: '31', numero: '830512987', nombre: 'Obras y Acabados del Litoral Ltda.', direccion: 'Vía 40 # 69-130', correo: 'tesoreria@obrasylitoral.example', es_cliente: true, plazo_dias: 45, retefuente_pct: 2.5, reteiva_pct: 15 });
  /* Proveedores */
  ter('p1', { tipo_id: '31', numero: '860355174', nombre: 'Distribuidora Ferretera Nacional S.A.', departamento: 'Bogotá, D.C.', ciudad: 'Bogotá, D.C.', direccion: 'Avenida Calle 13 # 68-50', correo: 'cartera@ferreteranacional.example', es_proveedor: true, plazo_dias: 30, ret_compra_fuente_pct: 2.5 });
  ter('p2', { tipo_id: '31', numero: '900612348', nombre: 'Inmobiliaria Santa Fe del Norte S.A.S.', direccion: 'Calle 77 # 59-35', correo: 'arriendos@santafenorte.example', es_proveedor: true, plazo_dias: 5, ret_compra_fuente_pct: 3.5 });
  ter('p3', { tipo_id: '31', numero: '802009771', nombre: 'Energía del Litoral S.A. E.S.P.', direccion: 'Carrera 55 # 72-109', correo: 'facturas@energialitoral.example', es_proveedor: true });
  ter('p4', { tipo_id: '13', numero: '32745108', partes: ['Laura', 'Patricia', 'Gómez', 'Villa'], direccion: 'Calle 93 # 47-12', correo: 'laura.gomez.contadora@correo.example', responsable_iva: false, es_proveedor: true, plazo_dias: 10, ret_compra_fuente_pct: 10 });
  ter('p5', { tipo_id: '31', numero: '901120457', nombre: 'Tecnología Global del Caribe S.A.S.', direccion: 'Carrera 51B # 80-58', correo: 'ventas@tecnoglobal.example', es_proveedor: true, ret_compra_fuente_pct: 2.5 });
  ter('banco', { tipo_id: '31', numero: '890904811', nombre: 'Banco Ejemplo de Colombia S.A.', direccion: 'Calle 72 # 54-35', correo: 'empresas@bancoejemplo.example', es_proveedor: true });
  ter('dian', { tipo_id: '31', numero: '800197268', nombre: 'Dirección de Impuestos y Aduanas Nacionales', departamento: 'Bogotá, D.C.', ciudad: 'Bogotá, D.C.', direccion: 'Carrera 8 # 6C-38', es_proveedor: true, responsable_iva: false });
  /* Entidades de seguridad social */
  ter('eps', { tipo_id: '31', numero: '800251440', nombre: 'EPS Vida Sana S.A.', es_proveedor: true, entidad_ss: ['eps'] });
  ter('afp', { tipo_id: '31', numero: '800224808', nombre: 'Fondo de Pensiones y Cesantías Futuro S.A.', es_proveedor: true, entidad_ss: ['pension', 'cesantias'] });
  ter('ccf', { tipo_id: '31', numero: '890102002', nombre: 'Caja de Compensación Familiar del Norte', es_proveedor: true, responsable_iva: false, entidad_ss: ['caja'] });
  ter('arl', { tipo_id: '31', numero: '860011153', nombre: 'ARL Protección Laboral S.A.', es_proveedor: true, entidad_ss: ['arl'] });
  ter('icbf', { tipo_id: '31', numero: '899999239', nombre: 'Instituto Colombiano de Bienestar Familiar', es_proveedor: true, responsable_iva: false, entidad_ss: ['parafiscales'] });
  ter('sena', { tipo_id: '31', numero: '899999034', nombre: 'Servicio Nacional de Aprendizaje SENA', es_proveedor: true, responsable_iva: false, entidad_ss: ['parafiscales'] });
  ter('pila', { tipo_id: '31', numero: '900156264', nombre: 'Operador de Planillas PILA Ejemplo S.A.', es_proveedor: true });
  /* Socios y empleados */
  ter('s1', { tipo_id: '13', numero: '8745123', partes: ['Jorge', 'Enrique', 'Martínez', 'Polo'], direccion: 'Carrera 59 # 79-210', correo: 'gerencia@elprogreso.example' });
  ter('s2', { tipo_id: '13', numero: '22456789', partes: ['Ana', 'Lucía', 'Torres', 'Badel'], direccion: 'Calle 80 # 62-14' });
  ter('e1', { tipo_id: '13', numero: '1045789632', partes: ['Pedro', 'José', 'Castillo', 'Pérez'], direccion: 'Calle 30 # 8-45' });
  ter('e2', { tipo_id: '13', numero: '1143256874', partes: ['Diana', 'Marcela', 'Herrera', 'Ruiz'], direccion: 'Carrera 21 # 60-33' });
  ter('e3', { tipo_id: '13', numero: '1002365417', partes: ['Luis', 'Fernando', 'Ortiz', 'Cantillo'], direccion: 'Calle 17 # 4-28' });

  const contabilidad = {
    factura_normal: false,
    nomina: { periodo: 'mensual', exonerada: true, arl_id: T.arl.id, icbf_id: T.icbf.id, sena_id: T.sena.id },
    operador_pila: T.pila.id,
  };
  db.empresas.push({ id: eid, owner: 'demo', creado_en: ahora, nombre: EMPRESA_DEMO, nit: '901234567', dv: dvOf('901234567'), tipo_persona: 'juridica', regimen: 'ordinario', responsable_iva: true,
    responsabilidades: 'O-13, O-15, O-47', actividad: '4752', direccion: 'Calle 72 # 45-18', departamento: 'Atlántico', ciudad: 'Barranquilla', telefono: '605 360 0000',
    correo: 'facturacion@elprogreso.example', pie_factura: 'Esta factura se asimila en todos sus efectos a una letra de cambio (art. 774 del Código de Comercio).', contabilidad });

  /* ---------- Productos y numeraciones ---------- */
  const PR = {};
  for (const [k, nombre, unidad, precio] of [
    ['CEM-50', 'Cemento gris uso general 50 kg', 'BULTO', 32000], ['VAR-38', 'Varilla corrugada 3/8" x 6 m', 'UND', 24500], ['PIN-GL', 'Pintura vinilo blanco tipo 1 galón', 'GAL', 58000],
    ['TAL-750', 'Taladro percutor 1/2" 750 W', 'UND', 289000], ['PVC-4', 'Tubo PVC sanitario 4" x 6 m', 'UND', 71000], ['LED-12', 'Bombillo LED 12 W luz blanca', 'UND', 8900],
    ['CAB-12', 'Cable eléctrico N.º 12 rollo 100 m', 'ROLLO', 215000], ['INST', 'Servicio de instalación eléctrica', 'SERV', 180000]]) PR[k] = add('productos', { codigo: k, nombre, unidad, precio, iva_pct: 19, activo: true, tipo: k === 'INST' ? 'servicio' : 'producto', cuenta_costo: '', bodega_id: null });
  // Bodegas: las dos con la cuenta de mercancías (los traslados entre ellas no generan asiento).
  const BOD = { principal: add('bodegas', { codigo: '01', nombre: 'Bodega principal', cuenta: '14350501', activa: true }), patio: add('bodegas', { codigo: '02', nombre: 'Patio de materiales', cuenta: '14350501', activa: true }) };
  for (const k of ['CEM-50', 'VAR-38', 'PVC-4']) PR[k].bodega_id = BOD.patio.id;
  const y = meses[0].slice(0, 4);
  const NUM = {
    FV: add('numeraciones', { tipo: 'FV', prefijo: 'FE', resolucion: '18764000000001', fecha_resolucion: `${y}-01-02`, vigencia_desde: sumarDias(inicio, -30), vigencia_hasta: `${Number(y) + 2}-01-02`, desde: 1, hasta: 5000, siguiente: 1, activa: true, electronica: true }),
    NC: add('numeraciones', { tipo: 'NC', prefijo: 'NC', resolucion: '', desde: 1, hasta: 999999999, siguiente: 1, activa: true, electronica: true }),
    ND: add('numeraciones', { tipo: 'ND', prefijo: 'ND', resolucion: '', desde: 1, hasta: 999999999, siguiente: 1, activa: true, electronica: true }),
    RC: add('numeraciones', { tipo: 'RC', prefijo: 'RC', resolucion: '', desde: 1, hasta: 999999999, siguiente: 1, activa: true, electronica: false }),
  };

  /* ---------- Documentos de venta ---------- */
  const emitir = (tipo, fecha, t, lineas, extra = {}) => {
    const its = lineas.map(([k, cantidad, precio]) => ({ producto_id: PR[k].id, codigo: k, descripcion: PR[k].nombre, unidad: PR[k].unidad, cantidad, precio: precio ?? PR[k].precio, descuento_pct: 0, iva_pct: 19, cuenta: '' }));
    const ret = tipo === 'FV' ? { retefuente_pct: t.retefuente_pct, reteiva_pct: t.reteiva_pct, reteica_milaje: t.reteica_milaje } : { retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0 };
    const tot = totales(its, ret), nu = NUM[tipo];
    const { porTarifa: _p, ...t2 } = tot;
    const d = add('documentos', { tipo, estado: 'emitido', electronica: tipo !== 'RC', prefijo: nu.prefijo, numero: nu.siguiente++, numeracion_id: nu.id, fecha, vence: null, tercero_id: t.id,
      forma_pago: 'credito', cuenta_pago: '', medio_pago: 'transferencia', ref_id: null, concepto: '', observaciones: '', anticipo: 0, ...ret, ...t2, emitido_en: ahora, ...extra });
    its.forEach((it, i) => add('items', { ...it, documento_id: d.id, orden: i }));
    return d;
  };
  const venta = (i, d, k, lineas, contado) => {
    const f = dia(i, d); if (!f) return null;
    const t = T[k];
    // Volumen de una ferretería mediana: unos $45 millones al mes antes de IVA.
    lineas = lineas.map(([k, c, pr]) => [k, k === 'INST' || k === 'TAL-750' ? c : Math.round(c * 2.4), pr]);
    return emitir('FV', f, t, lineas, contado ? { forma_pago: 'contado', cuenta_pago: contado, medio_pago: contado === P.caja ? 'efectivo' : 'transferencia' } : { vence: sumarDias(f, t.plazo_dias || 30) });
  };
  const recibo = (fecha, t, pagos, medio = 'transferencia') => {
    if (!fecha || !pagos.length) return null;
    const total = r2(pagos.reduce((s, [, v]) => s + v, 0)), nu = NUM.RC;
    const d = add('documentos', { tipo: 'RC', estado: 'emitido', electronica: false, prefijo: nu.prefijo, numero: nu.siguiente++, numeracion_id: nu.id, fecha, vence: null, tercero_id: t.id,
      forma_pago: 'contado', cuenta_pago: '', medio_pago: medio, ref_id: null, concepto: '', observaciones: '', anticipo: 0, retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0,
      bruto: total, descuento: 0, base: total, iva: 0, retefuente: 0, reteiva: 0, reteica: 0, total, neto: total, emitido_en: ahora });
    for (const [f, v] of pagos) add('aplicaciones', { recibo_id: d.id, factura_id: f.id, valor: v });
    return d;
  };

  /* ---------- Compras ---------- */
  const NC_ = { FC: 0, DS: 0, CE: 0 };
  const compra = (tipo, fecha, k, lineas, extra = {}) => {
    if (!fecha) return null;
    const t = T[k];
    const ret = { retefuente_pct: t.ret_compra_fuente_pct || 0, reteiva_pct: t.ret_compra_iva_pct || 0, reteica_milaje: t.ret_compra_ica_milaje || 0 };
    const ls = lineas.map(l => !Array.isArray(l) ? l : (([cuenta, descripcion, base, iva_pct = 19]) => ({ cuenta, descripcion, base, iva_pct }))(l));
    return add('compras', { tipo, estado: 'contabilizado', numero: ++NC_[tipo], fecha, vence: extra.cuenta_pago ? null : sumarDias(fecha, t.plazo_dias || 30), tercero_id: t.id, num_proveedor: '', observaciones: '',
      lineas: ls, ...ret, cuenta_retefuente: '', retenciones: {}, cuenta_pago: '', aplicaciones: [], anticipo: 0, ...totalesCompra(ls, ret), ...extra });
  };
  const egreso = (fecha, k, facturas) => {
    if (!fecha || !facturas.length) return null;
    const ap = facturas.map(f => ({ compra_id: f.id, valor: f.neto })), total = r2(ap.reduce((s, a) => s + a.valor, 0));
    return add('compras', { tipo: 'CE', estado: 'contabilizado', numero: ++NC_.CE, fecha, vence: null, tercero_id: T[k].id, num_proveedor: '', observaciones: '', lineas: [], retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0,
      cuenta_retefuente: '', retenciones: {}, cuenta_pago: P.bancos, aplicaciones: ap, anticipo: 0, base: 0, iva: 0, retefuente: 0, reteiva: 0, reteica: 0, total, neto: total });
  };

  /* ---------- Comprobantes contables ---------- */
  const NCO = {};
  const comp = (tipo, fecha, descripcion, lineas) => {
    if (!fecha) return null;
    NCO[tipo] = (NCO[tipo] || 0) + 1;
    return add('comprobantes', { tipo, numero: NCO[tipo], fecha, descripcion, estado: 'contabilizado', lineas: lineas.filter(l => l[2] || l[3]).map(([cuenta, t, debito, credito, detalle = descripcion]) => ({ cuenta, tercero_id: t.id, detalle, debito: r2(debito), credito: r2(credito) })) });
  };

  // Saldos iniciales (el día que empieza el demo).
  comp('SI', inicio, 'Saldos iniciales', [
    [P.caja, T.s1, 2500000, 0, 'Caja general'], [P.bancos, T.banco, 48000000, 0, 'Cuenta corriente'], 
    [P.clientes, T.c2, 3570000, 0, 'Factura anterior pendiente'], ['15280501', T.p5, 9600000, 0, 'Equipo de cómputo'], ['15920501', T.p5, 0, 1600000, 'Depreciación acumulada'],
    [P.proveedores, T.p1, 0, 7140000, 'Factura anterior pendiente'], ['31050501', T.s1, 0, 30000000, 'Aporte Jorge Martínez'], ['31050501', T.s2, 0, 30000000, 'Aporte Ana Lucía Torres'],
    ['37050501', T.s1, 32000000 - 26930000, 0, 'Utilidades de años anteriores (neto del inventario inicial)'],
  ]);
  // Inventario inicial por productos (cantidad y costo); la contrapartida son las utilidades acumuladas.
  const INI = [['CEM-50', 600, 19000], ['VAR-38', 400, 14800], ['PIN-GL', 60, 35500], ['TAL-750', 15, 178000], ['PVC-4', 120, 43500], ['LED-12', 500, 5360], ['CAB-12', 15, 132000]];
  add('inventario_docs', { tipo: 'AI', numero: 1, fecha: inicio, tercero_id: T.s1.id, concepto: 'inicial', cuenta_contra: '37050501', observaciones: 'Inventario inicial al empezar a usar AGAsoft',
    lineas: INI.map(([k, cantidad, costo]) => ({ producto_id: PR[k].id, bodega_id: PR[k].bodega_id || BOD.principal.id, sentido: 'entrada', cantidad, costo })), estado: 'contabilizado' });
  const siCliente = { id: null };

  // Préstamo bancario en el primer mes (financiación) y su cuota mensual.
  comp('CC', dia(0, 6), 'Desembolso préstamo de capital de trabajo', [[P.bancos, T.banco, 20000000, 0], ['21050501', T.banco, 0, 20000000]]);

  /* ---------- Empleados y nómina ---------- */
  const PN = paramNomina(contabilidad);
  const emp = (k, cargo, salario, area, extra = {}) => add('empleados', { tercero_id: T[k].id, cargo, contrato: 'indefinido', salario, fecha_ingreso: sumarDias(inicio, -400), area, riesgo: '1', auxilio: true,
    eps_id: T.eps.id, pension_id: T.afp.id, cesantias_id: T.afp.id, caja_id: T.ccf.id, banco: 'Banco Ejemplo', cuenta_bancaria: '', activo: true, ...extra });
  const EMP = [emp('e1', 'Asesor comercial', PN.smmlv, 'ventas'), emp('e2', 'Auxiliar contable', 2300000, 'admin'), emp('e3', 'Bodeguero', 1950000, 'ventas', { riesgo: '2' })];
  const cuentasNomina = new Set();

  // Ventas, recaudos, compras y pagos de cada mes.
  const FAC = [], COMPRAS = [];
  meses.forEach((mes, i) => {
    const k = i % 3;
    const ventas = [
      venta(i, 4, 'c1', [['CEM-50', 140 + 20 * k], ['VAR-38', 90 + 10 * i]]),
      venta(i, 7, 'c3', [['PIN-GL', 4 + k], ['LED-12', 12]], P.caja),
      venta(i, 11, 'c2', [['PVC-4', 18 + 2 * i], ['CAB-12', 3]]),
      venta(i, 15, 'c4', [['LED-12', 60], ['INST', 2 + k]]),
      venta(i, 19, 'c5', [['CEM-50', 200 + 15 * i], ['TAL-750', 2]]),
      venta(i, 24, 'c3', [['TAL-750', 1], ['PIN-GL', 2]], P.bancos),
      venta(i, 27, 'c1', [['CAB-12', 4 + k], ['PVC-4', 10]]),
    ].filter(Boolean);
    FAC.push(...ventas.map(f => ({ f, mes: i })));

    // El costo de ventas lo calcula el inventario (promedio ponderado) desde las facturas: no hay comprobante manual.
    const finM = finMes(mes) > hoy ? hoy : finMes(mes);

    // Compras del mes.
    // Mercancía por productos: entra a la bodega de cada producto (cuenta 14350501).
    const lp = (cod, cantidad, costo) => { const p = PR[cod], b = p.bodega_id || BOD.principal.id; return { producto_id: p.id, bodega_id: b, cantidad, costo, cuenta: '14350501', descripcion: p.nombre, base: r2(cantidad * costo), iva_pct: 19 }; };
    const mercancia = compra('FC', dia(i, 3), 'p1', [lp('CEM-50', 900 + 40 * i, 19500 + 150 * i), lp('VAR-38', 260 + 24 * i, 15000), lp('PIN-GL', 18, 36000), lp('CAB-12', 20, 133000),
      lp('PVC-4', 75 + 5 * i, 44000), lp('LED-12', 175, 5500), lp('TAL-750', 3, 180000)], { num_proveedor: `DFN-${4810 + i * 7}` });
    const arriendo = compra('FC', dia(i, 1), 'p2', [['51200501', `Arriendo local comercial ${mes}`, 3500000]], { num_proveedor: `ARR-${mes.replace('-', '')}` });
    const energia = compra('FC', dia(i, 14), 'p3', [['51350501', `Energía eléctrica ${mes}`, 460000 + 35000 * k]], { num_proveedor: `EL-${77120 + i}`, cuenta_pago: P.bancos });
    const honorarios = compra('DS', dia(i, 26), 'p4', [['51100501', `Honorarios asesoría contable ${mes}`, 1600000, 0]]);
    if (i === 2) compra('FC', dia(i, 9), 'p5', [['15280501', 'Computador portátil para facturación', 3900000]], { num_proveedor: 'TG-2291', cuenta_pago: P.bancos });
    COMPRAS.push({ i, mercancia, arriendo, energia, honorarios });

    // Gastos bancarios, 4 por mil y cuota del préstamo.
    comp('CC', dia(i, 28), `Gastos bancarios ${mes}`, [['53050501', T.banco, 68000 + 4000 * k, 0], [P.bancos, T.banco, 0, 68000 + 4000 * k]]);
    if (i > 0) comp('CC', dia(i, 6), `Cuota ${i} préstamo de capital de trabajo`, [['21050501', T.banco, 1000000, 0], ['53052001', T.banco, r2((20000000 - 1000000 * (i - 1)) * 0.0145), 0], [P.bancos, T.banco, 0, 1000000 + r2((20000000 - 1000000 * (i - 1)) * 0.0145)]]);
    // Depreciación del equipo de cómputo.
    if (finMes(mes) <= hoy) comp('CC', finMes(mes), `Depreciación ${mes}`, [['51600501', T.p5, i >= 2 ? 225000 : 160000, 0], ['15920501', T.p5, 0, i >= 2 ? 225000 : 160000]]);

    // Nómina mensual: se contabiliza el último día del mes (si ya pasó).
    if (finMes(mes) <= hoy) {
      const ls = EMP.map((e, j) => liquidar(e, j === 0 ? { comisiones: 350000 + 120000 * k } : j === 2 && k === 1 ? { horas: { HED: 10, HRDDF: 8 } } : {}, PN));
      cuentasDeNomina(ls).forEach(c => cuentasNomina.add(c));
      add('nominas', { periodo: 'mensual', desde: `${mes}-01`, hasta: finMes(mes), fecha: finMes(mes), lineas: ls, novedades: {}, cuenta_neto: PN.cuenta_neto, observaciones: '', numero: i + 1, estado: 'contabilizado', ...totalesNomina(ls) });
      // Pago de salarios el último día del mes.
      const sal = lineasPagoNomina({ banco: P.bancos, detalle: 'Pago de salarios', grupos: ls.map(l => ({ tercero_pago: l.tercero_id, nombre: db.terceros.find(t => t.id === l.tercero_id).nombre, filas: [{ cuenta: PN.cuenta_neto, tercero_id: l.tercero_id, saldo: l.neto, pagar: l.neto }] })) });
      comp('PN', finMes(mes), `Pago de salarios ${mes}`, sal.map(l => [l.cuenta, { id: l.tercero_id }, l.debito, l.credito, l.detalle]));
      // PILA el día 10 del mes siguiente, por el operador (si ya llegó esa fecha).
      const fPila = `${sumarMes(mes, 1)}-10`;
      if (fPila <= hoy) {
        const porEnt = {};
        for (const l of ls) for (const it of l.items) {
          const cta = it.tipo === 'ded' ? it.cuenta : it.contra;
          if (!cta || !CUENTAS_SS.test(cta)) continue;
          const t = it.tercero_id || l.tercero_id, kk = `${t}|${cta}`;
          porEnt[t] = porEnt[t] || {}; porEnt[t][cta] = r2((porEnt[t][cta] || 0) + it.valor); void kk;
        }
        const grupos = Object.entries(porEnt).map(([t, cs]) => ({ tercero_pago: t, nombre: db.terceros.find(x => x.id === t)?.nombre, filas: Object.entries(cs).map(([cuenta, v]) => ({ cuenta, tercero_id: t, saldo: v, pagar: v })) }));
        const pila = lineasPagoNomina({ banco: P.bancos, detalle: 'Pago de seguridad social (PILA)', grupos, terceroBanco: T.pila.id, detalleBanco: `Planilla PILA ${mes}` });
        comp('PN', fPila, `Pago de seguridad social (PILA) ${mes}`, pila.map(l => [l.cuenta, { id: l.tercero_id }, l.debito, l.credito, l.detalle]));
      }
    }
  });

  // Recaudos: cada factura a crédito se paga cerca de su vencimiento, con estas excepciones para que haya cartera:
  // la de Obras y Acabados de hace tres meses queda vencida, una se abona por la mitad y las del último mes siguen al día.
  const pagadas = new Set();
  const porCobrar = FAC.filter(({ f }) => f.forma_pago === 'credito');
  const vencidaC5 = porCobrar.find(({ f, mes }) => f.tercero_id === T.c5.id && mes === 2)?.f;
  const parcial = porCobrar.find(({ f, mes }) => f.tercero_id === T.c2.id && mes === 3)?.f;
  for (const { f } of porCobrar) {
    if (f === vencidaC5) continue;
    const fp = sumarDias(f.vence, -3);
    if (fp > sumarDias(hoy, -2)) continue;
    const valor = f === parcial ? r2(f.neto / 2) : f.neto;
    recibo(fp, T[Object.keys(T).find(k => T[k].id === f.tercero_id)], [[f, valor]]);
    pagadas.add(f.id);
  }
  // La factura del saldo inicial de La Ceiba se cobra en el primer mes (recibo sin factura en el sistema: va como comprobante).
  comp('CC', dia(0, 9), 'Recaudo factura anterior Inversiones La Ceiba', [[P.bancos, T.c2, 3570000, 0], [P.clientes, T.c2, 0, 3570000]]);
  void siCliente;

  // Nota crédito por devolución y nota débito por intereses de mora.
  const fNC = FAC.find(({ f, mes }) => f.tercero_id === T.c2.id && mes === 1)?.f;
  if (fNC) {
    const fe = sumarDias(fNC.fecha, 6);
    if (fe <= hoy) emitir('NC', fe, T.c2, [['PVC-4', 2]], { ref_id: fNC.id, concepto: '1', observaciones: 'Devolución de dos tubos con defecto de fábrica', forma_pago: fNC.forma_pago, vence: fNC.vence });
  }
  const fND = vencidaC5;
  if (fND) {
    const fe = sumarDias(fND.vence, 20);
    if (fe <= hoy) {
      const nu = NUM.ND, base = 85000, iva = r2(base * 0.19), total = r2(base + iva);
      const d = add('documentos', { tipo: 'ND', estado: 'emitido', electronica: true, prefijo: nu.prefijo, numero: nu.siguiente++, numeracion_id: nu.id, fecha: fe, vence: fND.vence, tercero_id: fND.tercero_id,
        forma_pago: 'credito', cuenta_pago: '', medio_pago: 'transferencia', ref_id: fND.id, concepto: '2', observaciones: 'Cobro de transporte de mercancía no facturado', anticipo: 0, retefuente_pct: 0, reteiva_pct: 0, reteica_milaje: 0,
        bruto: base, descuento: 0, base, iva, retefuente: 0, reteiva: 0, reteica: 0, total, neto: total, emitido_en: ahora });
      add('items', { documento_id: d.id, orden: 0, producto_id: null, codigo: '', descripcion: 'Transporte de mercancía a obra', unidad: 'SERV', cantidad: 1, precio: base, descuento_pct: 0, iva_pct: 19, cuenta: '' });
    }
  }

  // Pagos a proveedores: arriendo y honorarios a los pocos días; mercancía a los 30 días, salvo la del mes anterior (queda por pagar) y una vieja vencida.
  COMPRAS.forEach(({ i, mercancia, arriendo, honorarios }) => {
    if (arriendo) egreso(sumarDias(arriendo.fecha, 4) <= hoy ? sumarDias(arriendo.fecha, 4) : null, 'p2', [arriendo]);
    if (honorarios) egreso(sumarDias(honorarios.fecha, 8) <= sumarDias(hoy, -1) ? sumarDias(honorarios.fecha, 8) : null, 'p4', [honorarios]);
    if (mercancia && i !== 3) { const fp = sumarDias(mercancia.fecha, 28); if (fp <= sumarDias(hoy, -1)) egreso(fp, 'p1', [mercancia]); }
  });
  // Saldo inicial de proveedores pagado en el primer mes.
  comp('CC', dia(0, 12), 'Pago factura anterior Distribuidora Ferretera Nacional', [[P.proveedores, T.p1, 7140000, 0], [P.bancos, T.p1, 0, 7140000]]);

  // Retenciones del mes anterior pagadas a la DIAN el día 20.
  meses.forEach((mes, i) => {
    if (i === 0) return;
    const f = dia(i, 20); if (!f) return;
    const prev = COMPRAS[i - 1];
    const ret = r2([prev.mercancia, prev.arriendo, prev.energia, prev.honorarios].filter(Boolean).reduce((s, c) => s + (c.retefuente || 0), 0) + (i === 3 ? 97500 : 0));
    if (ret) comp('CC', f, `Pago retención en la fuente ${meses[i - 1]} (formulario 350)`, [[P.retefuente_pagar, T.dian, ret, 0], [P.bancos, T.dian, 0, ret]]);
  });

  /* ---------- Plan de cuentas ---------- */
  const plan = planInicial();
  const todas = [...plan, ...completarPlan(plan)];
  todas.push(...cuentasFaltantes([...cuentasNomina, PN.cuenta_neto], todas));
  for (const c of todas) add('cuentas', c);

  void pagadas;
  return db;
}
