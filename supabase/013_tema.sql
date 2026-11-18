-- AGAsoft: cada usuario escoge el color y el modo (claro/oscuro) de su AGAsoft.
-- Se guarda en su perfil para verlo igual en cualquier equipo.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

alter table public.perfiles add column if not exists tema jsonb not null default '{}'::jsonb;

-- El usuario solo puede cambiar su propio tema (el resto del perfil lo cambia el administrador).
create or replace function public.guardar_tema(p_tema jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta.'; end if;
  update perfiles set tema = jsonb_build_object('color', left(coalesce(p_tema->>'color', 'aga'), 20), 'modo', left(coalesce(p_tema->>'modo', 'auto'), 10))
  where id = auth.uid();
end $$;
revoke all on function public.guardar_tema(jsonb) from public, anon;
grant execute on function public.guardar_tema(jsonb) to authenticated;
notify pgrst, 'reload schema';
