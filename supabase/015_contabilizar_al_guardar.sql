-- AGAsoft 015: solo los documentos electrónicos tienen borrador. Los demás contabilizan al guardar
-- y se pueden imprimir, editar y anular.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    if d.estado = 'emitido' and d.electronica then raise exception 'Los documentos electrónicos no se modifican: se corrigen con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', false, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;

-- Anula recibos y facturas o notas que no son electrónicas. Las electrónicas se corrigen con una nota.
create or replace function public.anular_recibo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'emitido' then raise exception 'Solo se anulan documentos guardados.'; end if;
  if d.electronica and d.tipo <> 'RC' then raise exception 'Los documentos electrónicos no se anulan: se corrigen con una nota.'; end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Escribe el motivo de la anulación.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado = 'emitido') then
      raise exception 'La factura tiene notas crédito o débito. Anúlalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
  end if;
  update documentos set estado = 'anulado', anulado_en = now(), anulado_motivo = p_motivo where id = p_id;
end $$;

-- Compras, egresos y comprobantes: lo anulado ya no se edita.
create or replace function public.editar_guardado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
  return new;
end $$;
drop trigger if exists compras_editar on public.compras;
create trigger compras_editar before update on public.compras for each row execute function public.editar_guardado();
drop trigger if exists comprobantes_editar on public.comprobantes;
create trigger comprobantes_editar before update on public.comprobantes for each row execute function public.editar_guardado();

revoke all on function public.anular_recibo(uuid, text) from public, anon;
grant execute on function public.anular_recibo(uuid, text) to authenticated;
notify pgrst, 'reload schema';
