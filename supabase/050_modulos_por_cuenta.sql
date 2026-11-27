-- 050: módulos por cuenta, escogidos por el administrador en /admin.
--  - perfiles.modulos: null = la cuenta usa los módulos de su plan (como antes).
--    {clave: true|false, '*': false} = módulos escogidos a mano; '*' vale para los que no estén en la lista
--    (así los módulos nuevos de AGAsoft llegan apagados). Lo de la cuenta gana sobre el plan.
--  - ajustes_app.modulos_nuevos: con qué módulos entran las cuentas que se registren de ahora en adelante
--    (null = según su plan). Las cuentas que ya existen no cambian.
-- La base no se apaga nunca: ventas, compras y gastos, comprobantes, terceros, productos, configuración y electrónicos.
-- Correr una vez en Supabase › SQL Editor. Se puede correr más de una vez.

alter table public.perfiles add column if not exists modulos jsonb;

create table if not exists public.ajustes_app (
  id integer primary key default 1 check (id = 1),
  modulos_nuevos jsonb,
  actualizado_en timestamptz not null default now()
);
alter table public.ajustes_app enable row level security;
drop policy if exists ajustes_admin on public.ajustes_app;
create policy ajustes_admin on public.ajustes_app for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Solo el administrador cambia los módulos de una cuenta (la cuenta no puede encenderse módulos sola).
create or replace function public.proteger_modulos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.modulos is distinct from old.modulos and auth.uid() is not null and not public.es_admin() then
    raise exception 'Solo el administrador de AGAsoft cambia los módulos de una cuenta.';
  end if;
  return new;
end $$;
drop trigger if exists perfiles_modulos on public.perfiles;
create trigger perfiles_modulos before update of modulos on public.perfiles for each row execute function public.proteger_modulos();

-- El primer usuario queda como administrador. Los demás entran con 15 días de prueba gratis
-- y con los módulos de cuentas nuevas que haya escogido el administrador.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  select not exists (select 1 from public.perfiles) into primero;
  insert into public.perfiles (id, nombre, correo, es_admin, aprobado, prueba_hasta, modulos)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), coalesce(new.email, ''), primero, true,
    case when primero then null else public.hoy_co() + 15 end,
    case when primero then null else (select a.modulos_nuevos from public.ajustes_app a where a.id = 1) end)
  on conflict (id) do nothing;
  return new;
end $$;

notify pgrst, 'reload schema';
