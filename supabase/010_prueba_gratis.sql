-- AGAsoft: prueba gratis de 15 días.
-- Quien se registra por primera vez entra de una vez y usa AGAsoft gratis 15 días.
-- Al terminar la prueba la cuenta no puede entrar a sus datos: escoge un plan y el administrador lo aprueba en /admin.
-- Las cuentas que ya existían no cambian. Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

alter table public.perfiles add column if not exists prueba_hasta date;
alter table public.perfiles add column if not exists plan_solicitado uuid references public.planes(id) on delete set null;
alter table public.perfiles add column if not exists solicitado_en timestamptz;

-- Fecha de hoy en Colombia.
create or replace function public.hoy_co() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date; $$;

-- El primer usuario queda como administrador. Los demás entran con 15 días de prueba gratis.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  select not exists (select 1 from public.perfiles) into primero;
  insert into public.perfiles (id, nombre, correo, es_admin, aprobado, prueba_hasta)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), coalesce(new.email, ''), primero, true,
    case when primero then null else public.hoy_co() + 15 end)
  on conflict (id) do nothing;
  return new;
end $$;

-- Con la prueba vencida y sin plan aprobado, la cuenta no entra a sus datos (ni a los que le compartieron).
create or replace function public.aprobado() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado and not suspendido and (prueba_hasta is null or prueba_hasta >= public.hoy_co())
    from public.perfiles where id = auth.uid()), false);
$$;

-- La cuenta escoge el plan que quiere; el administrador lo aprueba en /admin.
create or replace function public.solicitar_plan(p_plan uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta.'; end if;
  if not exists (select 1 from planes where id = p_plan and activo) then raise exception 'Ese plan no está disponible.'; end if;
  update perfiles set plan_solicitado = p_plan, solicitado_en = now() where id = auth.uid() and not suspendido;
end $$;
revoke all on function public.solicitar_plan(uuid) from public, anon;
grant execute on function public.solicitar_plan(uuid) to authenticated;

-- Plan, prueba y uso de la cuenta que está entrando.
create or replace function public.mi_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', (select to_jsonb(pl) from planes pl where pl.id = p.plan_id),
    'plan_vence', p.plan_vence,
    'prueba_hasta', p.prueba_hasta,
    'plan_solicitado', (select to_jsonb(pl) from planes pl where pl.id = p.plan_solicitado),
    'solicitado_en', p.solicitado_en,
    'empresas', (select count(*) from empresas e where e.owner = p.id),
    'documentos_mes', public.documentos_mes(p.id),
    'usuarios', public.usuarios_de(p.id))
  from perfiles p where p.id = auth.uid();
$$;

-- Panel del administrador: ahora con la prueba y el plan pedido.
drop function if exists public.admin_cuentas();
create function public.admin_cuentas() returns table (
  id uuid, nombre text, correo text, es_admin boolean, aprobado boolean, suspendido boolean, plan_id uuid, plan_vence date, notas text,
  creado_en timestamptz, empresas integer, documentos_mes integer, usuarios integer, ultimo_documento date,
  prueba_hasta date, plan_solicitado uuid, solicitado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  return query
  select p.id, p.nombre, p.correo, p.es_admin, p.aprobado, p.suspendido, p.plan_id, p.plan_vence, p.notas, p.creado_en,
    (select count(*) from empresas e where e.owner = p.id)::integer,
    public.documentos_mes(p.id), public.usuarios_de(p.id),
    (select max(d.fecha) from documentos d join empresas e on e.id = d.empresa_id where e.owner = p.id and d.estado <> 'borrador'),
    p.prueba_hasta, p.plan_solicitado, p.solicitado_en
  from perfiles p order by p.creado_en desc;
end $$;

revoke all on function public.mi_plan(), public.admin_cuentas() from public, anon;
grant execute on function public.mi_plan(), public.admin_cuentas() to authenticated;
notify pgrst, 'reload schema';
