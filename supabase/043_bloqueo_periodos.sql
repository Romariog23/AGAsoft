-- 043: Bloqueo de periodos (no es el comprobante de cierre de cuentas).
-- Cada empresa tiene "bloqueado_hasta": ningún documento con fecha hasta ese día se crea, modifica, anula ni elimina.
-- Solo el dueño lo cambia, con la función bloquear_periodo, y queda registrado quién y cuándo. Correr una vez en Supabase.

alter table public.empresas add column if not exists bloqueado_hasta date;

create table if not exists public.bloqueos_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  hasta date,
  anterior date,
  usuario uuid default auth.uid(),
  correo text not null default coalesce(auth.jwt()->>'email', ''),
  en timestamptz not null default now()
);
create index if not exists bloqueos_log_empresa on public.bloqueos_log (empresa_id, en desc);
alter table public.bloqueos_log enable row level security;
drop policy if exists bloqueos_log_ver on public.bloqueos_log;
create policy bloqueos_log_ver on public.bloqueos_log for select to authenticated using (public.puede_ver(empresa_id));

-- La fecha de bloqueo solo cambia por bloquear_periodo (no con un guardado normal de la empresa).
create or replace function public.empresas_bloqueo() returns trigger
language plpgsql as $$
begin
  if new.bloqueado_hasta is distinct from old.bloqueado_hasta and coalesce(current_setting('agasoft.bloqueo', true), '') <> '1' then
    new.bloqueado_hasta := old.bloqueado_hasta;
  end if;
  return new;
end $$;
drop trigger if exists empresas_bloqueo on public.empresas;
create trigger empresas_bloqueo before update on public.empresas for each row execute function public.empresas_bloqueo();

create or replace function public.bloquear_periodo(p_empresa uuid, p_hasta date) returns void
language plpgsql security definer set search_path = public as $$
declare ant date;
begin
  if not public.es_dueno(p_empresa) then raise exception 'Solo el dueño de la empresa puede bloquear o desbloquear periodos.'; end if;
  select bloqueado_hasta into ant from empresas where id = p_empresa;
  perform set_config('agasoft.bloqueo', '1', true);
  update empresas set bloqueado_hasta = p_hasta where id = p_empresa;
  insert into bloqueos_log (empresa_id, hasta, anterior) values (p_empresa, p_hasta, ant);
end $$;
revoke all on function public.bloquear_periodo(uuid, date) from public, anon;
grant execute on function public.bloquear_periodo(uuid, date) to authenticated;

-- Revisa la fila vieja (editar, anular, eliminar) y la nueva (crear, editar). Los borradores de ventas no cuentan.
create or replace function public.revisar_bloqueo() returns trigger
language plpgsql security definer set search_path = public as $$
declare h date; e uuid; f date;
begin
  if public.en_traslado() then return coalesce(new, old); end if;
  e := case when tg_op = 'DELETE' then old.empresa_id else new.empresa_id end;
  select bloqueado_hasta into h from empresas where id = e;
  if h is null then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' and old.fecha <= h and not (tg_table_name = 'documentos' and old.estado = 'borrador') then
    f := old.fecha;
  elsif tg_op <> 'DELETE' and new.fecha <= h and not (tg_table_name = 'documentos' and new.estado = 'borrador') then
    f := new.fecha;
  end if;
  if f is not null then
    raise exception 'El periodo está bloqueado hasta el %: no se puede crear, modificar, anular ni eliminar un documento con fecha %. El dueño puede desbloquearlo en Configuración › Bloqueo de periodos.', to_char(h, 'DD/MM/YYYY'), to_char(f, 'DD/MM/YYYY');
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['documentos', 'compras', 'comprobantes', 'nominas', 'inventario_docs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_bloqueo', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.revisar_bloqueo()', t || '_bloqueo', t);
  end loop;
end $$;

-- Líneas de facturas y pagos de recibos: siguen la fecha de su documento.
create or replace function public.revisar_bloqueo_hijo() returns trigger
language plpgsql security definer set search_path = public as $$
declare h date; d record; pid uuid;
begin
  if public.en_traslado() then return coalesce(new, old); end if;
  pid := case when tg_table_name = 'items' then coalesce(new.documento_id, old.documento_id) else coalesce(new.recibo_id, old.recibo_id) end;
  select x.fecha, x.estado, e.bloqueado_hasta as hasta into d from documentos x join empresas e on e.id = x.empresa_id where x.id = pid;
  if d.hasta is not null and d.fecha <= d.hasta and d.estado <> 'borrador' then
    raise exception 'El periodo está bloqueado hasta el %: no se puede modificar un documento con fecha %.', to_char(d.hasta, 'DD/MM/YYYY'), to_char(d.fecha, 'DD/MM/YYYY');
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists items_bloqueo on public.items;
create trigger items_bloqueo before insert or update or delete on public.items for each row execute function public.revisar_bloqueo_hijo();
drop trigger if exists aplicaciones_bloqueo on public.aplicaciones;
create trigger aplicaciones_bloqueo before insert or update or delete on public.aplicaciones for each row execute function public.revisar_bloqueo_hijo();

notify pgrst, 'reload schema';
