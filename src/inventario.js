// Inventario: productos inventariables (los servicios no llevan existencias), bodegas con su cuenta 14 y
// método de costeo de la empresa (promedio ponderado o PEPS; UEPS no lo permiten las NIIF).
import { primeraDist, claveDist } from './centros.js';
import { r2, num } from './calc.js';
import { esAuxiliar, parametrosDe } from './puc.js';

export const METODOS = [['promedio', 'Promedio ponderado'], ['peps', 'PEPS (primero en entrar, primero en salir)']];
export const cfgInventario = c => {
  const i = c?.inventario || {};
  return { metodo: i.metodo === 'peps' ? 'peps' : 'promedio', negativo: i.negativo === 'bloquear' ? 'bloquear' : 'avisar' };
};
export const esInventariable = p => !!p && p.tipo !== 'servicio';
export const TIPOS_ITEM = [['producto', 'Producto (inventariable)'], ['servicio', 'Servicio (sin inventario)']];

// Bodegas activas; si la empresa no ha creado ninguna, la principal con la cuenta de inventario de la empresa (sin id: se crea al usarla).
export function bodegasDe(bodegas, contab) {
  const l = (bodegas || []).filter(b => b.activa !== false).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
  return l.length ? l : [{ id: '', codigo: '01', nombre: 'Bodega principal', cuenta: parametrosDe(contab?.parametros).inventario, activa: true }];
}
// Bodegas que venden: las que solo almacenan (vende false) no se escogen en facturas; su mercancía se traslada a una que vende.
export const bodegaVende = b => !!b && b.vende !== false;
// Bodega de donde sale un producto en la factura: la del producto si vende; si no, la primera que vende.
export function bodegaVentaDe(p, bodegas) {
  const l = (bodegas || []).filter(bodegaVende), propia = l.find(b => b.id === (p?.bodega_id || ''));
  return (propia || l[0] || null)?.id ?? null;
}
export function erroresBodega(b, bodegas, cuentas) {
  const out = [], codigo = String(b.codigo || '').trim(), cuenta = String(b.cuenta || '').trim();
  if (!codigo) out.push('Escribe el código de la bodega.');
  if (!String(b.nombre || '').trim()) out.push('Escribe el nombre de la bodega.');
  if ((bodegas || []).some(x => x.id !== b.id && String(x.codigo).toLowerCase() === codigo.toLowerCase())) out.push('Ya existe una bodega con ese código.');
  if (!/^14/.test(cuenta) || !esAuxiliar(cuenta)) out.push('La cuenta de la bodega debe ser una auxiliar de 8 dígitos de la clase 14 (inventarios).');
  else if (cuentas && !cuentas.some(c => c.codigo === cuenta)) out.push(`La cuenta ${cuenta} no existe en el plan de cuentas.`);
  return out;
}

// Línea de compra por producto: el valor antes de IVA es cantidad × costo unitario y va a la cuenta 14 de la bodega.
export const esLineaProducto = l => !!l?.producto_id;
export function lineaProducto(l, bodega) {
  const cantidad = num(l.cantidad), costo = num(l.costo);
  return { ...l, cantidad, costo, base: r2(cantidad * costo), cuenta: bodega?.cuenta || l.cuenta || '', bodega_id: bodega?.id ?? l.bodega_id ?? '' };
}
export function erroresLineaProducto(l, i, productos) {
  const out = [], p = (productos || []).find(x => x.id === l.producto_id), n = `Línea ${i + 1}`;
  if (!p) out.push(`${n}: el producto no existe.`);
  else if (!esInventariable(p)) out.push(`${n}: ${p.nombre} es un servicio; regístralo por cuenta.`);
  if (num(l.cantidad) <= 0) out.push(`${n}: la cantidad debe ser mayor que cero.`);
  if (num(l.costo) <= 0) out.push(`${n}: el costo unitario debe ser mayor que cero.`);
  return out;
}

// Entradas de inventario de las compras vigentes (FC y DS por producto), base para el kardex.
export function entradasCompras(compras) {
  const out = [];
  for (const c of compras || []) {
    if (c.estado === 'anulado' || c.tipo === 'CE') continue;
    (c.lineas || []).forEach((l, i) => { if (esLineaProducto(l)) out.push({ fecha: c.fecha, doc_id: c.id, tipo: c.tipo, numero: c.numero, linea: i, producto_id: l.producto_id, bodega_id: l.bodega_id || '', cantidad: num(l.cantidad), costo: num(l.costo), total: r2(num(l.base)) }); });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/* ---------- Kardex y costo (entrega 2) ---------- */
// Documentos de inventario (tabla inventario_docs): AI ajuste (entradas y salidas con contrapartida) y, más adelante, TR traslado.
export const TIPOS_INV = { AI: { nombre: 'Ajuste de inventario', corto: 'Ajuste inv.', plural: 'Ajustes de inventario' }, TR: { nombre: 'Traslado entre bodegas', corto: 'Traslado', plural: 'Traslados entre bodegas' } };
export const CONCEPTOS_AI = [['inicial', 'Inventario inicial'], ['conteo', 'Conteo físico'], ['faltante', 'Faltante'], ['sobrante', 'Sobrante'], ['otro', 'Otro']];
// Notas crédito que devuelven mercancía: devolución (1) y anulación de la factura (2).
export const NC_DEVUELVE = ['1', '2'];
const r4 = v => Math.round((Number(v) || 0) * 1e4) / 1e4;

// Movimientos de inventario de la empresa, en orden: compras, ajustes, ventas y devoluciones.
// S: { compras, documentos, items, productos, inventario_docs }
export function movimientosInv(S) {
  const prods = Object.fromEntries((S.productos || []).map(p => [p.id, p])), out = [];
  const inv = id => esInventariable(prods[id]);
  for (const c of S.compras || []) {
    if (c.estado === 'anulado' || c.tipo === 'CE') continue;
    (c.lineas || []).forEach((l, i) => { if (esLineaProducto(l) && inv(l.producto_id)) out.push({ fecha: c.fecha, orden: 0, origen: 'compra', doc_id: c.id, tipo: c.tipo, ref: `${c.tipo} ${c.numero}`, linea: i, tercero_id: c.tercero_id, producto_id: l.producto_id, bodega_id: l.bodega_id || '', cantidad: num(l.cantidad), costo: num(l.costo), dist: primeraDist(l.cc, prods[l.producto_id]?.cc, c.cc) }); });
  }
  // Traslados: sale de una bodega y entra a otra la misma cantidad, al costo del momento (no cambia el costo ni la existencia total).
  for (const t of S.inventario_docs || []) {
    if (t.estado === 'anulado' || t.tipo !== 'TR') continue;
    (t.lineas || []).forEach((l, i) => { if (!inv(l.producto_id) || !num(l.cantidad) || (l.bodega_id || '') === (l.bodega_destino || '')) return; const q = Math.abs(num(l.cantidad));
      const b = { fecha: t.fecha, orden: 4, origen: 'traslado', doc_id: t.id, tipo: 'TR', ref: `TR ${t.numero}`, linea: i, tercero_id: t.tercero_id, producto_id: l.producto_id, costo: null };
      out.push({ ...b, bodega_id: l.bodega_id || '', bodega_par: l.bodega_destino || '', cantidad: -q }, { ...b, bodega_id: l.bodega_destino || '', bodega_par: l.bodega_id || '', cantidad: q }); });
  }
  for (const a of S.inventario_docs || []) {
    if (a.estado === 'anulado' || a.tipo !== 'AI') continue;
    (a.lineas || []).forEach((l, i) => { if (!inv(l.producto_id) || !num(l.cantidad)) return; const ent = l.sentido !== 'salida';
      out.push({ fecha: a.fecha, orden: ent ? 1 : 3, origen: 'ajuste', doc_id: a.id, tipo: 'AI', ref: `AI ${a.numero}`, linea: i, tercero_id: a.tercero_id, producto_id: l.producto_id, bodega_id: l.bodega_id || '', cantidad: (ent ? 1 : -1) * Math.abs(num(l.cantidad)), costo: ent ? num(l.costo) : null, contra: a.cuenta_contra, dist: primeraDist(l.cc, a.cc) }); });
  }
  const docs = Object.fromEntries((S.documentos || []).map(d => [d.id, d])), itemsPor = {};
  for (const it of S.items || []) (itemsPor[it.documento_id] ||= []).push(it);
  for (const d of S.documentos || []) {
    if (d.estado !== 'emitido' || !['FV', 'NC'].includes(d.tipo)) continue;
    if (d.tipo === 'NC' && !NC_DEVUELVE.includes(String(d.concepto))) continue;
    const ref = `${d.prefijo || ''}${d.prefijo ? ' ' : ''}${d.numero}`;
    (itemsPor[d.id] || []).sort((a, b) => (a.orden || 0) - (b.orden || 0)).forEach((it, i) => {
      if (!it.producto_id || !inv(it.producto_id) || !num(it.cantidad)) return;
      const p = prods[it.producto_id], venta = d.tipo === 'FV';
      out.push({ fecha: d.fecha, orden: venta ? 3 : 2, origen: venta ? 'venta' : 'devolucion', doc_id: d.id, tipo: d.tipo, ref, linea: i, tercero_id: d.tercero_id, producto_id: it.producto_id, bodega_id: it.bodega_id || p.bodega_id || '',
        cantidad: (venta ? -1 : 1) * num(it.cantidad), costo: null, factura_id: venta ? null : d.ref_id || null, factura: venta ? null : docs[d.ref_id] || null,
        dist: primeraDist(it.cc, p.cc, d.cc, venta ? null : docs[d.ref_id]?.cc) });
    });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden || String(a.ref).localeCompare(String(b.ref)) || a.linea - b.linea);
}

// Costea los movimientos con el método de la empresa. El costo unitario es uno por producto (todas las bodegas).
// Cada movimiento sale con: costo (unitario), total (con signo), saldo (cantidad), valor (saldo en pesos) y promedio.
export function costear(movs, metodo = 'promedio') {
  const st = {}, salidaFV = {}, out = [];
  for (const m0 of movs) {
    const m = { ...m0 }, s = st[m.producto_id] ||= { cant: 0, valor: 0, capas: [], ultimo: 0 }, q = Math.abs(m.cantidad);
    if (m.origen === 'traslado') {
      // Solo mueve cantidades entre bodegas: el costo es el del momento y la existencia total no cambia.
      const c = r4(s.cant > 1e-9 && s.valor > 0 ? s.valor / s.cant : s.ultimo);
      Object.assign(m, { costo: c, total: r2(Math.sign(m.cantidad) * q * c), saldo: s.cant, valor: s.valor, promedio: s.cant > 1e-9 ? r4(s.valor / s.cant) : s.ultimo });
      out.push(m); continue;
    }
    if (m.cantidad > 0) {
      // Entrada: compra o ajuste a su costo; devolución al costo con que salió en su factura (o al costo actual).
      let c = m.costo;
      if (m.origen === 'devolucion') c = salidaFV[`${m.factura_id}|${m.producto_id}`] ?? (s.cant > 0 ? s.valor / s.cant : s.ultimo);
      c = r4(c); const tot = r2(q * c);
      s.cant = r4(s.cant + q); s.valor = r2(s.valor + tot); s.capas.push({ q, c }); if (m.origen !== 'devolucion') s.ultimo = c;
      Object.assign(m, { costo: c, total: tot });
    } else {
      let tot;
      if (metodo === 'peps') {
        let falta = q; tot = 0;
        while (falta > 1e-9 && s.capas.length) { const k = s.capas[0], u = Math.min(falta, k.q); tot += u * k.c; k.q = r4(k.q - u); falta = r4(falta - u); if (k.q <= 1e-9) s.capas.shift(); }
        if (falta > 1e-9) tot += falta * s.ultimo; // sin existencias: al último costo conocido
        tot = r2(tot);
      } else {
        const unit = s.cant > 1e-9 && s.valor > 0 ? s.valor / s.cant : s.ultimo;
        tot = r2(q * unit);
        // Cuando se acaba la existencia, el valor que queda por centavos se lleva a esta salida.
        if (Math.abs(s.cant - q) < 1e-9 && s.valor > 0) tot = r2(s.valor);
        // El promedio se consume en capas solo para llevar la existencia (no cambia el costo).
        let falta = q; while (falta > 1e-9 && s.capas.length) { const k = s.capas[0], u = Math.min(falta, k.q); k.q = r4(k.q - u); falta = r4(falta - u); if (k.q <= 1e-9) s.capas.shift(); }
      }
      s.cant = r4(s.cant - q); s.valor = r2(s.valor - tot);
      if (Math.abs(s.cant) < 1e-9) { s.cant = 0; if (Math.abs(s.valor) < 1) s.valor = 0; }
      const c = q ? r4(tot / q) : 0;
      if (m.origen === 'venta') { const k = `${m.doc_id}|${m.producto_id}`; salidaFV[k] = c; }
      Object.assign(m, { costo: c, total: -tot });
    }
    Object.assign(m, { saldo: s.cant, valor: s.valor, promedio: s.cant > 1e-9 ? r4(s.valor / s.cant) : s.ultimo });
    out.push(m);
  }
  return out;
}

// Existencias por producto (y por bodega en cantidades) a una fecha.
// bodegaDef: bodega de los movimientos que no traen (ventas de productos sin bodega propia): la principal.
export function existencias(costeados, hasta = '9999-12-31', bodegaDef = '') {
  const por = {};
  for (const m of costeados) {
    if (m.fecha > hasta) continue;
    const e = por[m.producto_id] ||= { producto_id: m.producto_id, cantidad: 0, valor: 0, promedio: 0, bodegas: {} };
    e.cantidad = m.saldo; e.valor = m.valor; e.promedio = m.promedio;
    const b = m.bodega_id || bodegaDef; e.bodegas[b] = r4((e.bodegas[b] || 0) + m.cantidad);
  }
  return Object.values(por);
}

// Asiento del costo: ventas (costo de ventas contra la 14 de la bodega), devoluciones (al revés) y ajustes (14 contra la contrapartida).
// Las compras ya se contabilizan en su propio asiento.
export function asientoInventario(costeados, { productos, bodegas, param }) {
  const P = parametrosDe(param), prods = Object.fromEntries((productos || []).map(p => [p.id, p])), bods = Object.fromEntries((bodegas || []).map(b => [b.id, b]));
  const cta14 = id => bods[id]?.cuenta || P.inventario, out = {};
  const mov = (m, cuenta, debito, credito, detalle) => {
    debito = r2(debito); credito = r2(credito); if (!debito && !credito) return;
    const k = `${m.doc_id}|${cuenta}|${debito ? 'D' : 'C'}|${claveDist(m.dist)}`;
    const x = out[k] ||= { fecha: m.fecha, doc_id: m.doc_id, tipo: m.tipo, ref: m.ref, origen: 'inventario', cuenta, tercero_id: m.tercero_id || null, detalle, debito: 0, credito: 0, ...(m.dist?.length ? { _dist: m.dist } : {}) };
    x.debito = r2(x.debito + debito); x.credito = r2(x.credito + credito);
  };
  for (const m of costeados) {
    if (m.origen === 'compra' || !m.total) continue;
    if (m.origen === 'traslado') {
      // Entre bodegas con la misma cuenta 14 no hay asiento; con cuentas distintas, de la 14 de origen a la de destino.
      if (cta14(m.bodega_id) === cta14(m.bodega_par)) continue;
      const v = Math.abs(m.total), c = cta14(m.bodega_id);
      if (m.total > 0) mov(m, c, v, 0, `Entrada por traslado ${m.ref}`); else mov(m, c, 0, v, `Salida por traslado ${m.ref}`);
      continue;
    }
    const v = Math.abs(m.total), costo = prods[m.producto_id]?.cuenta_costo || P.costo_ventas, inv = cta14(m.bodega_id);
    if (m.origen === 'venta') { mov(m, costo, v, 0, `Costo de ventas ${m.ref}`); mov(m, inv, 0, v, `Salida de inventario ${m.ref}`); }
    else if (m.origen === 'devolucion') { mov(m, inv, v, 0, `Devolución al inventario ${m.ref}`); mov(m, costo, 0, v, `Reversión del costo ${m.ref}`); }
    else if (m.origen === 'ajuste') {
      const contra = m.contra || P.inventario;
      if (contra === inv) continue; // inventario inicial cuyo saldo ya estaba en la contabilidad: solo cantidades
      if (m.total > 0) { mov(m, inv, v, 0, `Entrada por ajuste ${m.ref}`); mov(m, contra, 0, v, `Ajuste de inventario ${m.ref}`); }
      else { mov(m, contra, v, 0, `Ajuste de inventario ${m.ref}`); mov(m, inv, 0, v, `Salida por ajuste ${m.ref}`); }
    }
  }
  return Object.values(out);
}
export const inventarioContable = (S, contab) => asientoInventario(costear(movimientosInv(S), cfgInventario(contab).metodo), { productos: S.productos, bodegas: S.bodegas, param: contab?.parametros ?? S.param });

// Kardex de un producto: movimientos con entradas, salidas y saldo. Con bodega, el saldo es el de esa bodega (en cantidades).
export function kardex(costeados, productoId, { desde = '', hasta = '9999-12-31', bodega = null, bodegaDef = '' } = {}) {
  const ms = costeados.filter(m => m.producto_id === productoId && (bodega == null || (m.bodega_id || bodegaDef) === bodega));
  let cant = 0, inicial = { cantidad: 0, valor: 0 };
  const filas = [];
  for (const m of ms) {
    if (m.fecha > hasta) break;
    cant = r4(cant + m.cantidad);
    const f = { ...m, entrada: m.cantidad > 0 ? m.cantidad : 0, salida: m.cantidad < 0 ? -m.cantidad : 0, saldoBodega: cant };
    if (desde && m.fecha < desde) { inicial = { cantidad: bodega == null ? m.saldo : cant, valor: m.valor }; continue; }
    filas.push(f);
  }
  return { inicial, filas, final: filas.length ? { cantidad: bodega == null ? filas.at(-1).saldo : filas.at(-1).saldoBodega, valor: filas.at(-1).valor } : inicial };
}
// Costo de ventas por producto en un período: cantidad vendida neta (ventas menos devoluciones), costo y, con los ítems, la venta.
export function costoPorProducto(costeados, items, desde, hasta) {
  const por = {};
  for (const m of costeados) {
    if (m.fecha < desde || m.fecha > hasta || (m.origen !== 'venta' && m.origen !== 'devolucion')) continue;
    const x = por[m.producto_id] ||= { producto_id: m.producto_id, cantidad: 0, costo: 0, venta: 0 };
    x.cantidad = r4(x.cantidad - m.cantidad); x.costo = r2(x.costo - m.total);
  }
  const docs = new Set(costeados.filter(m => m.fecha >= desde && m.fecha <= hasta && (m.origen === 'venta' || m.origen === 'devolucion')).map(m => `${m.doc_id}|${m.origen}`));
  for (const it of items || []) {
    const v = docs.has(`${it.documento_id}|venta`) ? 1 : docs.has(`${it.documento_id}|devolucion`) ? -1 : 0;
    if (!v || !por[it.producto_id]) continue;
    const base = num(it.cantidad) * num(it.precio) * (1 - num(it.descuento_pct) / 100);
    por[it.producto_id].venta = r2(por[it.producto_id].venta + v * base);
  }
  return Object.values(por).map(x => ({ ...x, utilidad: r2(x.venta - x.costo), margen: x.venta ? r2((x.venta - x.costo) / x.venta * 100) : 0 }));
}
