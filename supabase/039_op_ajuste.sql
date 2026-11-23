-- Operación: la cotización es el proyecto. Ajuste adicional al operador por unidad (p. ej. +$1.000 la hora)
-- que se suma a su tarifa de programación solo en los registros de ese proyecto.
-- Requiere 038_cotizaciones.sql. Correr una vez en el SQL Editor de Supabase.
alter table public.cotizaciones add column if not exists ajuste_op numeric(16,2) not null default 0 check (ajuste_op >= 0);
notify pgrst, 'reload schema';
