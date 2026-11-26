-- 045: Cuentas con cartera. Cada cuenta puede marcarse para seguir sus saldos por tercero y documento cruce
-- (cartera, cuentas por pagar, edades). null = hereda de la cuenta padre; por defecto 1305, 1330 y 2205.
-- El documento cruce y el vencimiento de los comprobantes van dentro de comprobantes.lineas (cruce, vence): no necesitan columna.
-- Correr una vez en Supabase.
alter table public.cuentas add column if not exists cartera boolean;
notify pgrst, 'reload schema';
