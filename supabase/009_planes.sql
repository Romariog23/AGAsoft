-- AGAsoft: planes y control de uso.
-- El administrador (dueño de AGAsoft) crea los planes, se los asigna a cada cuenta y ve su uso desde /admin.
-- Cada cuenta es un usuario dueño de sus contabilidades (empresas). Los límites se cumplen en la base de datos.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

/* ============ Planes ============ */
create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  precio_mensual numeric(14,2) not null default 0 check (precio_mensual >= 0),
  -- Límites. Vacío (null) = sin límite.
  max_empresas integer check (max_empresas >= 0),
  max_documentos_mes integer check (max_documentos_mes >= 0),
  max_usuarios integer check (max_usuarios >= 0),
  descripcion text not null default '',
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
alter table public.planes enable row level security;
drop policy if exists planes_ver on public.planes;
create policy planes_ver on public.planes for select to authenticated using (true);
drop policy if exists planes_admin on public.planes;
create policy planes_admin on public.planes for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Planes de ejemplo (el administrador los cambia en /admin). Solo se crean si no hay ninguno.
insert into public.planes (nombre, precio_mensual, max_empresas, max_documentos_mes, max_usuarios, descripcion, orden)
select * from (values
  ('Básico', 49900::numeric, 1, 100, 1, 'Una contabilidad, hasta 100 documentos al mes.', 1),
  ('Profesional', 119900::numeric, 5, 1000, 3, 'Hasta 5 contabilidades y 3 personas con acceso.', 2),
  ('Contador', 249900::numeric, 30, 5000, 10, 'Para contadores con varias empresas cliente.', 3)
) as v(nombre, precio_mensual, max_empresas, max_documentos_mes, max_usuarios, descripcion, orden)
where not exists (select 1 from public.planes);

/* ============ Plan de cada cuenta ============ */
alter table public.perfiles add column if not exists plan_id uuid references public.planes(id) on delete set null;
alter table public.perfiles add column if not exists plan_vence date;
alter table public.perfiles add column if not exists suspendido boolean not null default false;
alter table public.perfiles add column if not exists notas text not null default '';

-- Una cuenta suspendida no entra a sus datos (ni a los que le compartieron).
create or replace function public.aprobado() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado and not suspendido from public.perfiles where id = auth.uid()), false);
$$;
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin and aprobado and not suspendido from public.perfiles where id = auth.uid()), false);
$$;

-- La cuenta solo puede cambiar su nombre; el plan, la aprobación y la suspensión los cambia el administrador.
drop policy if exists perfiles_admin on public.perfiles;
create policy perfiles_admin on public.perfiles for update to authenticated using (public.es_admin()) with check (public.es_admin());

/* ============ Uso ============ */
-- Documentos que cuenta el plan en un mes: facturas, notas y recibos emitidos, compras y comprobantes.
create or replace function public.documentos_mes(p_owner uuid, p_mes date default current_date) returns integer
language sql stable security definer set search_path = public as $$
  select (
    (select count(*) from documentos d join empresas e on e.id = d.empresa_id
      where e.owner = p_owner and d.estado <> 'borrador' and date_trunc('month', d.fecha) = date_trunc('month', p_mes))
  + (select count(*) from compras c join empresas e on e.id = c.empresa_id
      where e.owner = p_owner and date_trunc('month', c.fecha) = date_trunc('month', p_mes))
  + (select count(*) from comprobantes c join empresas e on e.id = c.empresa_id
      where e.owner = p_owner and date_trunc('month', c.fecha) = date_trunc('month', p_mes))
  )::integer;
$$;
-- Personas distintas con acceso a las contabilidades de una cuenta (sin contar al dueño).
create or replace function public.usuarios_de(p_owner uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(distinct lower(m.correo))::integer from miembros m join empresas e on e.id = m.empresa_id where e.owner = p_owner;
$$;

-- Uso y plan de la cuenta que está entrando (para mostrarlo en Configuración).
create or replace function public.mi_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', (select to_jsonb(pl) from planes pl where pl.id = p.plan_id),
    'plan_vence', p.plan_vence,
    'empresas', (select count(*) from empresas e where e.owner = p.id),
    'documentos_mes', public.documentos_mes(p.id),
    'usuarios', public.usuarios_de(p.id))
  from perfiles p where p.id = auth.uid();
$$;

-- Panel del administrador: todas las cuentas con su plan y su uso.
drop function if exists public.admin_cuentas();
create function public.admin_cuentas() returns table (
  id uuid, nombre text, correo text, es_admin boolean, aprobado boolean, suspendido boolean, plan_id uuid, plan_vence date, notas text,
  creado_en timestamptz, empresas integer, documentos_mes integer, usuarios integer, ultimo_documento date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  return query
  select p.id, p.nombre, p.correo, p.es_admin, p.aprobado, p.suspendido, p.plan_id, p.plan_vence, p.notas, p.creado_en,
    (select count(*) from empresas e where e.owner = p.id)::integer,
    public.documentos_mes(p.id), public.usuarios_de(p.id),
    (select max(d.fecha) from documentos d join empresas e on e.id = d.empresa_id where e.owner = p.id and d.estado <> 'borrador')
  from perfiles p order by p.creado_en desc;
end $$;

/* ============ Límites del plan ============ */
-- Plan vigente del dueño de una empresa. El administrador no tiene límites; una cuenta sin plan tampoco (cuentas antiguas).
create or replace function public.revisar_plan(p_owner uuid, p_que text) returns void
language plpgsql stable security definer set search_path = public as $$
declare p perfiles; pl planes; n integer;
begin
  select * into p from perfiles where id = p_owner;
  if not found or p.es_admin or p.plan_id is null then return; end if;
  select * into pl from planes where id = p.plan_id;
  if p.plan_vence is not null and p.plan_vence < current_date then
    raise exception 'El plan % venció el %. Comunícate con AGAsoft para renovarlo.', pl.nombre, to_char(p.plan_vence, 'DD/MM/YYYY'); end if;
  if p_que = 'empresa' and pl.max_empresas is not null then
    select count(*) into n from empresas where owner = p_owner;
    if n >= pl.max_empresas then raise exception 'Tu plan % permite % contabilidad(es). Comunícate con AGAsoft para ampliarlo.', pl.nombre, pl.max_empresas; end if;
  elsif p_que = 'documento' and pl.max_documentos_mes is not null then
    if public.documentos_mes(p_owner) >= pl.max_documentos_mes then
      raise exception 'Llegaste al límite de % documentos de este mes del plan %. Comunícate con AGAsoft para ampliarlo.', pl.max_documentos_mes, pl.nombre; end if;
  elsif p_que = 'usuario' and pl.max_usuarios is not null then
    if public.usuarios_de(p_owner) >= pl.max_usuarios then
      raise exception 'Tu plan % permite dar acceso a % persona(s). Comunícate con AGAsoft para ampliarlo.', pl.nombre, pl.max_usuarios; end if;
  end if;
end $$;
revoke all on function public.revisar_plan(uuid, text) from public, anon, authenticated;

create or replace function public.limite_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.revisar_plan(new.owner, 'empresa'); return new; end $$;
drop trigger if exists empresas_limite on public.empresas;
create trigger empresas_limite before insert on public.empresas for each row execute function public.limite_empresa();

create or replace function public.limite_documento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Facturas, notas y recibos cuentan al emitirse; compras y comprobantes al crearse.
  if tg_table_name = 'documentos' and not (new.estado = 'emitido' and (tg_op = 'INSERT' or old.estado = 'borrador')) then return new; end if;
  perform public.revisar_plan((select owner from empresas where id = new.empresa_id), 'documento');
  return new;
end $$;
drop trigger if exists documentos_limite on public.documentos;
create trigger documentos_limite before insert or update of estado on public.documentos for each row execute function public.limite_documento();
drop trigger if exists compras_limite on public.compras;
create trigger compras_limite before insert on public.compras for each row execute function public.limite_documento();
drop trigger if exists comprobantes_limite on public.comprobantes;
create trigger comprobantes_limite before insert on public.comprobantes for each row execute function public.limite_documento();

create or replace function public.limite_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid := (select owner from empresas where id = new.empresa_id);
begin
  -- Dar acceso a alguien que ya tiene acceso a otra contabilidad de la misma cuenta no suma.
  if exists (select 1 from miembros m join empresas e on e.id = m.empresa_id where e.owner = o and lower(m.correo) = lower(new.correo)) then return new; end if;
  perform public.revisar_plan(o, 'usuario');
  return new;
end $$;
drop trigger if exists miembros_limite on public.miembros;
create trigger miembros_limite before insert on public.miembros for each row execute function public.limite_usuario();

revoke all on function public.documentos_mes(uuid, date), public.usuarios_de(uuid) from public, anon, authenticated;
revoke all on function public.mi_plan(), public.admin_cuentas() from public, anon;
grant execute on function public.mi_plan(), public.admin_cuentas() to authenticated;
notify pgrst, 'reload schema';
