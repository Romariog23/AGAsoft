-- 047: Activos fijos (propiedad, planta y equipo) y su depreciación. Correr una vez en Supabase.
-- Los tipos de activo (vida útil y cuentas) se guardan en empresas.contabilidad.activos_tipos.
-- La depreciación de cada mes es un comprobante tipo DP; cada línea lleva el activo y el mes que deprecia.
create table if not exists public.activos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  tipo text not null,
  origen text not null default 'nuevo' check (origen in ('nuevo', 'saldo')),  -- saldo = viene de otro programa
  fecha_compra date,
  inicio text check (inicio is null or inicio ~ '^[0-9]{4}-[0-9]{2}$'),       -- mes en que empieza a depreciarse en AGAsoft
  costo numeric(18,2) not null default 0,
  residual numeric(18,2) not null default 0,
  dep_inicial numeric(18,2) not null default 0,                                -- depreciación acumulada al empezar (saldo inicial)
  vida_meses integer not null default 0,                                       -- nuevo: vida útil; saldo: vigencia que le queda
  cambios jsonb not null default '[]'::jsonb,                                  -- [{desde:'AAAA-MM', restantes}] cambios de vida útil
  cta_activo text not null default '', cta_dep text not null default '', cta_gasto text not null default '',
  cc1 uuid, cc2 uuid, cc3 uuid,
  ubicacion text not null default '',
  serie text not null default '',
  compra_id uuid references public.compras(id) on delete set null,          -- factura de compra o documento soporte del activo
  tercero_id uuid references public.terceros(id) on delete set null,        -- proveedor o tercero del activo (si no tiene factura)
  adiciones jsonb not null default '[]'::jsonb,                              -- repotenciaciones [{id, fecha, desde, valor, detalle, restantes, compra_id}]
  estado text not null default 'activo' check (estado in ('activo', 'baja')),
  baja_fecha date,
  baja_motivo text not null default '',
  creado_en timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists activos_empresa on public.activos (empresa_id);
-- Por si la tabla ya se creó con una versión anterior de este archivo.
alter table public.activos add column if not exists tercero_id uuid references public.terceros(id) on delete set null;
alter table public.activos add column if not exists adiciones jsonb not null default '[]'::jsonb;

alter table public.activos enable row level security;
drop policy if exists activos_ver on public.activos;
create policy activos_ver on public.activos for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists activos_crear on public.activos;
create policy activos_crear on public.activos for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists activos_editar on public.activos;
create policy activos_editar on public.activos for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists activos_borrar on public.activos;
create policy activos_borrar on public.activos for delete to authenticated using (public.puede_editar(empresa_id));

-- Comprobante de depreciación (DP).
alter table public.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table public.comprobantes add constraint comprobantes_tipo_check check (tipo in ('CC', 'SI', 'CI', 'PN', 'DP'));

notify pgrst, 'reload schema';
