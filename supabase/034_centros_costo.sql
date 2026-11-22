-- AGAsoft 034: centros de costo.
-- Hasta 3 niveles independientes por empresa (los nombra la empresa, por ejemplo Máquinas y Obras). La configuración
-- (activo, alcance: 'resultado' o 'todo', nombres y niveles habilitados) se guarda en empresas.contabilidad->'cc'.
-- Cada línea contable lleva cc1, cc2 y cc3 (id del centro de cada nivel). El nivel 1 es obligatorio en las cuentas del alcance.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.centros_costo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nivel smallint not null check (nivel between 1 and 3),
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, nivel, codigo)
);
create index if not exists centros_costo_empresa on public.centros_costo (empresa_id);

alter table public.centros_costo enable row level security;
drop policy if exists centros_costo_ver on public.centros_costo;
create policy centros_costo_ver on public.centros_costo for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists centros_costo_crear on public.centros_costo;
create policy centros_costo_crear on public.centros_costo for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists centros_costo_editar on public.centros_costo;
create policy centros_costo_editar on public.centros_costo for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

-- Ningún comprobante se guarda si una línea de una cuenta del alcance no tiene el centro de costo del nivel 1.
create or replace function public.validar_cc_comprobante() returns trigger
language plpgsql set search_path = public as $$
declare cfg jsonb; l jsonb; i int := 0;
begin
  if new.estado = 'anulado' then return new; end if;
  select contabilidad->'cc' into cfg from empresas where id = new.empresa_id;
  if cfg is null or coalesce((cfg->>'activo')::boolean, false) = false then return new; end if;
  for l in select * from jsonb_array_elements(coalesce(new.lineas, '[]'::jsonb)) loop
    i := i + 1;
    if (coalesce(cfg->>'alcance', 'resultado') = 'todo' or coalesce(l->>'cuenta', '') ~ '^[4-7]')
       and coalesce(l->>'cc1', '') = '' and (coalesce((l->>'debito')::numeric, 0) <> 0 or coalesce((l->>'credito')::numeric, 0) <> 0) then
      raise exception 'Línea %: la cuenta % lleva centro de costo y no lo tiene.', i, l->>'cuenta';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists comprobantes_validar_cc on public.comprobantes;
create trigger comprobantes_validar_cc before insert or update on public.comprobantes for each row execute function public.validar_cc_comprobante();

notify pgrst, 'reload schema';
