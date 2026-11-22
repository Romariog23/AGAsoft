-- AGAsoft 032: inventario, entrega 1.
--  - Productos y servicios: tipo (los productos son inventariables, los servicios no), cuenta de costo de ventas y bodega por defecto.
--  - Bodegas: cada una con su cuenta auxiliar de la clase 14 (los traslados entre bodegas se contabilizan entre cuentas 14).
--  - Las líneas de compra por producto se guardan en compras.lineas (producto_id, bodega_id, cantidad, costo): no cambia la tabla.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.bodegas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  cuenta text not null check (cuenta ~ '^14[0-9]{6}$'),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists bodegas_empresa on public.bodegas (empresa_id);

alter table public.productos add column if not exists tipo text not null default 'producto';
alter table public.productos drop constraint if exists productos_tipo_check;
alter table public.productos add constraint productos_tipo_check check (tipo in ('producto', 'servicio'));
alter table public.productos add column if not exists cuenta_costo text not null default '';
alter table public.productos add column if not exists bodega_id uuid references public.bodegas(id) on delete set null;

-- Las bodegas se ven y se editan como los demás datos de la empresa; no se borran si tienen movimientos (se desactivan).
alter table public.bodegas enable row level security;
drop policy if exists bodegas_ver on public.bodegas;
create policy bodegas_ver on public.bodegas for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists bodegas_crear on public.bodegas;
create policy bodegas_crear on public.bodegas for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists bodegas_editar on public.bodegas;
create policy bodegas_editar on public.bodegas for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';
