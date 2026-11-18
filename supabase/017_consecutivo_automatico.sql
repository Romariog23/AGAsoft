-- AGAsoft 017: los documentos que no son electrónicos toman su consecutivo al guardar aunque no se haya creado la numeración.
-- Si falta, se crea sola: FN para facturas normales, RC para recibos, NC y ND para notas, desde el 1.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

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

  -- Documentos que no son electrónicos: si no hay numeración, se crea una sola (FN, RC, NC o ND desde el 1).
  if not d.electronica and not exists (select 1 from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa and (d.tipo <> 'FV' or not electronica)) then
    insert into numeraciones (empresa_id, tipo, prefijo, electronica) values (d.empresa_id, d.tipo, case d.tipo when 'FV' then 'FN' else d.tipo end, false);
  end if;
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
notify pgrst, 'reload schema';
