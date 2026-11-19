-- AGAsoft 026: marcar terceros como entidades de seguridad social (EPS, fondo de pensiones, fondo de cesantías, caja, ARL, ICBF o SENA).
-- Un tercero puede tener varias (por ejemplo, un fondo de pensiones y cesantías). Con esto, la ficha del empleado y la PILA solo muestran esas entidades.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.terceros add column if not exists entidad_ss text[] not null default '{}';
alter table public.terceros drop constraint if exists terceros_entidad_ss_check;
alter table public.terceros add constraint terceros_entidad_ss_check check (entidad_ss <@ array['eps', 'pension', 'cesantias', 'caja', 'arl', 'parafiscales']::text[]);

notify pgrst, 'reload schema';
