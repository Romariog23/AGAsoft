-- 028: se pueden eliminar facturas y notas electrónicas que la DIAN no ha validado, recibos de caja,
-- comprobantes contables y documentos de compra (FC, DS, CE).
-- Corre este archivo en Supabase › SQL Editor. Se puede correr más de una vez.

create or replace function public.eliminar_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.tipo not in ('FV', 'NC', 'ND', 'RC') then raise exception 'Este documento no se puede eliminar.'; end if;
  -- Electrónicas: solo se eliminan si la DIAN no las ha validado (ningún envío aceptado ni con CUFE).
  if d.electronica and d.estado <> 'borrador' and exists (select 1 from fe_envios e where e.documento_id = p_id and (e.estado = 'aceptado' or e.cufe <> ''
      or 'true' in (e.respuesta->'data'->>'is_validated', e.respuesta->'data'->'credit_note'->>'is_validated', e.respuesta->'data'->'debit_note'->>'is_validated', e.respuesta->'data'->'bill'->>'is_validated'))) then
    raise exception 'Este documento ya fue validado por la DIAN: no se elimina, se corrige con una nota.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado <> 'borrador') then
      raise exception 'La factura tiene notas crédito o débito. Elimínalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
    -- Borradores de notas y pagos de recibos anulados o en borrador que apuntan a la factura.
    delete from documentos where ref_id = p_id and estado = 'borrador';
    delete from aplicaciones where factura_id = p_id;
  end if;
  if d.tipo = 'RC' then delete from aplicaciones where recibo_id = p_id; end if;
  delete from documentos where id = p_id;
  if d.numeracion_id is not null then
    update numeraciones set siguiente = d.numero where id = d.numeracion_id and siguiente = d.numero + 1 and d.numero >= desde;
  end if;
end $$;

revoke all on function public.eliminar_documento(uuid) from public, anon;
grant execute on function public.eliminar_documento(uuid) to authenticated;

-- Comprobantes contables y documentos de compra (FC, DS, CE) también se pueden eliminar.
drop policy if exists comprobantes_borrar on public.comprobantes;
create policy comprobantes_borrar on public.comprobantes for delete to authenticated using (public.puede_editar(empresa_id));
drop policy if exists compras_borrar on public.compras;
create policy compras_borrar on public.compras for delete to authenticated using (public.puede_editar(empresa_id));

-- Una factura de proveedor o documento soporte con egresos vigentes que la pagan no se elimina.
create or replace function public.compras_antes_de_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tipo <> 'CE' and exists (select 1 from compras e where e.empresa_id = old.empresa_id and e.tipo = 'CE' and e.estado <> 'anulado'
      and e.aplicaciones @> jsonb_build_array(jsonb_build_object('compra_id', old.id::text))) then
    raise exception 'Este documento tiene pagos. Elimina o anula primero el comprobante de egreso.'; end if;
  return old;
end $$;
drop trigger if exists compras_antes_de_borrar on public.compras;
create trigger compras_antes_de_borrar before delete on public.compras for each row execute function public.compras_antes_de_borrar();
