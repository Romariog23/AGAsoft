// Contabilización automática de los documentos de venta e informes contables.
// Todo es derivado: los asientos se calculan desde los documentos emitidos, así siempre cuadran con ellos.
import { r2, num, linea } from './calc.js';
import { RUBRO, rubroPorDefecto, naturaleza, nivelDe, parametrosPorDefecto } from './puc.js';

const TIPO_NOMBRE = { FV: 'Factura', NC: 'Nota crédito', ND: 'Nota débito', RC: 'Recibo de caja' };

// Movimientos contables de un documento emitido.
// ctx: { items (todas las líneas), aplicaciones, productos, param, docs (para referencias) }
function asiento(d, ctx) {
  if (d.estado !== 'emitido') return [];
  const P = { ...parametrosPorDefecto(), ...(ctx.param || {}) };
  const ref = `${d.prefijo || ''}${d.prefijo ? ' ' : ''}${d.numero}`;
  const base = { fecha: d.fecha, doc_id: d.id, tipo: d.tipo, ref, tercero_id: d.tercero_id };
  const out = [];
  const mov = (cuenta, debito, credito, detalle, conTercero = true) => {
    debito = r2(debito); credito = r2(credito);
    if (!debito && !credito) return;
    out.push({ ...base, cuenta, debito, credito, detalle, tercero_id: conTercero ? d.tercero_id : null });
  };
  const prods = Object.fromEntries((ctx.productos || []).map(p => [p.id, p]));

  if (d.tipo === 'RC') {
    const caja = d.medio_pago === 'efectivo' ? P.caja : P.bancos;
    mov(caja, d.total, 0, `${TIPO_NOMBRE.RC} ${ref}`, false);
    const docs = Object.fromEntries((ctx.docs || []).map(x => [x.id, x]));
    for (const a of (ctx.aplicaciones || []).filter(a => a.recibo_id === d.id)) {
      const f = docs[a.factura_id];
      mov(P.clientes, 0, a.valor, `Abono a factura ${f ? `${f.prefijo || ''} ${f.numero}`.trim() : ''}`);
    }
    mov(P.anticipos, 0, d.anticipo, 'Anticipo recibido');
    return cuadrar(out, P);
  }

  // Factura, nota débito (suman) y nota crédito (resta).
  const its = (ctx.items || []).filter(i => i.documento_id === d.id);
  const porCuenta = {};
  let iva = 0;
  for (const it of its) {
    const l = linea(it);
    let cta;
    if (d.tipo === 'NC') cta = P.devoluciones;
    else if (d.tipo === 'ND' && d.concepto === '1') cta = P.intereses;
    else cta = prods[it.producto_id]?.cuenta_ingreso || P.ingresos;
    porCuenta[cta] = r2((porCuenta[cta] || 0) + l.base);
    iva += l.iva;
  }
  const signo = d.tipo === 'NC' ? -1 : 1; // NC invierte débitos y créditos
  const lado = (cuenta, valor, detalle, deudor) => {
    const dr = (deudor ? 1 : -1) * signo > 0;
    mov(cuenta, dr ? valor : 0, dr ? 0 : valor, detalle);
  };
  const det = `${TIPO_NOMBRE[d.tipo]} ${ref}`;
  lado(P.clientes, d.neto, det, true);
  lado(P.retefuente, d.retefuente, 'Retención en la fuente', true);
  lado(P.reteiva, d.reteiva, 'ReteIVA', true);
  lado(P.reteica, d.reteica, 'ReteICA', true);
  for (const [cta, v] of Object.entries(porCuenta)) {
    // La nota crédito lleva la devolución al débito de la 4175 (cuenta de naturaleza débito).
    if (d.tipo === 'NC') mov(cta, v, 0, det); else lado(cta, v, det, false);
  }
  lado(P.iva, iva, 'IVA', false);
  return cuadrar(out, P);
}
// Diferencias de centavos por redondeo se llevan a la cuenta de ingresos para que el asiento cuadre.
function cuadrar(out, P) {
  const dif = r2(out.reduce((s, m) => s + m.debito - m.credito, 0));
  if (dif && Math.abs(dif) < 1 && out.length) {
    const m = out.find(x => x.cuenta === P.ingresos || x.cuenta === P.devoluciones) || out[out.length - 1];
    if (dif > 0) m.credito = r2(m.credito + dif); else m.debito = r2(m.debito - dif);
  }
  return out;
}
function movimientos(S) {
  const ctx = { items: S.items, aplicaciones: S.aplicaciones, productos: S.productos, param: S.param, docs: S.documentos };
  return S.documentos.filter(d => d.estado === 'emitido').flatMap(d => asiento(d, ctx))
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
  return ids.filter(id => r[id] && r[id].dc).map(id => ({ id, nombre: RUBRO[id].nombre, valor: r2(signo * r[id].dc),
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

export { asiento, movimientos, balancePrueba, libroAuxiliar, estadoResultados, situacionFinanciera, rubroDe, ancestros };
