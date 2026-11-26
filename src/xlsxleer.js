// Lector mínimo de Excel (.xlsx): devuelve las filas de la primera hoja como listas de textos.
// Sin librerías: abre el ZIP, descomprime con DecompressionStream y lee el XML de la hoja y de los textos compartidos.
// Las fechas de Excel (números de serie) se devuelven como AAAA-MM-DD cuando la celda tiene formato de fecha.

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

async function inflar(datos) {
  const s = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
// Archivos del ZIP: nombre → función que devuelve su texto.
function entradas(buf) {
  const b = new Uint8Array(buf);
  let e = b.length - 22; while (e >= 0 && u32(b, e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
  const n = u16(b, e + 10); let p = u32(b, e + 16); const out = {};
  for (let k = 0; k < n; k++) {
    const metodo = u16(b, p + 10), tam = u32(b, p + 20), ln = u16(b, p + 28), lx = u16(b, p + 30), lc = u16(b, p + 32), off = u32(b, p + 42);
    const nombre = new TextDecoder().decode(b.subarray(p + 46, p + 46 + ln));
    const ini = off + 30 + u16(b, off + 26) + u16(b, off + 28), datos = b.subarray(ini, ini + tam);
    out[nombre] = async () => new TextDecoder().decode(metodo === 0 ? datos : await inflar(datos));
    p += 46 + ln + lx + lc;
  }
  return out;
}
const desc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d)).replace(/&amp;/g, '&');
const colNum = ref => { let n = 0; for (const ch of ref.replace(/\d/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const fechaSerie = n => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);

export async function leerXlsx(buf) {
  const z = entradas(buf);
  const hojaNom = Object.keys(z).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]))[0];
  if (!hojaNom) throw new Error('El Excel no tiene hojas.');
  const compartidos = z['xl/sharedStrings.xml'] ? [...(await z['xl/sharedStrings.xml']()).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => desc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))) : [];
  // Estilos con formato de fecha (numFmt 14-22 o formatos propios con d/m/y).
  const fechas = new Set();
  if (z['xl/styles.xml']) {
    const st = await z['xl/styles.xml']();
    const propios = new Set([...st.matchAll(/<numFmt [^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].filter(m => /[dmy]/i.test(m[2].replace(/\[[^\]]*\]|"[^"]*"/g, ''))).map(m => m[1]));
    const xfs = (st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [, ''])[1];
    [...xfs.matchAll(/<xf [^>]*?numFmtId="(\d+)"/g)].forEach((m, i) => { const id = Number(m[1]); if ((id >= 14 && id <= 22) || propios.has(m[1])) fechas.add(i); });
  }
  const xml = await z[hojaNom]();
  const filas = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = c[1], ref = (at.match(/r="([A-Z]+\d+)"/) || [])[1], t = (at.match(/t="(\w+)"/) || [])[1], s = Number((at.match(/s="(\d+)"/) || [])[1]);
      const cuerpo = c[2] || '', v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (t === 's') val = compartidos[Number(v)] ?? '';
      else if (t === 'inlineStr') val = desc([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
      else if (v !== undefined) val = t === 'str' || t === 'b' ? desc(v) : fechas.has(s) && !isNaN(Number(v)) ? fechaSerie(Number(v)) : v;
      fila[ref ? colNum(ref) : fila.length] = val;
    }
    filas.push(Array.from(fila, x => x ?? ''));
  }
  return filas.filter(f => f.some(x => String(x).trim()));
}
