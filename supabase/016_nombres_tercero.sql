-- AGAsoft 016: nombre del tercero como lo pide la DIAN.
-- Persona natural: primer nombre, segundo nombre, primer apellido y segundo apellido. Persona jurídica: razón social.
-- La columna nombre sigue siendo el nombre completo que se muestra en listas y documentos.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.terceros add column if not exists tipo_persona text not null default 'juridica';
alter table public.terceros add column if not exists razon_social text not null default '';
alter table public.terceros add column if not exists primer_nombre text not null default '';
alter table public.terceros add column if not exists segundo_nombre text not null default '';
alter table public.terceros add column if not exists primer_apellido text not null default '';
alter table public.terceros add column if not exists segundo_apellido text not null default '';
alter table public.terceros drop constraint if exists terceros_tipo_persona_check;
alter table public.terceros add constraint terceros_tipo_persona_check check (tipo_persona in ('natural', 'juridica'));

-- Terceros que ya existían: con NIT quedan como jurídica con su nombre de razón social; con cédula u otro documento, como natural.
update public.terceros set tipo_persona = case when tipo_id = '31' then 'juridica' else 'natural' end,
  razon_social = case when tipo_id = '31' then nombre else '' end
where razon_social = '' and primer_nombre = '' and primer_apellido = '';
notify pgrst, 'reload schema';
