-- El comprobante de cierre (CI) se puede crear, anular o eliminar aunque el periodo esté bloqueado.
-- Todo lo demás sigue igual que en 043_bloqueo_periodos.sql.
create or replace function public.revisar_bloqueo() returns trigger
language plpgsql security definer set search_path = public as $$
declare h date; e uuid; f date;
begin
  if public.en_traslado() then return coalesce(new, old); end if;
  if tg_table_name = 'comprobantes' and (case when tg_op = 'DELETE' then old.tipo else new.tipo end) = 'CI'
     and (tg_op = 'INSERT' or old.tipo = 'CI') then return coalesce(new, old); end if;
  e := case when tg_op = 'DELETE' then old.empresa_id else new.empresa_id end;
  select bloqueado_hasta into h from empresas where id = e;
  if h is null then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' and old.fecha <= h and not (tg_table_name = 'documentos' and old.estado = 'borrador') then
    f := old.fecha;
  elsif tg_op <> 'DELETE' and new.fecha <= h and not (tg_table_name = 'documentos' and new.estado = 'borrador') then
    f := new.fecha;
  end if;
  if f is not null then
    raise exception 'El periodo está bloqueado hasta el %: no se puede crear, modificar, anular ni eliminar un documento con fecha %. El dueño puede desbloquearlo en Configuración › Bloqueo de periodos.', to_char(h, 'DD/MM/YYYY'), to_char(f, 'DD/MM/YYYY');
  end if;
  return coalesce(new, old);
end $$;
