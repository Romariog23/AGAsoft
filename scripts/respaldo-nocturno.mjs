// Copia nocturna de AGAsoft (la corre GitHub Actions; ver .github/workflows/respaldo-nocturno.yml).
// Por cada empresa deja en SALIDA/<fecha>/<NIT> <nombre>/:
//   - auxiliar-general.xlsx: el Auxiliar contable general detallado de toda la historia (se abre en Excel sin AGAsoft).
//   - datos.json: todas las tablas de la empresa tal como están en la base (para restaurar).
// Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (solo en secretos de GitHub), SALIDA (carpeta, por defecto ./respaldo).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { movimientos } from '../src/contab.js';
import { parametrosDe } from '../src/puc.js';
import { tarifasIva } from '../src/impuestos.js';
import { cfgInventario } from '../src/inventario.js';
import { cfgCC } from '../src/centros.js';
import { tieneModulo } from '../src/planes.js';
import { auxiliarGeneral, hojasAuxiliarGeneral } from '../src/reportes.js';
import { xlsx } from '../src/xlsx.js';

const TABLAS = ['cuentas', 'terceros', 'productos', 'numeraciones', 'documentos', 'items', 'aplicaciones', 'miembros', 'comprobantes', 'compras', 'empleados', 'nominas', 'fe_envios', 'bodegas', 'inventario_docs', 'centros_costo', 'op_tipos', 'op_elementos', 'op_tarifas', 'op_registros', 'op_cortes', 'cotizaciones', 'nominas_e'];
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, SALIDA = 'respaldo' } = process.env;
if (!url || !key) { console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });
const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
async function todo(t, filtro) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(t).select('*').order('id').range(from, from + 999);
    if (filtro) q = q.eq(...filtro);
    const rows = ok(await q); out.push(...rows); if (rows.length < 1000) return out;
  }
}
const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // hora de Colombia
const limpio = s => String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

const empresas = await todo('empresas');
const perfiles = Object.fromEntries((await todo('perfiles')).map(p => [p.id, p]));
const planes = Object.fromEntries((await todo('planes')).map(p => [p.id, p]));
let errores = 0;
for (const e of empresas) {
  try {
    const d = {};
    for (const t of TABLAS) d[t] = await todo(t, ['empresa_id', e.id]).catch(err => (t === 'cuentas' || t === 'documentos' ? Promise.reject(err) : []));
    const plan = planes[perfiles[e.owner]?.plan_id] || null;
    const c = e.contabilidad;
    const ms = movimientos({ ...d, contab: c, param: parametrosDe(c), tarifas: tarifasIva(c), metodoInv: cfgInventario(c).metodo, cc: cfgCC(c), inventario: tieneModulo(plan, 'inventario') });
    const r = auxiliarGeneral(ms, null, hoy);
    const ctas = Object.fromEntries(d.cuentas.map(x => [x.codigo, x.nombre])), ters = Object.fromEntries(d.terceros.map(x => [x.id, x]));
    const dir = join(SALIDA, hoy, limpio(`${e.nit} ${e.nombre}`));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'auxiliar-general.xlsx'), xlsx(hojasAuxiliarGeneral(r, { empresa: e, desde: r.grupos[0]?.fecha || '', hasta: hoy, nomCta: k => ctas[k] || '', tercero: id => ters[id], generado: new Date().toISOString() })));
    await writeFile(join(dir, 'datos.json'), JSON.stringify({ generado: new Date().toISOString(), empresa: e, ...d }));
    console.log(`OK ${e.nit} ${e.nombre}: ${r.grupos.length} comprobantes, ${r.partidas} partidas${r.debito !== r.credito ? ' (¡NO CUADRA!)' : ''}`);
  } catch (err) { errores++; console.error(`ERROR ${e.nit} ${e.nombre}: ${err.message}`); }
}
console.log(`${empresas.length - errores} de ${empresas.length} empresas respaldadas.`);
if (errores) process.exit(1);
