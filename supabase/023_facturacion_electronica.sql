-- 023: envíos de documentos electrónicos a la DIAN (por el proveedor tecnológico; hoy Factus).
-- Cada intento queda registrado; el documento se toma como aceptado cuando tiene un envío con estado 'aceptado'.
create table if not exists public.fe_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  documento_id uuid not null references public.documentos(id) on delete cascade,
  ambiente text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
  estado text not null check (estado in ('aceptado', 'rechazado', 'error')),
  cufe text not null default '',
  mensaje text not null default '',
  errores jsonb not null default '[]'::jsonb,
  pdf text not null default '',
  respuesta jsonb,
  enviado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists fe_envios_doc on public.fe_envios (documento_id);
alter table public.fe_envios enable row level security;
drop policy if exists fe_envios_ver on public.fe_envios;
create policy fe_envios_ver on public.fe_envios for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists fe_envios_crear on public.fe_envios;
create policy fe_envios_crear on public.fe_envios for insert to authenticated with check (public.puede_editar(empresa_id));
-- Sin update ni delete: el historial de envíos no se modifica.

