-- 051: plan "Base" (Romario, 2026-11-28): ventas, compras, contabilidad, nómina electrónica, informes y configuración,
-- con los documentos electrónicos. Lo demás (inventario, operación, cotizaciones, calendario, centros de costo,
-- medios magnéticos, importar, informes avanzados, usuarios de consulta) queda apagado, y '*': false hace que los
-- módulos nuevos de AGAsoft también lleguen apagados a este plan.
-- Se crea INACTIVO y en $0: en /admin › Planes ponle el precio y márcalo como activo para asignarlo.
-- Correr una vez en Supabase › SQL Editor. Si ya existe un plan llamado "Base", no hace nada.

insert into public.planes (nombre, precio_mensual, por_empresa, max_empresas, max_documentos_mes, max_documentos_fe_mes, max_usuarios, max_empleados, modulos, descripcion, activo, orden)
select 'Base', 0, true, null, null, null, null, null,
  '{"*": false, "contables": true, "informes": true, "conciliacion": true, "activos": true, "cierre": true, "nomina": true, "nominae": true}'::jsonb,
  'Ventas, compras, contabilidad, nómina electrónica, informes y configuración, con documentos electrónicos.', false, 5
where not exists (select 1 from public.planes where lower(nombre) = 'base');

notify pgrst, 'reload schema';
