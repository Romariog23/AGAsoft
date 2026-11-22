-- AGAsoft 037: Operación (módulo opcional por empresa).
-- Registros operativos que NO generan movimientos contables: horas máquina, viajes, jornales, servicios…
-- Cada empresa arma sus tipos de operación (op_tipos.config: listas, campos, fórmulas, tarifas por, reglas y salidas).
-- Ninguna tabla tiene columnas de una actividad: lo propio de cada empresa va en jsonb (datos, criterios, config).
-- Se activa por empresa en Configuración › Operación (empresas.contabilidad->'operacion'->'activo').
-- Los cierres (documento soporte, factura desde cotización) llegan en entregas siguientes; op_cortes y las columnas
-- cierre_* quedan creadas desde ya para no pedir otro SQL.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.op_tipos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  plantilla text not null default 'libre',
  config jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists op_tipos_empresa on public.op_tipos (empresa_id);

-- Elementos de las listas de cada tipo (equipos, obras, vehículos, rutas, lotes…).
create table if not exists public.op_elementos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id uuid not null references public.op_tipos(id) on delete cascade,
  lista text not null,
  codigo text not null default '',
  nombre text not null check (length(trim(nombre)) > 0),
  datos jsonb not null default '{}'::jsonb,
  tercero_id uuid references public.terceros(id),
  centro_id uuid references public.centros_costo(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists op_elementos_tipo on public.op_elementos (empresa_id, tipo_id, lista);

-- Tarifas con vigencia. criterios = {tercero: uuid, equipo: uuid, …} (vacío = aplica a todos). La más específica gana.
create table if not exists public.op_tarifas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id uuid not null references public.op_tipos(id) on delete cascade,
  uso text not null default 'pago' check (uso in ('pago', 'cobro')),
  criterios jsonb not null default '{}'::jsonb,
  modo text not null default 'unidad' check (modo in ('unidad', 'registro', 'fijo')),
  valor numeric(18,2) not null check (valor > 0),
  desde date,
  hasta date,
  producto_id uuid references public.productos(id),
  nota text not null default '',
  creado_en timestamptz not null default now(),
  check (hasta is null or desde is null or hasta >= desde)
);
create index if not exists op_tarifas_tipo on public.op_tarifas (empresa_id, tipo_id);

-- Cortes (liquidación de un periodo). Se usan desde la entrega 2.
create table if not exists public.op_cortes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id uuid not null references public.op_tipos(id) on delete cascade,
  desde date not null,
  hasta date not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  volantes jsonb not null default '[]'::jsonb,
  generados jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  check (hasta >= desde)
);
create index if not exists op_cortes_tipo on public.op_cortes (empresa_id, tipo_id, desde);

-- Cada anotación. datos = valores de los campos del tipo; cantidad y valor se calculan con la configuración.
-- cierre_pago (DS o nómina) y cierre_cobro (factura) son dos cierres independientes de las mismas horas.
create table if not exists public.op_registros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id uuid not null references public.op_tipos(id) on delete cascade,
  fecha date not null,
  tercero_id uuid not null references public.terceros(id),
  datos jsonb not null default '{}'::jsonb,
  cantidad_pagada numeric(14,2),
  nota text not null default '',
  clase text not null default 'registro' check (clase in ('registro', 'cargo')),
  corte_id uuid references public.op_cortes(id) on delete set null,
  cotizacion_id uuid,
  cierre_pago uuid,
  cierre_cobro uuid,
  creado_en timestamptz not null default now()
);
create index if not exists op_registros_tipo on public.op_registros (empresa_id, tipo_id, fecha);

-- Un registro de un corte cerrado o ya cerrado (pagado o facturado) no se cambia ni se borra.
create or replace function public.validar_op_registro() returns trigger
language plpgsql set search_path = public as $$
declare c text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.cierre_pago is not null or old.cierre_cobro is not null then
      if tg_op = 'DELETE' or new.datos is distinct from old.datos or new.fecha is distinct from old.fecha or new.tercero_id is distinct from old.tercero_id or new.cantidad_pagada is distinct from old.cantidad_pagada then
        raise exception 'Este registro ya se pagó o se facturó: no se puede cambiar.';
      end if;
    end if;
    select estado into c from public.op_cortes where id = old.corte_id;
    if c = 'cerrado' and (tg_op = 'DELETE' or new.datos is distinct from old.datos or new.fecha is distinct from old.fecha or new.cantidad_pagada is distinct from old.cantidad_pagada) then
      raise exception 'El registro pertenece a un corte cerrado.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists op_registros_validar on public.op_registros;
create trigger op_registros_validar before update or delete on public.op_registros for each row execute function public.validar_op_registro();

do $$ declare t text; begin
  foreach t in array array['op_tipos', 'op_elementos', 'op_tarifas', 'op_cortes', 'op_registros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.puede_ver(empresa_id))', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_crear', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.puede_editar(empresa_id))', t || '_crear', t);
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id))', t || '_editar', t);
    execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.puede_editar(empresa_id))', t || '_borrar', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
