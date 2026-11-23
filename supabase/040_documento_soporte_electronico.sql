-- AGAsoft 040: documento soporte electrónico y nota de ajuste al documento soporte (DIAN por Factus).
--  - compras.electronica: el documento soporte (DS) se envía a la DIAN.
--  - compras tipo 'NA': nota de ajuste a un documento soporte electrónico (ref_id = el DS, concepto = código DIAN 1 a 5).
--  - fe_envios.compra_id: los envíos de DS y NA quedan en el mismo historial que las facturas (documento_id queda vacío).
--  - Un DS o NA validado por la DIAN ya no se edita, no se anula y no se elimina: se corrige con una nota de ajuste.
-- Requiere 023_facturacion_electronica.sql y 028_eliminar_documentos.sql. Se puede correr más de una vez.
-- Ejecutar en Supabase: SQL Editor > New query > pegar > Run. Después redesplegar la función fe-factus.

alter table public.compras add column if not exists electronica boolean not null default false;
alter table public.compras add column if not exists ref_id uuid references public.compras(id) on delete restrict;
alter table public.compras add column if not exists concepto text not null default '';
alter table public.compras drop constraint if exists compras_tipo_check;
alter table public.compras add constraint compras_tipo_check check (tipo in ('FC', 'DS', 'CE', 'NA'));

alter table public.fe_envios alter column documento_id drop not null;
alter table public.fe_envios add column if not exists compra_id uuid references public.compras(id) on delete cascade;
alter table public.fe_envios drop constraint if exists fe_envios_origen;
alter table public.fe_envios add constraint fe_envios_origen check (documento_id is not null or compra_id is not null);
create index if not exists fe_envios_compra on public.fe_envios (compra_id);

-- ¿La DIAN ya validó esta compra (DS o NA)?
create or replace function public.compra_validada(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fe_envios e where e.compra_id = cid and e.estado = 'aceptado');
$$;

-- No se edita ni se anula un DS o NA validado por la DIAN.
create or replace function public.compras_antes_de_cambiar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.electronica and public.compra_validada(old.id) then
    raise exception 'La DIAN ya validó este documento: no se puede modificar ni anular. Corrígelo con una nota de ajuste.'; end if;
  if new.tipo = 'NA' then
    if new.ref_id is null or not exists (select 1 from compras d where d.id = new.ref_id and d.empresa_id = new.empresa_id and d.tipo = 'DS' and d.tercero_id = new.tercero_id) then
      raise exception 'La nota de ajuste debe referirse a un documento soporte del mismo proveedor.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists compras_antes_de_cambiar on public.compras;
create trigger compras_antes_de_cambiar before update on public.compras for each row execute function public.compras_antes_de_cambiar();

create or replace function public.compras_antes_de_crear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'NA' and (new.ref_id is null or not exists (select 1 from compras d where d.id = new.ref_id and d.empresa_id = new.empresa_id and d.tipo = 'DS' and d.tercero_id = new.tercero_id)) then
    raise exception 'La nota de ajuste debe referirse a un documento soporte del mismo proveedor.'; end if;
  return new;
end $$;
drop trigger if exists compras_antes_de_crear on public.compras;
create trigger compras_antes_de_crear before insert on public.compras for each row execute function public.compras_antes_de_crear();

-- Borrar: igual que 028 (no con egresos vigentes) y además no si la DIAN lo validó o si tiene notas de ajuste.
create or replace function public.compras_antes_de_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tipo <> 'CE' and exists (select 1 from compras e where e.empresa_id = old.empresa_id and e.tipo = 'CE' and e.estado <> 'anulado'
      and e.aplicaciones @> jsonb_build_array(jsonb_build_object('compra_id', old.id::text))) then
    raise exception 'Este documento tiene pagos. Elimina o anula primero el comprobante de egreso.'; end if;
  if old.electronica and public.compra_validada(old.id) then
    raise exception 'La DIAN ya validó este documento: no se puede eliminar. Corrígelo con una nota de ajuste.'; end if;
  if exists (select 1 from compras n where n.ref_id = old.id) then
    raise exception 'Este documento soporte tiene notas de ajuste. Elimina primero las notas.'; end if;
  return old;
end $$;
drop trigger if exists compras_antes_de_borrar on public.compras;
create trigger compras_antes_de_borrar before delete on public.compras for each row execute function public.compras_antes_de_borrar();

notify pgrst, 'reload schema';
