-- Cotizaciones (Ventas). No mueven contabilidad: fijan el precio de cobro.
-- Una cotización puede amarrarse a un tipo de Operación y a elementos (obra, equipo…): las horas de esos
-- registros se facturan desde Operación con el precio de la línea que coincida.
-- Requiere 037_operacion.sql. Correr una vez en el SQL Editor de Supabase.

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero bigint not null,
  fecha date not null default current_date,
  vence date,
  tercero_id uuid not null references public.terceros(id),
  estado text not null default 'abierta' check (estado in ('abierta', 'aceptada', 'rechazada', 'cerrada')),
  op_tipo_id uuid references public.op_tipos(id) on delete set null,
  -- {campo: elemento_id}: solo los registros con esos elementos se cobran con esta cotización.
  criterios jsonb not null default '{}'::jsonb,
  -- [{producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, op, criterios}]
  lineas jsonb not null default '[]'::jsonb,
  observaciones text not null default '',
  condiciones text not null default '',
  bruto numeric(16,2) not null default 0,
  descuento numeric(16,2) not null default 0,
  base numeric(16,2) not null default 0,
  iva numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  creado_por uuid default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index if not exists cotizaciones_empresa on public.cotizaciones (empresa_id, fecha);

alter table public.cotizaciones enable row level security;
drop policy if exists cotizaciones_ver on public.cotizaciones;
create policy cotizaciones_ver on public.cotizaciones for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists cotizaciones_crear on public.cotizaciones;
create policy cotizaciones_crear on public.cotizaciones for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists cotizaciones_editar on public.cotizaciones;
create policy cotizaciones_editar on public.cotizaciones for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists cotizaciones_borrar on public.cotizaciones;
create policy cotizaciones_borrar on public.cotizaciones for delete to authenticated using (public.puede_editar(empresa_id));

-- El registro de Operación apunta a su cotización (opcional: si no, se busca por obra/equipo).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'op_registros_cotizacion_fk') then
    alter table public.op_registros add constraint op_registros_cotizacion_fk foreign key (cotizacion_id) references public.cotizaciones(id) on delete set null;
  end if;
end $$;

notify pgrst, 'reload schema';
