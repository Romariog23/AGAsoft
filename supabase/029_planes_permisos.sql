-- 029: permisos por plan y planes por empresa.
-- Cada plan puede cobrar por empresa, limitar los documentos electrónicos del mes de cada empresa, los empleados de nómina
-- y apagar módulos (nómina, medios magnéticos, importar plantillas). Vacío (null) = sin límite.
-- Corre este archivo en Supabase › SQL Editor. Se puede correr más de una vez.

alter table public.planes add column if not exists por_empresa boolean not null default false;
alter table public.planes add column if not exists max_documentos_fe_mes integer check (max_documentos_fe_mes >= 0);
alter table public.planes add column if not exists max_empleados integer check (max_empleados >= 0);
alter table public.planes add column if not exists modulos jsonb not null default '{"nomina": true, "exogena": true, "importar": true}'::jsonb;

-- Plan vigente que manda sobre una empresa (el de su dueño). Null: sin límites (administrador, prueba gratis o cuenta sin plan).
create or replace function public.plan_de_empresa(p_eid uuid) returns public.planes
language sql stable security definer set search_path = public as $$
  select pl.* from empresas e join perfiles p on p.id = e.owner join planes pl on pl.id = p.plan_id
  where e.id = p_eid and not p.es_admin;
$$;
revoke all on function public.plan_de_empresa(uuid) from public, anon, authenticated;

-- Documentos electrónicos (facturas y notas) guardados en el mes en curso por una empresa (los anulados también cuentan: ya se gastaron).
create or replace function public.documentos_fe_mes(p_eid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from documentos
  where empresa_id = p_eid and electronica and estado <> 'borrador' and tipo in ('FV', 'NC', 'ND')
    and date_trunc('month', fecha) = date_trunc('month', public.hoy_co());
$$;
revoke all on function public.documentos_fe_mes(uuid) from public, anon, authenticated;

-- Tope de documentos electrónicos: cuenta al guardar (pasar a emitido) una factura o nota electrónica.
create or replace function public.limite_fe() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes;
begin
  if not (new.electronica and new.tipo in ('FV', 'NC', 'ND') and new.estado = 'emitido' and (tg_op = 'INSERT' or old.estado is distinct from 'emitido')) then return new; end if;
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is not null and pl.max_documentos_fe_mes is not null and public.documentos_fe_mes(new.empresa_id) >= pl.max_documentos_fe_mes then
    raise exception 'Llegaste a los % documentos electrónicos de este mes del plan %. Sube de plan en Mi plan para seguir facturando electrónicamente.', pl.max_documentos_fe_mes, pl.nombre; end if;
  return new;
end $$;
drop trigger if exists documentos_limite_fe on public.documentos;
create trigger documentos_limite_fe before insert or update of estado on public.documentos for each row execute function public.limite_fe();

-- Nómina: el módulo tiene que estar en el plan, y los empleados activos no pasan del tope.
create or replace function public.limite_nomina() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes; n integer;
begin
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is null then return new; end if;
  if coalesce(pl.modulos->>'nomina', 'true') = 'false' then
    raise exception 'El plan % no incluye nómina. Sube de plan en Mi plan.', pl.nombre; end if;
  if tg_table_name = 'empleados' and pl.max_empleados is not null and new.activo and (tg_op = 'INSERT' or not old.activo) then
    select count(*) into n from empleados where empresa_id = new.empresa_id and activo and id <> new.id;
    if n >= pl.max_empleados then raise exception 'El plan % permite % empleado(s) activo(s) por empresa. Sube de plan en Mi plan.', pl.nombre, pl.max_empleados; end if;
  end if;
  return new;
end $$;
drop trigger if exists empleados_limite on public.empleados;
create trigger empleados_limite before insert or update of activo on public.empleados for each row execute function public.limite_nomina();
drop trigger if exists nominas_limite on public.nominas;
create trigger nominas_limite before insert on public.nominas for each row execute function public.limite_nomina();

-- Uso de una empresa frente a su plan (para Mi plan).
create or replace function public.uso_empresa(p_eid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.puede_ver(p_eid) then raise exception 'Empresa no encontrada.'; end if;
  return jsonb_build_object(
    'documentos_fe_mes', public.documentos_fe_mes(p_eid),
    'empleados', (select count(*) from empleados where empresa_id = p_eid and activo),
    'plan', (select to_jsonb(pl) from public.plan_de_empresa(p_eid) pl where pl.id is not null));
end $$;
revoke all on function public.uso_empresa(uuid) from public, anon;
grant execute on function public.uso_empresa(uuid) to authenticated;

-- Planes por documentos electrónicos (precio por empresa, firma digital incluida). Solo se crean si no existen.
insert into public.planes (nombre, precio_mensual, por_empresa, max_empresas, max_documentos_mes, max_documentos_fe_mes, max_usuarios, max_empleados, modulos, descripcion, orden)
select v.* from (values
  ('Emprendedor', 39900::numeric, true, null::int, null::int, 30, 1, 0, '{"nomina": false, "exogena": false, "importar": false}'::jsonb, 'Para empezar a facturar: 30 documentos electrónicos al mes, firma digital incluida.', 10),
  ('Pyme', 79900, true, null, null, 100, 2, 5, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '100 documentos electrónicos al mes, nómina hasta 5 empleados y medios magnéticos.', 11),
  ('Empresa', 129900, true, null, null, 300, 5, 25, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '300 documentos electrónicos al mes, nómina hasta 25 empleados y 5 usuarios.', 12),
  ('Empresa Plus', 209900, true, null, null, 1000, null, null, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '1.000 documentos electrónicos al mes, usuarios y nómina sin límite.', 13)
) as v(nombre, precio_mensual, por_empresa, max_empresas, max_documentos_mes, max_documentos_fe_mes, max_usuarios, max_empleados, modulos, descripcion, orden)
where not exists (select 1 from public.planes p where lower(p.nombre) = lower(v.nombre));

notify pgrst, 'reload schema';
