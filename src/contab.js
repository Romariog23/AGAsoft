// Contabilización automática de los documentos de venta e informes contables.
// Todo es derivado: los asientos se calculan desde los documentos emitidos, así siempre cuadran con ellos.
import { cuentaIva } from './impuestos.js';
import { r2, num, linea, excedenteDe } from './calc.js';
import { asientoCompra } from './compras.js';
import { asientoNomina } from './nomina.js';
import { movimientosInv, costear, asientoInventario } from './inventario.js';
import { RUBRO, rubroPorDefecto, naturaleza, nivelDe, parametrosDe, a8, esAuxiliar } from './puc.js';

const TIPO_NOMBRE = { FV: 'Factura', NC: 'Nota crédito', ND: 'Nota débito', RC: 'Recibo de caja' };

// Movimientos contables de un documento emitido.
// ctx: { items (todas las líneas), aplicaciones, productos, param, docs (para referencias) }
function asiento(d, ctx) {
  if (d.estado !== 'emitido') return [];
  const P = parametrosDe(ctx.param);
  const ref = `${d.prefijo || ''}${d.prefijo ? ' ' : ''}${d.numero}`;
  const base = { fecha: d.fecha, doc_id: d.id, tipo: d.tipo, ref, tercero_id: d.tercero_id };
  const out = [];
  const mov = (cuenta, debito, credito, detalle, conTercero = true) => {
    debito = r2(debito); credito = r2(credito); cuenta = a8(cuenta);
    if (!debito && !credito) return;
    out.push({ ...base, cuenta, debito, credito, detalle, tercero_id: conTercero ? d.tercero_id : null });
  };
  const prods = Object.fromEntries((ctx.productos || []).map(p => [p.id, p]));

  if (d.tipo === 'RC') {
    const caja = String(d.cuenta_pago || '').trim() || (d.medio_pago === 'efectivo' ? P.caja : P.bancos);
    mov(caja, d.total, 0, `${TIPO_NOMBRE.RC} ${ref}`);
    const docs = Object.fromEntries((ctx.docs || []).map(x => [x.id, x]));
    for (const a of (ctx.aplicaciones || []).filter(a => a.recibo_id === d.id)) {
      const f = docs[a.factura_id];
      mov(P.clientes, 0, a.valor, `Abono a factura ${f ? `${f.prefijo || ''} ${f.numero}`.trim() : ''}`);
    }
    mov(P.anticipos, 0, d.anticipo, 'Anticipo recibido');
    const ex = d.retenciones?.excedente;
    if (ex?.cuenta) mov(ex.cuenta, 0, num(ex.valor), 'Valor recibido de más');
    return cuadrar(out, P);
  }

  // Factura, nota débito (suman) y nota crédito (resta).
  const its = (ctx.items || []).filter(i => i.documento_id === d.id);
  const porCuenta = {};
  const ivaPor = {};
  for (const it of its) {
    const l = linea(it);
    // Cada producto puede tener su cuenta para factura y nota débito, y otra para nota crédito o devolución.
    // Si no la tiene, se usa la de los parámetros de la empresa.
    const pr = prods[it.producto_id] || {};
    let cta;
    // La cuenta escogida en la línea manda sobre la del producto y la de la empresa.
    if (String(it.cuenta || '').trim()) cta = String(it.cuenta).trim();
    else if (d.tipo === 'NC') cta = pr.cuenta_devolucion || P.devoluciones;
    else if (pr.cuenta_ingreso) cta = pr.cuenta_ingreso;
    else cta = d.tipo === 'ND' && d.concepto === '1' ? P.intereses : P.ingresos;
    porCuenta[cta] = r2((porCuenta[cta] || 0) + l.base);
    // El IVA va a la cuenta de su tarifa (si la tarifa tiene cuenta propia) o a la de los parámetros.
    const ci = cuentaIva(ctx.tarifas, it.iva_pct, 'venta', P);
    ivaPor[ci] = r2((ivaPor[ci] || 0) + l.iva);
  }
  const signo = d.tipo === 'NC' ? -1 : 1; // NC invierte débitos y créditos
  const lado = (cuenta, valor, detalle, deudor) => {
    const dr = (deudor ? 1 : -1) * signo > 0;
    mov(cuenta, dr ? valor : 0, dr ? 0 : valor, detalle);
  };
  const det = `${TIPO_NOMBRE[d.tipo]} ${ref}`;
  // La forma de pago de contado lleva el valor a caja, bancos u otra cuenta en vez de clientes. Las notas siguen a su factura.
  const fac = d.tipo === 'FV' ? d : (ctx.docs || []).find(x => x.id === d.ref_id);
  // Nota crédito por encima del saldo de cartera: el excedente va a la cuenta escogida (clase 4 o 5), no a clientes.
  const exc = d.tipo === 'NC' && d.retenciones?.excedente?.cuenta ? excedenteDe(d) : 0;
  lado(String(fac?.cuenta_pago || '').trim() || P.clientes, r2(d.neto - exc), det, true);
  if (exc) mov(d.retenciones.excedente.cuenta, 0, exc, `Excedente sobre el saldo de la factura · ${det}`);
  // Retenciones: la cuenta del concepto escogido en el documento (las notas sin concepto propio siguen a su factura).
  // Naturaleza débito en ventas; la nota crédito la lleva al crédito.
  for (const [k, nom] of [['retefuente', 'Retención en la fuente'], ['reteiva', 'ReteIVA'], ['reteica', 'ReteICA']]) {
    const r = d.retenciones?.[k] || (d.tipo !== 'FV' ? fac?.retenciones?.[k] : null);
    lado(String(r?.cuenta || '').trim() || P[k], d[k], r?.nombre ? `${nom} · ${r.nombre}` : nom, (r?.naturaleza || 'D') === 'D');
  }
  for (const [cta, v] of Object.entries(porCuenta)) {
    // La nota crédito lleva la devolución al débito (4175 o la cuenta de devolución del producto).
    if (d.tipo === 'NC') mov(cta, v, 0, det); else lado(cta, v, det, false);
  }
  for (const [ci, v] of Object.entries(ivaPor)) lado(ci, v, 'IVA', false);
  return cuadrar(out, P);
}
// Diferencias de centavos por redondeo se llevan a la cuenta de ingresos para que el asiento cuadre.
function cuadrar(out, P) {
  const dif = r2(out.reduce((s, m) => s + m.debito - m.credito, 0));
  if (dif && Math.abs(dif) < 1 && out.length) {
    const m = out.find(x => x.cuenta === P.ingresos || x.cuenta === P.devoluciones) || out[out.length - 1];
    if (dif > 0) m.credito = r2(m.credito + dif); else m.debito = r2(m.debito - dif);
  }
  return out.map(unLado).filter(m => m.debito || m.credito);
}
// Cada línea del asiento lleva un solo valor: débito o crédito. Si quedaron los dos, se deja la diferencia.
function unLado(m) {
  if (!m.debito || !m.credito) return m;
  const n = r2(m.debito - m.credito);
  return { ...m, debito: n > 0 ? n : 0, credito: n < 0 ? -n : 0 };
}
/* ---------- Comprobantes contables manuales ---------- */
const TIPOS_COMP = { CC: { nombre: 'Nota de contabilidad', corto: 'Nota cont.', plural: 'Notas de contabilidad' }, SI: { nombre: 'Saldos iniciales', corto: 'Saldos ini.', plural: 'Saldos iniciales' },
  CI: { nombre: 'Cierre contable', corto: 'Cierre', plural: 'Cierres contables' },
  PN: { nombre: 'Comprobante de pago de nómina', corto: 'Pago nómina', plural: 'Pagos de nómina' } };

// Cierre del año: cancela los saldos de ingresos, gastos y costos (clases 4, 5, 6 y 7) de cada cuenta y tercero,
// y lleva la diferencia a la utilidad (crédito) o a la pérdida del ejercicio (débito). Un cierre anterior del mismo año no cuenta.
// terceroDefecto: tercero para las líneas que no lo traen (resultado del ejercicio y movimientos viejos sin tercero).
function cierreAnual(movs, anio, ctaUtilidad, ctaPerdida, terceroDefecto = '') {
  const ini = `${anio}-01-01`, fin = `${anio}-12-31`, saldos = {};
  for (const m of movs) {
    if (m.tipo === 'CI' || m.fecha < ini || m.fecha > fin || !/^[4-7]/.test(m.cuenta)) continue;
    const k = `${m.cuenta}|${m.tercero_id || ''}`;
    saldos[k] = r2((saldos[k] || 0) + m.debito - m.credito);
  }
  const lineas = Object.entries(saldos).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
    const [cuenta, tercero_id] = k.split('|');
    return { cuenta, tercero_id: tercero_id || terceroDefecto, detalle: `Cierre ${anio}`, debito: v < 0 ? -v : 0, credito: v > 0 ? v : 0 };
  });
  const resultado = r2(-Object.values(saldos).reduce((a, v) => a + v, 0)); // positivo = utilidad
  const ingresos = r2(-Object.entries(saldos).filter(([k]) => k.startsWith('4')).reduce((a, [, v]) => a + v, 0));
  if (resultado > 0) lineas.push({ cuenta: ctaUtilidad, tercero_id: terceroDefecto, detalle: `Utilidad del ejercicio ${anio}`, debito: 0, credito: resultado });
  else if (resultado < 0) lineas.push({ cuenta: ctaPerdida, tercero_id: terceroDefecto, detalle: `Pérdida del ejercicio ${anio}`, debito: -resultado, credito: 0 });
  return { lineas, resultado, ingresos, gastos: r2(ingresos - resultado), fecha: fin };
}
function asientoComprobante(c) {
  if (c.estado === 'anulado') return [];
  const ref = `${c.tipo} ${c.numero}`;
  return (c.lineas || []).map(l => ({ fecha: c.fecha, doc_id: c.id, tipo: c.tipo, ref, origen: 'comp', cuenta: a8(l.cuenta), tercero_id: l.tercero_id || null,
    detalle: l.detalle || c.descripcion || TIPOS_COMP[c.tipo]?.nombre || '', debito: r2(num(l.debito)), credito: r2(num(l.credito)),
    ...(l.cc1 ? { cc1: l.cc1 } : {}), ...(l.cc2 ? { cc2: l.cc2 } : {}), ...(l.cc3 ? { cc3: l.cc3 } : {}) })).filter(m => m.debito || m.credito);
}
// Errores del comprobante (lista vacía si está bien). Solo se contabiliza en cuentas auxiliares de 8 dígitos.
function erroresComprobante(c, cuentas) {
  const idx = indexar(cuentas), out = [];
  const ls = (c.lineas || []).filter(l => String(l.cuenta || '').trim() || num(l.debito) || num(l.credito));
  if (!c.fecha) out.push('Escribe la fecha.');
  if (ls.length < 2) out.push('El comprobante necesita al menos dos líneas.');
  ls.forEach((l, i) => {
    const cta = String(l.cuenta || '').trim(), n = `Línea ${i + 1}`;
    if (!cta) out.push(`${n}: falta la cuenta.`);
    else if (!esAuxiliar(cta)) out.push(`${n}: la cuenta ${cta} no es auxiliar; solo se registran movimientos en cuentas de 8 dígitos.`);
    else if (!idx[cta]) out.push(`${n}: la cuenta ${cta} no existe en el plan de cuentas.`);
    if (!String(l.tercero_id || '').trim()) out.push(`${n}: falta el tercero (puede ser cualquiera, pero todas las líneas lo llevan).`);
    const d = num(l.debito), k = num(l.credito);
    if (d < 0 || k < 0) out.push(`${n}: los valores no pueden ser negativos.`);
    else if (d && k) out.push(`${n}: lleva débito o crédito, no los dos.`);
    else if (!d && !k) out.push(`${n}: falta el valor.`);
  });
  const td = r2(ls.reduce((s, l) => s + num(l.debito), 0)), tc = r2(ls.reduce((s, l) => s + num(l.credito), 0));
  if (ls.length >= 2 && td !== tc) out.push(`No cuadra: la diferencia es ${r2(td - tc)}.`);
  return out;
}

function movimientos(S) {
  const ctx = { items: S.items, aplicaciones: S.aplicaciones, productos: S.productos, param: S.param, docs: S.documentos, tarifas: S.tarifas };
  return S.documentos.filter(d => d.estado === 'emitido').flatMap(d => asiento(d, ctx)).concat((S.comprobantes || []).flatMap(asientoComprobante)).concat((S.compras || []).flatMap(c => asientoCompra(c, S.param, S.tarifas))).concat((S.nominas || []).flatMap(asientoNomina))
    // Costo de ventas, devoluciones y ajustes de inventario, costeados con el método de la empresa.
    .concat(asientoInventario(costear(movimientosInv(S), S.metodoInv || 'promedio'), { productos: S.productos, bodegas: S.bodegas, param: S.param }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ref.localeCompare(b.ref));
}

/* ---------- Plan de cuentas ---------- */
const indexar = cuentas => Object.fromEntries(cuentas.map(c => [c.codigo, c]));
// Cadena de cuentas padre que existen en el plan (de mayor a menor nivel).
function ancestros(codigo, idx) {
  const out = [];
  for (const n of [1, 2, 4, 6, 8, 10]) if (n < codigo.length && idx[codigo.slice(0, n)]) out.push(codigo.slice(0, n));
  return out;
}
function rubroDe(codigo, idx) {
  if (idx[codigo]?.niif_rubro) return idx[codigo].niif_rubro;
  for (const a of ancestros(codigo, idx).reverse()) if (idx[a]?.niif_rubro) return idx[a].niif_rubro;
  return rubroPorDefecto(codigo);
}
const natDe = (codigo, idx) => idx[codigo]?.naturaleza || naturaleza(codigo);
const saldoNat = (codigo, idx, d, c) => r2(natDe(codigo, idx) === 'D' ? d - c : c - d);

/* ---------- Balance de prueba ---------- */
function balancePrueba(movs, cuentas, desde, hasta) {
  const idx = indexar(cuentas);
  const acc = {};
  const sumar = (cod, campo, v) => { (acc[cod] = acc[cod] || { id: 0, ic: 0, d: 0, c: 0 })[campo] += v; };
  for (const m of movs) {
    if (m.fecha > hasta) continue;
    const ant = desde && m.fecha < desde;
    for (const cod of [...ancestros(m.cuenta, idx), m.cuenta]) {
      if (ant) { sumar(cod, 'id', m.debito); sumar(cod, 'ic', m.credito); } else { sumar(cod, 'd', m.debito); sumar(cod, 'c', m.credito); }
    }
  }
  const filas = Object.entries(acc).map(([codigo, v]) => ({
    codigo, nombre: idx[codigo]?.nombre || '(cuenta que no está en el plan)', nivel: nivelDe(codigo), naturaleza: natDe(codigo, idx),
    inicial: saldoNat(codigo, idx, v.id, v.ic), debito: r2(v.d), credito: r2(v.c), final: saldoNat(codigo, idx, v.id + v.d, v.ic + v.c),
  })).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const hojas = filas.filter(f => f.codigo.length === 1);
  return { filas, debitos: r2(hojas.reduce((s, f) => s + f.debito, 0)), creditos: r2(hojas.reduce((s, f) => s + f.credito, 0)) };
}

/* ---------- Balance de prueba por tercero ---------- */
// Saldos de una cuenta (o de todas las que empiezan por ese código) separados por tercero.
function saldosPorTercero(movs, cuentas, prefijo, desde, hasta) {
  const idx = indexar(cuentas), nat = natDe(prefijo, idx), acc = {};
  for (const m of movs) {
    if (!m.cuenta.startsWith(prefijo) || m.fecha > hasta) continue;
    const k = m.tercero_id || '', x = (acc[k] = acc[k] || { tercero_id: k || null, id: 0, ic: 0, d: 0, c: 0 });
    if (desde && m.fecha < desde) { x.id += m.debito; x.ic += m.credito; } else { x.d += m.debito; x.c += m.credito; }
  }
  const sal = (d, c) => r2(nat === 'D' ? d - c : c - d);
  return Object.values(acc).map(x => ({ tercero_id: x.tercero_id, inicial: sal(x.id, x.ic), debito: r2(x.d), credito: r2(x.c), final: sal(x.id + x.d, x.ic + x.c) }))
    .filter(x => x.inicial || x.debito || x.credito || x.final);
}

/* ---------- Libro auxiliar ---------- */
// Movimientos de una cuenta (o de todas las que empiezan por ese código), con saldo corrido.
function libroAuxiliar(movs, cuentas, prefijo, desde, hasta, terceroId) {
  const idx = indexar(cuentas);
  const nat = natDe(prefijo, idx);
  const sel = movs.filter(m => m.cuenta.startsWith(prefijo) && m.fecha <= hasta && (!terceroId || m.tercero_id === terceroId));
  const previos = sel.filter(m => desde && m.fecha < desde);
  let saldo = r2(previos.reduce((s, m) => s + (nat === 'D' ? m.debito - m.credito : m.credito - m.debito), 0));
  const inicial = saldo;
  const filas = sel.filter(m => !desde || m.fecha >= desde).map(m => { saldo = r2(saldo + (nat === 'D' ? m.debito - m.credito : m.credito - m.debito)); return { ...m, saldo }; });
  return { inicial, filas, final: saldo, debitos: r2(filas.reduce((s, m) => s + m.debito, 0)), creditos: r2(filas.reduce((s, m) => s + m.credito, 0)) };
}

// Libro auxiliar de un rango de cuentas: desde la cuenta 1 hasta la 2 (o desde la 1 hasta la 1 = toda la clase 1).
// Devuelve una sección por cada cuenta auxiliar del rango que tenga saldo anterior o movimientos.
function auxiliarRango(movs, cuentas, desdeCta, hastaCta, desde, hasta, terceroId) {
  const lo = String(desdeCta || '').padEnd(8, '0'), hi = String(hastaCta || desdeCta || '').padEnd(8, '9');
  const [a, b] = lo <= hi ? [lo, hi] : [String(hastaCta).padEnd(8, '0'), String(desdeCta).padEnd(8, '9')];
  const codigos = [...new Set(movs.map(m => m.cuenta))].filter(c => c >= a && c <= b).sort();
  const secciones = codigos.map(c => ({ cuenta: c, ...libroAuxiliar(movs, cuentas, c, desde, hasta, terceroId) })).filter(x => x.inicial || x.filas.length);
  return { secciones, debitos: r2(secciones.reduce((s, x) => s + x.debitos, 0)), creditos: r2(secciones.reduce((s, x) => s + x.creditos, 0)) };
}

/* ---------- Estados financieros (NIIF para Pymes) ---------- */
// Agrupa por rubro NIIF. Valores con signo: activo y gastos en positivo al débito; pasivo, patrimonio e ingresos al crédito.
function porRubro(movs, cuentas, desde, hasta) {
  const idx = indexar(cuentas);
  const r = {};
  for (const m of movs) {
    if (m.fecha > hasta || (desde && m.fecha < desde)) continue;
    const id = rubroDe(m.cuenta, idx); if (!id) continue;
    const x = (r[id] = r[id] || { dc: 0, cuentas: {} });
    x.dc = r2(x.dc + m.debito - m.credito);
    x.cuentas[m.cuenta] = r2((x.cuentas[m.cuenta] || 0) + m.debito - m.credito);
  }
  return r;
}
function lineas(r, ids, signo, idx) {
  return ids.filter(id => r[id] && r[id].dc).map(id => ({ id, signo, nombre: RUBRO[id].nombre, valor: r2(signo * r[id].dc),
    cuentas: Object.entries(r[id].cuentas).filter(([, v]) => v).map(([c, v]) => ({ codigo: c, nombre: idx[c]?.nombre || c, valor: r2(signo * v) })).sort((a, b) => a.codigo.localeCompare(b.codigo)) }));
}
const suma = l => r2(l.reduce((s, x) => s + x.valor, 0));

function estadoResultados(movs, cuentas, desde, hasta) {
  const idx = indexar(cuentas), r = porRubro(movs, cuentas, desde, hasta);
  const ingresos = lineas(r, ['ingresos'], -1, idx), costo = lineas(r, ['costo'], 1, idx);
  const bruta = r2(suma(ingresos) - suma(costo));
  const gastos = lineas(r, ['gasto_adm', 'gasto_ventas'], 1, idx);
  const otrosI = lineas(r, ['otros_ingresos'], -1, idx), otrosG = lineas(r, ['otros_gastos'], 1, idx);
  const operacional = r2(bruta - suma(gastos) + suma(otrosI) - suma(otrosG));
  const ingFin = lineas(r, ['ing_fin'], -1, idx), costoFin = lineas(r, ['costo_fin'], 1, idx);
  const antesImp = r2(operacional + suma(ingFin) - suma(costoFin));
  const impuesto = lineas(r, ['impuesto'], 1, idx);
  const neta = r2(antesImp - suma(impuesto));
  return { secciones: [
    { titulo: 'Ingresos de actividades ordinarias', lineas: ingresos },
    { titulo: 'Costo de ventas', lineas: costo, resta: true },
    { total: 'Ganancia bruta', valor: bruta },
    { titulo: 'Gastos de operación', lineas: gastos, resta: true },
    { titulo: 'Otros ingresos', lineas: otrosI },
    { titulo: 'Otros gastos', lineas: otrosG, resta: true },
    { total: 'Ganancia (pérdida) por actividades de operación', valor: operacional },
    { titulo: 'Ingresos financieros', lineas: ingFin },
    { titulo: 'Costos financieros', lineas: costoFin, resta: true },
    { total: 'Ganancia (pérdida) antes de impuestos', valor: antesImp },
    { titulo: 'Gasto por impuesto a las ganancias', lineas: impuesto, resta: true },
    { total: 'Ganancia (pérdida) del periodo', valor: neta, final: true },
  ], neta };
}

function situacionFinanciera(movs, cuentas, hasta) {
  const idx = indexar(cuentas), r = porRubro(movs, cuentas, null, hasta);
  const ids = s => Object.values(RUBRO).filter(x => x.estado === 'ESF' && x.seccion === s && x.id !== 'resultado').map(x => x.id);
  const ac = lineas(r, ids('Activo corriente'), 1, idx), anc = lineas(r, ids('Activo no corriente'), 1, idx);
  const pc = lineas(r, ids('Pasivo corriente'), -1, idx), pnc = lineas(r, ids('Pasivo no corriente'), -1, idx);
  const pat = lineas(r, ids('Patrimonio'), -1, idx);
  // Resultado del ejercicio: lo que esté en la 36 más lo que aún no se ha cerrado de ingresos, gastos y costos.
  const resultado = r2(-((r.resultado?.dc) || 0) - ['ingresos', 'costo', 'gasto_adm', 'gasto_ventas', 'otros_ingresos', 'otros_gastos', 'ing_fin', 'costo_fin', 'impuesto'].reduce((s, id) => s + ((r[id]?.dc) || 0), 0));
  if (resultado) pat.push({ id: 'resultado', nombre: RUBRO.resultado.nombre, valor: resultado, cuentas: [] });
  const activo = r2(suma(ac) + suma(anc)), pasivo = r2(suma(pc) + suma(pnc)), patrimonio = suma(pat);
  const excluido = r.no_niif ? r2(r.no_niif.dc) : 0;
  return { grupos: [
    { titulo: 'Activo', secciones: [{ titulo: 'Activo corriente', lineas: ac }, { titulo: 'Activo no corriente', lineas: anc }], total: activo },
    { titulo: 'Pasivo', secciones: [{ titulo: 'Pasivo corriente', lineas: pc }, { titulo: 'Pasivo no corriente', lineas: pnc }], total: pasivo },
    { titulo: 'Patrimonio', secciones: [{ titulo: '', lineas: pat }], total: patrimonio },
  ], activo, pasivo, patrimonio, cuadra: Math.abs(activo - pasivo - patrimonio) < 0.01, excluido };
}

// Resumen para el panel de Inicio: ingresos (clase 4) y gastos y costos (5, 6, 7) por mes, de los últimos n meses
// hasta el mes de `hasta` (AAAA-MM-DD), y la utilidad del año de `hasta`. No cuenta el comprobante de cierre.
function resumenMensual(movs, hasta, n = 12) {
  const [y, m] = hasta.slice(0, 7).split('-').map(Number), meses = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); meses.push(d.toISOString().slice(0, 7)); }
  const idx = Object.fromEntries(meses.map((k, i) => [k, i])), ingresos = meses.map(() => 0), gastos = meses.map(() => 0);
  let utilidad = 0; const anio = hasta.slice(0, 4);
  for (const x of movs) {
    if (x.tipo === 'CI' || x.fecha > hasta || !/^[4-7]/.test(x.cuenta)) continue;
    const v = x.cuenta[0] === '4' ? x.credito - x.debito : x.debito - x.credito, i = idx[x.fecha.slice(0, 7)];
    if (i !== undefined) { if (x.cuenta[0] === '4') ingresos[i] += v; else gastos[i] += v; }
    if (x.fecha.startsWith(anio)) utilidad += x.cuenta[0] === '4' ? v : -v;
  }
  return { meses, ingresos: ingresos.map(r2), gastos: gastos.map(r2), utilidad: r2(utilidad) };
}
// Saldos de cartera por edades de vencimiento (filas de cartera() con saldo y diasVencida).
function carteraEdades(filas) {
  const out = [['Al día', 0], ['1 a 30 días', 0], ['31 a 60 días', 0], ['Más de 60 días', 0]];
  for (const c of filas) if (c.saldo > 0.009) { const d = c.diasVencida || 0; out[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : 3][1] += c.saldo; }
  return out.map(([k, v]) => [k, r2(v)]);
}

export { resumenMensual, carteraEdades, cierreAnual, auxiliarRango, unLado, saldosPorTercero, asiento, asientoComprobante, erroresComprobante, TIPOS_COMP, movimientos, balancePrueba, libroAuxiliar, estadoResultados, situacionFinanciera, rubroDe, ancestros };
