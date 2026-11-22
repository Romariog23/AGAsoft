// Centros de costo: hasta 3 niveles independientes que nombra la empresa (por ejemplo Máquinas y Obras).
// El nivel 1 es obligatorio en las líneas dentro del alcance; los niveles 2 y 3 son opcionales y se habilitan.
// Cada línea contable lleva cc1, cc2 y cc3 (id del centro de cada nivel): son un filtro de la misma contabilidad,
// por eso los informes por centro de costo siempre suman igual que los contables.
export const ALCANCES = [['resultado', 'Solo cuentas de resultado (clases 4, 5, 6 y 7)'], ['todo', 'Cuentas de balance y de resultado']];
export function cfgCC(contab) {
  const x = contab?.cc || {}, nv = x.niveles || [];
  const n2 = nv[1]?.activo === true, n3 = n2 && nv[2]?.activo === true;
  return { activo: x.activo === true, alcance: x.alcance === 'todo' ? 'todo' : 'resultado',
    niveles: [{ nivel: 1, nombre: String(nv[0]?.nombre || '').trim() || 'Centro de costo', activo: true, obligatorio: true },
      { nivel: 2, nombre: String(nv[1]?.nombre || '').trim() || 'Nivel 2', activo: n2, obligatorio: false },
      { nivel: 3, nombre: String(nv[2]?.nombre || '').trim() || 'Nivel 3', activo: n3, obligatorio: false }] };
}
export const nivelesActivos = cfg => cfg.niveles.filter(n => n.activo);
// ¿Esta cuenta lleva centro de costo?
export const cuentaConCC = (cfg, cuenta) => !!cfg?.activo && (cfg.alcance === 'todo' || /^[4-7]/.test(String(cuenta || '')));
export const centrosDe = (centros, nivel, todos = false) => (centros || []).filter(c => Number(c.nivel) === nivel && (todos || c.activo !== false)).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));

// Errores de centro de costo en líneas contables [{cuenta, cc1, cc2, cc3}].
export function erroresCC(lineas, cfg, centros, etiqueta = i => `Línea ${i + 1}`) {
  if (!cfg?.activo) return [];
  const out = [], por = Object.fromEntries((centros || []).map(c => [c.id, c]));
  (lineas || []).forEach((l, i) => {
    const en = cuentaConCC(cfg, l.cuenta);
    for (const n of cfg.niveles) {
      const v = l[`cc${n.nivel}`];
      if (!v) { if (en && n.activo && n.obligatorio) out.push(`${etiqueta(i)}: falta el centro de costo "${n.nombre}" (la cuenta ${l.cuenta} lleva centro de costo).`); continue; }
      const c = por[v];
      if (!c || Number(c.nivel) !== n.nivel) out.push(`${etiqueta(i)}: el centro de "${n.nombre}" escogido no existe.`);
      else if (!n.activo) out.push(`${etiqueta(i)}: el nivel ${n.nombre} no está habilitado.`);
    }
  });
  return out;
}
// Deja solo los centros de las líneas que los llevan.
export const limpiarCC = (l, cfg) => { const r = { ...l }; for (const k of ['cc1', 'cc2', 'cc3']) { if (!cuentaConCC(cfg, l.cuenta) || !r[k]) delete r[k]; } return r; };
export function erroresCentro(c, centros) {
  const out = [], cod = String(c.codigo || '').trim();
  if (!cod) out.push('Escribe el código.');
  if (!String(c.nombre || '').trim()) out.push('Escribe el nombre.');
  if ((centros || []).some(x => x.id !== c.id && Number(x.nivel) === Number(c.nivel) && String(x.codigo).toLowerCase() === cod.toLowerCase())) out.push('Ya existe un centro con ese código en este nivel.');
  return out;
}

/* ---------- Distribución en documentos automáticos ---------- */
// Una distribución es una lista [{cc1, cc2, cc3, pct}]: un solo centro es [{cc1, …, pct: 100}].
// Se escoge en el documento (centro general), en cada línea (cambia el general), en el producto o en el empleado.
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const r4 = v => Math.round((Number(v) || 0) * 1e4) / 1e4;
export function normDist(dist) {
  const ls = (Array.isArray(dist) ? dist : []).filter(x => x && (x.cc1 || x.cc2 || x.cc3));
  if (ls.length === 1) return [{ ...soloCC(ls[0]), pct: 100 }];
  return ls.map(x => ({ ...soloCC(x), pct: r4(x.pct) }));
}
const soloCC = x => Object.fromEntries(['cc1', 'cc2', 'cc3'].filter(k => x[k]).map(k => [k, x[k]]));
export const tieneDist = d => normDist(d).length > 0;
// La primera distribución que tenga algo (línea, producto, documento…).
export const primeraDist = (...ds) => { for (const d of ds) { const n = normDist(d); if (n.length) return n; } return []; };
const claveCC = x => `${x.cc1 || ''}|${x.cc2 || ''}|${x.cc3 || ''}`;
export const claveDist = d => normDist(d).map(x => `${claveCC(x)}:${x.pct}`).join(';');
// Une varias distribuciones según el valor de cada una (para clientes, proveedores, IVA y retenciones del documento).
export function distPonderada(partes) {
  const pesos = {}, ccs = {};
  let total = 0;
  for (const { dist, valor } of partes || []) {
    const v = Math.abs(Number(valor) || 0), n = normDist(dist);
    if (!v || !n.length) continue;
    total += v;
    for (const x of n) { const k = claveCC(x); ccs[k] = soloCC(x); pesos[k] = (pesos[k] || 0) + v * x.pct / 100; }
  }
  if (!total) return [];
  const ks = Object.keys(pesos), out = ks.map(k => ({ ...ccs[k], pct: r4(pesos[k] / total * 100) }));
  const dif = r4(100 - out.reduce((s, x) => s + x.pct, 0)); if (dif && out.length) out[out.length - 1].pct = r4(out[out.length - 1].pct + dif);
  return out.length === 1 ? [{ ...out[0], pct: 100 }] : out;
}
// Reparte un movimiento contable entre los centros de la distribución (los centavos van al último).
export function repartirMov(m, dist) {
  const n = normDist(dist);
  if (!n.length) return [m];
  let rd = m.debito || 0, rc = m.credito || 0;
  return n.map((x, i) => {
    const ult = i === n.length - 1, d = ult ? r2(rd) : r2((m.debito || 0) * x.pct / 100), c = ult ? r2(rc) : r2((m.credito || 0) * x.pct / 100);
    rd = r2(rd - d); rc = r2(rc - c);
    return { ...m, debito: d, credito: c, ...soloCC(x) };
  }).filter(x => x.debito || x.credito);
}
// Último paso de la contabilidad: cada movimiento con distribución (_dist) se reparte si su cuenta lleva centro de costo.
export function aplicarCC(movs, cfg) {
  const out = [];
  for (const m0 of movs) {
    const { _dist, ...m } = m0;
    if (!cfg?.activo) { delete m.cc1; delete m.cc2; delete m.cc3; out.push(m); continue; }
    if (m.cc1 || !_dist || !cuentaConCC(cfg, m.cuenta)) { out.push(m); continue; }
    out.push(...repartirMov(m, _dist));
  }
  return out;
}
// Errores de una distribución: cada parte lleva el nivel 1 y los porcentajes suman 100.
export function erroresDist(dist, cfg, centros, que = 'Centro de costo') {
  if (!cfg?.activo) return [];
  const n = normDist(dist), out = [];
  if (!n.length) return out;
  out.push(...erroresCC(n.map(x => ({ ...x, cuenta: cfg.alcance === 'todo' ? '1' : '4' })), cfg, centros, i => n.length > 1 ? `${que} (parte ${i + 1})` : que));
  if (n.some(x => x.pct <= 0)) out.push(`${que}: cada parte debe tener un porcentaje mayor que cero.`);
  const s = r4(n.reduce((a, x) => a + x.pct, 0));
  if (Math.abs(s - 100) > 0.001) out.push(`${que}: los porcentajes suman ${s} % y deben sumar 100 %.`);
  return out;
}
// Cuentas que quedarían sin centro de costo en el asiento de un documento (ya repartido con aplicarCC).
export function sinCentro(movs, cfg) {
  if (!cfg?.activo) return [];
  return [...new Set((movs || []).filter(m => cuentaConCC(cfg, m.cuenta) && !m.cc1).map(m => m.cuenta))];
}
// Texto corto de una distribución: "Retro 01 · Obra 80" o "Retro 01 60 % · Volqueta 40 %".
export function textoDist(dist, centros) {
  const por = Object.fromEntries((centros || []).map(c => [c.id, c])), n = normDist(dist);
  const t = x => ['cc1', 'cc2', 'cc3'].filter(k => x[k]).map(k => por[x[k]]?.nombre || '?').join(' / ');
  return n.length === 1 ? t(n[0]) : n.map(x => `${t(x)} ${x.pct} %`).join(' · ');
}
