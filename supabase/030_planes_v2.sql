-- 030: planes v2 (Emprendedor, Pyme, Empresa), ajustados a lo que AGAsoft hace hoy.
-- Precios mensuales sin IVA y por empresa. El cliente compra su propio paquete de Factus, por eso no hay tope
-- de documentos electrónicos en AGAsoft. Nuevos módulos: informes (ventas y cartera), avanzados (informes avanzados
-- y exportar a Excel) y consulta (usuarios de solo consulta). Empresa Plus deja de ofrecerse.
-- max_usuarios = personas a las que el dueño da acceso (sin contarlo a él): 1 usuario = 0, 3 usuarios = 2.
-- Corre este archivo en Supabase › SQL Editor después del 029. Se puede correr más de una vez.

insert into public.planes (nombre, precio_mensual, por_empresa, orden, descripcion)
select v.nombre, v.precio, true, v.orden, '' from (values ('Emprendedor', 31000::numeric, 10), ('Pyme', 69000, 11), ('Empresa', 129900, 12)) as v(nombre, precio, orden)
where not exists (select 1 from public.planes p where lower(p.nombre) = lower(v.nombre));

update public.planes set precio_mensual = 31000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = 0, max_empleados = 0, activo = true, orden = 10,
  modulos = '{"nomina": false, "exogena": false, "importar": false, "informes": false, "avanzados": false, "consulta": false}'::jsonb,
  descripcion = 'Para facturar electrónicamente y llevar la contabilidad básica. 1 usuario.'
where lower(nombre) = 'emprendedor';

update public.planes set precio_mensual = 69000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = 2, max_empleados = 5, activo = true, orden = 11,
  modulos = '{"nomina": true, "exogena": true, "importar": true, "informes": true, "avanzados": false, "consulta": true}'::jsonb,
  descripcion = 'Suma nómina hasta 5 empleados, medios magnéticos, importar de Excel e informes de ventas y cartera. 3 usuarios.'
where lower(nombre) = 'pyme';

update public.planes set precio_mensual = 119000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = null, max_empleados = null, activo = true, orden = 12,
  modulos = '{"nomina": true, "exogena": true, "importar": true, "informes": true, "avanzados": true, "consulta": true}'::jsonb,
  descripcion = 'Todo AGAsoft: informes avanzados, exportar a Excel, nómina y usuarios sin límite.'
where lower(nombre) = 'empresa';

-- Se dejan de ofrecer (las cuentas que ya los tienen los conservan hasta que les cambies el plan).
update public.planes set activo = false where lower(nombre) in ('empresa plus', 'básico', 'basico', 'profesional', 'contador');

-- Usuarios de solo consulta: solo si el plan los incluye.
create or replace function public.limite_consulta() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes;
begin
  if new.rol <> 'consulta' or (tg_op = 'UPDATE' and old.rol = 'consulta') then return new; end if;
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is not null and coalesce(pl.modulos->>'consulta', 'true') = 'false' then
    raise exception 'El plan % no incluye usuarios de solo consulta. Sube de plan en Mi plan.', pl.nombre; end if;
  return new;
end $$;
drop trigger if exists miembros_consulta on public.miembros;
create trigger miembros_consulta before insert or update of rol on public.miembros for each row execute function public.limite_consulta();

notify pgrst, 'reload schema';
