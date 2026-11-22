-- AGAsoft 033: inventario, entrega 2. Documentos de inventario: AI ajuste de inventario (inventario inicial, conteo físico,
-- faltantes y sobrantes) y, en la siguiente entrega, TR traslado entre bodegas.
-- El costo de ventas de las facturas y las devoluciones de las notas crédito se calculan en la app con el método de la empresa
-- (promedio ponderado o PEPS) desde los documentos, igual que el resto de la contabilidad: no se guardan aparte.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.inventario_docs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('AI', 'TR')),
  numero bigint not null,
  fecha date not null default current_date,
  tercero_id uuid references public.terceros(id),
  concepto text not null default '',
  -- AI: cuenta contrapartida del ajuste. TR: no aplica.
  cuenta_contra text not null default '',
  -- AI: [{producto_id, bodega_id, sentido: entrada|salida, cantidad, costo}]   TR: [{producto_id, bodega_id, bodega_destino, cantidad}]
  lineas jsonb not null default '[]'::jsonb,
  observaciones text not null default '',
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists inventario_docs_empresa on public.inventario_docs (empresa_id, fecha);

create or replace function public.validar_inventario_doc() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Un documento de inventario anulado no se puede modificar.'; end if;
  if jsonb_array_length(new.lineas) = 0 then raise exception 'El documento necesita al menos un producto.'; end if;
  if new.tipo = 'AI' and new.cuenta_contra !~ '^[0-9]{8}$' then raise exception 'Escoge la cuenta contrapartida del ajuste (auxiliar de 8 dígitos).'; end if;
  if new.tipo = 'AI' and new.tercero_id is null then raise exception 'Escoge el tercero del ajuste.'; end if;
  return new;
end $$;
drop trigger if exists inventario_docs_validar on public.inventario_docs;
create trigger inventario_docs_validar before insert or update on public.inventario_docs for each row execute function public.validar_inventario_doc();

alter table public.inventario_docs enable row level security;
drop policy if exists inventario_docs_ver on public.inventario_docs;
create policy inventario_docs_ver on public.inventario_docs for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists inventario_docs_crear on public.inventario_docs;
create policy inventario_docs_crear on public.inventario_docs for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists inventario_docs_editar on public.inventario_docs;
create policy inventario_docs_editar on public.inventario_docs for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists inventario_docs_borrar on public.inventario_docs;
create policy inventario_docs_borrar on public.inventario_docs for delete to authenticated using (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';
