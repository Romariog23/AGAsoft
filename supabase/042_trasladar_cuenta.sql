-- 042: Trasladar movimientos de una cuenta auxiliar a otra (reescribe la historia).
-- Cambia la cuenta en todos los documentos de la empresa (facturas, notas, recibos, compras, egresos,
-- comprobantes, nómina, inventario) y en su configuración (parámetros, tarifas, retenciones, formas de pago,
-- productos y bodegas). Solo el dueño de la empresa (o el administrador). Correr una vez en Supabase.

-- Mientras corre el traslado, las validaciones de edición dejan pasar el cambio de cuenta
-- (documentos validados por la DIAN: la cuenta contable no va en el XML, así que no se altera lo enviado).
create or replace function public.en_traslado() returns boolean
language sql stable as $$ select coalesce(current_setting('agasoft.traslado', true), '') = '1' $$;

create or replace function public.editar_guardado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.en_traslado() then return new; end if;
  if old.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
  return new;
end $$;

create or replace function public.compras_antes_de_cambiar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.en_traslado() then return new; end if;
  if old.electronica and public.compra_validada(old.id) then
    raise exception 'La DIAN ya validó este documento: no se puede modificar ni anular. Corrígelo con una nota de ajuste.'; end if;
  if new.tipo = 'NA' then
    if new.ref_id is null or not exists (select 1 from compras d where d.id = new.ref_id and d.empresa_id = new.empresa_id and d.tipo = 'DS' and d.tercero_id = new.tercero_id) then
      raise exception 'La nota de ajuste debe referirse a un documento soporte del mismo proveedor.'; end if;
  end if;
  return new;
end $$;

create or replace function public.trasladar_cuenta(p_empresa uuid, p_desde text, p_hasta text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a text := '"' || p_desde || '"';
  b text := '"' || p_hasta || '"';
  n int := 0; k int;
begin
  if not public.es_dueno(p_empresa) then raise exception 'Solo el dueño de la empresa puede trasladar movimientos.'; end if;
  if p_desde !~ '^[0-9]{8}$' or p_hasta !~ '^[0-9]{8}$' or p_desde = p_hasta then
    raise exception 'Escoge dos cuentas auxiliares distintas de 8 dígitos.'; end if;
  if not exists (select 1 from cuentas where empresa_id = p_empresa and codigo = p_hasta and activa) then
    raise exception 'La cuenta % no existe o está inactiva.', p_hasta; end if;
  if exists (select 1 from bodegas where empresa_id = p_empresa and cuenta = p_desde) and p_hasta !~ '^14' then
    raise exception 'La cuenta % es de una bodega: la cuenta nueva debe ser de la clase 14.', p_desde; end if;

  perform set_config('agasoft.traslado', '1', true);

  update items set cuenta = p_hasta where empresa_id = p_empresa and cuenta = p_desde;
  get diagnostics k = row_count; n := n + k;

  update documentos set
    cuenta_pago = case when cuenta_pago = p_desde then p_hasta else cuenta_pago end,
    retenciones = replace(retenciones::text, a, b)::jsonb
  where empresa_id = p_empresa and (cuenta_pago = p_desde or strpos(retenciones::text, a) > 0);
  get diagnostics k = row_count; n := n + k;

  update compras set
    lineas = replace(lineas::text, a, b)::jsonb,
    aplicaciones = replace(aplicaciones::text, a, b)::jsonb,
    retenciones = replace(retenciones::text, a, b)::jsonb,
    cuenta_pago = case when cuenta_pago = p_desde then p_hasta else cuenta_pago end,
    cuenta_retefuente = case when cuenta_retefuente = p_desde then p_hasta else cuenta_retefuente end
  where empresa_id = p_empresa and estado <> 'anulado'
    and (strpos(lineas::text, a) > 0 or strpos(aplicaciones::text, a) > 0 or strpos(retenciones::text, a) > 0 or cuenta_pago = p_desde or cuenta_retefuente = p_desde);
  get diagnostics k = row_count; n := n + k;

  update comprobantes set lineas = replace(lineas::text, a, b)::jsonb
  where empresa_id = p_empresa and estado <> 'anulado' and strpos(lineas::text, a) > 0;
  get diagnostics k = row_count; n := n + k;

  update nominas set
    lineas = replace(lineas::text, a, b)::jsonb,
    cuenta_neto = case when cuenta_neto = p_desde then p_hasta else cuenta_neto end
  where empresa_id = p_empresa and estado <> 'anulado' and (strpos(lineas::text, a) > 0 or cuenta_neto = p_desde);
  get diagnostics k = row_count; n := n + k;

  update inventario_docs set cuenta_contra = p_hasta where empresa_id = p_empresa and cuenta_contra = p_desde;
  get diagnostics k = row_count; n := n + k;

  update productos set
    cuenta_ingreso = case when cuenta_ingreso = p_desde then p_hasta else cuenta_ingreso end,
    cuenta_devolucion = case when cuenta_devolucion = p_desde then p_hasta else cuenta_devolucion end,
    cuenta_costo = case when cuenta_costo = p_desde then p_hasta else cuenta_costo end
  where empresa_id = p_empresa and p_desde in (cuenta_ingreso, cuenta_devolucion, cuenta_costo);
  get diagnostics k = row_count; n := n + k;

  update bodegas set cuenta = p_hasta where empresa_id = p_empresa and cuenta = p_desde;
  get diagnostics k = row_count; n := n + k;

  -- Configuración de la empresa: parámetros, tarifas de IVA, retenciones, formas de pago y versiones anteriores.
  update empresas set contabilidad = replace(contabilidad::text, a, b)::jsonb
  where id = p_empresa and strpos(contabilidad::text, a) > 0;

  return jsonb_build_object('registros', n);
end $$;

revoke all on function public.trasladar_cuenta(uuid, text, text) from public, anon;
grant execute on function public.trasladar_cuenta(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
