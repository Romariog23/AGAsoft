-- AGAsoft: departamento en empresas y clientes (listas de departamentos y municipios de Colombia).
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.
alter table public.empresas add column if not exists departamento text not null default '';
alter table public.terceros add column if not exists departamento text not null default '';
notify pgrst, 'reload schema';
