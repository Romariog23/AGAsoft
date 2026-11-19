-- 022: los planes activos se ven sin iniciar sesión (para mostrarlos en la página de entrada).
drop policy if exists planes_publicos on public.planes;
create policy planes_publicos on public.planes for select to anon using (activo);
