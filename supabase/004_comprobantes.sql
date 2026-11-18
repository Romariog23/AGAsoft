-- AGAsoft: comprobantes contables manuales (notas de contabilidad y saldos iniciales).
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.
create table if not exists public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null default 'CC' check (tipo in ('CC', 'SI')),
  numero bigint not null,
  fecha date not null default current_date,
  descripcion text not null default '',
  -- Cada línea: {cuenta, tercero_id, detalle, debito, credito}
  lineas jsonb not null default '[]'::jsonb,
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists comprobantes_empresa on public.comprobantes (empresa_id);

-- El comprobante debe cuadrar (sumas iguales) y cada línea llevar débito o crédito, no los dos.
create or replace function public.validar_comprobante() returns trigger
language plpgsql set search_path = public as $$
declare d numeric := 0; c numeric := 0; l jsonb;
begin
  if jsonb_typeof(new.lineas) <> 'array' or jsonb_array_length(new.lineas) < 2 then raise exception 'El comprobante necesita al menos dos líneas.'; end if;
  for l in select * from jsonb_array_elements(new.lineas) loop
    if coalesce(l->>'cuenta', '') = '' then raise exception 'Hay una línea sin cuenta.'; end if;
    if coalesce((l->>'debito')::numeric, 0) < 0 or coalesce((l->>'credito')::numeric, 0) < 0 then raise exception 'Los valores no pueden ser negativos.'; end if;
    if coalesce((l->>'debito')::numeric, 0) > 0 and coalesce((l->>'credito')::numeric, 0) > 0 then raise exception 'Cada línea lleva débito o crédito, no los dos.'; end if;
    d := d + coalesce((l->>'debito')::numeric, 0); c := c + coalesce((l->>'credito')::numeric, 0);
  end loop;
  if round(d, 2) <> round(c, 2) then raise exception 'El comprobante no cuadra: débitos % y créditos %.', d, c; end if;
  if d = 0 then raise exception 'El comprobante no tiene valores.'; end if;
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Un comprobante anulado no se puede modificar.'; end if;
  return new;
end $$;
drop trigger if exists comprobantes_validar on public.comprobantes;
create trigger comprobantes_validar before insert or update on public.comprobantes for each row execute function public.validar_comprobante();

-- Se ven y se editan como los documentos; no se borran (se anulan).
alter table public.comprobantes enable row level security;
drop policy if exists comprobantes_ver on public.comprobantes;
create policy comprobantes_ver on public.comprobantes for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists comprobantes_crear on public.comprobantes;
create policy comprobantes_crear on public.comprobantes for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists comprobantes_editar on public.comprobantes;
create policy comprobantes_editar on public.comprobantes for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';
