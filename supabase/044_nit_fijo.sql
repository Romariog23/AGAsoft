-- 044: El NIT de la empresa queda fijo después de su primer documento electrónico aceptado por la DIAN en producción.
create or replace function public.empresas_nit_fijo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nit is distinct from old.nit and exists (select 1 from fe_envios where empresa_id = old.id and estado = 'aceptado' and ambiente = 'produccion') then
    raise exception 'El NIT no se puede cambiar: la empresa ya emitió facturas electrónicas en producción con este NIT.';
  end if;
  return new;
end $$;
drop trigger if exists empresas_nit_fijo on public.empresas;
create trigger empresas_nit_fijo before update of nit on public.empresas for each row execute function public.empresas_nit_fijo();
notify pgrst, 'reload schema';
