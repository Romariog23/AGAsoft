// Apariencia: cada usuario escoge el color principal y el modo (claro, oscuro o automático).
// Se guarda en el navegador para aplicarlo al instante y en su perfil para que lo vea en cualquier equipo.
export const COLORES = [
  { id: 'aga', nombre: 'AGA (azul petróleo)', claro: '#0b2938', oscuro: '#a8cb18' },
  { id: 'azul', nombre: 'Azul', claro: '#1d4ed8', oscuro: '#8ab4ff' },
  { id: 'turquesa', nombre: 'Turquesa', claro: '#0f766e', oscuro: '#5eead4' },
  { id: 'verde', nombre: 'Verde', claro: '#1f7a4d', oscuro: '#6fd39f' },
  { id: 'morado', nombre: 'Morado', claro: '#6d28d9', oscuro: '#c4a7ff' },
  { id: 'vino', nombre: 'Vino', claro: '#9f1239', oscuro: '#ff9fb5' },
  { id: 'naranja', nombre: 'Naranja', claro: '#c2410c', oscuro: '#ffb27a' },
  { id: 'grafito', nombre: 'Grafito', claro: '#374151', oscuro: '#cbd5e1' },
];
export const MODOS = [['auto', 'Automático (como el equipo)'], ['light', 'Claro'], ['dark', 'Oscuro']];
const KEY = 'agasoft-tema';
const DEF = { color: 'aga', modo: 'auto' };

export function normalizar(t) {
  const x = { ...DEF, ...(t && typeof t === 'object' ? t : {}) };
  if (!COLORES.some(c => c.id === x.color)) x.color = DEF.color;
  if (!MODOS.some(([m]) => m === x.modo)) x.modo = DEF.modo;
  return { color: x.color, modo: x.modo };
}
export function leerTema() { try { return normalizar(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (_) { return { ...DEF }; } }
export function guardarLocal(t) { try { localStorage.setItem(KEY, JSON.stringify(normalizar(t))); } catch (_) { /* sin almacenamiento */ } }

// Reglas de color: el color AGA usa los valores de style.css; los demás cambian el color de acento en claro y en oscuro.
function css() {
  const oscuro = c => `--accent:${c.oscuro};--accent-fg:#0b1418;--accent-soft:color-mix(in srgb,${c.oscuro} 18%,#0f222c);`;
  return COLORES.filter(c => c.id !== 'aga').map(c =>
    `:root[data-color="${c.id}"]{--accent:${c.claro};--accent-fg:#fff;--accent-soft:color-mix(in srgb,${c.claro} 12%,#fff);--brand:${c.claro};--mark-fg:#fff}
@media (prefers-color-scheme: dark){:root[data-color="${c.id}"]:not([data-theme="light"]){${oscuro(c)}}}
:root[data-color="${c.id}"][data-theme="dark"]{${oscuro(c)}}`).join('\n');
}
export function aplicarTema(t) {
  const { color, modo } = normalizar(t), r = document.documentElement;
  if (!document.getElementById('temaCss')) { const s = document.createElement('style'); s.id = 'temaCss'; s.textContent = css(); document.head.append(s); }
  if (color === 'aga') delete r.dataset.color; else r.dataset.color = color;
  if (modo === 'auto') delete r.dataset.theme; else r.dataset.theme = modo;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = COLORES.find(c => c.id === color).claro;
}
