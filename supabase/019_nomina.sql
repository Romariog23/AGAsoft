-- AGAsoft 019: nómina (empleados y liquidaciones de nómina).
-- Cada nómina guarda en `lineas` la liquidación de cada empleado con sus cuentas, así su contabilidad no cambia
-- si después se editan los parámetros. Los parámetros del año se guardan en la configuración contable de la empresa.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.empleados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tercero_id uuid not null references public.terceros(id),
  cargo text not null default '',
  contrato text not null default 'indefinido' check (contrato in ('indefinido', 'fijo', 'obra')),
  fecha_ingreso date,
  fecha_retiro date,
  salario numeric(16,2) not null default 0 check (salario >= 0),
  area text not null default 'admin' check (area in ('admin', 'ventas', 'produccion')),
  riesgo text not null default '1' check (riesgo in ('1', '2', '3', '4', '5')),
  auxilio boolean not null default true,
  eps_id uuid references public.terceros(id) on delete set null,
  pension_id uuid references public.terceros(id) on delete set null,
  cesantias_id uuid references public.terceros(id) on delete set null,
  caja_id uuid references public.terceros(id) on delete set null,
  banco text not null default '',
  cuenta_bancaria text not null default '',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tercero_id)
);
create index if not exists empleados_empresa on public.empleados (empresa_id);

create table if not exists public.nominas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero bigint not null,
  periodo text not null default 'mensual' check (periodo in ('mensual', 'quincenal')),
  desde date not null,
  hasta date not null,
  fecha date not null,
  -- Una línea por empleado: {empleado_id, tercero_id, area, dias, ibc, items:[{k, nombre, tipo, valor, cuenta, contra, tercero_id}], devengado, deducciones, neto, aportes, provisiones}
  lineas jsonb not null default '[]'::jsonb,
  novedades jsonb not null default '{}'::jsonb,
  cuenta_neto text not null default '25050501',
  devengado numeric(18,2) not null default 0,
  deducciones numeric(18,2) not null default 0,
  neto numeric(18,2) not null default 0,
  aportes numeric(18,2) not null default 0,
  provisiones numeric(18,2) not null default 0,
  observaciones text not null default '',
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, numero),
  check (hasta >= desde)
);
create index if not exists nominas_empresa on public.nominas (empresa_id);

create or replace function public.validar_nomina() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Una nómina anulada no se puede modificar.'; end if;
  if jsonb_array_length(new.lineas) = 0 then raise exception 'La nómina necesita al menos un empleado.'; end if;
  if new.neto < 0 then raise exception 'El neto de la nómina no puede ser negativo.'; end if;
  return new;
end $$;
drop trigger if exists nominas_validar on public.nominas;
create trigger nominas_validar before insert or update on public.nominas for each row execute function public.validar_nomina();

-- Se ven y se editan como los demás documentos; las nóminas no se borran (se anulan).
alter table public.empleados enable row level security;
drop policy if exists empleados_ver on public.empleados;
create policy empleados_ver on public.empleados for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists empleados_crear on public.empleados;
create policy empleados_crear on public.empleados for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists empleados_editar on public.empleados;
create policy empleados_editar on public.empleados for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

alter table public.nominas enable row level security;
drop policy if exists nominas_ver on public.nominas;
create policy nominas_ver on public.nominas for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists nominas_crear on public.nominas;
create policy nominas_crear on public.nominas for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists nominas_editar on public.nominas;
create policy nominas_editar on public.nominas for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';
