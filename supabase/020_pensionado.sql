-- 020: empleado pensionado (no cotiza pensión ni fondo de solidaridad; salud completa).
alter table public.empleados add column if not exists pensionado boolean not null default false;
