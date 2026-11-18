-- AGAsoft: factura de venta electrónica y factura normal (no electrónica).
-- Las facturas normales (y sus notas) se pueden eliminar aunque ya estén emitidas, porque no se reportan a la DIAN.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

-- Cada numeración de factura es electrónica (resolución DIAN) o normal. La primera vez, las numeraciones de factura
-- que ya tienen resolución quedan como electrónicas. Las facturas ya emitidas quedan como normales (se pueden eliminar):
-- ninguna se ha transmitido todavía a la DIAN.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'numeraciones' and column_name = 'electronica') then
    alter table public.numeraciones add column electronica boolean not null default false;
    update public.numeraciones set electronica = true where tipo = 'FV' and trim(resolucion) <> '';
  end if;
end $$;
alter table public.documentos add column if not exists electronica boolean not null default false;
-- Una numeración activa por tipo de documento y por clase.
drop index if exists public.numeraciones_una_activa;
create unique index if not exists numeraciones_una_activa on public.numeraciones (empresa_id, tipo, electronica) where activa;

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
    if d.estado <> 'borrador' then raise exception 'Solo se pueden modificar borradores.'; end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
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

create or replace function public.emitir_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos; n numeraciones; f documentos; acred numeric;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'borrador' then raise exception 'El documento ya no es un borrador.'; end if;
  if d.tipo in ('FV', 'NC', 'ND') then
    if not exists (select 1 from items where documento_id = p_id) then raise exception 'Agrega al menos una línea.'; end if;
    if d.total <= 0 then raise exception 'El total debe ser mayor que cero.'; end if;
  end if;
  if d.tipo in ('NC', 'ND') then
    select * into f from documentos where id = d.ref_id;
    if not found or f.tipo <> 'FV' or f.estado <> 'emitido' or f.empresa_id <> d.empresa_id then raise exception 'La nota debe referirse a una factura emitida.'; end if;
    if f.tercero_id <> d.tercero_id then raise exception 'La nota debe ser del mismo cliente de la factura.'; end if;
    update documentos set electronica = f.electronica where id = p_id; d.electronica := f.electronica;
    if d.tipo = 'NC' then
      select coalesce(sum(total), 0) into acred from documentos where tipo = 'NC' and estado = 'emitido' and ref_id = f.id;
      if acred + d.total > f.total then raise exception 'La nota crédito supera el valor pendiente de la factura (% disponible).', f.total - acred; end if;
    end if;
  end if;
  if d.tipo = 'RC' and d.electronica then update documentos set electronica = false where id = p_id; d.electronica := false; end if;
  if d.tipo = 'RC' and d.total <= 0 then raise exception 'El recibo debe tener un valor mayor que cero.'; end if;

  -- La factura usa la numeración de su clase (electrónica o normal). Notas y recibos prefieren la de su clase y si no, la que haya.
  select * into n from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa and (d.tipo <> 'FV' or electronica = d.electronica)
    order by (electronica = d.electronica) desc limit 1 for update;
  if not found then raise exception '%', case when d.tipo = 'FV' and d.electronica then 'No hay una numeración activa de factura electrónica. Créala en Numeraciones con la resolución DIAN.'
    when d.tipo = 'FV' then 'No hay una numeración activa de factura normal (no electrónica). Créala en Numeraciones.'
    else 'No hay una numeración activa para este tipo de documento. Créala en Numeraciones.' end; end if;
  if n.siguiente > n.hasta then raise exception 'Se agotó el rango de numeración % (hasta %).', n.prefijo, n.hasta; end if;
  if n.vigencia_hasta is not null and d.fecha > n.vigencia_hasta then raise exception 'La numeración % venció el %.', n.prefijo, n.vigencia_hasta; end if;
  if n.vigencia_desde is not null and d.fecha < n.vigencia_desde then raise exception 'La numeración % rige desde el %.', n.prefijo, n.vigencia_desde; end if;

  update documentos set estado = 'emitido', prefijo = n.prefijo, numero = n.siguiente, numeracion_id = n.id, emitido_en = now() where id = p_id;
  update numeraciones set siguiente = siguiente + 1 where id = n.id;
end $$;

-- Elimina una factura, nota crédito o nota débito NO electrónica, aunque esté emitida.
-- Una factura con notas o pagos vigentes no se puede eliminar: primero se eliminan las notas y se anulan los recibos.
-- Si era el último número de su numeración, ese número se vuelve a usar.
create or replace function public.eliminar_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.tipo not in ('FV', 'NC', 'ND') then raise exception 'Los recibos de caja no se eliminan: se anulan.'; end if;
  if d.electronica and d.estado <> 'borrador' then raise exception 'Las facturas y notas electrónicas no se eliminan: se corrigen con una nota.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado <> 'borrador') then
      raise exception 'La factura tiene notas crédito o débito. Elimínalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
    -- Borradores de notas y pagos de recibos anulados o en borrador que apuntan a la factura.
    delete from documentos where ref_id = p_id and estado = 'borrador';
    delete from aplicaciones where factura_id = p_id;
  end if;
  delete from documentos where id = p_id;
  if d.numeracion_id is not null then
    update numeraciones set siguiente = d.numero where id = d.numeracion_id and siguiente = d.numero + 1 and d.numero >= desde;
  end if;
end $$;

revoke all on function public.eliminar_documento(uuid) from public, anon;
grant execute on function public.eliminar_documento(uuid) to authenticated;
