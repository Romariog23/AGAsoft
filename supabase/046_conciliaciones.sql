-- 046: Conciliación bancaria. Una conciliación por cuenta de bancos y mes: el extracto cargado (o traído del banco),
-- los cruces con el libro auxiliar y el saldo final según el extracto. Correr una vez en Supabase.
create table if not exists public.conciliaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cuenta text not null check (cuenta ~ '^[0-9]{8}$'),
  periodo text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  saldo_extracto numeric(18,2) not null default 0,
  -- [{id, fecha, descripcion, referencia, debito, credito}]  débito = sale de la cuenta, crédito = entra (como el banco)
  extracto jsonb not null default '[]'::jsonb,
  -- [{l: [claves del libro], b: [ids del extracto], auto}]
  cruces jsonb not null default '[]'::jsonb,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  cerrada_en timestamptz,
  cerrada_por text not null default '',
  creado_en timestamptz not null default now(),
  unique (empresa_id, cuenta, periodo)
);
create index if not exists conciliaciones_empresa on public.conciliaciones (empresa_id, cuenta, periodo);

alter table public.conciliaciones enable row level security;
drop policy if exists conciliaciones_ver on public.conciliaciones;
create policy conciliaciones_ver on public.conciliaciones for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists conciliaciones_crear on public.conciliaciones;
create policy conciliaciones_crear on public.conciliaciones for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists conciliaciones_editar on public.conciliaciones;
create policy conciliaciones_editar on public.conciliaciones for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists conciliaciones_borrar on public.conciliaciones;
create policy conciliaciones_borrar on public.conciliaciones for delete to authenticated using (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';
