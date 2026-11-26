// Plantillas de importación de AGAsoft.
// El contador descarga de la DIAN (con el token de la empresa) los documentos emitidos y recibidos,
// pasa los datos a estas plantillas y AGAsoft los valida y los carga. Funciones puras: no tocan la base de datos.
import { r2, num, parseNit, totales } from './calc.js';
import { esAuxiliar, a8 } from './puc.js';
import { nombreTercero } from './nombres.js';

// Nombre del tercero: persona natural (dos nombres y dos apellidos) o jurídica (razón social).
const colsNombre = (quien, alias) => [
  ['tipo_persona', `Tipo persona${quien} (Natural o Jurídica)`, false, ['tipopersona', 'persona', 'naturaleza', 'tipodepersona']],
  ['razon_social', `Razón social${quien}`, false, alias],
  ['primer_nombre', `Primer nombre${quien}`, false, ['primernombre', 'nombre1']], ['segundo_nombre', `Segundo nombre${quien}`, false, ['segundonombre', 'nombre2', 'otrosnombres']],
  ['primer_apellido', `Primer apellido${quien}`, false, ['primerapellido', 'apellido1']], ['segundo_apellido', `Segundo apellido${quien}`, false, ['segundoapellido', 'apellido2']],
];

// Cada columna: [clave, título en la plantilla, obligatoria, otros títulos que también se aceptan].
const PLANTILLAS = {
  terceros: {
    titulo: 'Terceros', archivo: 'plantilla-terceros.csv',
    ayuda: 'Clientes y proveedores. Si el tercero ya existe (mismo número) se deja como está y solo se marca como cliente o proveedor.',
    cols: [
      ['tipo_id', 'Tipo ID', false, ['tipo', 'tipodocumento', 'tipoidentificacion']],
      ['numero', 'NIT o cédula', true, ['nit', 'numero', 'identificacion', 'documento', 'cedula', 'nitocedula']],
      ...colsNombre('', ['razonsocial', 'nombre', 'nombrerazonsocial', 'nombreorazonsocial']),
      ['direccion', 'Dirección', false, []], ['ciudad', 'Ciudad', false, ['municipio']], ['telefono', 'Teléfono', false, ['celular']],
      ['correo', 'Correo', false, ['email', 'correoelectronico']],
      ['es_cliente', 'Cliente (S/N)', false, ['cliente']], ['es_proveedor', 'Proveedor (S/N)', false, ['proveedor']],
    ],
    ejemplo: [['NIT', '900123456-8', 'Jurídica', 'Cliente Ejemplo S.A.S.', '', '', '', '', 'Calle 1 # 2-3', 'Barranquilla', '3001234567', 'pagos@cliente.co', 'S', 'N'],
      ['CC', '1045678901', 'Natural', '', 'María', 'José', 'Pérez', 'Gómez', '', 'Barranquilla', '', '', 'S', 'N']],
  },
  ventas: {
    titulo: 'Facturas de venta', archivo: 'plantilla-facturas-venta.csv',
    ayuda: 'Una fila por cada línea de la factura. Las filas con el mismo prefijo y número forman una sola factura. Si solo tienes los totales de la DIAN, usa una línea por factura con el valor antes de IVA.',
    cols: [
      ['prefijo', 'Prefijo', false, []], ['numero', 'Número', true, ['folio', 'consecutivo', 'numerofactura']],
      ['fecha', 'Fecha', true, ['fechaemision', 'fechadeemision']], ['vence', 'Vence', false, ['fechavencimiento', 'vencimiento']],
      ['nit', 'NIT cliente', true, ['nitcliente', 'nitreceptor', 'nitadquiriente', 'identificacioncliente']],
      ...colsNombre(' cliente', ['razonsocialcliente', 'nombrecliente', 'nombrereceptor', 'cliente', 'razonsocial', 'nombre']),
      ['codigo', 'Código', false, ['codigoproducto', 'referencia']], ['descripcion', 'Descripción', false, ['concepto', 'detalle']],
      ['cantidad', 'Cantidad', false, ['cant']], ['precio', 'Valor unitario antes de IVA', true, ['precio', 'valorunitario', 'preciounitario', 'valor', 'base', 'valorantesdeiva']],
      ['descuento_pct', 'Descuento %', false, ['descuento']], ['iva_pct', 'IVA %', false, ['iva', 'tarifaiva']],
      ['cuenta', 'Cuenta ingreso', false, ['cuenta', 'cuentacontable']],
      ['retefuente_pct', 'Retefuente %', false, ['retefuente']], ['reteiva_pct', 'ReteIVA %', false, ['reteiva']], ['reteica_milaje', 'ReteICA por mil', false, ['reteica']],
      ['electronica', 'Electrónica (S/N)', false, ['electronica']],
    ],
    ejemplo: [['FE', '101', '2026-10-05', '2026-11-04', '900123456-8', 'Jurídica', 'Cliente Ejemplo S.A.S.', '', '', '', '', 'ASE-01', 'Asesoría contable octubre', '1', '1200000', '0', '19', '', '2.5', '15', '4.14', 'S'],
      ['FE', '101', '2026-10-05', '2026-11-04', '900123456-8', 'Jurídica', 'Cliente Ejemplo S.A.S.', '', '', '', '', '', 'Papelería', '2', '18500', '0', '19', '', '2.5', '15', '4.14', 'S']],
  },
  compras: {
    titulo: 'Facturas de compra y documentos soporte', archivo: 'plantilla-compras.csv',
    ayuda: 'Una fila por cada concepto. Las filas con el mismo tipo, NIT del proveedor y número forman un solo documento. Tipo FC = factura de proveedor, DS = documento soporte.',
    cols: [
      ['tipo', 'Tipo (FC o DS)', false, ['tipo', 'tipodocumento']],
      ['num_proveedor', 'Número del proveedor', true, ['numero', 'numerofactura', 'folio', 'prefijoynumero']],
      ['fecha', 'Fecha', true, ['fechaemision', 'fechadeemision']], ['vence', 'Vence', false, ['fechavencimiento', 'vencimiento']],
      ['nit', 'NIT proveedor', true, ['nitproveedor', 'nitemisor', 'identificacionproveedor']],
      ...colsNombre(' proveedor', ['razonsocialproveedor', 'nombreproveedor', 'nombreemisor', 'proveedor', 'razonsocial', 'nombre']),
      ['cuenta', 'Cuenta (gasto, costo, inventario o activo)', true, ['cuenta', 'cuentacontable', 'cuentagasto']],
      ['descripcion', 'Descripción', false, ['concepto', 'detalle']],
      ['base', 'Valor antes de IVA', true, ['valor', 'base', 'subtotal', 'valorantesdeiva']], ['iva_pct', 'IVA %', false, ['iva', 'tarifaiva']],
      ['retefuente_pct', 'Retefuente %', false, ['retefuente']], ['reteiva_pct', 'ReteIVA %', false, ['reteiva']], ['reteica_milaje', 'ReteICA por mil', false, ['reteica']],
    ],
    ejemplo: [['FC', 'FV-5521', '2026-10-03', '2026-11-02', '830122566-1', 'Jurídica', 'Telecomunicaciones Demo S.A.S.', '', '', '', '', '51350501', 'Internet octubre', '250000', '19', '4', '0', '0'],
      ['DS', 'DS-1', '2026-10-10', '', '1045678901', 'Natural', '', 'María', 'José', 'Pérez', 'Gómez', '51100501', 'Honorarios', '800000', '0', '10', '0', '0']],
  },
  saldos: {
    titulo: 'Saldos iniciales', archivo: 'plantilla-saldos-iniciales.csv',
    ayuda: 'El saldo de cada cuenta a la fecha en que empiezas a llevar la contabilidad en AGAsoft (por ejemplo el balance de prueba por tercero al 31 de diciembre). Una fila por cuenta y tercero; cada línea lleva tercero. Se crea un solo comprobante de saldos iniciales y debe cuadrar (débitos = créditos). Si la cuenta auxiliar no existe y escribes su nombre, se crea dentro de su subcuenta.',
    cols: [
      ['cuenta', 'Cuenta', true, ['cuentacontable', 'codigo', 'codigocuenta', 'auxiliar']],
      ['nombre_cuenta', 'Nombre cuenta', false, ['nombredelacuenta', 'descripcioncuenta']],
      ['nit', 'NIT o cédula tercero', true, ['nit', 'nittercero', 'identificacion', 'tercero', 'documento', 'cedula']],
      ...colsNombre(' tercero', ['razonsocialtercero', 'nombretercero', 'razonsocial', 'nombre']),
      ['detalle', 'Detalle', false, ['concepto', 'descripcion']],
      ['cruce', 'Documento cruce', false, ['documentocruce', 'doccruce', 'factura', 'numerofactura', 'documentoreferencia']],
      ['vence', 'Vence', false, ['vencimiento', 'fechavencimiento']],
      ['debito', 'Débito', false, ['debe', 'debitos', 'saldodebito']], ['credito', 'Crédito', false, ['haber', 'creditos', 'saldocredito']],
    ],
    ejemplo: [['11100501', 'Bancos nacionales', '900123456-8', 'Jurídica', 'Banco Ejemplo S.A.', '', '', '', '', 'Saldo en cuenta corriente', '', '', '15000000', ''],
      ['13050501', 'Clientes nacionales', '900123456-8', 'Jurídica', 'Banco Ejemplo S.A.', '', '', '', '', 'Factura pendiente', 'FE 1520', '31/01/2027', '2500000', ''],
      ['31050501', 'Capital suscrito y pagado', '1045678901', 'Natural', '', 'María', 'José', 'Pérez', 'Gómez', 'Aporte del socio', '', '', '', '17500000']],
  },
};

const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// CSV listo para abrir en Excel (separado por punto y coma, con BOM para las tildes).
function csvPlantilla(cual) {
  const p = PLANTILLAS[cual];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + [p.cols.map(c => c[1]), ...p.ejemplo].map(r => r.map(q).join(';')).join('\r\n');
}

// Valores como vienen de Excel en Colombia: "1.234.567,89", "$ 1,234,567.89", "-850000", "19%".
function parseValor(v) {
  let s = String(v ?? '').replace(/[$\s%]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!s) return 0;
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (coma >= 0) s = /,\d{3}(,\d{3})*$/.test(s) && !/,\d{1,2}$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else if (punto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return num(s);
}
// Fechas 2026-10-05, 05/10/2026, 5-10-2026 o 2026/10/05. Devuelve AAAA-MM-DD o ''.
function parseFecha(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return fechaOk(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return fechaOk(m[3], m[2], m[1]);
  return '';
}
function fechaOk(y, mo, d) {
  const f = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = new Date(f + 'T00:00:00Z');
  return !isNaN(t) && t.toISOString().slice(0, 10) === f ? f : '';
}
const siNo = (v, defecto) => { const s = norm(v); if (!s) return defecto; return ['s', 'si', 'x', '1', 'true', 'yes'].includes(s); };
// Tarifa de IVA: acepta 19, "19%" o 0,19.
const tarifa = v => { const n = parseValor(v); return n > 0 && n < 1 ? r2(n * 100) : n; };

// Identificación del tercero: NIT (con o sin dígito) o cédula.
function leerId(numero, tipo) {
  const raw = String(numero ?? '').trim().replace(/[.\s]/g, '');
  if (!raw) return { error: 'falta el NIT o la cédula' };
  const t = norm(tipo);
  const esNit = t ? ['nit', '31'].includes(t) : raw.includes('-') || /^[89]\d{8}$/.test(raw);
  if (!esNit) { const n = raw.split('-')[0]; return /^\d{3,15}$/.test(n) ? { tipo_id: '13', numero: n, dv: null } : { error: `identificación "${numero}" no válida` }; }
  const p = parseNit(raw);
  return p.error ? { error: `NIT ${numero}: ${p.error}` } : { tipo_id: '31', numero: p.nit, dv: p.dv };
}

// Lee las filas del CSV (la primera con los títulos) y las convierte en objetos con las claves de la plantilla.
function leerFilas(cual, rows) {
  const p = PLANTILLAS[cual];
  const hi = rows.findIndex(r => p.cols.filter(c => c[2]).every(c => r.some(h => [norm(c[1]), norm(c[0]), ...c[3]].includes(norm(h)))));
  const head = (rows[hi >= 0 ? hi : 0] || []).map(norm);
  const map = {};
  for (const [k, titulo, , alias] of p.cols) { const i = head.findIndex(h => h === norm(titulo) || h === norm(k) || alias.includes(h)); if (i >= 0) map[k] = i; }
  const faltan = p.cols.filter(c => c[2] && map[c[0]] === undefined).map(c => c[1]);
  const inicio = (hi >= 0 ? hi : 0) + 1;
  const filas = rows.slice(inicio).map((r, i) => ({ _fila: inicio + i + 1, ...Object.fromEntries(Object.entries(map).map(([k, j]) => [k, String(r[j] ?? '').trim()])) }))
    .filter(f => Object.entries(f).some(([k, v]) => k !== '_fila' && v));
  return { filas, faltan, columnas: Object.keys(map) };
}

// Terceros que hay que crear o marcar. ctx.terceros = los que ya existen.
function terceroDe(f, ctx, nuevos, rol) {
  const id = leerId(f.nit ?? f.numero, f.tipo_id);
  if (id.error) return { error: id.error };
  const existe = ctx.terceros.find(t => t.numero === id.numero);
  if (existe) return { numero: id.numero, existe };
  let n = nuevos.get(id.numero);
  if (!n) {
    if (![f.razon_social, f.primer_nombre, f.primer_apellido].some(Boolean)) return { error: `el tercero ${id.numero} no existe: escribe su razón social o sus nombres y apellidos en la plantilla` };
    const nom = nombreTercero(f, id.tipo_id); if (nom.error) return { error: `tercero ${id.numero}: ${nom.error}` };
    n = { ...id, ...nom, es_cliente: rol === 'cliente', es_proveedor: rol === 'proveedor' };
    nuevos.set(id.numero, n);
  } else if (rol === 'cliente') n.es_cliente = true; else if (rol === 'proveedor') n.es_proveedor = true;
  return { numero: id.numero, nuevo: n };
}

function prepararTerceros(filas, ctx) {
  const crear = new Map(), marcar = [], errores = [];
  for (const f of filas) {
    const id = leerId(f.numero, f.tipo_id);
    if (id.error) { errores.push(`Fila ${f._fila}: ${id.error}`); continue; }
    const nom = nombreTercero(f, id.tipo_id);
    if (nom.error) { errores.push(`Fila ${f._fila}: ${nom.error}`); continue; }
    const cli = siNo(f.es_cliente, true), prov = siNo(f.es_proveedor, false);
    const existe = ctx.terceros.find(t => t.numero === id.numero);
    if (existe) { if ((cli && existe.es_cliente === false) || (prov && !existe.es_proveedor)) marcar.push({ id: existe.id, es_cliente: existe.es_cliente !== false || cli, es_proveedor: !!existe.es_proveedor || prov }); continue; }
    if (crear.has(id.numero)) { errores.push(`Fila ${f._fila}: el número ${id.numero} está repetido en la plantilla`); continue; }
    crear.set(id.numero, { ...id, ...nom, direccion: f.direccion || '', ciudad: f.ciudad || '', telefono: f.telefono || '', correo: f.correo || '', es_cliente: cli, es_proveedor: prov });
  }
  return { terceros: [...crear.values()], marcar, docs: [], errores };
}

const cuentaValida = (c, ctx) => !c || (esAuxiliar(c) && ctx.cuentas.some(x => x.codigo === c));

function prepararVentas(filas, ctx) {
  const nuevos = new Map(), grupos = new Map(), errores = [];
  for (const f of filas) {
    const numero = Math.round(parseValor(f.numero)), prefijo = String(f.prefijo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!numero) { errores.push(`Fila ${f._fila}: falta el número de la factura`); continue; }
    const k = `${prefijo}|${numero}`;
    const g = grupos.get(k) || { prefijo, numero, filas: [] };
    g.filas.push(f); grupos.set(k, g);
  }
  const docs = [];
  for (const g of grupos.values()) {
    const f0 = g.filas[0], nom = `${g.prefijo} ${g.numero}`.trim(), errs = [];
    if (ctx.documentos.some(d => d.tipo === 'FV' && (d.prefijo || '') === g.prefijo && Number(d.numero) === g.numero)) { errores.push(`Factura ${nom}: ya existe en AGAsoft, no se importa de nuevo`); continue; }
    const fecha = parseFecha(f0.fecha), vence = f0.vence ? parseFecha(f0.vence) : '';
    if (!fecha) errs.push(`fecha "${f0.fecha}" no válida (usa AAAA-MM-DD o DD/MM/AAAA)`);
    if (f0.vence && !vence) errs.push(`vencimiento "${f0.vence}" no válido`);
    const t = terceroDe(f0, ctx, nuevos, 'cliente'); if (t.error) errs.push(t.error);
    const items = g.filas.map(f => {
      const cuenta = String(f.cuenta || '').trim().split(' ')[0];
      if (!cuentaValida(cuenta, ctx)) errs.push(`fila ${f._fila}: la cuenta ${cuenta} no es una auxiliar de 8 dígitos del plan de cuentas`);
      const precio = parseValor(f.precio), cantidad = f.cantidad ? parseValor(f.cantidad) : 1;
      if (precio < 0 || cantidad <= 0) errs.push(`fila ${f._fila}: revisa la cantidad y el valor`);
      const p = f.codigo && ctx.productos?.find(x => x.codigo.toLowerCase() === f.codigo.toLowerCase());
      return { producto_id: p?.id || '', codigo: f.codigo || '', descripcion: f.descripcion || p?.nombre || 'Venta', unidad: p?.unidad || 'UND', cantidad, precio, descuento_pct: parseValor(f.descuento_pct), iva_pct: tarifa(f.iva_pct), cuenta };
    });
    const ret = { retefuente_pct: parseValor(f0.retefuente_pct), reteiva_pct: parseValor(f0.reteiva_pct), reteica_milaje: parseValor(f0.reteica_milaje) };
    const tot = totales(items, ret);
    if (tot.total <= 0) errs.push('el total debe ser mayor que cero');
    if (errs.length) { errores.push(`Factura ${nom}: ${errs.join('; ')}`); continue; }
    const credito = vence && vence > fecha;
    docs.push({ tercero: t.numero, items, doc: { tipo: 'FV', prefijo: g.prefijo, numero: g.numero, fecha, vence: credito ? vence : fecha, forma_pago: credito ? 'credito' : 'contado', medio_pago: 'transferencia',
      electronica: siNo(f0.electronica, true), observaciones: 'Importada desde plantilla', ...ret,
      bruto: tot.bruto, descuento: tot.descuento, base: tot.base, iva: tot.iva, retefuente: tot.retefuente, reteiva: tot.reteiva, reteica: tot.reteica, total: tot.total, neto: tot.neto, anticipo: 0 } });
  }
  return { terceros: [...nuevos.values()], marcar: [], docs, errores };
}

function prepararCompras(filas, ctx, totalesCompra) {
  const nuevos = new Map(), grupos = new Map(), errores = [];
  for (const f of filas) {
    const tipo = String(f.tipo || 'FC').toUpperCase().trim();
    if (!['FC', 'DS'].includes(tipo)) { errores.push(`Fila ${f._fila}: el tipo debe ser FC o DS`); continue; }
    if (!f.num_proveedor) { errores.push(`Fila ${f._fila}: falta el número del documento`); continue; }
    const id = leerId(f.nit);
    const k = `${tipo}|${id.numero || f.nit}|${f.num_proveedor}`;
    const g = grupos.get(k) || { tipo, filas: [] };
    g.filas.push(f); grupos.set(k, g);
  }
  const docs = [];
  for (const g of grupos.values()) {
    const f0 = g.filas[0], nom = `${g.tipo} ${f0.num_proveedor}`, errs = [];
    const t = terceroDe(f0, ctx, nuevos, 'proveedor'); if (t.error) errs.push(t.error);
    if (t.existe && ctx.compras.some(c => c.estado !== 'anulado' && c.tipo === g.tipo && c.tercero_id === t.existe.id && String(c.num_proveedor).trim().toUpperCase() === f0.num_proveedor.toUpperCase())) {
      errores.push(`${nom} de ${t.existe.nombre}: ya existe en AGAsoft, no se importa de nuevo`); continue;
    }
    const fecha = parseFecha(f0.fecha), vence = f0.vence ? parseFecha(f0.vence) : '';
    if (!fecha) errs.push(`fecha "${f0.fecha}" no válida (usa AAAA-MM-DD o DD/MM/AAAA)`);
    if (f0.vence && !vence) errs.push(`vencimiento "${f0.vence}" no válido`);
    const lineas = g.filas.map(f => {
      const cuenta = String(f.cuenta || '').trim().split(' ')[0];
      if (!cuenta || !cuentaValida(cuenta, ctx)) errs.push(`fila ${f._fila}: la cuenta "${cuenta}" no es una auxiliar de 8 dígitos del plan de cuentas`);
      const base = r2(parseValor(f.base)); if (base < 0) errs.push(`fila ${f._fila}: el valor no puede ser negativo`);
      return { cuenta, descripcion: f.descripcion || '', base, iva_pct: tarifa(f.iva_pct) };
    });
    const ret = { retefuente_pct: parseValor(f0.retefuente_pct), reteiva_pct: parseValor(f0.reteiva_pct), reteica_milaje: parseValor(f0.reteica_milaje) };
    const tot = totalesCompra(lineas, ret);
    if (tot.total <= 0) errs.push('el total debe ser mayor que cero');
    if (errs.length) { errores.push(`${nom}: ${errs.join('; ')}`); continue; }
    docs.push({ tercero: t.numero, compra: { tipo: g.tipo, num_proveedor: f0.num_proveedor, fecha, vence: vence || null, lineas, ...ret, cuenta_retefuente: '', cuenta_pago: '', aplicaciones: [], anticipo: 0,
      observaciones: 'Importada desde plantilla', estado: 'contabilizado', ...tot } });
  }
  return { terceros: [...nuevos.values()], marcar: [], docs, errores };
}

// Saldos iniciales: líneas del comprobante SI, terceros y cuentas auxiliares que faltan. ctx.cuentas, ctx.terceros.
function prepararSaldos(filas, ctx) {
  const nuevos = new Map(), cuentasNuevas = new Map(), lineas = [], errores = [];
  const existe = c => ctx.cuentas.some(x => x.codigo === c) || cuentasNuevas.has(c);
  for (const f of filas) {
    const raw = String(f.cuenta || '').replace(/\D/g, '');
    const cuenta = raw.length === 6 ? a8(raw) : raw;
    if (!esAuxiliar(cuenta)) { errores.push(`Fila ${f._fila}: la cuenta "${f.cuenta}" no es auxiliar (8 dígitos).`); continue; }
    if (!existe(cuenta)) {
      const padre = ctx.cuentas.find(x => x.codigo === cuenta.slice(0, 6));
      if (!padre || !f.nombre_cuenta) { errores.push(`Fila ${f._fila}: la cuenta ${cuenta} no existe${padre ? '; escribe su nombre en la columna Nombre cuenta para crearla' : ` y tampoco su subcuenta ${cuenta.slice(0, 6)}`}.`); continue; }
      cuentasNuevas.set(cuenta, { codigo: cuenta, nombre: f.nombre_cuenta, naturaleza: padre.naturaleza });
    }
    let d = parseValor(f.debito), c = parseValor(f.credito);
    if (d < 0) { c += -d; d = 0; } if (c < 0) { d += -c; c = 0; }
    d = r2(d); c = r2(c);
    if (!d && !c) continue;
    const t = terceroDe(f, ctx, nuevos, '');
    if (t.error) { errores.push(`Fila ${f._fila}: ${t.error}`); continue; }
    const vence = f.vence ? parseFecha(f.vence) : '';
    if (f.vence && !vence) { errores.push(`Fila ${f._fila}: la fecha de vencimiento "${f.vence}" no se entiende (usa DD/MM/AAAA).`); continue; }
    lineas.push({ cuenta, tercero: t.numero, detalle: f.detalle || 'Saldo inicial', debito: d > c ? r2(d - c) : 0, credito: c > d ? r2(c - d) : 0, ...(f.cruce ? { cruce: String(f.cruce).trim() } : {}), ...(vence ? { vence } : {}) });
  }
  const debito = r2(lineas.reduce((x, l) => x + l.debito, 0)), credito = r2(lineas.reduce((x, l) => x + l.credito, 0));
  return { terceros: [...nuevos.values()], cuentasNuevas: [...cuentasNuevas.values()], lineas, debito, credito, diferencia: r2(debito - credito), errores, docs: [], marcar: [] };
}

export { prepararSaldos };
export { PLANTILLAS, csvPlantilla, leerFilas, prepararTerceros, prepararVentas, prepararCompras, parseValor, parseFecha, leerId };
