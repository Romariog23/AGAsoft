// Archivo de Excel (.xlsx) sin librerías: un ZIP sin compresión con el XML mínimo de una hoja de cálculo.
// Sirve en el navegador y en Node (respaldo nocturno). Función pura: devuelve los bytes del archivo.
// hojas: [{ nombre, filas: [[valor, ...]], anchos?: [n, ...], encabezado?: true }]
// Valores: número → celda numérica con miles y 2 decimales; 'AAAA-MM-DD' → fecha de Excel; lo demás → texto.

const enc = new TextEncoder();
const xml = s => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
// Días desde el 30-dic-1899 (sistema de fechas 1900 de Excel).
const serial = f => { const [a, m, d] = f.split('-').map(Number); return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); };
const col = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

function celda(v, ref, negrita) {
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${negrita ? 4 : 2}"><v>${v}</v></c>`;
  if (typeof v === 'string' && FECHA.test(v)) return `<c r="${ref}" s="1"><v>${serial(v)}</v></c>`;
  if (v === null || v === undefined || v === '') return '';
  return `<c r="${ref}" t="inlineStr"${negrita ? ' s="3"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
function hoja({ filas = [], anchos = [], encabezado = true, negritas = [] }) {
  const cols = anchos.length ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const neg = new Set(negritas);
  const rows = filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => celda(v, col(c) + (r + 1), (encabezado && r === 0) || neg.has(r))).join('')}</row>`).join('');
  const fijar = encabezado && filas.length ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  const filtro = encabezado && filas.length > 1 ? `<autoFilter ref="A1:${col(Math.max(0, filas[0].length - 1))}${filas.length}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fijar}${cols}<sheetData>${rows}</sheetData>${filtro}</worksheet>`;
}
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs>
</styleSheet>`;

// CRC-32 y ZIP sin compresión (método 0).
const TABLA = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(archivos) {
  const partes = [], central = []; let off = 0;
  for (const [nombre, texto] of archivos) {
    const n = enc.encode(nombre), d = enc.encode(texto), crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    partes.push(new Uint8Array(h.buffer), n, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), n);
    off += 30 + n.length + d.length;
  }
  const tam = central.reduce((s, x) => s + x.length, 0), fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, tam, true); fin.setUint32(16, off, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)], out = new Uint8Array(todo.reduce((s, x) => s + x.length, 0));
  let p = 0; for (const x of todo) { out.set(x, p); p += x.length; }
  return out;
}

export function xlsx(hojas) {
  const hs = hojas.map((h, i) => ({ ...h, nombre: String(h.nombre || `Hoja${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) }));
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hs.map((h, i) => `<sheet name="${xml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${hs.map((h, i) => h.encabezado !== false && h.filas?.length > 1 ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(h.nombre)}'!$A$1:$${col(h.filas[0].length - 1)}$${h.filas.length}</definedName></definedNames>` : '').find(Boolean) || ''}</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hs.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', ESTILOS],
    ...hs.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hoja(h)]),
  ]);
}
