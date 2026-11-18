// Plan Único de Cuentas para comerciantes (Decreto 2650 de 1993) y su homologación a NIIF para Pymes.
// Se cargan clases, grupos, cuentas y las subcuentas que usa la contabilización automática.
// Las subcuentas que terminan en 01, 02… las crea AGAsoft (el PUC oficial numera de 5 en 5, así que no chocan).

const PUC = `
1|Activo
11|Disponible
1105|Caja
110505|Caja general
1110|Bancos
111005|Moneda nacional
1115|Remesas en tránsito
1120|Cuentas de ahorro
112005|Bancos
1125|Fondos
12|Inversiones
1205|Acciones
1210|Cuotas o partes de interés social
1215|Bonos
1220|Cédulas
1225|Certificados
1230|Papeles comerciales
1235|Títulos
1245|Derechos fiduciarios
1295|Otras inversiones
1299|Provisiones
13|Deudores
1305|Clientes
130505|Nacionales
130510|Del exterior
1310|Cuentas corrientes comerciales
1320|Cuentas por cobrar a vinculados económicos
1325|Cuentas por cobrar a directores
1328|Aportes por cobrar
1330|Anticipos y avances
1335|Depósitos
1345|Ingresos por cobrar
1350|Retención sobre contratos
1355|Anticipo de impuestos y contribuciones o saldos a favor
135505|Anticipo de impuestos de renta y complementarios
135510|Anticipo de impuestos de industria y comercio
135515|Retención en la fuente
135517|Impuesto a las ventas retenido
135518|Impuesto de industria y comercio retenido
1360|Reclamaciones
1365|Cuentas por cobrar a trabajadores
1370|Préstamos a particulares
1380|Deudores varios
1390|Deudas de difícil cobro
1399|Provisiones
14|Inventarios
1405|Materias primas
1410|Productos en proceso
1430|Productos terminados
1435|Mercancías no fabricadas por la empresa
1455|Materiales, repuestos y accesorios
1460|Envases y empaques
1465|Inventarios en tránsito
1499|Provisiones
15|Propiedades, planta y equipo
1504|Terrenos
1508|Construcciones en curso
1516|Construcciones y edificaciones
1520|Maquinaria y equipo
1524|Equipo de oficina
1528|Equipo de computación y comunicación
1540|Flota y equipo de transporte
1592|Depreciación acumulada
1599|Provisiones
16|Intangibles
1605|Crédito mercantil
1610|Marcas
1615|Patentes
1620|Concesiones y franquicias
1625|Derechos
1635|Licencias
1698|Amortización acumulada
17|Diferidos
1705|Gastos pagados por anticipado
1710|Cargos diferidos
1798|Amortización acumulada
18|Otros activos
1805|Bienes de arte y cultura
1895|Diversos
19|Valorizaciones
1905|De inversiones
1910|De propiedades, planta y equipo
2|Pasivo
21|Obligaciones financieras
2105|Bancos nacionales
2110|Bancos del exterior
2115|Corporaciones financieras
2120|Compañías de financiamiento comercial
2195|Otras obligaciones
22|Proveedores
2205|Nacionales
2210|Del exterior
23|Cuentas por pagar
2305|Cuentas corrientes comerciales
2335|Costos y gastos por pagar
2355|Deudas con accionistas o socios
2360|Dividendos o participaciones por pagar
2365|Retención en la fuente
2367|Impuesto a las ventas retenido
2368|Impuesto de industria y comercio retenido
2370|Retenciones y aportes de nómina
2380|Acreedores varios
24|Impuestos, gravámenes y tasas
2404|De renta y complementarios
2408|Impuesto sobre las ventas por pagar
240801|IVA generado en ventas
240802|IVA descontable en compras
2412|De industria y comercio
2495|Otros
25|Obligaciones laborales
2505|Salarios por pagar
2510|Cesantías consolidadas
2515|Intereses sobre cesantías
2520|Prima de servicios
2525|Vacaciones consolidadas
26|Pasivos estimados y provisiones
2605|Para costos y gastos
2610|Para obligaciones laborales
2615|Para obligaciones fiscales
27|Diferidos
2705|Ingresos recibidos por anticipado
28|Otros pasivos
2805|Anticipos y avances recibidos
280505|De clientes
2810|Depósitos recibidos
2815|Ingresos recibidos para terceros
3|Patrimonio
31|Capital social
3105|Capital suscrito y pagado
3115|Aportes sociales
3130|Capital de personas naturales
32|Superávit de capital
3205|Prima en colocación de acciones, cuotas o partes de interés social
33|Reservas
3305|Reservas obligatorias
3310|Reservas estatutarias
3315|Reservas ocasionales
34|Revalorización del patrimonio
3405|Ajustes por inflación
36|Resultados del ejercicio
3605|Utilidad del ejercicio
3610|Pérdida del ejercicio
37|Resultados de ejercicios anteriores
3705|Utilidades acumuladas
3710|Pérdidas acumuladas
38|Superávit por valorizaciones
3805|De inversiones
3810|De propiedades, planta y equipo
4|Ingresos
41|Operacionales
4120|Industrias manufactureras
4135|Comercio al por mayor y al por menor
413501|Venta de mercancías
4140|Hoteles y restaurantes
4145|Transporte, almacenamiento y comunicaciones
4155|Actividades inmobiliarias, empresariales y de alquiler
415501|Venta de servicios
4160|Enseñanza
4165|Actividades de servicios sociales y de salud
4170|Otras actividades de servicios comunitarios, sociales y personales
4175|Devoluciones en ventas (DB)
417501|Devoluciones, rebajas y descuentos en ventas
42|No operacionales
4210|Financieros
421005|Intereses
4220|Arrendamientos
4235|Servicios
4245|Utilidad en venta de propiedades, planta y equipo
4250|Recuperaciones
4295|Diversos
5|Gastos
51|Operacionales de administración
5105|Gastos de personal
5110|Honorarios
5115|Impuestos
5120|Arrendamientos
5125|Contribuciones y afiliaciones
5130|Seguros
5135|Servicios
5140|Gastos legales
5145|Mantenimiento y reparaciones
5150|Adecuación e instalación
5155|Gastos de viaje
5160|Depreciaciones
5165|Amortizaciones
5195|Diversos
5199|Provisiones
52|Operacionales de ventas
5205|Gastos de personal
5210|Honorarios
5215|Impuestos
5220|Arrendamientos
5235|Servicios
5245|Mantenimiento y reparaciones
5260|Depreciaciones
5295|Diversos
5299|Provisiones
53|No operacionales
5305|Financieros
530505|Gastos bancarios
530520|Intereses
5310|Pérdida en venta y retiro de bienes
5315|Gastos extraordinarios
5395|Gastos diversos
54|Impuesto de renta y complementarios
5405|Impuesto de renta y complementarios
59|Ganancias y pérdidas
5905|Ganancias y pérdidas
6|Costos de ventas
61|Costo de ventas y de prestación de servicios
6120|Industrias manufactureras
6135|Comercio al por mayor y al por menor
6155|Actividades inmobiliarias, empresariales y de alquiler
62|Compras
6205|De mercancías
6225|Devoluciones en compras (CR)
7|Costos de producción o de operación
71|Materia prima
72|Mano de obra directa
73|Costos indirectos
74|Contratos de servicios
8|Cuentas de orden deudoras
81|Derechos contingentes
82|Deudoras fiscales
83|Deudoras de control
9|Cuentas de orden acreedoras
91|Responsabilidades contingentes
92|Acreedoras fiscales
93|Acreedoras de control
`.trim().split('\n').map(l => { const [codigo, nombre] = l.split('|'); return { codigo, nombre }; });

// Niveles: clase (1 dígito) y luego de a 2 dígitos: grupo (2), cuenta (4), subcuenta (6) y auxiliar (8).
// Solo las auxiliares de 8 dígitos reciben movimientos.
const NIVEL = { 1: 'Clase', 2: 'Grupo', 4: 'Cuenta', 6: 'Subcuenta', 8: 'Auxiliar' };
const DIGITOS_AUX = 8;
const nivelDe = c => NIVEL[c.length] || 'Auxiliar';
const esAuxiliar = c => /^\d{8}$/.test(String(c || ''));
// Lleva una cuenta de 4 o 6 dígitos a la auxiliar de 8 que AGAsoft crea por defecto (cuenta+05, subcuenta+01).
// Sirve para datos guardados antes de que las auxiliares fueran de 8 dígitos.
function a8(c) {
  c = String(c || '').trim();
  if (c.length === 6) return c + '01';
  if (c.length === 4) return c + '0501';
  return c;
}
// Cuentas que faltan para que cada cuenta (4) tenga subcuenta (6) y cada subcuenta tenga auxiliar (8).
function completarPlan(cuentas) {
  const cods = new Set(cuentas.map(c => c.codigo)), nuevas = [];
  const tieneHijas = (cod, n) => [...cods].some(x => x.length === n && x.startsWith(cod));
  const agregar = (codigo, nombre, padre) => {
    cods.add(codigo);
    nuevas.push({ codigo, nombre, naturaleza: padre.naturaleza || naturaleza(codigo), niif_rubro: null, niif_codigo: '', activa: true });
  };
  for (const c of [...cuentas].filter(c => c.codigo.length === 4)) if (!tieneHijas(c.codigo, 6)) agregar(c.codigo + '05', c.nombre, c);
  const seis = [...cuentas.filter(c => c.codigo.length === 6), ...nuevas.filter(c => c.codigo.length === 6)];
  for (const c of seis) if (!tieneHijas(c.codigo, 8)) agregar(c.codigo + '01', c.nombre, c);
  return nuevas;
}
// Naturaleza: débito para activo, gastos y costos (y cuentas que restan en el crédito, como depreciaciones, son crédito).
function naturaleza(c) {
  if (/^(1592|1598|1599|1698|1798|1299|1399|1499|6225)/.test(c)) return 'C';
  if (/^4175/.test(c)) return 'D';
  return ['1', '5', '6', '7', '8'].includes(c[0]) ? 'D' : 'C';
}

/* ---------- Homologación a NIIF para Pymes (secciones 4 y 5) ---------- */
// Cada rubro es una línea del estado de situación financiera (ESF) o del estado de resultados (ER).
const RUBROS = [
  // id, estado, sección, nombre
  ['efectivo', 'ESF', 'Activo corriente', 'Efectivo y equivalentes al efectivo'],
  ['inversiones_c', 'ESF', 'Activo corriente', 'Inversiones e instrumentos financieros'],
  ['deudores', 'ESF', 'Activo corriente', 'Deudores comerciales y otras cuentas por cobrar'],
  ['imp_corriente', 'ESF', 'Activo corriente', 'Activos por impuestos corrientes'],
  ['inventarios', 'ESF', 'Activo corriente', 'Inventarios'],
  ['anticipados', 'ESF', 'Activo corriente', 'Gastos pagados por anticipado'],
  ['ppe', 'ESF', 'Activo no corriente', 'Propiedades, planta y equipo'],
  ['intangibles', 'ESF', 'Activo no corriente', 'Activos intangibles'],
  ['otros_anc', 'ESF', 'Activo no corriente', 'Otros activos no corrientes'],
  ['obligaciones', 'ESF', 'Pasivo corriente', 'Obligaciones financieras'],
  ['acreedores', 'ESF', 'Pasivo corriente', 'Acreedores comerciales y otras cuentas por pagar'],
  ['imp_pagar', 'ESF', 'Pasivo corriente', 'Pasivos por impuestos corrientes'],
  ['laborales', 'ESF', 'Pasivo corriente', 'Beneficios a los empleados'],
  ['provisiones', 'ESF', 'Pasivo corriente', 'Provisiones'],
  ['otros_pc', 'ESF', 'Pasivo corriente', 'Anticipos y otros pasivos'],
  ['capital', 'ESF', 'Patrimonio', 'Capital emitido'],
  ['prima', 'ESF', 'Patrimonio', 'Prima de emisión'],
  ['reservas', 'ESF', 'Patrimonio', 'Reservas'],
  ['resultado', 'ESF', 'Patrimonio', 'Resultado del ejercicio'],
  ['acumulados', 'ESF', 'Patrimonio', 'Ganancias acumuladas'],
  ['ingresos', 'ER', 'Ingresos', 'Ingresos de actividades ordinarias'],
  ['costo', 'ER', 'Costo', 'Costo de ventas'],
  ['gasto_adm', 'ER', 'Gastos', 'Gastos de administración'],
  ['gasto_ventas', 'ER', 'Gastos', 'Gastos de distribución y ventas'],
  ['otros_ingresos', 'ER', 'Otros', 'Otros ingresos'],
  ['otros_gastos', 'ER', 'Otros', 'Otros gastos'],
  ['ing_fin', 'ER', 'Financieros', 'Ingresos financieros'],
  ['costo_fin', 'ER', 'Financieros', 'Costos financieros'],
  ['impuesto', 'ER', 'Impuesto', 'Gasto por impuesto a las ganancias'],
  ['no_niif', '—', 'No aplica', 'No se reconoce bajo NIIF (se elimina en la conversión)'],
  ['orden', '—', 'Cuentas de orden', 'Cuentas de orden (revelación)'],
].map(([id, estado, seccion, nombre]) => ({ id, estado, seccion, nombre }));
const RUBRO = Object.fromEntries(RUBROS.map(r => [r.id, r]));

// Regla por prefijo: el más largo gana.
const REGLAS = [
  ['11', 'efectivo'], ['12', 'inversiones_c'], ['13', 'deudores'], ['1355', 'imp_corriente'], ['14', 'inventarios'],
  ['15', 'ppe'], ['16', 'intangibles'], ['1705', 'anticipados'], ['1710', 'otros_anc'], ['1798', 'otros_anc'], ['18', 'otros_anc'], ['19', 'no_niif'],
  ['21', 'obligaciones'], ['22', 'acreedores'], ['23', 'acreedores'], ['2365', 'imp_pagar'], ['2367', 'imp_pagar'], ['2368', 'imp_pagar'],
  ['24', 'imp_pagar'], ['25', 'laborales'], ['26', 'provisiones'], ['27', 'otros_pc'], ['28', 'otros_pc'], ['29', 'obligaciones'],
  ['31', 'capital'], ['32', 'prima'], ['33', 'reservas'], ['34', 'acumulados'], ['36', 'resultado'], ['37', 'acumulados'], ['38', 'no_niif'],
  ['41', 'ingresos'], ['42', 'otros_ingresos'], ['4210', 'ing_fin'],
  ['51', 'gasto_adm'], ['52', 'gasto_ventas'], ['53', 'otros_gastos'], ['5305', 'costo_fin'], ['54', 'impuesto'], ['59', 'resultado'],
  ['6', 'costo'], ['7', 'costo'], ['8', 'orden'], ['9', 'orden'],
];
function rubroPorDefecto(codigo) {
  let mejor = null;
  for (const [p, r] of REGLAS) if (codigo.startsWith(p) && (!mejor || p.length > mejor[0].length)) mejor = [p, r];
  return mejor ? mejor[1] : null;
}

// Plan inicial de una empresa: cada cuenta con naturaleza, nivel y rubro NIIF.
function planInicial() {
  const base = PUC.map(c => ({ codigo: c.codigo, nombre: c.nombre, naturaleza: naturaleza(c.codigo), niif_rubro: c.codigo.length >= 2 ? rubroPorDefecto(c.codigo) : null, niif_codigo: '', activa: true }));
  return base.concat(completarPlan(base)).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

// Parámetros de la contabilización automática (se pueden cambiar por empresa).
const PARAMETROS = {
  clientes: ['13050501', 'Clientes (cuenta por cobrar)'],
  ingresos: ['41350101', 'Ingresos por ventas (si el producto no tiene cuenta propia)'],
  iva: ['24080101', 'IVA generado'],
  devoluciones: ['41750101', 'Devoluciones, rebajas y descuentos (si el producto no tiene cuenta propia)'],
  intereses: ['42100501', 'Ingresos por intereses (nota débito por intereses)'],
  retefuente: ['13551501', 'Retención en la fuente que le practican'],
  reteiva: ['13551701', 'ReteIVA que le practican'],
  reteica: ['13551801', 'ReteICA que le practican'],
  caja: ['11050501', 'Caja (recibos en efectivo)'],
  bancos: ['11100501', 'Bancos (transferencias, tarjeta, cheque)'],
  anticipos: ['28050501', 'Anticipos de clientes'],
};
const parametrosPorDefecto = () => Object.fromEntries(Object.entries(PARAMETROS).map(([k, [c]]) => [k, c]));
// Parámetros guardados por la empresa, llevados a cuentas auxiliares de 8 dígitos.
const parametrosDe = guardados => Object.fromEntries(Object.entries({ ...parametrosPorDefecto(), ...(guardados || {}) }).map(([k, c]) => [k, a8(c)]));

export { PUC, planInicial, completarPlan, a8, esAuxiliar, DIGITOS_AUX, parametrosDe, naturaleza, nivelDe, RUBROS, RUBRO, rubroPorDefecto, PARAMETROS, parametrosPorDefecto };
