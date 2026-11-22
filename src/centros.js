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
