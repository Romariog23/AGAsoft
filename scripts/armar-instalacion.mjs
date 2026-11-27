// Arma supabase/instalar_todo.sql: schema.sql + todas las migraciones (002, 003, ...) en orden, en un solo archivo,
// para instalar AGAsoft VACÍO (solo estructura, sin datos de empresas) en un proyecto nuevo de Supabase.
// Uso: node scripts/armar-instalacion.mjs   (volver a correrlo cada vez que se agregue una migración nueva)
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase');
const migraciones = (await readdir(dir)).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
const archivos = ['schema.sql', ...migraciones];

const partes = [`-- AGAsoft: instalación completa en un proyecto NUEVO de Supabase (solo estructura, sin datos).
-- Generado con: node scripts/armar-instalacion.mjs  (no editar a mano; se arma con schema.sql + ${migraciones[0]} … ${migraciones.at(-1)}).
-- Cómo usarlo: Supabase › SQL Editor › New query › pegar todo › Run. Se puede volver a correr sin perder datos.
-- Después: registrarse en la app; el PRIMER usuario que se registra queda como administrador.
`];
for (const f of archivos) {
  const sql = (await readFile(join(dir, f), 'utf8')).trimEnd();
  partes.push(`\n/* ======================================================================\n   ${f}\n   ====================================================================== */\n${sql}\n`);
}
partes.push(`
/* ======================================================================
   Limpieza para una instalación nueva
   ====================================================================== */
-- Los planes viejos (Básico, Profesional, Contador, Empresa Plus) quedan inactivos por las migraciones 009/029/030.
-- En una base nueva nadie los usa: se borran para que en /admin solo queden Emprendedor, Pyme y Empresa.
delete from public.planes p
where not p.activo
  and not exists (select 1 from public.perfiles x where x.plan_id = p.id or x.plan_solicitado = p.id);

notify pgrst, 'reload schema';
`);
await writeFile(join(dir, 'instalar_todo.sql'), partes.join(''));
console.log(`supabase/instalar_todo.sql armado con ${archivos.length} archivos.`);
