-- Notificaciones: cuándo leyó cada usuario cada aviso de la bandeja.
-- Los avisos se calculan en la app; aquí solo queda la lectura, para que se vea igual en el celular y el computador.
create table if not exists public.notificaciones_leidas (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave text not null check (length(clave) between 1 and 300),
  leida_en timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table public.notificaciones_leidas enable row level security;
drop policy if exists notif_propias on public.notificaciones_leidas;
create policy notif_propias on public.notificaciones_leidas for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.notificaciones_leidas to authenticated;
