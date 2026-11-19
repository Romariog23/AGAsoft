-- 021: nómina en borrador (se guarda sin contabilizar; se puede editar o eliminar hasta contabilizarla).
alter table public.nominas drop constraint if exists nominas_estado_check;
alter table public.nominas add constraint nominas_estado_check check (estado in ('borrador', 'contabilizado', 'anulado'));

create or replace function public.validar_nomina() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Una nómina anulada no se puede modificar.'; end if;
  if tg_op = 'UPDATE' and old.estado = 'contabilizado' and new.estado = 'borrador' then raise exception 'Una nómina contabilizada no puede volver a borrador: anúlala.'; end if;
  if jsonb_array_length(new.lineas) = 0 then raise exception 'La nómina necesita al menos un empleado.'; end if;
  if new.neto < 0 then raise exception 'El neto de la nómina no puede ser negativo.'; end if;
  return new;
end $$;

-- Solo los borradores se pueden eliminar.
drop policy if exists nominas_borrar on public.nominas;
create policy nominas_borrar on public.nominas for delete to authenticated using (public.puede_editar(empresa_id) and estado = 'borrador');
