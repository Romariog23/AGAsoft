-- AGAsoft: cuenta contable por producto para nota crédito y devolución.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.
alter table public.productos add column if not exists cuenta_devolucion text not null default '';
notify pgrst, 'reload schema';
