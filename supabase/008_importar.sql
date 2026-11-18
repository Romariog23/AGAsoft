-- AGAsoft: importar facturas de venta desde las plantillas (datos tomados de la DIAN con el token).
-- La factura entra ya emitida, con el prefijo y el número que tiene en la DIAN.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run. Requiere haber corrido 007_factura_electronica.sql.
create or replace function public.importar_documento(p_doc jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  d documentos; did uuid;
begin
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  p_doc := p_doc - array['vence', 'id', 'ref_id']::text[] || jsonb_strip_nulls(jsonb_build_object('vence', nullif(p_doc->>'vence', '')));
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if d.tipo <> 'FV' then raise exception 'Por ahora solo se importan facturas de venta.'; end if;
  if d.numero is null or d.numero <= 0 then raise exception 'La factura necesita número.'; end if;
  if not exists (select 1 from terceros where id = d.tercero_id and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if exists (select 1 from documentos where empresa_id = eid and tipo = 'FV' and prefijo = coalesce(d.prefijo, '') and numero = d.numero) then
    raise exception 'La factura % % ya existe.', coalesce(d.prefijo, ''), d.numero; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'La factura necesita al menos una línea.'; end if;
  insert into documentos (empresa_id, tipo, estado, electronica, prefijo, numero, fecha, vence, tercero_id, forma_pago, medio_pago, observaciones,
    bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, emitido_en)
  values (eid, 'FV', 'emitido', coalesce(d.electronica, true), coalesce(d.prefijo, ''), d.numero, coalesce(d.fecha, current_date), d.vence, d.tercero_id,
    coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'transferencia'), coalesce(d.observaciones, ''),
    coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0), coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0),
    coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0), coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), now())
  returning id into did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 1), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(p_items) with ordinality as a(x, o);
  return did;
end $$;

revoke all on function public.importar_documento(jsonb, jsonb) from public, anon;
grant execute on function public.importar_documento(jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';
