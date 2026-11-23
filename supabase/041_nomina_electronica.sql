-- AGAsoft 041: nómina electrónica (DIAN por Factus).
--  - nominas_e: un documento por empleado y mes. tipo 'NIE' = nómina individual electrónica,
--    'NIAE' = nota de ajuste que elimina una NIE validada (ref_id = la NIE).
--  - body guarda lo que se envió (devengados, deducciones, horas) para consultarlo después.
--  - fe_envios.nomina_e_id: los envíos quedan en el mismo historial que facturas y documentos soporte.
--  - Una NIE o NIAE validada por la DIAN no se modifica ni se elimina.
-- Requiere 019_nomina.sql, 023_facturacion_electronica.sql y 040_documento_soporte_electronico.sql. Se puede correr más de una vez.
-- Ejecutar en Supabase: SQL Editor > New query > pegar > Run. Después redesplegar la función fe-factus.

create table if not exists public.nominas_e (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null default 'NIE' check (tipo in ('NIE', 'NIAE')),
  numero bigint not null,
  anio int not null check (anio between 2000 and 2100),
  mes int not null check (mes between 1 and 12),
  empleado_id uuid references public.empleados(id) on delete restrict,
  tercero_id uuid not null references public.terceros(id),
  ref_id uuid references public.nominas_e(id) on delete restrict,
  body jsonb not null default '{}'::jsonb,
  devengado numeric(18,2) not null default 0,
  deducciones numeric(18,2) not null default 0,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists nominas_e_empresa on public.nominas_e (empresa_id, anio, mes);

alter table public.fe_envios add column if not exists nomina_e_id uuid references public.nominas_e(id) on delete cascade;
alter table public.fe_envios drop constraint if exists fe_envios_origen;
alter table public.fe_envios add constraint fe_envios_origen check (documento_id is not null or compra_id is not null or nomina_e_id is not null);
create index if not exists fe_envios_nomina_e on public.fe_envios (nomina_e_id);

create or replace function public.nomina_e_validada(nid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fe_envios e where e.nomina_e_id = nid and e.estado = 'aceptado');
$$;

create or replace function public.nominas_e_proteger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Al borrar la empresa entera (cascada) no se bloquea.
  if tg_op = 'DELETE' and not exists (select 1 from empresas x where x.id = old.empresa_id) then return old; end if;
  if tg_op in ('UPDATE', 'DELETE') and public.nomina_e_validada(old.id) then
    raise exception 'La DIAN ya validó esta nómina electrónica: no se puede modificar ni eliminar. Corrígela con una nota de ajuste.'; end if;
  if tg_op in ('INSERT', 'UPDATE') and new.tipo = 'NIAE' and (new.ref_id is null or not exists (
      select 1 from nominas_e r where r.id = new.ref_id and r.empresa_id = new.empresa_id and r.tipo = 'NIE' and public.nomina_e_validada(r.id))) then
    raise exception 'La nota de ajuste debe referirse a una nómina electrónica validada por la DIAN.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists nominas_e_proteger on public.nominas_e;
create trigger nominas_e_proteger before insert or update or delete on public.nominas_e for each row execute function public.nominas_e_proteger();

alter table public.nominas_e enable row level security;
drop policy if exists nominas_e_ver on public.nominas_e;
create policy nominas_e_ver on public.nominas_e for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists nominas_e_crear on public.nominas_e;
create policy nominas_e_crear on public.nominas_e for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists nominas_e_editar on public.nominas_e;
create policy nominas_e_editar on public.nominas_e for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists nominas_e_borrar on public.nominas_e;
create policy nominas_e_borrar on public.nominas_e for delete to authenticated using (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';
