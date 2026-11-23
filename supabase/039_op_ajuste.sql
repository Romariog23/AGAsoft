-- Operación: tarifa de programación "Ajuste adicional" (se suma a la tarifa base, p. ej. +$1.000 la hora en una obra).
-- Requiere 037_operacion.sql. Correr una vez en el SQL Editor de Supabase.
alter table public.op_tarifas drop constraint if exists op_tarifas_modo_check;
alter table public.op_tarifas add constraint op_tarifas_modo_check check (modo in ('unidad', 'registro', 'fijo', 'adicional'));
notify pgrst, 'reload schema';
