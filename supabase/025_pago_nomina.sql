-- AGAsoft 025: comprobante de pago de nómina (PN).
-- Un solo comprobante paga salarios, seguridad social (PILA) o prestaciones a varios terceros, como una dispersión bancaria.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table public.comprobantes add constraint comprobantes_tipo_check check (tipo in ('CC', 'SI', 'CI', 'PN'));

notify pgrst, 'reload schema';
