// Formato de números por empresa: con o sin decimales y separador de miles punto (1.234,56) o coma (1,234.56).
export const FORMATO_DEF = { decimales: true, miles: '.' };
export const formatoDe = c => {
  const f = { ...FORMATO_DEF, ...(c?.formato_num || {}) };
  return { decimales: f.decimales !== false, miles: f.miles === ',' ? ',' : '.' };
};
// dec: decimales fijos; si se omite, 2 con decimales o 0 sin ellos.
export function numTxt(v, f = FORMATO_DEF, dec) {
  const n = Number(v) || 0, d = dec ?? (f.decimales === false ? 0 : 2);
  const abs = Math.abs(n).toFixed(d), [ent, frac] = abs.split('.');
  const neg = n < 0 && Number(abs) !== 0;
  return (neg ? '-' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, f.miles) + (frac ? (f.miles === ',' ? '.' : ',') + frac : '');
}
export const moneyTxt = (v, f) => { const t = numTxt(v, f); return t.startsWith('-') ? '-$ ' + t.slice(1) : '$ ' + t; };
// Cantidades: sin ceros de más (hasta 4 decimales), con el separador escogido.
export const cantTxt = (v, f = FORMATO_DEF) => { const n = Number(v) || 0, d = Math.min(4, (String(+n.toFixed(4)).split('.')[1] || '').length); return numTxt(n, { ...f, decimales: true }, d); };
