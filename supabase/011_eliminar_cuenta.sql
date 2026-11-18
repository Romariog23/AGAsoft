-- AGAsoft: el administrador puede eliminar una cuenta desde /admin.
-- Se borra el usuario con todas sus contabilidades (empresas) y sus datos. No se puede deshacer.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.admin_eliminar_cuenta(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  if p_id = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta.'; end if;
  if exists (select 1 from public.perfiles where id = p_id and es_admin) then raise exception 'No se puede eliminar una cuenta administradora.'; end if;
  -- Documentos que la cuenta creó en contabilidades de otros quedan sin autor (no se borran).
  update public.documentos set creado_por = null where creado_por = p_id;
  -- Accesos que le dieron en contabilidades de otros.
  delete from public.miembros where lower(correo) = lower((select correo from public.perfiles where id = p_id));
  -- Sus contabilidades y todo lo que cuelga de ellas se borran en cascada con el usuario.
  delete from public.empresas where owner = p_id;
  delete from auth.users where id = p_id;
  delete from public.perfiles where id = p_id;
end $$;
revoke all on function public.admin_eliminar_cuenta(uuid) from public, anon;
grant execute on function public.admin_eliminar_cuenta(uuid) to authenticated;
notify pgrst, 'reload schema';
