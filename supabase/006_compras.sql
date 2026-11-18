-- AGAsoft: compras y gastos (factura de proveedor, documento soporte y comprobante de egreso).
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

-- Un tercero puede ser cliente, proveedor o ambos. Retenciones que la empresa le practica al proveedor.
alter table public.terceros add column if not exists es_cliente boolean not null default true;
alter table public.terceros add column if not exists es_proveedor boolean not null default false;
alter table public.terceros add column if not exists ret_compra_fuente_pct numeric(6,3) not null default 0;
alter table public.terceros add column if not exists ret_compra_iva_pct numeric(6,3) not null default 0;
alter table public.terceros add column if not exists ret_compra_ica_milaje numeric(7,3) not null default 0;

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('FC', 'DS', 'CE')),
  numero bigint not null,
  num_proveedor text not null default '',
  fecha date not null default current_date,
  vence date,
  tercero_id uuid not null references public.terceros(id),
  -- FC y DS: cada línea {cuenta, descripcion, base, iva_pct}
  lineas jsonb not null default '[]'::jsonb,
  retefuente_pct numeric(6,3) not null default 0,
  reteiva_pct numeric(6,3) not null default 0,
  reteica_milaje numeric(7,3) not null default 0,
  cuenta_retefuente text not null default '',
  base numeric(18,2) not null default 0,
  iva numeric(18,2) not null default 0,
  retefuente numeric(18,2) not null default 0,
  reteiva numeric(18,2) not null default 0,
  reteica numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  neto numeric(18,2) not null default 0,
  -- CE: cuenta de caja o bancos y facturas que paga [{compra_id, valor, ref}]
  cuenta_pago text not null default '',
  aplicaciones jsonb not null default '[]'::jsonb,
  anticipo numeric(18,2) not null default 0,
  observaciones text not null default '',
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists compras_empresa on public.compras (empresa_id);

create or replace function public.validar_compra() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Un documento anulado no se puede modificar.'; end if;
  if new.tipo in ('FC', 'DS') and jsonb_array_length(new.lineas) = 0 then raise exception 'El documento necesita al menos una línea.'; end if;
  if new.neto < 0 or new.anticipo < 0 then raise exception 'Los valores no pueden ser negativos.'; end if;
  return new;
end $$;
drop trigger if exists compras_validar on public.compras;
create trigger compras_validar before insert or update on public.compras for each row execute function public.validar_compra();

-- Se ven y se editan como los demás documentos; no se borran (se anulan).
alter table public.compras enable row level security;
drop policy if exists compras_ver on public.compras;
create policy compras_ver on public.compras for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists compras_crear on public.compras;
create policy compras_crear on public.compras for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists compras_editar on public.compras;
create policy compras_editar on public.compras for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';
