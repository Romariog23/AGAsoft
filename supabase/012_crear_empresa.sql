-- AGAsoft: arreglo para que una cuenta nueva (no administradora) pueda crear su primera empresa.
-- Al crear la empresa la app pide de vuelta la fila creada, y la regla de lectura buscaba la empresa
-- en la tabla antes de que existiera, así que respondía "No tienes permiso". Ahora el dueño la ve directo.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

drop policy if exists empresas_ver on public.empresas;
create policy empresas_ver on public.empresas for select to authenticated
  using ((owner = auth.uid() and public.aprobado()) or public.puede_ver(id));
notify pgrst, 'reload schema';
