-- AGAsoft: instalación completa en un proyecto NUEVO de Supabase (solo estructura, sin datos).
-- Generado con: node scripts/armar-instalacion.mjs  (no editar a mano; se arma con schema.sql + 002_departamento.sql … 050_modulos_por_cuenta.sql).
-- Cómo usarlo: Supabase › SQL Editor › New query › pegar todo › Run. Se puede volver a correr sin perder datos.
-- Después: registrarse en la app; el PRIMER usuario que se registra queda como administrador.

/* ======================================================================
   schema.sql
   ====================================================================== */
-- AGAsoft: tablas, permisos y funciones del módulo de ventas.
-- Ejecutar una vez en un proyecto NUEVO de Supabase: SQL Editor > New query > pegar todo > Run.
-- Se puede volver a ejecutar sin perder datos.

/* ============ Usuarios ============ */
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  correo text not null default '',
  es_admin boolean not null default false,
  aprobado boolean not null default false,
  creado_en timestamptz not null default now()
);
alter table public.perfiles enable row level security;

-- El primer usuario que se registra queda como administrador aprobado. Los demás esperan aprobación.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  select not exists (select 1 from public.perfiles) into primero;
  insert into public.perfiles (id, nombre, correo, es_admin, aprobado)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), coalesce(new.email, ''), primero, primero)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists al_registrarse on auth.users;
create trigger al_registrarse after insert on auth.users for each row execute function public.crear_perfil();

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin and aprobado from public.perfiles where id = auth.uid()), false);
$$;
create or replace function public.aprobado() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado from public.perfiles where id = auth.uid()), false);
$$;

drop policy if exists perfiles_ver on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated using (id = auth.uid() or public.es_admin());
drop policy if exists perfiles_admin on public.perfiles;
create policy perfiles_admin on public.perfiles for update to authenticated using (public.es_admin()) with check (public.es_admin());

/* ============ Empresas y acceso ============ */
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  nit text not null check (nit ~ '^[0-9]{5,15}$'),
  dv smallint check (dv between 0 and 9),
  tipo_persona text not null default 'juridica' check (tipo_persona in ('juridica', 'natural')),
  regimen text not null default 'ordinario',
  responsable_iva boolean not null default true,
  responsabilidades text not null default '',
  actividad text not null default '',
  direccion text not null default '',
  ciudad text not null default '',
  telefono text not null default '',
  correo text not null default '',
  pie_factura text not null default '',
  creado_en timestamptz not null default now(),
  unique (owner, nit)
);

-- Personas a las que el dueño da acceso a una empresa (por correo).
create table if not exists public.miembros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  correo text not null check (correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  rol text not null default 'responsable' check (rol in ('responsable', 'consulta')),
  creado_en timestamptz not null default now(),
  unique (empresa_id, correo)
);

create or replace function public.es_dueno(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_admin() or (public.aprobado() and exists (select 1 from public.empresas e where e.id = eid and e.owner = auth.uid()));
$$;
create or replace function public.puede_ver(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_dueno(eid) or (public.aprobado() and exists (
    select 1 from public.miembros m where m.empresa_id = eid and lower(m.correo) = lower(coalesce(auth.jwt()->>'email', ''))));
$$;
create or replace function public.puede_editar(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_dueno(eid) or (public.aprobado() and exists (
    select 1 from public.miembros m where m.empresa_id = eid and m.rol = 'responsable' and lower(m.correo) = lower(coalesce(auth.jwt()->>'email', ''))));
$$;

alter table public.empresas enable row level security;
drop policy if exists empresas_ver on public.empresas;
-- El dueño ve su empresa directo (así puede leer la fila que acaba de crear).
create policy empresas_ver on public.empresas for select to authenticated
  using ((owner = auth.uid() and public.aprobado()) or public.puede_ver(id));
drop policy if exists empresas_crear on public.empresas;
create policy empresas_crear on public.empresas for insert to authenticated with check (public.aprobado() and owner = auth.uid());
drop policy if exists empresas_editar on public.empresas;
create policy empresas_editar on public.empresas for update to authenticated using (public.es_dueno(id)) with check (public.es_dueno(id));
drop policy if exists empresas_borrar on public.empresas;
create policy empresas_borrar on public.empresas for delete to authenticated using (public.es_dueno(id));

alter table public.miembros enable row level security;
drop policy if exists miembros_ver on public.miembros;
create policy miembros_ver on public.miembros for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists miembros_editar on public.miembros;
create policy miembros_editar on public.miembros for all to authenticated using (public.es_dueno(empresa_id)) with check (public.es_dueno(empresa_id));

/* ============ Maestros ============ */
create table if not exists public.terceros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id text not null default '31',
  numero text not null check (numero ~ '^[0-9A-Za-z-]{3,20}$'),
  dv smallint check (dv between 0 and 9),
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text not null default '',
  ciudad text not null default '',
  telefono text not null default '',
  correo text not null default '',
  responsable_iva boolean not null default false,
  retefuente_pct numeric(6,3) not null default 0,
  reteiva_pct numeric(6,3) not null default 0,
  reteica_milaje numeric(7,3) not null default 0,
  plazo_dias integer not null default 0,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo_id, numero)
);
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  unidad text not null default 'UND',
  precio numeric(16,2) not null default 0,
  iva_pct numeric(5,2) not null default 19,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create table if not exists public.numeraciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('FV', 'NC', 'ND', 'RC')),
  prefijo text not null default '' check (prefijo ~ '^[A-Za-z0-9]{0,4}$'),
  resolucion text not null default '',
  fecha_resolucion date,
  desde bigint not null default 1 check (desde > 0),
  hasta bigint not null default 999999999 check (hasta >= desde),
  siguiente bigint not null default 1,
  vigencia_desde date,
  vigencia_hasta date,
  activa boolean not null default true,
  electronica boolean not null default false,
  creado_en timestamptz not null default now(),
  check (siguiente >= desde)
);
-- Solo una numeración activa por tipo de documento.
create unique index if not exists numeraciones_una_activa on public.numeraciones (empresa_id, tipo, electronica) where activa;

do $$ declare t text; begin
  foreach t in array array['terceros', 'productos', 'numeraciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.puede_ver(empresa_id))', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id))', t || '_editar', t);
  end loop;
end $$;

/* ============ Contabilidad: PUC con homologación NIIF ============ */
create table if not exists public.cuentas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text not null check (codigo ~ '^[0-9]{1,12}$'),
  nombre text not null check (length(trim(nombre)) > 0),
  naturaleza text not null default 'D' check (naturaleza in ('D', 'C')),
  niif_rubro text,
  niif_codigo text not null default '',
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, codigo)
);
alter table public.cuentas enable row level security;
drop policy if exists cuentas_ver on public.cuentas;
create policy cuentas_ver on public.cuentas for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists cuentas_editar on public.cuentas;
create policy cuentas_editar on public.cuentas for all to authenticated using (public.es_dueno(empresa_id)) with check (public.es_dueno(empresa_id));
-- Cuentas que usa la contabilización automática (clientes, IVA, ingresos, retenciones, caja, bancos…).
alter table public.empresas add column if not exists contabilidad jsonb not null default '{}'::jsonb;
alter table public.productos add column if not exists cuenta_ingreso text not null default '';
alter table public.productos add column if not exists cuenta_devolucion text not null default '';
alter table public.empresas add column if not exists departamento text not null default '';
alter table public.terceros add column if not exists departamento text not null default '';

/* ============ Documentos de venta ============ */
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('FV', 'NC', 'ND', 'RC')),
  estado text not null default 'borrador' check (estado in ('borrador', 'emitido', 'anulado')),
  electronica boolean not null default false,
  prefijo text not null default '',
  numero bigint,
  numeracion_id uuid references public.numeraciones(id),
  fecha date not null default current_date,
  vence date,
  tercero_id uuid not null references public.terceros(id),
  forma_pago text not null default 'contado',
  medio_pago text not null default 'efectivo',
  ref_id uuid references public.documentos(id),
  concepto text not null default '',
  observaciones text not null default '',
  bruto numeric(16,2) not null default 0,
  descuento numeric(16,2) not null default 0,
  base numeric(16,2) not null default 0,
  iva numeric(16,2) not null default 0,
  retefuente_pct numeric(6,3) not null default 0,
  reteiva_pct numeric(6,3) not null default 0,
  reteica_milaje numeric(7,3) not null default 0,
  retefuente numeric(16,2) not null default 0,
  reteiva numeric(16,2) not null default 0,
  reteica numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  neto numeric(16,2) not null default 0,
  anticipo numeric(16,2) not null default 0,
  emitido_en timestamptz,
  anulado_en timestamptz,
  anulado_motivo text,
  creado_por uuid default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now()
);
create unique index if not exists documentos_consecutivo on public.documentos (empresa_id, tipo, prefijo, numero) where numero is not null;
create index if not exists documentos_empresa on public.documentos (empresa_id, tipo, fecha);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  orden integer not null default 0,
  producto_id uuid references public.productos(id) on delete set null,
  codigo text not null default '',
  descripcion text not null default '',
  unidad text not null default 'UND',
  cantidad numeric(16,4) not null default 1,
  precio numeric(16,2) not null default 0,
  descuento_pct numeric(5,2) not null default 0,
  iva_pct numeric(5,2) not null default 0,
  cuenta text not null default ''
);
alter table public.items add column if not exists cuenta text not null default '';
create index if not exists items_doc on public.items (documento_id);

-- Pagos de un recibo de caja aplicados a facturas.
create table if not exists public.aplicaciones (
  id uuid primary key default gen_random_uuid(),
  recibo_id uuid not null references public.documentos(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  factura_id uuid not null references public.documentos(id),
  valor numeric(16,2) not null check (valor > 0)
);
create index if not exists aplicaciones_recibo on public.aplicaciones (recibo_id);

-- Documentos, líneas y pagos solo se leen directo; se escriben con las funciones de abajo.
do $$ declare t text; begin
  foreach t in array array['documentos', 'items', 'aplicaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.puede_ver(empresa_id))', t || '_ver', t);
  end loop;
end $$;

/* ============ Funciones ============ */
-- Crea o actualiza un borrador con sus líneas y pagos. Devuelve su id.
create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    if d.estado <> 'borrador' then raise exception 'Solo se pueden modificar borradores.'; end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;

create or replace function public.emitir_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos; n numeraciones; f documentos; acred numeric;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'borrador' then raise exception 'El documento ya no es un borrador.'; end if;
  if d.tipo in ('FV', 'NC', 'ND') then
    if not exists (select 1 from items where documento_id = p_id) then raise exception 'Agrega al menos una línea.'; end if;
    if d.total <= 0 then raise exception 'El total debe ser mayor que cero.'; end if;
  end if;
  if d.tipo in ('NC', 'ND') then
    select * into f from documentos where id = d.ref_id;
    if not found or f.tipo <> 'FV' or f.estado <> 'emitido' or f.empresa_id <> d.empresa_id then raise exception 'La nota debe referirse a una factura emitida.'; end if;
    if f.tercero_id <> d.tercero_id then raise exception 'La nota debe ser del mismo cliente de la factura.'; end if;
    update documentos set electronica = f.electronica where id = p_id; d.electronica := f.electronica;
    if d.tipo = 'NC' then
      select coalesce(sum(total), 0) into acred from documentos where tipo = 'NC' and estado = 'emitido' and ref_id = f.id;
      if acred + d.total > f.total then raise exception 'La nota crédito supera el valor pendiente de la factura (% disponible).', f.total - acred; end if;
    end if;
  end if;
  if d.tipo = 'RC' and d.electronica then update documentos set electronica = false where id = p_id; d.electronica := false; end if;
  if d.tipo = 'RC' and d.total <= 0 then raise exception 'El recibo debe tener un valor mayor que cero.'; end if;

  -- La factura usa la numeración de su clase (electrónica o normal). Notas y recibos prefieren la de su clase y si no, la que haya.
  select * into n from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa and (d.tipo <> 'FV' or electronica = d.electronica)
    order by (electronica = d.electronica) desc limit 1 for update;
  if not found then raise exception '%', case when d.tipo = 'FV' and d.electronica then 'No hay una numeración activa de factura electrónica. Créala en Numeraciones con la resolución DIAN.'
    when d.tipo = 'FV' then 'No hay una numeración activa de factura normal (no electrónica). Créala en Numeraciones.'
    else 'No hay una numeración activa para este tipo de documento. Créala en Numeraciones.' end; end if;
  if n.siguiente > n.hasta then raise exception 'Se agotó el rango de numeración % (hasta %).', n.prefijo, n.hasta; end if;
  if n.vigencia_hasta is not null and d.fecha > n.vigencia_hasta then raise exception 'La numeración % venció el %.', n.prefijo, n.vigencia_hasta; end if;
  if n.vigencia_desde is not null and d.fecha < n.vigencia_desde then raise exception 'La numeración % rige desde el %.', n.prefijo, n.vigencia_desde; end if;

  update documentos set estado = 'emitido', prefijo = n.prefijo, numero = n.siguiente, numeracion_id = n.id, emitido_en = now() where id = p_id;
  update numeraciones set siguiente = siguiente + 1 where id = n.id;
end $$;

-- Las facturas y notas emitidas no se anulan (se corrigen con nota crédito). Los recibos de caja sí.
create or replace function public.anular_recibo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.tipo <> 'RC' or d.estado <> 'emitido' then raise exception 'Solo se pueden anular recibos de caja emitidos.'; end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Escribe el motivo de la anulación.'; end if;
  update documentos set estado = 'anulado', anulado_en = now(), anulado_motivo = p_motivo where id = p_id;
end $$;

create or replace function public.borrar_borrador(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'borrador' then raise exception 'Solo se pueden borrar borradores.'; end if;
  delete from documentos where id = p_id;
end $$;

revoke all on function public.guardar_documento(jsonb, jsonb, jsonb), public.emitir_documento(uuid), public.anular_recibo(uuid, text), public.borrar_borrador(uuid) from public, anon;
grant execute on function public.guardar_documento(jsonb, jsonb, jsonb), public.emitir_documento(uuid), public.anular_recibo(uuid, text), public.borrar_borrador(uuid) to authenticated;

-- Elimina una factura, nota crédito o nota débito NO electrónica, aunque esté emitida.
-- Una factura con notas o pagos vigentes no se puede eliminar: primero se eliminan las notas y se anulan los recibos.
-- Si era el último número de su numeración, ese número se vuelve a usar.
create or replace function public.eliminar_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.tipo not in ('FV', 'NC', 'ND') then raise exception 'Los recibos de caja no se eliminan: se anulan.'; end if;
  if d.electronica and d.estado <> 'borrador' then raise exception 'Las facturas y notas electrónicas no se eliminan: se corrigen con una nota.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado <> 'borrador') then
      raise exception 'La factura tiene notas crédito o débito. Elimínalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
    -- Borradores de notas y pagos de recibos anulados o en borrador que apuntan a la factura.
    delete from documentos where ref_id = p_id and estado = 'borrador';
    delete from aplicaciones where factura_id = p_id;
  end if;
  delete from documentos where id = p_id;
  if d.numeracion_id is not null then
    update numeraciones set siguiente = d.numero where id = d.numeracion_id and siguiente = d.numero + 1 and d.numero >= desde;
  end if;
end $$;

revoke all on function public.eliminar_documento(uuid) from public, anon;
grant execute on function public.eliminar_documento(uuid) to authenticated;

-- Importa una factura de venta ya emitida (plantillas con datos de la DIAN). También en 008_importar.sql.
create or replace function public.importar_documento(p_doc jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  d documentos; did uuid;
begin
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  p_doc := p_doc - array['vence', 'id', 'ref_id']::text[] || jsonb_strip_nulls(jsonb_build_object('vence', nullif(p_doc->>'vence', '')));
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if d.tipo <> 'FV' then raise exception 'Por ahora solo se importan facturas de venta.'; end if;
  if d.numero is null or d.numero <= 0 then raise exception 'La factura necesita número.'; end if;
  if not exists (select 1 from terceros where id = d.tercero_id and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if exists (select 1 from documentos where empresa_id = eid and tipo = 'FV' and prefijo = coalesce(d.prefijo, '') and numero = d.numero) then
    raise exception 'La factura % % ya existe.', coalesce(d.prefijo, ''), d.numero; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'La factura necesita al menos una línea.'; end if;
  insert into documentos (empresa_id, tipo, estado, electronica, prefijo, numero, fecha, vence, tercero_id, forma_pago, medio_pago, observaciones,
    bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, emitido_en)
  values (eid, 'FV', 'emitido', coalesce(d.electronica, true), coalesce(d.prefijo, ''), d.numero, coalesce(d.fecha, current_date), d.vence, d.tercero_id,
    coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'transferencia'), coalesce(d.observaciones, ''),
    coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0), coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0),
    coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0), coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), now())
  returning id into did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 1), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(p_items) with ordinality as a(x, o);
  return did;
end $$;

revoke all on function public.importar_documento(jsonb, jsonb) from public, anon;
grant execute on function public.importar_documento(jsonb, jsonb) to authenticated;

/* ============ Comprobantes contables (también en 004_comprobantes.sql) ============ */
create table if not exists public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null default 'CC' check (tipo in ('CC', 'SI')),
  numero bigint not null,
  fecha date not null default current_date,
  descripcion text not null default '',
  -- Cada línea: {cuenta, tercero_id, detalle, debito, credito}
  lineas jsonb not null default '[]'::jsonb,
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists comprobantes_empresa on public.comprobantes (empresa_id);

-- El comprobante debe cuadrar (sumas iguales) y cada línea llevar débito o crédito, no los dos.
create or replace function public.validar_comprobante() returns trigger
language plpgsql set search_path = public as $$
declare d numeric := 0; c numeric := 0; l jsonb;
begin
  if jsonb_typeof(new.lineas) <> 'array' or jsonb_array_length(new.lineas) < 2 then raise exception 'El comprobante necesita al menos dos líneas.'; end if;
  for l in select * from jsonb_array_elements(new.lineas) loop
    if coalesce(l->>'cuenta', '') = '' then raise exception 'Hay una línea sin cuenta.'; end if;
    if coalesce((l->>'debito')::numeric, 0) < 0 or coalesce((l->>'credito')::numeric, 0) < 0 then raise exception 'Los valores no pueden ser negativos.'; end if;
    if coalesce((l->>'debito')::numeric, 0) > 0 and coalesce((l->>'credito')::numeric, 0) > 0 then raise exception 'Cada línea lleva débito o crédito, no los dos.'; end if;
    d := d + coalesce((l->>'debito')::numeric, 0); c := c + coalesce((l->>'credito')::numeric, 0);
  end loop;
  if round(d, 2) <> round(c, 2) then raise exception 'El comprobante no cuadra: débitos % y créditos %.', d, c; end if;
  if d = 0 then raise exception 'El comprobante no tiene valores.'; end if;
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Un comprobante anulado no se puede modificar.'; end if;
  return new;
end $$;
drop trigger if exists comprobantes_validar on public.comprobantes;
create trigger comprobantes_validar before insert or update on public.comprobantes for each row execute function public.validar_comprobante();

-- Se ven y se editan como los documentos; no se borran (se anulan).
alter table public.comprobantes enable row level security;
drop policy if exists comprobantes_ver on public.comprobantes;
create policy comprobantes_ver on public.comprobantes for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists comprobantes_crear on public.comprobantes;
create policy comprobantes_crear on public.comprobantes for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists comprobantes_editar on public.comprobantes;
create policy comprobantes_editar on public.comprobantes for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

/* ============ Compras y gastos (también en 006_compras.sql) ============ */

-- Un tercero puede ser cliente, proveedor o ambos. Retenciones que la empresa le practica al proveedor.
alter table public.terceros add column if not exists es_cliente boolean not null default true;
alter table public.terceros add column if not exists es_proveedor boolean not null default false;
alter table public.terceros add column if not exists ret_compra_fuente_pct numeric(6,3) not null default 0;
alter table public.terceros add column if not exists ret_compra_iva_pct numeric(6,3) not null default 0;
alter table public.terceros add column if not exists ret_compra_ica_milaje numeric(7,3) not null default 0;

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('FC', 'DS', 'CE')),
  numero bigint not null,
  num_proveedor text not null default '',
  fecha date not null default current_date,
  vence date,
  tercero_id uuid not null references public.terceros(id),
  -- FC y DS: cada línea {cuenta, descripcion, base, iva_pct}
  lineas jsonb not null default '[]'::jsonb,
  retefuente_pct numeric(6,3) not null default 0,
  reteiva_pct numeric(6,3) not null default 0,
  reteica_milaje numeric(7,3) not null default 0,
  cuenta_retefuente text not null default '',
  base numeric(18,2) not null default 0,
  iva numeric(18,2) not null default 0,
  retefuente numeric(18,2) not null default 0,
  reteiva numeric(18,2) not null default 0,
  reteica numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  neto numeric(18,2) not null default 0,
  -- CE: cuenta de caja o bancos y facturas que paga [{compra_id, valor, ref}]
  cuenta_pago text not null default '',
  aplicaciones jsonb not null default '[]'::jsonb,
  anticipo numeric(18,2) not null default 0,
  observaciones text not null default '',
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists compras_empresa on public.compras (empresa_id);

create or replace function public.validar_compra() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Un documento anulado no se puede modificar.'; end if;
  if new.tipo in ('FC', 'DS') and jsonb_array_length(new.lineas) = 0 then raise exception 'El documento necesita al menos una línea.'; end if;
  if new.neto < 0 or new.anticipo < 0 then raise exception 'Los valores no pueden ser negativos.'; end if;
  return new;
end $$;
drop trigger if exists compras_validar on public.compras;
create trigger compras_validar before insert or update on public.compras for each row execute function public.validar_compra();

-- Se ven y se editan como los demás documentos; no se borran (se anulan).
alter table public.compras enable row level security;
drop policy if exists compras_ver on public.compras;
create policy compras_ver on public.compras for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists compras_crear on public.compras;
create policy compras_crear on public.compras for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists compras_editar on public.compras;
create policy compras_editar on public.compras for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

/* ============ Planes y uso (también en 009_planes.sql) ============ */

/* ============ Planes ============ */
create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  precio_mensual numeric(14,2) not null default 0 check (precio_mensual >= 0),
  -- Límites. Vacío (null) = sin límite.
  max_empresas integer check (max_empresas >= 0),
  max_documentos_mes integer check (max_documentos_mes >= 0),
  max_usuarios integer check (max_usuarios >= 0),
  descripcion text not null default '',
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
alter table public.planes enable row level security;
drop policy if exists planes_ver on public.planes;
create policy planes_ver on public.planes for select to authenticated using (true);
drop policy if exists planes_admin on public.planes;
create policy planes_admin on public.planes for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Planes de ejemplo (el administrador los cambia en /admin). Solo se crean si no hay ninguno.
insert into public.planes (nombre, precio_mensual, max_empresas, max_documentos_mes, max_usuarios, descripcion, orden)
select * from (values
  ('Básico', 49900::numeric, 1, 100, 1, 'Una contabilidad, hasta 100 documentos al mes.', 1),
  ('Profesional', 119900::numeric, 5, 1000, 3, 'Hasta 5 contabilidades y 3 personas con acceso.', 2),
  ('Contador', 249900::numeric, 30, 5000, 10, 'Para contadores con varias empresas cliente.', 3)
) as v(nombre, precio_mensual, max_empresas, max_documentos_mes, max_usuarios, descripcion, orden)
where not exists (select 1 from public.planes);

/* ============ Plan de cada cuenta ============ */
alter table public.perfiles add column if not exists plan_id uuid references public.planes(id) on delete set null;
alter table public.perfiles add column if not exists plan_vence date;
alter table public.perfiles add column if not exists suspendido boolean not null default false;
alter table public.perfiles add column if not exists notas text not null default '';

-- Una cuenta suspendida no entra a sus datos (ni a los que le compartieron).
create or replace function public.aprobado() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado and not suspendido from public.perfiles where id = auth.uid()), false);
$$;
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin and aprobado and not suspendido from public.perfiles where id = auth.uid()), false);
$$;

-- La cuenta solo puede cambiar su nombre; el plan, la aprobación y la suspensión los cambia el administrador.
drop policy if exists perfiles_admin on public.perfiles;
create policy perfiles_admin on public.perfiles for update to authenticated using (public.es_admin()) with check (public.es_admin());

/* ============ Uso ============ */
-- Documentos que cuenta el plan en un mes: facturas, notas y recibos emitidos, compras y comprobantes.
create or replace function public.documentos_mes(p_owner uuid, p_mes date default current_date) returns integer
language sql stable security definer set search_path = public as $$
  select (
    (select count(*) from documentos d join empresas e on e.id = d.empresa_id
      where e.owner = p_owner and d.estado <> 'borrador' and date_trunc('month', d.fecha) = date_trunc('month', p_mes))
  + (select count(*) from compras c join empresas e on e.id = c.empresa_id
      where e.owner = p_owner and date_trunc('month', c.fecha) = date_trunc('month', p_mes))
  + (select count(*) from comprobantes c join empresas e on e.id = c.empresa_id
      where e.owner = p_owner and date_trunc('month', c.fecha) = date_trunc('month', p_mes))
  )::integer;
$$;
-- Personas distintas con acceso a las contabilidades de una cuenta (sin contar al dueño).
create or replace function public.usuarios_de(p_owner uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(distinct lower(m.correo))::integer from miembros m join empresas e on e.id = m.empresa_id where e.owner = p_owner;
$$;

-- Uso y plan de la cuenta que está entrando (para mostrarlo en Configuración).
create or replace function public.mi_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', (select to_jsonb(pl) from planes pl where pl.id = p.plan_id),
    'plan_vence', p.plan_vence,
    'empresas', (select count(*) from empresas e where e.owner = p.id),
    'documentos_mes', public.documentos_mes(p.id),
    'usuarios', public.usuarios_de(p.id))
  from perfiles p where p.id = auth.uid();
$$;

-- Panel del administrador: todas las cuentas con su plan y su uso.
drop function if exists public.admin_cuentas();
create function public.admin_cuentas() returns table (
  id uuid, nombre text, correo text, es_admin boolean, aprobado boolean, suspendido boolean, plan_id uuid, plan_vence date, notas text,
  creado_en timestamptz, empresas integer, documentos_mes integer, usuarios integer, ultimo_documento date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  return query
  select p.id, p.nombre, p.correo, p.es_admin, p.aprobado, p.suspendido, p.plan_id, p.plan_vence, p.notas, p.creado_en,
    (select count(*) from empresas e where e.owner = p.id)::integer,
    public.documentos_mes(p.id), public.usuarios_de(p.id),
    (select max(d.fecha) from documentos d join empresas e on e.id = d.empresa_id where e.owner = p.id and d.estado <> 'borrador')
  from perfiles p order by p.creado_en desc;
end $$;

/* ============ Límites del plan ============ */
-- Plan vigente del dueño de una empresa. El administrador no tiene límites; una cuenta sin plan tampoco (cuentas antiguas).
create or replace function public.revisar_plan(p_owner uuid, p_que text) returns void
language plpgsql stable security definer set search_path = public as $$
declare p perfiles; pl planes; n integer;
begin
  select * into p from perfiles where id = p_owner;
  if not found or p.es_admin or p.plan_id is null then return; end if;
  select * into pl from planes where id = p.plan_id;
  if p.plan_vence is not null and p.plan_vence < current_date then
    raise exception 'El plan % venció el %. Comunícate con AGAsoft para renovarlo.', pl.nombre, to_char(p.plan_vence, 'DD/MM/YYYY'); end if;
  if p_que = 'empresa' and pl.max_empresas is not null then
    select count(*) into n from empresas where owner = p_owner;
    if n >= pl.max_empresas then raise exception 'Tu plan % permite % contabilidad(es). Comunícate con AGAsoft para ampliarlo.', pl.nombre, pl.max_empresas; end if;
  elsif p_que = 'documento' and pl.max_documentos_mes is not null then
    if public.documentos_mes(p_owner) >= pl.max_documentos_mes then
      raise exception 'Llegaste al límite de % documentos de este mes del plan %. Comunícate con AGAsoft para ampliarlo.', pl.max_documentos_mes, pl.nombre; end if;
  elsif p_que = 'usuario' and pl.max_usuarios is not null then
    if public.usuarios_de(p_owner) >= pl.max_usuarios then
      raise exception 'Tu plan % permite dar acceso a % persona(s). Comunícate con AGAsoft para ampliarlo.', pl.nombre, pl.max_usuarios; end if;
  end if;
end $$;
revoke all on function public.revisar_plan(uuid, text) from public, anon, authenticated;

create or replace function public.limite_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.revisar_plan(new.owner, 'empresa'); return new; end $$;
drop trigger if exists empresas_limite on public.empresas;
create trigger empresas_limite before insert on public.empresas for each row execute function public.limite_empresa();

create or replace function public.limite_documento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Facturas, notas y recibos cuentan al emitirse; compras y comprobantes al crearse.
  if tg_table_name = 'documentos' and not (new.estado = 'emitido' and (tg_op = 'INSERT' or old.estado = 'borrador')) then return new; end if;
  perform public.revisar_plan((select owner from empresas where id = new.empresa_id), 'documento');
  return new;
end $$;
drop trigger if exists documentos_limite on public.documentos;
create trigger documentos_limite before insert or update of estado on public.documentos for each row execute function public.limite_documento();
drop trigger if exists compras_limite on public.compras;
create trigger compras_limite before insert on public.compras for each row execute function public.limite_documento();
drop trigger if exists comprobantes_limite on public.comprobantes;
create trigger comprobantes_limite before insert on public.comprobantes for each row execute function public.limite_documento();

create or replace function public.limite_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid := (select owner from empresas where id = new.empresa_id);
begin
  -- Dar acceso a alguien que ya tiene acceso a otra contabilidad de la misma cuenta no suma.
  if exists (select 1 from miembros m join empresas e on e.id = m.empresa_id where e.owner = o and lower(m.correo) = lower(new.correo)) then return new; end if;
  perform public.revisar_plan(o, 'usuario');
  return new;
end $$;
drop trigger if exists miembros_limite on public.miembros;
create trigger miembros_limite before insert on public.miembros for each row execute function public.limite_usuario();

revoke all on function public.documentos_mes(uuid, date), public.usuarios_de(uuid) from public, anon, authenticated;
revoke all on function public.mi_plan(), public.admin_cuentas() from public, anon;
grant execute on function public.mi_plan(), public.admin_cuentas() to authenticated;
notify pgrst, 'reload schema';


-- AGAsoft: prueba gratis de 15 días.
-- Quien se registra por primera vez entra de una vez y usa AGAsoft gratis 15 días.
-- Al terminar la prueba la cuenta no puede entrar a sus datos: escoge un plan y el administrador lo aprueba en /admin.
-- Las cuentas que ya existían no cambian. Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

alter table public.perfiles add column if not exists prueba_hasta date;
alter table public.perfiles add column if not exists plan_solicitado uuid references public.planes(id) on delete set null;
alter table public.perfiles add column if not exists solicitado_en timestamptz;

-- Fecha de hoy en Colombia.
create or replace function public.hoy_co() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date; $$;

-- El primer usuario queda como administrador. Los demás entran con 15 días de prueba gratis.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  select not exists (select 1 from public.perfiles) into primero;
  insert into public.perfiles (id, nombre, correo, es_admin, aprobado, prueba_hasta)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), coalesce(new.email, ''), primero, true,
    case when primero then null else public.hoy_co() + 15 end)
  on conflict (id) do nothing;
  return new;
end $$;

-- Con la prueba vencida y sin plan aprobado, la cuenta no entra a sus datos (ni a los que le compartieron).
create or replace function public.aprobado() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado and not suspendido and (prueba_hasta is null or prueba_hasta >= public.hoy_co())
    from public.perfiles where id = auth.uid()), false);
$$;

-- La cuenta escoge el plan que quiere; el administrador lo aprueba en /admin.
create or replace function public.solicitar_plan(p_plan uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta.'; end if;
  if not exists (select 1 from planes where id = p_plan and activo) then raise exception 'Ese plan no está disponible.'; end if;
  update perfiles set plan_solicitado = p_plan, solicitado_en = now() where id = auth.uid() and not suspendido;
end $$;
revoke all on function public.solicitar_plan(uuid) from public, anon;
grant execute on function public.solicitar_plan(uuid) to authenticated;

-- Plan, prueba y uso de la cuenta que está entrando.
create or replace function public.mi_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', (select to_jsonb(pl) from planes pl where pl.id = p.plan_id),
    'plan_vence', p.plan_vence,
    'prueba_hasta', p.prueba_hasta,
    'plan_solicitado', (select to_jsonb(pl) from planes pl where pl.id = p.plan_solicitado),
    'solicitado_en', p.solicitado_en,
    'empresas', (select count(*) from empresas e where e.owner = p.id),
    'documentos_mes', public.documentos_mes(p.id),
    'usuarios', public.usuarios_de(p.id))
  from perfiles p where p.id = auth.uid();
$$;

-- Panel del administrador: ahora con la prueba y el plan pedido.
drop function if exists public.admin_cuentas();
create function public.admin_cuentas() returns table (
  id uuid, nombre text, correo text, es_admin boolean, aprobado boolean, suspendido boolean, plan_id uuid, plan_vence date, notas text,
  creado_en timestamptz, empresas integer, documentos_mes integer, usuarios integer, ultimo_documento date,
  prueba_hasta date, plan_solicitado uuid, solicitado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  return query
  select p.id, p.nombre, p.correo, p.es_admin, p.aprobado, p.suspendido, p.plan_id, p.plan_vence, p.notas, p.creado_en,
    (select count(*) from empresas e where e.owner = p.id)::integer,
    public.documentos_mes(p.id), public.usuarios_de(p.id),
    (select max(d.fecha) from documentos d join empresas e on e.id = d.empresa_id where e.owner = p.id and d.estado <> 'borrador'),
    p.prueba_hasta, p.plan_solicitado, p.solicitado_en
  from perfiles p order by p.creado_en desc;
end $$;

revoke all on function public.mi_plan(), public.admin_cuentas() from public, anon;
grant execute on function public.mi_plan(), public.admin_cuentas() to authenticated;
notify pgrst, 'reload schema';


-- AGAsoft: el administrador puede eliminar una cuenta desde /admin.
-- Se borra el usuario con todas sus contabilidades (empresas) y sus datos. No se puede deshacer.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.admin_eliminar_cuenta(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  if p_id = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta.'; end if;
  if exists (select 1 from public.perfiles where id = p_id and es_admin) then raise exception 'No se puede eliminar una cuenta administradora.'; end if;
  -- Documentos que la cuenta creó en contabilidades de otros quedan sin autor (no se borran).
  update public.documentos set creado_por = null where creado_por = p_id;
  -- Accesos que le dieron en contabilidades de otros.
  delete from public.miembros where lower(correo) = lower((select correo from public.perfiles where id = p_id));
  -- Sus contabilidades y todo lo que cuelga de ellas se borran en cascada con el usuario.
  delete from public.empresas where owner = p_id;
  delete from auth.users where id = p_id;
  delete from public.perfiles where id = p_id;
end $$;
revoke all on function public.admin_eliminar_cuenta(uuid) from public, anon;
grant execute on function public.admin_eliminar_cuenta(uuid) to authenticated;
notify pgrst, 'reload schema';


-- AGAsoft: cada usuario escoge el color y el modo (claro/oscuro) de su AGAsoft.
-- Se guarda en su perfil para verlo igual en cualquier equipo.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

alter table public.perfiles add column if not exists tema jsonb not null default '{}'::jsonb;

-- El usuario solo puede cambiar su propio tema (el resto del perfil lo cambia el administrador).
create or replace function public.guardar_tema(p_tema jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta.'; end if;
  update perfiles set tema = jsonb_build_object('color', left(coalesce(p_tema->>'color', 'aga'), 20), 'modo', left(coalesce(p_tema->>'modo', 'auto'), 10))
  where id = auth.uid();
end $$;
revoke all on function public.guardar_tema(jsonb) from public, anon;
grant execute on function public.guardar_tema(jsonb) to authenticated;
notify pgrst, 'reload schema';


-- AGAsoft 014: formas de pago configurables.
-- Cada factura de venta guarda la cuenta de su forma de pago (caja, bancos, cartera u otra). Vacío = clientes (cartera).
-- Las compras ya tenían la columna cuenta_pago. Se puede correr más de una vez.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

alter table public.documentos add column if not exists cuenta_pago text not null default '';

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    if d.estado <> 'borrador' then raise exception 'Solo se pueden modificar borradores.'; end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;
notify pgrst, 'reload schema';

-- AGAsoft 015: solo los documentos electrónicos tienen borrador. Los demás contabilizan al guardar
-- y se pueden imprimir, editar y anular.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    if d.estado = 'emitido' and d.electronica then raise exception 'Los documentos electrónicos no se modifican: se corrigen con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', false, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;

-- Anula recibos y facturas o notas que no son electrónicas. Las electrónicas se corrigen con una nota.
create or replace function public.anular_recibo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'emitido' then raise exception 'Solo se anulan documentos guardados.'; end if;
  if d.electronica and d.tipo <> 'RC' then raise exception 'Los documentos electrónicos no se anulan: se corrigen con una nota.'; end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Escribe el motivo de la anulación.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado = 'emitido') then
      raise exception 'La factura tiene notas crédito o débito. Anúlalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
  end if;
  update documentos set estado = 'anulado', anulado_en = now(), anulado_motivo = p_motivo where id = p_id;
end $$;

-- Compras, egresos y comprobantes: lo anulado ya no se edita.
create or replace function public.editar_guardado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
  return new;
end $$;
drop trigger if exists compras_editar on public.compras;
create trigger compras_editar before update on public.compras for each row execute function public.editar_guardado();
drop trigger if exists comprobantes_editar on public.comprobantes;
create trigger comprobantes_editar before update on public.comprobantes for each row execute function public.editar_guardado();

revoke all on function public.anular_recibo(uuid, text) from public, anon;
grant execute on function public.anular_recibo(uuid, text) to authenticated;
notify pgrst, 'reload schema';


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

-- AGAsoft 017: los documentos que no son electrónicos toman su consecutivo al guardar aunque no se haya creado la numeración.
-- Si falta, se crea sola: FN para facturas normales, RC para recibos, NC y ND para notas, desde el 1.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.emitir_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos; n numeraciones; f documentos; acred numeric;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'borrador' then raise exception 'El documento ya no es un borrador.'; end if;
  if d.tipo in ('FV', 'NC', 'ND') then
    if not exists (select 1 from items where documento_id = p_id) then raise exception 'Agrega al menos una línea.'; end if;
    if d.total <= 0 then raise exception 'El total debe ser mayor que cero.'; end if;
  end if;
  if d.tipo in ('NC', 'ND') then
    select * into f from documentos where id = d.ref_id;
    if not found or f.tipo <> 'FV' or f.estado <> 'emitido' or f.empresa_id <> d.empresa_id then raise exception 'La nota debe referirse a una factura emitida.'; end if;
    if f.tercero_id <> d.tercero_id then raise exception 'La nota debe ser del mismo cliente de la factura.'; end if;
    update documentos set electronica = f.electronica where id = p_id; d.electronica := f.electronica;
    if d.tipo = 'NC' then
      select coalesce(sum(total), 0) into acred from documentos where tipo = 'NC' and estado = 'emitido' and ref_id = f.id;
      if acred + d.total > f.total then raise exception 'La nota crédito supera el valor pendiente de la factura (% disponible).', f.total - acred; end if;
    end if;
  end if;
  if d.tipo = 'RC' and d.electronica then update documentos set electronica = false where id = p_id; d.electronica := false; end if;
  if d.tipo = 'RC' and d.total <= 0 then raise exception 'El recibo debe tener un valor mayor que cero.'; end if;

  -- Documentos que no son electrónicos: si no hay numeración, se crea una sola (FN, RC, NC o ND desde el 1).
  if not d.electronica and not exists (select 1 from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa and (d.tipo <> 'FV' or not electronica)) then
    insert into numeraciones (empresa_id, tipo, prefijo, electronica) values (d.empresa_id, d.tipo, case d.tipo when 'FV' then 'FN' else d.tipo end, false);
  end if;
  -- La factura usa la numeración de su clase (electrónica o normal). Notas y recibos prefieren la de su clase y si no, la que haya.
  select * into n from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa and (d.tipo <> 'FV' or electronica = d.electronica)
    order by (electronica = d.electronica) desc limit 1 for update;
  if not found then raise exception '%', case when d.tipo = 'FV' and d.electronica then 'No hay una numeración activa de factura electrónica. Créala en Numeraciones con la resolución DIAN.'
    when d.tipo = 'FV' then 'No hay una numeración activa de factura normal (no electrónica). Créala en Numeraciones.'
    else 'No hay una numeración activa para este tipo de documento. Créala en Numeraciones.' end; end if;
  if n.siguiente > n.hasta then raise exception 'Se agotó el rango de numeración % (hasta %).', n.prefijo, n.hasta; end if;
  if n.vigencia_hasta is not null and d.fecha > n.vigencia_hasta then raise exception 'La numeración % venció el %.', n.prefijo, n.vigencia_hasta; end if;
  if n.vigencia_desde is not null and d.fecha < n.vigencia_desde then raise exception 'La numeración % rige desde el %.', n.prefijo, n.vigencia_desde; end if;

  update documentos set estado = 'emitido', prefijo = n.prefijo, numero = n.siguiente, numeracion_id = n.id, emitido_en = now() where id = p_id;
  update numeraciones set siguiente = siguiente + 1 where id = n.id;
end $$;
notify pgrst, 'reload schema';

-- AGAsoft 018: módulo de impuestos y cierre contable.
-- Cada factura, nota y compra guarda el concepto y la cuenta de sus retenciones (Impuestos › Conceptos de retención),
-- y los comprobantes admiten el tipo CI (cierre contable del año).
-- Los conceptos de retención y las tarifas de IVA se guardan en la configuración contable de la empresa (no necesitan tabla).
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.documentos add column if not exists retenciones jsonb not null default '{}'::jsonb;
alter table public.compras add column if not exists retenciones jsonb not null default '{}'::jsonb;
alter table public.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table public.comprobantes add constraint comprobantes_tipo_check check (tipo in ('CC', 'SI', 'CI'));

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    if d.estado = 'emitido' and d.electronica then raise exception 'Los documentos electrónicos no se modifican: se corrigen con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', false, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, retenciones, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), coalesce(d.retenciones, '{}'::jsonb), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), retenciones = coalesce(d.retenciones, '{}'::jsonb), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;
notify pgrst, 'reload schema';

/* ============ Nómina (también en 019_nomina.sql) ============ */
create table if not exists public.empleados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tercero_id uuid not null references public.terceros(id),
  cargo text not null default '',
  contrato text not null default 'indefinido' check (contrato in ('indefinido', 'fijo', 'obra')),
  fecha_ingreso date,
  fecha_retiro date,
  salario numeric(16,2) not null default 0 check (salario >= 0),
  area text not null default 'admin' check (area in ('admin', 'ventas', 'produccion')),
  riesgo text not null default '1' check (riesgo in ('1', '2', '3', '4', '5')),
  auxilio boolean not null default true,
  eps_id uuid references public.terceros(id) on delete set null,
  pension_id uuid references public.terceros(id) on delete set null,
  cesantias_id uuid references public.terceros(id) on delete set null,
  caja_id uuid references public.terceros(id) on delete set null,
  banco text not null default '',
  cuenta_bancaria text not null default '',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tercero_id)
);
create index if not exists empleados_empresa on public.empleados (empresa_id);

create table if not exists public.nominas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero bigint not null,
  periodo text not null default 'mensual' check (periodo in ('mensual', 'quincenal')),
  desde date not null,
  hasta date not null,
  fecha date not null,
  -- Una línea por empleado: {empleado_id, tercero_id, area, dias, ibc, items:[{k, nombre, tipo, valor, cuenta, contra, tercero_id}], devengado, deducciones, neto, aportes, provisiones}
  lineas jsonb not null default '[]'::jsonb,
  novedades jsonb not null default '{}'::jsonb,
  cuenta_neto text not null default '25050501',
  devengado numeric(18,2) not null default 0,
  deducciones numeric(18,2) not null default 0,
  neto numeric(18,2) not null default 0,
  aportes numeric(18,2) not null default 0,
  provisiones numeric(18,2) not null default 0,
  observaciones text not null default '',
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, numero),
  check (hasta >= desde)
);
create index if not exists nominas_empresa on public.nominas (empresa_id);

create or replace function public.validar_nomina() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Una nómina anulada no se puede modificar.'; end if;
  if jsonb_array_length(new.lineas) = 0 then raise exception 'La nómina necesita al menos un empleado.'; end if;
  if new.neto < 0 then raise exception 'El neto de la nómina no puede ser negativo.'; end if;
  return new;
end $$;
drop trigger if exists nominas_validar on public.nominas;
create trigger nominas_validar before insert or update on public.nominas for each row execute function public.validar_nomina();

-- Se ven y se editan como los demás documentos; las nóminas no se borran (se anulan).
alter table public.empleados enable row level security;
drop policy if exists empleados_ver on public.empleados;
create policy empleados_ver on public.empleados for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists empleados_crear on public.empleados;
create policy empleados_crear on public.empleados for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists empleados_editar on public.empleados;
create policy empleados_editar on public.empleados for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

alter table public.nominas enable row level security;
drop policy if exists nominas_ver on public.nominas;
create policy nominas_ver on public.nominas for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists nominas_crear on public.nominas;
create policy nominas_crear on public.nominas for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists nominas_editar on public.nominas;
create policy nominas_editar on public.nominas for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

-- 020: empleado pensionado (no cotiza pensión ni fondo de solidaridad; salud completa).
alter table public.empleados add column if not exists pensionado boolean not null default false;

-- 021: nómina en borrador (se guarda sin contabilizar; se puede editar o eliminar hasta contabilizarla).
alter table public.nominas drop constraint if exists nominas_estado_check;
alter table public.nominas add constraint nominas_estado_check check (estado in ('borrador', 'contabilizado', 'anulado'));

create or replace function public.validar_nomina() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Una nómina anulada no se puede modificar.'; end if;
  if tg_op = 'UPDATE' and old.estado = 'contabilizado' and new.estado = 'borrador' then raise exception 'Una nómina contabilizada no puede volver a borrador: anúlala.'; end if;
  if jsonb_array_length(new.lineas) = 0 then raise exception 'La nómina necesita al menos un empleado.'; end if;
  if new.neto < 0 then raise exception 'El neto de la nómina no puede ser negativo.'; end if;
  return new;
end $$;

-- Solo los borradores se pueden eliminar.
drop policy if exists nominas_borrar on public.nominas;
create policy nominas_borrar on public.nominas for delete to authenticated using (public.puede_editar(empresa_id) and estado = 'borrador');

-- 022: los planes activos se ven sin iniciar sesión (para mostrarlos en la página de entrada).
drop policy if exists planes_publicos on public.planes;
create policy planes_publicos on public.planes for select to anon using (activo);

-- 023: envíos de documentos electrónicos a la DIAN (por MATIAS API).
-- Cada intento queda registrado; el documento se toma como aceptado cuando tiene un envío con estado 'aceptado'.
create table if not exists public.fe_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  documento_id uuid not null references public.documentos(id) on delete cascade,
  ambiente text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
  estado text not null check (estado in ('aceptado', 'rechazado', 'error')),
  cufe text not null default '',
  mensaje text not null default '',
  errores jsonb not null default '[]'::jsonb,
  pdf text not null default '',
  respuesta jsonb,
  enviado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists fe_envios_doc on public.fe_envios (documento_id);
alter table public.fe_envios enable row level security;
drop policy if exists fe_envios_ver on public.fe_envios;
create policy fe_envios_ver on public.fe_envios for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists fe_envios_crear on public.fe_envios;
create policy fe_envios_crear on public.fe_envios for insert to authenticated with check (public.puede_editar(empresa_id));
-- Sin update ni delete: el historial de envíos no se modifica.


-- 024: cuenta de Factus de cada empresa (proveedor tecnológico de facturación electrónica).
-- Requiere 023_facturacion_electronica.sql (tabla fe_envios).
-- Solo la lee y escribe la función fe-factus con la llave de servicio: ningún usuario puede leer la contraseña.
create table if not exists public.fe_cuentas (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  proveedor text not null default 'factus',
  ambiente text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
  usuario text not null default '',
  clave text not null default '',
  client_id text not null default '',
  client_secret text not null default '',
  actualizado timestamptz not null default now()
);
alter table public.fe_cuentas enable row level security;
-- Sin políticas a propósito: desde el navegador no se puede leer ni escribir.
revoke all on public.fe_cuentas from anon, authenticated;

/* ============ Pago de nómina (también en 025_pago_nomina.sql) ============ */

alter table public.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table public.comprobantes add constraint comprobantes_tipo_check check (tipo in ('CC', 'SI', 'CI', 'PN'));

notify pgrst, 'reload schema';

/* ============ Entidades de seguridad social (también en 026_entidades_ss.sql) ============ */

alter table public.terceros add column if not exists entidad_ss text[] not null default '{}';
alter table public.terceros drop constraint if exists terceros_entidad_ss_check;
alter table public.terceros add constraint terceros_entidad_ss_check check (entidad_ss <@ array['eps', 'pension', 'cesantias', 'caja', 'arl', 'parafiscales']::text[]);

notify pgrst, 'reload schema';

-- AGAsoft 027: las facturas y notas electrónicas guardadas (con número) se pueden modificar
-- hasta que la DIAN las acepte. Se bloquean al quedar aceptadas en "Enviar a la DIAN".
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    -- Los electrónicos se pueden modificar mientras no los haya aceptado la DIAN; aceptados se corrigen con una nota.
    if d.estado = 'emitido' and d.electronica and exists (select 1 from fe_envios e where e.documento_id = did and e.estado = 'aceptado') then
      raise exception 'Este documento ya fue aceptado por la DIAN: no se modifica, se corrige con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', d.electronica, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, retenciones, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), coalesce(d.retenciones, '{}'::jsonb), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), retenciones = coalesce(d.retenciones, '{}'::jsonb), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;
notify pgrst, 'reload schema';

-- 028: se pueden eliminar facturas y notas electrónicas que la DIAN no ha validado, recibos de caja,
-- comprobantes contables y documentos de compra (FC, DS, CE).
-- Corre este archivo en Supabase › SQL Editor. Se puede correr más de una vez.

create or replace function public.eliminar_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.tipo not in ('FV', 'NC', 'ND', 'RC') then raise exception 'Este documento no se puede eliminar.'; end if;
  -- Electrónicas: solo se eliminan si la DIAN no las ha validado (ningún envío aceptado ni con CUFE).
  if d.electronica and d.estado <> 'borrador' and exists (select 1 from fe_envios e where e.documento_id = p_id and (e.estado = 'aceptado' or e.cufe <> ''
      or 'true' in (e.respuesta->'data'->>'is_validated', e.respuesta->'data'->'credit_note'->>'is_validated', e.respuesta->'data'->'debit_note'->>'is_validated', e.respuesta->'data'->'bill'->>'is_validated'))) then
    raise exception 'Este documento ya fue validado por la DIAN: no se elimina, se corrige con una nota.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado <> 'borrador') then
      raise exception 'La factura tiene notas crédito o débito. Elimínalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
    -- Borradores de notas y pagos de recibos anulados o en borrador que apuntan a la factura.
    delete from documentos where ref_id = p_id and estado = 'borrador';
    delete from aplicaciones where factura_id = p_id;
  end if;
  if d.tipo = 'RC' then delete from aplicaciones where recibo_id = p_id; end if;
  delete from documentos where id = p_id;
  if d.numeracion_id is not null then
    update numeraciones set siguiente = d.numero where id = d.numeracion_id and siguiente = d.numero + 1 and d.numero >= desde;
  end if;
end $$;

revoke all on function public.eliminar_documento(uuid) from public, anon;
grant execute on function public.eliminar_documento(uuid) to authenticated;

-- Comprobantes contables y documentos de compra (FC, DS, CE) también se pueden eliminar.
drop policy if exists comprobantes_borrar on public.comprobantes;
create policy comprobantes_borrar on public.comprobantes for delete to authenticated using (public.puede_editar(empresa_id));
drop policy if exists compras_borrar on public.compras;
create policy compras_borrar on public.compras for delete to authenticated using (public.puede_editar(empresa_id));

-- Una factura de proveedor o documento soporte con egresos vigentes que la pagan no se elimina.
create or replace function public.compras_antes_de_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tipo <> 'CE' and exists (select 1 from compras e where e.empresa_id = old.empresa_id and e.tipo = 'CE' and e.estado <> 'anulado'
      and e.aplicaciones @> jsonb_build_array(jsonb_build_object('compra_id', old.id::text))) then
    raise exception 'Este documento tiene pagos. Elimina o anula primero el comprobante de egreso.'; end if;
  return old;
end $$;
drop trigger if exists compras_antes_de_borrar on public.compras;
create trigger compras_antes_de_borrar before delete on public.compras for each row execute function public.compras_antes_de_borrar();

-- 029: permisos por plan y planes por empresa.
-- Cada plan puede cobrar por empresa, limitar los documentos electrónicos del mes de cada empresa, los empleados de nómina
-- y apagar módulos (nómina, medios magnéticos, importar plantillas). Vacío (null) = sin límite.
-- Corre este archivo en Supabase › SQL Editor. Se puede correr más de una vez.

alter table public.planes add column if not exists por_empresa boolean not null default false;
alter table public.planes add column if not exists max_documentos_fe_mes integer check (max_documentos_fe_mes >= 0);
alter table public.planes add column if not exists max_empleados integer check (max_empleados >= 0);
alter table public.planes add column if not exists modulos jsonb not null default '{"nomina": true, "exogena": true, "importar": true}'::jsonb;

-- Plan vigente que manda sobre una empresa (el de su dueño). Null: sin límites (administrador, prueba gratis o cuenta sin plan).
create or replace function public.plan_de_empresa(p_eid uuid) returns public.planes
language sql stable security definer set search_path = public as $$
  select pl.* from empresas e join perfiles p on p.id = e.owner join planes pl on pl.id = p.plan_id
  where e.id = p_eid and not p.es_admin;
$$;
revoke all on function public.plan_de_empresa(uuid) from public, anon, authenticated;

-- Documentos electrónicos (facturas y notas) guardados en el mes en curso por una empresa (los anulados también cuentan: ya se gastaron).
create or replace function public.documentos_fe_mes(p_eid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from documentos
  where empresa_id = p_eid and electronica and estado <> 'borrador' and tipo in ('FV', 'NC', 'ND')
    and date_trunc('month', fecha) = date_trunc('month', public.hoy_co());
$$;
revoke all on function public.documentos_fe_mes(uuid) from public, anon, authenticated;

-- Tope de documentos electrónicos: cuenta al guardar (pasar a emitido) una factura o nota electrónica.
create or replace function public.limite_fe() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes;
begin
  if not (new.electronica and new.tipo in ('FV', 'NC', 'ND') and new.estado = 'emitido' and (tg_op = 'INSERT' or old.estado is distinct from 'emitido')) then return new; end if;
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is not null and pl.max_documentos_fe_mes is not null and public.documentos_fe_mes(new.empresa_id) >= pl.max_documentos_fe_mes then
    raise exception 'Llegaste a los % documentos electrónicos de este mes del plan %. Sube de plan en Mi plan para seguir facturando electrónicamente.', pl.max_documentos_fe_mes, pl.nombre; end if;
  return new;
end $$;
drop trigger if exists documentos_limite_fe on public.documentos;
create trigger documentos_limite_fe before insert or update of estado on public.documentos for each row execute function public.limite_fe();

-- Nómina: el módulo tiene que estar en el plan, y los empleados activos no pasan del tope.
create or replace function public.limite_nomina() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes; n integer;
begin
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is null then return new; end if;
  if coalesce(pl.modulos->>'nomina', 'true') = 'false' then
    raise exception 'El plan % no incluye nómina. Sube de plan en Mi plan.', pl.nombre; end if;
  if tg_table_name = 'empleados' and pl.max_empleados is not null and new.activo and (tg_op = 'INSERT' or not old.activo) then
    select count(*) into n from empleados where empresa_id = new.empresa_id and activo and id <> new.id;
    if n >= pl.max_empleados then raise exception 'El plan % permite % empleado(s) activo(s) por empresa. Sube de plan en Mi plan.', pl.nombre, pl.max_empleados; end if;
  end if;
  return new;
end $$;
drop trigger if exists empleados_limite on public.empleados;
create trigger empleados_limite before insert or update of activo on public.empleados for each row execute function public.limite_nomina();
drop trigger if exists nominas_limite on public.nominas;
create trigger nominas_limite before insert on public.nominas for each row execute function public.limite_nomina();

-- Uso de una empresa frente a su plan (para Mi plan).
create or replace function public.uso_empresa(p_eid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.puede_ver(p_eid) then raise exception 'Empresa no encontrada.'; end if;
  return jsonb_build_object(
    'documentos_fe_mes', public.documentos_fe_mes(p_eid),
    'empleados', (select count(*) from empleados where empresa_id = p_eid and activo),
    'plan', (select to_jsonb(pl) from public.plan_de_empresa(p_eid) pl where pl.id is not null));
end $$;
revoke all on function public.uso_empresa(uuid) from public, anon;
grant execute on function public.uso_empresa(uuid) to authenticated;

-- Planes por documentos electrónicos (precio por empresa, firma digital incluida). Solo se crean si no existen.
insert into public.planes (nombre, precio_mensual, por_empresa, max_empresas, max_documentos_mes, max_documentos_fe_mes, max_usuarios, max_empleados, modulos, descripcion, orden)
select v.* from (values
  ('Emprendedor', 39900::numeric, true, null::int, null::int, 30, 1, 0, '{"nomina": false, "exogena": false, "importar": false}'::jsonb, 'Para empezar a facturar: 30 documentos electrónicos al mes, firma digital incluida.', 10),
  ('Pyme', 79900, true, null, null, 100, 2, 5, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '100 documentos electrónicos al mes, nómina hasta 5 empleados y medios magnéticos.', 11),
  ('Empresa', 129900, true, null, null, 300, 5, 25, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '300 documentos electrónicos al mes, nómina hasta 25 empleados y 5 usuarios.', 12),
  ('Empresa Plus', 209900, true, null, null, 1000, null, null, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '1.000 documentos electrónicos al mes, usuarios y nómina sin límite.', 13)
) as v(nombre, precio_mensual, por_empresa, max_empresas, max_documentos_mes, max_documentos_fe_mes, max_usuarios, max_empleados, modulos, descripcion, orden)
where not exists (select 1 from public.planes p where lower(p.nombre) = lower(v.nombre));

notify pgrst, 'reload schema';
-- 030: planes v2 (Emprendedor, Pyme, Empresa), ajustados a lo que AGAsoft hace hoy.
-- Precios mensuales sin IVA y por empresa. El cliente compra su propio paquete de Factus, por eso no hay tope
-- de documentos electrónicos en AGAsoft. Nuevos módulos: informes (ventas y cartera), avanzados (informes avanzados
-- y exportar a Excel) y consulta (usuarios de solo consulta). Empresa Plus deja de ofrecerse.
-- max_usuarios = personas a las que el dueño da acceso (sin contarlo a él): 1 usuario = 0, 3 usuarios = 2.
-- Corre este archivo en Supabase › SQL Editor después del 029. Se puede correr más de una vez.

insert into public.planes (nombre, precio_mensual, por_empresa, orden, descripcion)
select v.nombre, v.precio, true, v.orden, '' from (values ('Emprendedor', 31000::numeric, 10), ('Pyme', 69000, 11), ('Empresa', 129900, 12)) as v(nombre, precio, orden)
where not exists (select 1 from public.planes p where lower(p.nombre) = lower(v.nombre));

update public.planes set precio_mensual = 31000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = 0, max_empleados = 0, activo = true, orden = 10,
  modulos = '{"nomina": false, "exogena": false, "importar": false, "informes": false, "avanzados": false, "consulta": false}'::jsonb,
  descripcion = 'Para facturar electrónicamente y llevar la contabilidad básica. 1 usuario.'
where lower(nombre) = 'emprendedor';

update public.planes set precio_mensual = 69000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = 2, max_empleados = 5, activo = true, orden = 11,
  modulos = '{"nomina": true, "exogena": true, "importar": true, "informes": true, "avanzados": false, "consulta": true}'::jsonb,
  descripcion = 'Suma nómina hasta 5 empleados, medios magnéticos, importar de Excel e informes de ventas y cartera. 3 usuarios.'
where lower(nombre) = 'pyme';

update public.planes set precio_mensual = 119000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = null, max_empleados = null, activo = true, orden = 12,
  modulos = '{"nomina": true, "exogena": true, "importar": true, "informes": true, "avanzados": true, "consulta": true}'::jsonb,
  descripcion = 'Todo AGAsoft: informes avanzados, exportar a Excel, nómina y usuarios sin límite.'
where lower(nombre) = 'empresa';

-- Se dejan de ofrecer (las cuentas que ya los tienen los conservan hasta que les cambies el plan).
update public.planes set activo = false where lower(nombre) in ('empresa plus', 'básico', 'basico', 'profesional', 'contador');

-- Usuarios de solo consulta: solo si el plan los incluye.
create or replace function public.limite_consulta() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes;
begin
  if new.rol <> 'consulta' or (tg_op = 'UPDATE' and old.rol = 'consulta') then return new; end if;
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is not null and coalesce(pl.modulos->>'consulta', 'true') = 'false' then
    raise exception 'El plan % no incluye usuarios de solo consulta. Sube de plan en Mi plan.', pl.nombre; end if;
  return new;
end $$;
drop trigger if exists miembros_consulta on public.miembros;
create trigger miembros_consulta before insert or update of rol on public.miembros for each row execute function public.limite_consulta();

notify pgrst, 'reload schema';

/* ======================================================================
   002_departamento.sql
   ====================================================================== */
-- AGAsoft: departamento en empresas y clientes (listas de departamentos y municipios de Colombia).
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.
alter table public.empresas add column if not exists departamento text not null default '';
alter table public.terceros add column if not exists departamento text not null default '';
notify pgrst, 'reload schema';

/* ======================================================================
   003_cuenta_devolucion.sql
   ====================================================================== */
-- AGAsoft: cuenta contable por producto para nota crédito y devolución.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.
alter table public.productos add column if not exists cuenta_devolucion text not null default '';
notify pgrst, 'reload schema';

/* ======================================================================
   004_comprobantes.sql
   ====================================================================== */
-- AGAsoft: comprobantes contables manuales (notas de contabilidad y saldos iniciales).
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.
create table if not exists public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null default 'CC' check (tipo in ('CC', 'SI')),
  numero bigint not null,
  fecha date not null default current_date,
  descripcion text not null default '',
  -- Cada línea: {cuenta, tercero_id, detalle, debito, credito}
  lineas jsonb not null default '[]'::jsonb,
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists comprobantes_empresa on public.comprobantes (empresa_id);

-- El comprobante debe cuadrar (sumas iguales) y cada línea llevar débito o crédito, no los dos.
create or replace function public.validar_comprobante() returns trigger
language plpgsql set search_path = public as $$
declare d numeric := 0; c numeric := 0; l jsonb;
begin
  if jsonb_typeof(new.lineas) <> 'array' or jsonb_array_length(new.lineas) < 2 then raise exception 'El comprobante necesita al menos dos líneas.'; end if;
  for l in select * from jsonb_array_elements(new.lineas) loop
    if coalesce(l->>'cuenta', '') = '' then raise exception 'Hay una línea sin cuenta.'; end if;
    if coalesce((l->>'debito')::numeric, 0) < 0 or coalesce((l->>'credito')::numeric, 0) < 0 then raise exception 'Los valores no pueden ser negativos.'; end if;
    if coalesce((l->>'debito')::numeric, 0) > 0 and coalesce((l->>'credito')::numeric, 0) > 0 then raise exception 'Cada línea lleva débito o crédito, no los dos.'; end if;
    d := d + coalesce((l->>'debito')::numeric, 0); c := c + coalesce((l->>'credito')::numeric, 0);
  end loop;
  if round(d, 2) <> round(c, 2) then raise exception 'El comprobante no cuadra: débitos % y créditos %.', d, c; end if;
  if d = 0 then raise exception 'El comprobante no tiene valores.'; end if;
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Un comprobante anulado no se puede modificar.'; end if;
  return new;
end $$;
drop trigger if exists comprobantes_validar on public.comprobantes;
create trigger comprobantes_validar before insert or update on public.comprobantes for each row execute function public.validar_comprobante();

-- Se ven y se editan como los documentos; no se borran (se anulan).
alter table public.comprobantes enable row level security;
drop policy if exists comprobantes_ver on public.comprobantes;
create policy comprobantes_ver on public.comprobantes for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists comprobantes_crear on public.comprobantes;
create policy comprobantes_crear on public.comprobantes for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists comprobantes_editar on public.comprobantes;
create policy comprobantes_editar on public.comprobantes for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

/* ======================================================================
   005_cuenta_por_item.sql
   ====================================================================== */
-- AGAsoft 005: cuenta contable por línea de documento y arreglo al guardar borradores
-- con fecha de vencimiento o documento de referencia vacíos. Se puede correr más de una vez.
alter table public.items add column if not exists cuenta text not null default '';

-- Crea o actualiza un borrador con sus líneas y pagos. Devuelve su id.
create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    if d.estado <> 'borrador' then raise exception 'Solo se pueden modificar borradores.'; end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, fecha, vence, tercero_id, forma_pago, medio_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;

notify pgrst, 'reload schema';

/* ======================================================================
   006_compras.sql
   ====================================================================== */
-- AGAsoft: compras y gastos (factura de proveedor, documento soporte y comprobante de egreso).
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

-- Un tercero puede ser cliente, proveedor o ambos. Retenciones que la empresa le practica al proveedor.
alter table public.terceros add column if not exists es_cliente boolean not null default true;
alter table public.terceros add column if not exists es_proveedor boolean not null default false;
alter table public.terceros add column if not exists ret_compra_fuente_pct numeric(6,3) not null default 0;
alter table public.terceros add column if not exists ret_compra_iva_pct numeric(6,3) not null default 0;
alter table public.terceros add column if not exists ret_compra_ica_milaje numeric(7,3) not null default 0;

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('FC', 'DS', 'CE')),
  numero bigint not null,
  num_proveedor text not null default '',
  fecha date not null default current_date,
  vence date,
  tercero_id uuid not null references public.terceros(id),
  -- FC y DS: cada línea {cuenta, descripcion, base, iva_pct}
  lineas jsonb not null default '[]'::jsonb,
  retefuente_pct numeric(6,3) not null default 0,
  reteiva_pct numeric(6,3) not null default 0,
  reteica_milaje numeric(7,3) not null default 0,
  cuenta_retefuente text not null default '',
  base numeric(18,2) not null default 0,
  iva numeric(18,2) not null default 0,
  retefuente numeric(18,2) not null default 0,
  reteiva numeric(18,2) not null default 0,
  reteica numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0,
  neto numeric(18,2) not null default 0,
  -- CE: cuenta de caja o bancos y facturas que paga [{compra_id, valor, ref}]
  cuenta_pago text not null default '',
  aplicaciones jsonb not null default '[]'::jsonb,
  anticipo numeric(18,2) not null default 0,
  observaciones text not null default '',
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists compras_empresa on public.compras (empresa_id);

create or replace function public.validar_compra() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Un documento anulado no se puede modificar.'; end if;
  if new.tipo in ('FC', 'DS') and jsonb_array_length(new.lineas) = 0 then raise exception 'El documento necesita al menos una línea.'; end if;
  if new.neto < 0 or new.anticipo < 0 then raise exception 'Los valores no pueden ser negativos.'; end if;
  return new;
end $$;
drop trigger if exists compras_validar on public.compras;
create trigger compras_validar before insert or update on public.compras for each row execute function public.validar_compra();

-- Se ven y se editan como los demás documentos; no se borran (se anulan).
alter table public.compras enable row level security;
drop policy if exists compras_ver on public.compras;
create policy compras_ver on public.compras for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists compras_crear on public.compras;
create policy compras_crear on public.compras for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists compras_editar on public.compras;
create policy compras_editar on public.compras for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

/* ======================================================================
   007_factura_electronica.sql
   ====================================================================== */
-- AGAsoft: factura de venta electrónica y factura normal (no electrónica).
-- Las facturas normales (y sus notas) se pueden eliminar aunque ya estén emitidas, porque no se reportan a la DIAN.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

-- Cada numeración de factura es electrónica (resolución DIAN) o normal. La primera vez, las numeraciones de factura
-- que ya tienen resolución quedan como electrónicas. Las facturas ya emitidas quedan como normales (se pueden eliminar):
-- ninguna se ha transmitido todavía a la DIAN.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'numeraciones' and column_name = 'electronica') then
    alter table public.numeraciones add column electronica boolean not null default false;
    update public.numeraciones set electronica = true where tipo = 'FV' and trim(resolucion) <> '';
  end if;
end $$;
alter table public.documentos add column if not exists electronica boolean not null default false;
-- Una numeración activa por tipo de documento y por clase.
drop index if exists public.numeraciones_una_activa;
create unique index if not exists numeraciones_una_activa on public.numeraciones (empresa_id, tipo, electronica) where activa;

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    if d.estado <> 'borrador' then raise exception 'Solo se pueden modificar borradores.'; end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;

create or replace function public.emitir_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos; n numeraciones; f documentos; acred numeric;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'borrador' then raise exception 'El documento ya no es un borrador.'; end if;
  if d.tipo in ('FV', 'NC', 'ND') then
    if not exists (select 1 from items where documento_id = p_id) then raise exception 'Agrega al menos una línea.'; end if;
    if d.total <= 0 then raise exception 'El total debe ser mayor que cero.'; end if;
  end if;
  if d.tipo in ('NC', 'ND') then
    select * into f from documentos where id = d.ref_id;
    if not found or f.tipo <> 'FV' or f.estado <> 'emitido' or f.empresa_id <> d.empresa_id then raise exception 'La nota debe referirse a una factura emitida.'; end if;
    if f.tercero_id <> d.tercero_id then raise exception 'La nota debe ser del mismo cliente de la factura.'; end if;
    update documentos set electronica = f.electronica where id = p_id; d.electronica := f.electronica;
    if d.tipo = 'NC' then
      select coalesce(sum(total), 0) into acred from documentos where tipo = 'NC' and estado = 'emitido' and ref_id = f.id;
      if acred + d.total > f.total then raise exception 'La nota crédito supera el valor pendiente de la factura (% disponible).', f.total - acred; end if;
    end if;
  end if;
  if d.tipo = 'RC' and d.electronica then update documentos set electronica = false where id = p_id; d.electronica := false; end if;
  if d.tipo = 'RC' and d.total <= 0 then raise exception 'El recibo debe tener un valor mayor que cero.'; end if;

  -- La factura usa la numeración de su clase (electrónica o normal). Notas y recibos prefieren la de su clase y si no, la que haya.
  select * into n from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa and (d.tipo <> 'FV' or electronica = d.electronica)
    order by (electronica = d.electronica) desc limit 1 for update;
  if not found then raise exception '%', case when d.tipo = 'FV' and d.electronica then 'No hay una numeración activa de factura electrónica. Créala en Numeraciones con la resolución DIAN.'
    when d.tipo = 'FV' then 'No hay una numeración activa de factura normal (no electrónica). Créala en Numeraciones.'
    else 'No hay una numeración activa para este tipo de documento. Créala en Numeraciones.' end; end if;
  if n.siguiente > n.hasta then raise exception 'Se agotó el rango de numeración % (hasta %).', n.prefijo, n.hasta; end if;
  if n.vigencia_hasta is not null and d.fecha > n.vigencia_hasta then raise exception 'La numeración % venció el %.', n.prefijo, n.vigencia_hasta; end if;
  if n.vigencia_desde is not null and d.fecha < n.vigencia_desde then raise exception 'La numeración % rige desde el %.', n.prefijo, n.vigencia_desde; end if;

  update documentos set estado = 'emitido', prefijo = n.prefijo, numero = n.siguiente, numeracion_id = n.id, emitido_en = now() where id = p_id;
  update numeraciones set siguiente = siguiente + 1 where id = n.id;
end $$;

-- Elimina una factura, nota crédito o nota débito NO electrónica, aunque esté emitida.
-- Una factura con notas o pagos vigentes no se puede eliminar: primero se eliminan las notas y se anulan los recibos.
-- Si era el último número de su numeración, ese número se vuelve a usar.
create or replace function public.eliminar_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.tipo not in ('FV', 'NC', 'ND') then raise exception 'Los recibos de caja no se eliminan: se anulan.'; end if;
  if d.electronica and d.estado <> 'borrador' then raise exception 'Las facturas y notas electrónicas no se eliminan: se corrigen con una nota.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado <> 'borrador') then
      raise exception 'La factura tiene notas crédito o débito. Elimínalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
    -- Borradores de notas y pagos de recibos anulados o en borrador que apuntan a la factura.
    delete from documentos where ref_id = p_id and estado = 'borrador';
    delete from aplicaciones where factura_id = p_id;
  end if;
  delete from documentos where id = p_id;
  if d.numeracion_id is not null then
    update numeraciones set siguiente = d.numero where id = d.numeracion_id and siguiente = d.numero + 1 and d.numero >= desde;
  end if;
end $$;

revoke all on function public.eliminar_documento(uuid) from public, anon;
grant execute on function public.eliminar_documento(uuid) to authenticated;

/* ======================================================================
   008_importar.sql
   ====================================================================== */
-- AGAsoft: importar facturas de venta desde las plantillas (datos tomados de la DIAN con el token).
-- La factura entra ya emitida, con el prefijo y el número que tiene en la DIAN.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run. Requiere haber corrido 007_factura_electronica.sql.
create or replace function public.importar_documento(p_doc jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  d documentos; did uuid;
begin
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  p_doc := p_doc - array['vence', 'id', 'ref_id']::text[] || jsonb_strip_nulls(jsonb_build_object('vence', nullif(p_doc->>'vence', '')));
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if d.tipo <> 'FV' then raise exception 'Por ahora solo se importan facturas de venta.'; end if;
  if d.numero is null or d.numero <= 0 then raise exception 'La factura necesita número.'; end if;
  if not exists (select 1 from terceros where id = d.tercero_id and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if exists (select 1 from documentos where empresa_id = eid and tipo = 'FV' and prefijo = coalesce(d.prefijo, '') and numero = d.numero) then
    raise exception 'La factura % % ya existe.', coalesce(d.prefijo, ''), d.numero; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'La factura necesita al menos una línea.'; end if;
  insert into documentos (empresa_id, tipo, estado, electronica, prefijo, numero, fecha, vence, tercero_id, forma_pago, medio_pago, observaciones,
    bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, emitido_en)
  values (eid, 'FV', 'emitido', coalesce(d.electronica, true), coalesce(d.prefijo, ''), d.numero, coalesce(d.fecha, current_date), d.vence, d.tercero_id,
    coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'transferencia'), coalesce(d.observaciones, ''),
    coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0), coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0),
    coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0), coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), now())
  returning id into did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 1), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(p_items) with ordinality as a(x, o);
  return did;
end $$;

revoke all on function public.importar_documento(jsonb, jsonb) from public, anon;
grant execute on function public.importar_documento(jsonb, jsonb) to authenticated;
notify pgrst, 'reload schema';

/* ======================================================================
   009_planes.sql
   ====================================================================== */
-- AGAsoft: planes y control de uso.
-- El administrador (dueño de AGAsoft) crea los planes, se los asigna a cada cuenta y ve su uso desde /admin.
-- Cada cuenta es un usuario dueño de sus contabilidades (empresas). Los límites se cumplen en la base de datos.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

/* ============ Planes ============ */
create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  precio_mensual numeric(14,2) not null default 0 check (precio_mensual >= 0),
  -- Límites. Vacío (null) = sin límite.
  max_empresas integer check (max_empresas >= 0),
  max_documentos_mes integer check (max_documentos_mes >= 0),
  max_usuarios integer check (max_usuarios >= 0),
  descripcion text not null default '',
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
alter table public.planes enable row level security;
drop policy if exists planes_ver on public.planes;
create policy planes_ver on public.planes for select to authenticated using (true);
drop policy if exists planes_admin on public.planes;
create policy planes_admin on public.planes for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Planes de ejemplo (el administrador los cambia en /admin). Solo se crean si no hay ninguno.
insert into public.planes (nombre, precio_mensual, max_empresas, max_documentos_mes, max_usuarios, descripcion, orden)
select * from (values
  ('Básico', 49900::numeric, 1, 100, 1, 'Una contabilidad, hasta 100 documentos al mes.', 1),
  ('Profesional', 119900::numeric, 5, 1000, 3, 'Hasta 5 contabilidades y 3 personas con acceso.', 2),
  ('Contador', 249900::numeric, 30, 5000, 10, 'Para contadores con varias empresas cliente.', 3)
) as v(nombre, precio_mensual, max_empresas, max_documentos_mes, max_usuarios, descripcion, orden)
where not exists (select 1 from public.planes);

/* ============ Plan de cada cuenta ============ */
alter table public.perfiles add column if not exists plan_id uuid references public.planes(id) on delete set null;
alter table public.perfiles add column if not exists plan_vence date;
alter table public.perfiles add column if not exists suspendido boolean not null default false;
alter table public.perfiles add column if not exists notas text not null default '';

-- Una cuenta suspendida no entra a sus datos (ni a los que le compartieron).
create or replace function public.aprobado() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado and not suspendido from public.perfiles where id = auth.uid()), false);
$$;
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin and aprobado and not suspendido from public.perfiles where id = auth.uid()), false);
$$;

-- La cuenta solo puede cambiar su nombre; el plan, la aprobación y la suspensión los cambia el administrador.
drop policy if exists perfiles_admin on public.perfiles;
create policy perfiles_admin on public.perfiles for update to authenticated using (public.es_admin()) with check (public.es_admin());

/* ============ Uso ============ */
-- Documentos que cuenta el plan en un mes: facturas, notas y recibos emitidos, compras y comprobantes.
create or replace function public.documentos_mes(p_owner uuid, p_mes date default current_date) returns integer
language sql stable security definer set search_path = public as $$
  select (
    (select count(*) from documentos d join empresas e on e.id = d.empresa_id
      where e.owner = p_owner and d.estado <> 'borrador' and date_trunc('month', d.fecha) = date_trunc('month', p_mes))
  + (select count(*) from compras c join empresas e on e.id = c.empresa_id
      where e.owner = p_owner and date_trunc('month', c.fecha) = date_trunc('month', p_mes))
  + (select count(*) from comprobantes c join empresas e on e.id = c.empresa_id
      where e.owner = p_owner and date_trunc('month', c.fecha) = date_trunc('month', p_mes))
  )::integer;
$$;
-- Personas distintas con acceso a las contabilidades de una cuenta (sin contar al dueño).
create or replace function public.usuarios_de(p_owner uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(distinct lower(m.correo))::integer from miembros m join empresas e on e.id = m.empresa_id where e.owner = p_owner;
$$;

-- Uso y plan de la cuenta que está entrando (para mostrarlo en Configuración).
create or replace function public.mi_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', (select to_jsonb(pl) from planes pl where pl.id = p.plan_id),
    'plan_vence', p.plan_vence,
    'empresas', (select count(*) from empresas e where e.owner = p.id),
    'documentos_mes', public.documentos_mes(p.id),
    'usuarios', public.usuarios_de(p.id))
  from perfiles p where p.id = auth.uid();
$$;

-- Panel del administrador: todas las cuentas con su plan y su uso.
drop function if exists public.admin_cuentas();
create function public.admin_cuentas() returns table (
  id uuid, nombre text, correo text, es_admin boolean, aprobado boolean, suspendido boolean, plan_id uuid, plan_vence date, notas text,
  creado_en timestamptz, empresas integer, documentos_mes integer, usuarios integer, ultimo_documento date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  return query
  select p.id, p.nombre, p.correo, p.es_admin, p.aprobado, p.suspendido, p.plan_id, p.plan_vence, p.notas, p.creado_en,
    (select count(*) from empresas e where e.owner = p.id)::integer,
    public.documentos_mes(p.id), public.usuarios_de(p.id),
    (select max(d.fecha) from documentos d join empresas e on e.id = d.empresa_id where e.owner = p.id and d.estado <> 'borrador')
  from perfiles p order by p.creado_en desc;
end $$;

/* ============ Límites del plan ============ */
-- Plan vigente del dueño de una empresa. El administrador no tiene límites; una cuenta sin plan tampoco (cuentas antiguas).
create or replace function public.revisar_plan(p_owner uuid, p_que text) returns void
language plpgsql stable security definer set search_path = public as $$
declare p perfiles; pl planes; n integer;
begin
  select * into p from perfiles where id = p_owner;
  if not found or p.es_admin or p.plan_id is null then return; end if;
  select * into pl from planes where id = p.plan_id;
  if p.plan_vence is not null and p.plan_vence < current_date then
    raise exception 'El plan % venció el %. Comunícate con AGAsoft para renovarlo.', pl.nombre, to_char(p.plan_vence, 'DD/MM/YYYY'); end if;
  if p_que = 'empresa' and pl.max_empresas is not null then
    select count(*) into n from empresas where owner = p_owner;
    if n >= pl.max_empresas then raise exception 'Tu plan % permite % contabilidad(es). Comunícate con AGAsoft para ampliarlo.', pl.nombre, pl.max_empresas; end if;
  elsif p_que = 'documento' and pl.max_documentos_mes is not null then
    if public.documentos_mes(p_owner) >= pl.max_documentos_mes then
      raise exception 'Llegaste al límite de % documentos de este mes del plan %. Comunícate con AGAsoft para ampliarlo.', pl.max_documentos_mes, pl.nombre; end if;
  elsif p_que = 'usuario' and pl.max_usuarios is not null then
    if public.usuarios_de(p_owner) >= pl.max_usuarios then
      raise exception 'Tu plan % permite dar acceso a % persona(s). Comunícate con AGAsoft para ampliarlo.', pl.nombre, pl.max_usuarios; end if;
  end if;
end $$;
revoke all on function public.revisar_plan(uuid, text) from public, anon, authenticated;

create or replace function public.limite_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.revisar_plan(new.owner, 'empresa'); return new; end $$;
drop trigger if exists empresas_limite on public.empresas;
create trigger empresas_limite before insert on public.empresas for each row execute function public.limite_empresa();

create or replace function public.limite_documento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Facturas, notas y recibos cuentan al emitirse; compras y comprobantes al crearse.
  if tg_table_name = 'documentos' and not (new.estado = 'emitido' and (tg_op = 'INSERT' or old.estado = 'borrador')) then return new; end if;
  perform public.revisar_plan((select owner from empresas where id = new.empresa_id), 'documento');
  return new;
end $$;
drop trigger if exists documentos_limite on public.documentos;
create trigger documentos_limite before insert or update of estado on public.documentos for each row execute function public.limite_documento();
drop trigger if exists compras_limite on public.compras;
create trigger compras_limite before insert on public.compras for each row execute function public.limite_documento();
drop trigger if exists comprobantes_limite on public.comprobantes;
create trigger comprobantes_limite before insert on public.comprobantes for each row execute function public.limite_documento();

create or replace function public.limite_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid := (select owner from empresas where id = new.empresa_id);
begin
  -- Dar acceso a alguien que ya tiene acceso a otra contabilidad de la misma cuenta no suma.
  if exists (select 1 from miembros m join empresas e on e.id = m.empresa_id where e.owner = o and lower(m.correo) = lower(new.correo)) then return new; end if;
  perform public.revisar_plan(o, 'usuario');
  return new;
end $$;
drop trigger if exists miembros_limite on public.miembros;
create trigger miembros_limite before insert on public.miembros for each row execute function public.limite_usuario();

revoke all on function public.documentos_mes(uuid, date), public.usuarios_de(uuid) from public, anon, authenticated;
revoke all on function public.mi_plan(), public.admin_cuentas() from public, anon;
grant execute on function public.mi_plan(), public.admin_cuentas() to authenticated;
notify pgrst, 'reload schema';

/* ======================================================================
   010_prueba_gratis.sql
   ====================================================================== */
-- AGAsoft: prueba gratis de 15 días.
-- Quien se registra por primera vez entra de una vez y usa AGAsoft gratis 15 días.
-- Al terminar la prueba la cuenta no puede entrar a sus datos: escoge un plan y el administrador lo aprueba en /admin.
-- Las cuentas que ya existían no cambian. Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

alter table public.perfiles add column if not exists prueba_hasta date;
alter table public.perfiles add column if not exists plan_solicitado uuid references public.planes(id) on delete set null;
alter table public.perfiles add column if not exists solicitado_en timestamptz;

-- Fecha de hoy en Colombia.
create or replace function public.hoy_co() returns date
language sql stable as $$ select (now() at time zone 'America/Bogota')::date; $$;

-- El primer usuario queda como administrador. Los demás entran con 15 días de prueba gratis.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  select not exists (select 1 from public.perfiles) into primero;
  insert into public.perfiles (id, nombre, correo, es_admin, aprobado, prueba_hasta)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), coalesce(new.email, ''), primero, true,
    case when primero then null else public.hoy_co() + 15 end)
  on conflict (id) do nothing;
  return new;
end $$;

-- Con la prueba vencida y sin plan aprobado, la cuenta no entra a sus datos (ni a los que le compartieron).
create or replace function public.aprobado() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select aprobado and not suspendido and (prueba_hasta is null or prueba_hasta >= public.hoy_co())
    from public.perfiles where id = auth.uid()), false);
$$;

-- La cuenta escoge el plan que quiere; el administrador lo aprueba en /admin.
create or replace function public.solicitar_plan(p_plan uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta.'; end if;
  if not exists (select 1 from planes where id = p_plan and activo) then raise exception 'Ese plan no está disponible.'; end if;
  update perfiles set plan_solicitado = p_plan, solicitado_en = now() where id = auth.uid() and not suspendido;
end $$;
revoke all on function public.solicitar_plan(uuid) from public, anon;
grant execute on function public.solicitar_plan(uuid) to authenticated;

-- Plan, prueba y uso de la cuenta que está entrando.
create or replace function public.mi_plan() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', (select to_jsonb(pl) from planes pl where pl.id = p.plan_id),
    'plan_vence', p.plan_vence,
    'prueba_hasta', p.prueba_hasta,
    'plan_solicitado', (select to_jsonb(pl) from planes pl where pl.id = p.plan_solicitado),
    'solicitado_en', p.solicitado_en,
    'empresas', (select count(*) from empresas e where e.owner = p.id),
    'documentos_mes', public.documentos_mes(p.id),
    'usuarios', public.usuarios_de(p.id))
  from perfiles p where p.id = auth.uid();
$$;

-- Panel del administrador: ahora con la prueba y el plan pedido.
drop function if exists public.admin_cuentas();
create function public.admin_cuentas() returns table (
  id uuid, nombre text, correo text, es_admin boolean, aprobado boolean, suspendido boolean, plan_id uuid, plan_vence date, notas text,
  creado_en timestamptz, empresas integer, documentos_mes integer, usuarios integer, ultimo_documento date,
  prueba_hasta date, plan_solicitado uuid, solicitado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  return query
  select p.id, p.nombre, p.correo, p.es_admin, p.aprobado, p.suspendido, p.plan_id, p.plan_vence, p.notas, p.creado_en,
    (select count(*) from empresas e where e.owner = p.id)::integer,
    public.documentos_mes(p.id), public.usuarios_de(p.id),
    (select max(d.fecha) from documentos d join empresas e on e.id = d.empresa_id where e.owner = p.id and d.estado <> 'borrador'),
    p.prueba_hasta, p.plan_solicitado, p.solicitado_en
  from perfiles p order by p.creado_en desc;
end $$;

revoke all on function public.mi_plan(), public.admin_cuentas() from public, anon;
grant execute on function public.mi_plan(), public.admin_cuentas() to authenticated;
notify pgrst, 'reload schema';

/* ======================================================================
   011_eliminar_cuenta.sql
   ====================================================================== */
-- AGAsoft: el administrador puede eliminar una cuenta desde /admin.
-- Se borra el usuario con todas sus contabilidades (empresas) y sus datos. No se puede deshacer.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.admin_eliminar_cuenta(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.es_admin() then raise exception 'Solo el administrador de AGAsoft.'; end if;
  if p_id = auth.uid() then raise exception 'No puedes eliminar tu propia cuenta.'; end if;
  if exists (select 1 from public.perfiles where id = p_id and es_admin) then raise exception 'No se puede eliminar una cuenta administradora.'; end if;
  -- Documentos que la cuenta creó en contabilidades de otros quedan sin autor (no se borran).
  update public.documentos set creado_por = null where creado_por = p_id;
  -- Accesos que le dieron en contabilidades de otros.
  delete from public.miembros where lower(correo) = lower((select correo from public.perfiles where id = p_id));
  -- Sus contabilidades y todo lo que cuelga de ellas se borran en cascada con el usuario.
  delete from public.empresas where owner = p_id;
  delete from auth.users where id = p_id;
  delete from public.perfiles where id = p_id;
end $$;
revoke all on function public.admin_eliminar_cuenta(uuid) from public, anon;
grant execute on function public.admin_eliminar_cuenta(uuid) to authenticated;
notify pgrst, 'reload schema';

/* ======================================================================
   012_crear_empresa.sql
   ====================================================================== */
-- AGAsoft: arreglo para que una cuenta nueva (no administradora) pueda crear su primera empresa.
-- Al crear la empresa la app pide de vuelta la fila creada, y la regla de lectura buscaba la empresa
-- en la tabla antes de que existiera, así que respondía "No tienes permiso". Ahora el dueño la ve directo.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

drop policy if exists empresas_ver on public.empresas;
create policy empresas_ver on public.empresas for select to authenticated
  using ((owner = auth.uid() and public.aprobado()) or public.puede_ver(id));
notify pgrst, 'reload schema';

/* ======================================================================
   013_tema.sql
   ====================================================================== */
-- AGAsoft: cada usuario escoge el color y el modo (claro/oscuro) de su AGAsoft.
-- Se guarda en su perfil para verlo igual en cualquier equipo.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

alter table public.perfiles add column if not exists tema jsonb not null default '{}'::jsonb;

-- El usuario solo puede cambiar su propio tema (el resto del perfil lo cambia el administrador).
create or replace function public.guardar_tema(p_tema jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entra con tu cuenta.'; end if;
  update perfiles set tema = jsonb_build_object('color', left(coalesce(p_tema->>'color', 'aga'), 20), 'modo', left(coalesce(p_tema->>'modo', 'auto'), 10))
  where id = auth.uid();
end $$;
revoke all on function public.guardar_tema(jsonb) from public, anon;
grant execute on function public.guardar_tema(jsonb) to authenticated;
notify pgrst, 'reload schema';

/* ======================================================================
   014_formas_pago.sql
   ====================================================================== */
-- AGAsoft 014: formas de pago configurables.
-- Cada factura de venta guarda la cuenta de su forma de pago (caja, bancos, cartera u otra). Vacío = clientes (cartera).
-- Las compras ya tenían la columna cuenta_pago. Se puede correr más de una vez.
-- Ejecutar una vez en Supabase: SQL Editor > New query > pegar > Run.

alter table public.documentos add column if not exists cuenta_pago text not null default '';

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    if d.estado <> 'borrador' then raise exception 'Solo se pueden modificar borradores.'; end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;
notify pgrst, 'reload schema';

/* ======================================================================
   015_contabilizar_al_guardar.sql
   ====================================================================== */
-- AGAsoft 015: solo los documentos electrónicos tienen borrador. Los demás contabilizan al guardar
-- y se pueden imprimir, editar y anular.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    if d.estado = 'emitido' and d.electronica then raise exception 'Los documentos electrónicos no se modifican: se corrigen con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', false, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;

-- Anula recibos y facturas o notas que no son electrónicas. Las electrónicas se corrigen con una nota.
create or replace function public.anular_recibo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'emitido' then raise exception 'Solo se anulan documentos guardados.'; end if;
  if d.electronica and d.tipo <> 'RC' then raise exception 'Los documentos electrónicos no se anulan: se corrigen con una nota.'; end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Escribe el motivo de la anulación.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado = 'emitido') then
      raise exception 'La factura tiene notas crédito o débito. Anúlalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
  end if;
  update documentos set estado = 'anulado', anulado_en = now(), anulado_motivo = p_motivo where id = p_id;
end $$;

-- Compras, egresos y comprobantes: lo anulado ya no se edita.
create or replace function public.editar_guardado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
  return new;
end $$;
drop trigger if exists compras_editar on public.compras;
create trigger compras_editar before update on public.compras for each row execute function public.editar_guardado();
drop trigger if exists comprobantes_editar on public.comprobantes;
create trigger comprobantes_editar before update on public.comprobantes for each row execute function public.editar_guardado();

revoke all on function public.anular_recibo(uuid, text) from public, anon;
grant execute on function public.anular_recibo(uuid, text) to authenticated;
notify pgrst, 'reload schema';

/* ======================================================================
   016_nombres_tercero.sql
   ====================================================================== */
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

/* ======================================================================
   017_consecutivo_automatico.sql
   ====================================================================== */
-- AGAsoft 017: los documentos que no son electrónicos toman su consecutivo al guardar aunque no se haya creado la numeración.
-- Si falta, se crea sola: FN para facturas normales, RC para recibos, NC y ND para notas, desde el 1.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.emitir_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos; n numeraciones; f documentos; acred numeric;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.estado <> 'borrador' then raise exception 'El documento ya no es un borrador.'; end if;
  if d.tipo in ('FV', 'NC', 'ND') then
    if not exists (select 1 from items where documento_id = p_id) then raise exception 'Agrega al menos una línea.'; end if;
    if d.total <= 0 then raise exception 'El total debe ser mayor que cero.'; end if;
  end if;
  if d.tipo in ('NC', 'ND') then
    select * into f from documentos where id = d.ref_id;
    if not found or f.tipo <> 'FV' or f.estado <> 'emitido' or f.empresa_id <> d.empresa_id then raise exception 'La nota debe referirse a una factura emitida.'; end if;
    if f.tercero_id <> d.tercero_id then raise exception 'La nota debe ser del mismo cliente de la factura.'; end if;
    update documentos set electronica = f.electronica where id = p_id; d.electronica := f.electronica;
    if d.tipo = 'NC' then
      select coalesce(sum(total), 0) into acred from documentos where tipo = 'NC' and estado = 'emitido' and ref_id = f.id;
      if acred + d.total > f.total then raise exception 'La nota crédito supera el valor pendiente de la factura (% disponible).', f.total - acred; end if;
    end if;
  end if;
  if d.tipo = 'RC' and d.electronica then update documentos set electronica = false where id = p_id; d.electronica := false; end if;
  if d.tipo = 'RC' and d.total <= 0 then raise exception 'El recibo debe tener un valor mayor que cero.'; end if;

  -- Documentos que no son electrónicos: si no hay numeración, se crea una sola (FN, RC, NC o ND desde el 1).
  if not d.electronica and not exists (select 1 from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa and (d.tipo <> 'FV' or not electronica)) then
    insert into numeraciones (empresa_id, tipo, prefijo, electronica) values (d.empresa_id, d.tipo, case d.tipo when 'FV' then 'FN' else d.tipo end, false);
  end if;
  -- La factura usa la numeración de su clase (electrónica o normal). Notas y recibos prefieren la de su clase y si no, la que haya.
  select * into n from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa and (d.tipo <> 'FV' or electronica = d.electronica)
    order by (electronica = d.electronica) desc limit 1 for update;
  if not found then raise exception '%', case when d.tipo = 'FV' and d.electronica then 'No hay una numeración activa de factura electrónica. Créala en Numeraciones con la resolución DIAN.'
    when d.tipo = 'FV' then 'No hay una numeración activa de factura normal (no electrónica). Créala en Numeraciones.'
    else 'No hay una numeración activa para este tipo de documento. Créala en Numeraciones.' end; end if;
  if n.siguiente > n.hasta then raise exception 'Se agotó el rango de numeración % (hasta %).', n.prefijo, n.hasta; end if;
  if n.vigencia_hasta is not null and d.fecha > n.vigencia_hasta then raise exception 'La numeración % venció el %.', n.prefijo, n.vigencia_hasta; end if;
  if n.vigencia_desde is not null and d.fecha < n.vigencia_desde then raise exception 'La numeración % rige desde el %.', n.prefijo, n.vigencia_desde; end if;

  update documentos set estado = 'emitido', prefijo = n.prefijo, numero = n.siguiente, numeracion_id = n.id, emitido_en = now() where id = p_id;
  update numeraciones set siguiente = siguiente + 1 where id = n.id;
end $$;
notify pgrst, 'reload schema';

/* ======================================================================
   018_impuestos_cierre.sql
   ====================================================================== */
-- AGAsoft 018: módulo de impuestos y cierre contable.
-- Cada factura, nota y compra guarda el concepto y la cuenta de sus retenciones (Impuestos › Conceptos de retención),
-- y los comprobantes admiten el tipo CI (cierre contable del año).
-- Los conceptos de retención y las tarifas de IVA se guardan en la configuración contable de la empresa (no necesitan tabla).
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.documentos add column if not exists retenciones jsonb not null default '{}'::jsonb;
alter table public.compras add column if not exists retenciones jsonb not null default '{}'::jsonb;
alter table public.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table public.comprobantes add constraint comprobantes_tipo_check check (tipo in ('CC', 'SI', 'CI'));

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    if d.estado = 'emitido' and d.electronica then raise exception 'Los documentos electrónicos no se modifican: se corrigen con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', false, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, retenciones, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), coalesce(d.retenciones, '{}'::jsonb), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), retenciones = coalesce(d.retenciones, '{}'::jsonb), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;
notify pgrst, 'reload schema';

/* ======================================================================
   019_nomina.sql
   ====================================================================== */
-- AGAsoft 019: nómina (empleados y liquidaciones de nómina).
-- Cada nómina guarda en `lineas` la liquidación de cada empleado con sus cuentas, así su contabilidad no cambia
-- si después se editan los parámetros. Los parámetros del año se guardan en la configuración contable de la empresa.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.empleados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tercero_id uuid not null references public.terceros(id),
  cargo text not null default '',
  contrato text not null default 'indefinido' check (contrato in ('indefinido', 'fijo', 'obra')),
  fecha_ingreso date,
  fecha_retiro date,
  salario numeric(16,2) not null default 0 check (salario >= 0),
  area text not null default 'admin' check (area in ('admin', 'ventas', 'produccion')),
  riesgo text not null default '1' check (riesgo in ('1', '2', '3', '4', '5')),
  auxilio boolean not null default true,
  eps_id uuid references public.terceros(id) on delete set null,
  pension_id uuid references public.terceros(id) on delete set null,
  cesantias_id uuid references public.terceros(id) on delete set null,
  caja_id uuid references public.terceros(id) on delete set null,
  banco text not null default '',
  cuenta_bancaria text not null default '',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tercero_id)
);
create index if not exists empleados_empresa on public.empleados (empresa_id);

create table if not exists public.nominas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero bigint not null,
  periodo text not null default 'mensual' check (periodo in ('mensual', 'quincenal')),
  desde date not null,
  hasta date not null,
  fecha date not null,
  -- Una línea por empleado: {empleado_id, tercero_id, area, dias, ibc, items:[{k, nombre, tipo, valor, cuenta, contra, tercero_id}], devengado, deducciones, neto, aportes, provisiones}
  lineas jsonb not null default '[]'::jsonb,
  novedades jsonb not null default '{}'::jsonb,
  cuenta_neto text not null default '25050501',
  devengado numeric(18,2) not null default 0,
  deducciones numeric(18,2) not null default 0,
  neto numeric(18,2) not null default 0,
  aportes numeric(18,2) not null default 0,
  provisiones numeric(18,2) not null default 0,
  observaciones text not null default '',
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, numero),
  check (hasta >= desde)
);
create index if not exists nominas_empresa on public.nominas (empresa_id);

create or replace function public.validar_nomina() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Una nómina anulada no se puede modificar.'; end if;
  if jsonb_array_length(new.lineas) = 0 then raise exception 'La nómina necesita al menos un empleado.'; end if;
  if new.neto < 0 then raise exception 'El neto de la nómina no puede ser negativo.'; end if;
  return new;
end $$;
drop trigger if exists nominas_validar on public.nominas;
create trigger nominas_validar before insert or update on public.nominas for each row execute function public.validar_nomina();

-- Se ven y se editan como los demás documentos; las nóminas no se borran (se anulan).
alter table public.empleados enable row level security;
drop policy if exists empleados_ver on public.empleados;
create policy empleados_ver on public.empleados for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists empleados_crear on public.empleados;
create policy empleados_crear on public.empleados for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists empleados_editar on public.empleados;
create policy empleados_editar on public.empleados for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

alter table public.nominas enable row level security;
drop policy if exists nominas_ver on public.nominas;
create policy nominas_ver on public.nominas for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists nominas_crear on public.nominas;
create policy nominas_crear on public.nominas for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists nominas_editar on public.nominas;
create policy nominas_editar on public.nominas for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

/* ======================================================================
   020_pensionado.sql
   ====================================================================== */
-- 020: empleado pensionado (no cotiza pensión ni fondo de solidaridad; salud completa).
alter table public.empleados add column if not exists pensionado boolean not null default false;

/* ======================================================================
   021_nomina_borrador.sql
   ====================================================================== */
-- 021: nómina en borrador (se guarda sin contabilizar; se puede editar o eliminar hasta contabilizarla).
alter table public.nominas drop constraint if exists nominas_estado_check;
alter table public.nominas add constraint nominas_estado_check check (estado in ('borrador', 'contabilizado', 'anulado'));

create or replace function public.validar_nomina() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Una nómina anulada no se puede modificar.'; end if;
  if tg_op = 'UPDATE' and old.estado = 'contabilizado' and new.estado = 'borrador' then raise exception 'Una nómina contabilizada no puede volver a borrador: anúlala.'; end if;
  if jsonb_array_length(new.lineas) = 0 then raise exception 'La nómina necesita al menos un empleado.'; end if;
  if new.neto < 0 then raise exception 'El neto de la nómina no puede ser negativo.'; end if;
  return new;
end $$;

-- Solo los borradores se pueden eliminar.
drop policy if exists nominas_borrar on public.nominas;
create policy nominas_borrar on public.nominas for delete to authenticated using (public.puede_editar(empresa_id) and estado = 'borrador');

/* ======================================================================
   022_planes_publicos.sql
   ====================================================================== */
-- 022: los planes activos se ven sin iniciar sesión (para mostrarlos en la página de entrada).
drop policy if exists planes_publicos on public.planes;
create policy planes_publicos on public.planes for select to anon using (activo);

/* ======================================================================
   023_facturacion_electronica.sql
   ====================================================================== */
-- 023: envíos de documentos electrónicos a la DIAN (por el proveedor tecnológico; hoy Factus).
-- Cada intento queda registrado; el documento se toma como aceptado cuando tiene un envío con estado 'aceptado'.
create table if not exists public.fe_envios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  documento_id uuid not null references public.documentos(id) on delete cascade,
  ambiente text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
  estado text not null check (estado in ('aceptado', 'rechazado', 'error')),
  cufe text not null default '',
  mensaje text not null default '',
  errores jsonb not null default '[]'::jsonb,
  pdf text not null default '',
  respuesta jsonb,
  enviado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists fe_envios_doc on public.fe_envios (documento_id);
alter table public.fe_envios enable row level security;
drop policy if exists fe_envios_ver on public.fe_envios;
create policy fe_envios_ver on public.fe_envios for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists fe_envios_crear on public.fe_envios;
create policy fe_envios_crear on public.fe_envios for insert to authenticated with check (public.puede_editar(empresa_id));
-- Sin update ni delete: el historial de envíos no se modifica.

/* ======================================================================
   024_factus.sql
   ====================================================================== */
-- 024: cuenta de Factus de cada empresa (proveedor tecnológico de facturación electrónica).
-- Requiere 023_facturacion_electronica.sql (tabla fe_envios).
-- Solo la lee y escribe la función fe-factus con la llave de servicio: ningún usuario puede leer la contraseña.
create table if not exists public.fe_cuentas (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  proveedor text not null default 'factus',
  ambiente text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
  usuario text not null default '',
  clave text not null default '',
  client_id text not null default '',
  client_secret text not null default '',
  actualizado timestamptz not null default now()
);
alter table public.fe_cuentas enable row level security;
-- Sin políticas a propósito: desde el navegador no se puede leer ni escribir.
revoke all on public.fe_cuentas from anon, authenticated;

/* ======================================================================
   025_pago_nomina.sql
   ====================================================================== */
-- AGAsoft 025: comprobante de pago de nómina (PN).
-- Un solo comprobante paga salarios, seguridad social (PILA) o prestaciones a varios terceros, como una dispersión bancaria.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table public.comprobantes add constraint comprobantes_tipo_check check (tipo in ('CC', 'SI', 'CI', 'PN'));

notify pgrst, 'reload schema';

/* ======================================================================
   026_entidades_ss.sql
   ====================================================================== */
-- AGAsoft 026: marcar terceros como entidades de seguridad social (EPS, fondo de pensiones, fondo de cesantías, caja, ARL, ICBF o SENA).
-- Un tercero puede tener varias (por ejemplo, un fondo de pensiones y cesantías). Con esto, la ficha del empleado y la PILA solo muestran esas entidades.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.terceros add column if not exists entidad_ss text[] not null default '{}';
alter table public.terceros drop constraint if exists terceros_entidad_ss_check;
alter table public.terceros add constraint terceros_entidad_ss_check check (entidad_ss <@ array['eps', 'pension', 'cesantias', 'caja', 'arl', 'parafiscales']::text[]);

notify pgrst, 'reload schema';

/* ======================================================================
   027_editar_electronica.sql
   ====================================================================== */
-- AGAsoft 027: las facturas y notas electrónicas guardadas (con número) se pueden modificar
-- hasta que la DIAN las acepte. Se bloquean al quedar aceptadas en "Enviar a la DIAN".
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    -- Los electrónicos se pueden modificar mientras no los haya aceptado la DIAN; aceptados se corrigen con una nota.
    if d.estado = 'emitido' and d.electronica and exists (select 1 from fe_envios e where e.documento_id = did and e.estado = 'aceptado') then
      raise exception 'Este documento ya fue aceptado por la DIAN: no se modifica, se corrige con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', d.electronica, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, retenciones, ref_id, concepto, observaciones,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), coalesce(d.retenciones, '{}'::jsonb), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), retenciones = coalesce(d.retenciones, '{}'::jsonb), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;
notify pgrst, 'reload schema';

/* ======================================================================
   028_eliminar_documentos.sql
   ====================================================================== */
-- 028: se pueden eliminar facturas y notas electrónicas que la DIAN no ha validado, recibos de caja,
-- comprobantes contables y documentos de compra (FC, DS, CE).
-- Corre este archivo en Supabase › SQL Editor. Se puede correr más de una vez.

create or replace function public.eliminar_documento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d documentos;
begin
  select * into d from documentos where id = p_id for update;
  if not found or not public.puede_editar(d.empresa_id) then raise exception 'Documento no encontrado.'; end if;
  if d.tipo not in ('FV', 'NC', 'ND', 'RC') then raise exception 'Este documento no se puede eliminar.'; end if;
  -- Electrónicas: solo se eliminan si la DIAN no las ha validado (ningún envío aceptado ni con CUFE).
  if d.electronica and d.estado <> 'borrador' and exists (select 1 from fe_envios e where e.documento_id = p_id and (e.estado = 'aceptado' or e.cufe <> ''
      or 'true' in (e.respuesta->'data'->>'is_validated', e.respuesta->'data'->'credit_note'->>'is_validated', e.respuesta->'data'->'debit_note'->>'is_validated', e.respuesta->'data'->'bill'->>'is_validated'))) then
    raise exception 'Este documento ya fue validado por la DIAN: no se elimina, se corrige con una nota.'; end if;
  if d.tipo = 'FV' then
    if exists (select 1 from documentos x where x.ref_id = p_id and x.estado <> 'borrador') then
      raise exception 'La factura tiene notas crédito o débito. Elimínalas primero.'; end if;
    if exists (select 1 from aplicaciones a join documentos r on r.id = a.recibo_id where a.factura_id = p_id and r.estado = 'emitido') then
      raise exception 'La factura tiene pagos. Anula primero los recibos de caja que la pagan.'; end if;
    -- Borradores de notas y pagos de recibos anulados o en borrador que apuntan a la factura.
    delete from documentos where ref_id = p_id and estado = 'borrador';
    delete from aplicaciones where factura_id = p_id;
  end if;
  if d.tipo = 'RC' then delete from aplicaciones where recibo_id = p_id; end if;
  delete from documentos where id = p_id;
  if d.numeracion_id is not null then
    update numeraciones set siguiente = d.numero where id = d.numeracion_id and siguiente = d.numero + 1 and d.numero >= desde;
  end if;
end $$;

revoke all on function public.eliminar_documento(uuid) from public, anon;
grant execute on function public.eliminar_documento(uuid) to authenticated;

-- Comprobantes contables y documentos de compra (FC, DS, CE) también se pueden eliminar.
drop policy if exists comprobantes_borrar on public.comprobantes;
create policy comprobantes_borrar on public.comprobantes for delete to authenticated using (public.puede_editar(empresa_id));
drop policy if exists compras_borrar on public.compras;
create policy compras_borrar on public.compras for delete to authenticated using (public.puede_editar(empresa_id));

-- Una factura de proveedor o documento soporte con egresos vigentes que la pagan no se elimina.
create or replace function public.compras_antes_de_borrar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.tipo <> 'CE' and exists (select 1 from compras e where e.empresa_id = old.empresa_id and e.tipo = 'CE' and e.estado <> 'anulado'
      and e.aplicaciones @> jsonb_build_array(jsonb_build_object('compra_id', old.id::text))) then
    raise exception 'Este documento tiene pagos. Elimina o anula primero el comprobante de egreso.'; end if;
  return old;
end $$;
drop trigger if exists compras_antes_de_borrar on public.compras;
create trigger compras_antes_de_borrar before delete on public.compras for each row execute function public.compras_antes_de_borrar();

/* ======================================================================
   029_planes_permisos.sql
   ====================================================================== */
-- 029: permisos por plan y planes por empresa.
-- Cada plan puede cobrar por empresa, limitar los documentos electrónicos del mes de cada empresa, los empleados de nómina
-- y apagar módulos (nómina, medios magnéticos, importar plantillas). Vacío (null) = sin límite.
-- Corre este archivo en Supabase › SQL Editor. Se puede correr más de una vez.

alter table public.planes add column if not exists por_empresa boolean not null default false;
alter table public.planes add column if not exists max_documentos_fe_mes integer check (max_documentos_fe_mes >= 0);
alter table public.planes add column if not exists max_empleados integer check (max_empleados >= 0);
alter table public.planes add column if not exists modulos jsonb not null default '{"nomina": true, "exogena": true, "importar": true}'::jsonb;

-- Plan vigente que manda sobre una empresa (el de su dueño). Null: sin límites (administrador, prueba gratis o cuenta sin plan).
create or replace function public.plan_de_empresa(p_eid uuid) returns public.planes
language sql stable security definer set search_path = public as $$
  select pl.* from empresas e join perfiles p on p.id = e.owner join planes pl on pl.id = p.plan_id
  where e.id = p_eid and not p.es_admin;
$$;
revoke all on function public.plan_de_empresa(uuid) from public, anon, authenticated;

-- Documentos electrónicos (facturas y notas) guardados en el mes en curso por una empresa (los anulados también cuentan: ya se gastaron).
create or replace function public.documentos_fe_mes(p_eid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from documentos
  where empresa_id = p_eid and electronica and estado <> 'borrador' and tipo in ('FV', 'NC', 'ND')
    and date_trunc('month', fecha) = date_trunc('month', public.hoy_co());
$$;
revoke all on function public.documentos_fe_mes(uuid) from public, anon, authenticated;

-- Tope de documentos electrónicos: cuenta al guardar (pasar a emitido) una factura o nota electrónica.
create or replace function public.limite_fe() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes;
begin
  if not (new.electronica and new.tipo in ('FV', 'NC', 'ND') and new.estado = 'emitido' and (tg_op = 'INSERT' or old.estado is distinct from 'emitido')) then return new; end if;
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is not null and pl.max_documentos_fe_mes is not null and public.documentos_fe_mes(new.empresa_id) >= pl.max_documentos_fe_mes then
    raise exception 'Llegaste a los % documentos electrónicos de este mes del plan %. Sube de plan en Mi plan para seguir facturando electrónicamente.', pl.max_documentos_fe_mes, pl.nombre; end if;
  return new;
end $$;
drop trigger if exists documentos_limite_fe on public.documentos;
create trigger documentos_limite_fe before insert or update of estado on public.documentos for each row execute function public.limite_fe();

-- Nómina: el módulo tiene que estar en el plan, y los empleados activos no pasan del tope.
create or replace function public.limite_nomina() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes; n integer;
begin
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is null then return new; end if;
  if coalesce(pl.modulos->>'nomina', 'true') = 'false' then
    raise exception 'El plan % no incluye nómina. Sube de plan en Mi plan.', pl.nombre; end if;
  if tg_table_name = 'empleados' and pl.max_empleados is not null and new.activo and (tg_op = 'INSERT' or not old.activo) then
    select count(*) into n from empleados where empresa_id = new.empresa_id and activo and id <> new.id;
    if n >= pl.max_empleados then raise exception 'El plan % permite % empleado(s) activo(s) por empresa. Sube de plan en Mi plan.', pl.nombre, pl.max_empleados; end if;
  end if;
  return new;
end $$;
drop trigger if exists empleados_limite on public.empleados;
create trigger empleados_limite before insert or update of activo on public.empleados for each row execute function public.limite_nomina();
drop trigger if exists nominas_limite on public.nominas;
create trigger nominas_limite before insert on public.nominas for each row execute function public.limite_nomina();

-- Uso de una empresa frente a su plan (para Mi plan).
create or replace function public.uso_empresa(p_eid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.puede_ver(p_eid) then raise exception 'Empresa no encontrada.'; end if;
  return jsonb_build_object(
    'documentos_fe_mes', public.documentos_fe_mes(p_eid),
    'empleados', (select count(*) from empleados where empresa_id = p_eid and activo),
    'plan', (select to_jsonb(pl) from public.plan_de_empresa(p_eid) pl where pl.id is not null));
end $$;
revoke all on function public.uso_empresa(uuid) from public, anon;
grant execute on function public.uso_empresa(uuid) to authenticated;

-- Planes por documentos electrónicos (precio por empresa, firma digital incluida). Solo se crean si no existen.
insert into public.planes (nombre, precio_mensual, por_empresa, max_empresas, max_documentos_mes, max_documentos_fe_mes, max_usuarios, max_empleados, modulos, descripcion, orden)
select v.* from (values
  ('Emprendedor', 39900::numeric, true, null::int, null::int, 30, 1, 0, '{"nomina": false, "exogena": false, "importar": false}'::jsonb, 'Para empezar a facturar: 30 documentos electrónicos al mes, firma digital incluida.', 10),
  ('Pyme', 79900, true, null, null, 100, 2, 5, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '100 documentos electrónicos al mes, nómina hasta 5 empleados y medios magnéticos.', 11),
  ('Empresa', 129900, true, null, null, 300, 5, 25, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '300 documentos electrónicos al mes, nómina hasta 25 empleados y 5 usuarios.', 12),
  ('Empresa Plus', 209900, true, null, null, 1000, null, null, '{"nomina": true, "exogena": true, "importar": true}'::jsonb, '1.000 documentos electrónicos al mes, usuarios y nómina sin límite.', 13)
) as v(nombre, precio_mensual, por_empresa, max_empresas, max_documentos_mes, max_documentos_fe_mes, max_usuarios, max_empleados, modulos, descripcion, orden)
where not exists (select 1 from public.planes p where lower(p.nombre) = lower(v.nombre));

notify pgrst, 'reload schema';

/* ======================================================================
   030_planes_v2.sql
   ====================================================================== */
-- 030: planes v2 (Emprendedor, Pyme, Empresa), ajustados a lo que AGAsoft hace hoy.
-- Precios mensuales sin IVA y por empresa. El cliente compra su propio paquete de Factus, por eso no hay tope
-- de documentos electrónicos en AGAsoft. Nuevos módulos: informes (ventas y cartera), avanzados (informes avanzados
-- y exportar a Excel) y consulta (usuarios de solo consulta). Empresa Plus deja de ofrecerse.
-- max_usuarios = personas a las que el dueño da acceso (sin contarlo a él): 1 usuario = 0, 3 usuarios = 2.
-- Corre este archivo en Supabase › SQL Editor después del 029. Se puede correr más de una vez.

insert into public.planes (nombre, precio_mensual, por_empresa, orden, descripcion)
select v.nombre, v.precio, true, v.orden, '' from (values ('Emprendedor', 31000::numeric, 10), ('Pyme', 69000, 11), ('Empresa', 129900, 12)) as v(nombre, precio, orden)
where not exists (select 1 from public.planes p where lower(p.nombre) = lower(v.nombre));

update public.planes set precio_mensual = 31000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = 0, max_empleados = 0, activo = true, orden = 10,
  modulos = '{"nomina": false, "exogena": false, "importar": false, "informes": false, "avanzados": false, "consulta": false}'::jsonb,
  descripcion = 'Para facturar electrónicamente y llevar la contabilidad básica. 1 usuario.'
where lower(nombre) = 'emprendedor';

update public.planes set precio_mensual = 69000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = 2, max_empleados = 5, activo = true, orden = 11,
  modulos = '{"nomina": true, "exogena": true, "importar": true, "informes": true, "avanzados": false, "consulta": true}'::jsonb,
  descripcion = 'Suma nómina hasta 5 empleados, medios magnéticos, importar de Excel e informes de ventas y cartera. 3 usuarios.'
where lower(nombre) = 'pyme';

update public.planes set precio_mensual = 119000, por_empresa = true, max_empresas = null, max_documentos_mes = null, max_documentos_fe_mes = null,
  max_usuarios = null, max_empleados = null, activo = true, orden = 12,
  modulos = '{"nomina": true, "exogena": true, "importar": true, "informes": true, "avanzados": true, "consulta": true}'::jsonb,
  descripcion = 'Todo AGAsoft: informes avanzados, exportar a Excel, nómina y usuarios sin límite.'
where lower(nombre) = 'empresa';

-- Se dejan de ofrecer (las cuentas que ya los tienen los conservan hasta que les cambies el plan).
update public.planes set activo = false where lower(nombre) in ('empresa plus', 'básico', 'basico', 'profesional', 'contador');

-- Usuarios de solo consulta: solo si el plan los incluye.
create or replace function public.limite_consulta() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes;
begin
  if new.rol <> 'consulta' or (tg_op = 'UPDATE' and old.rol = 'consulta') then return new; end if;
  pl := public.plan_de_empresa(new.empresa_id);
  if pl.id is not null and coalesce(pl.modulos->>'consulta', 'true') = 'false' then
    raise exception 'El plan % no incluye usuarios de solo consulta. Sube de plan en Mi plan.', pl.nombre; end if;
  return new;
end $$;
drop trigger if exists miembros_consulta on public.miembros;
create trigger miembros_consulta before insert or update of rol on public.miembros for each row execute function public.limite_consulta();

notify pgrst, 'reload schema';

/* ======================================================================
   031_notificaciones.sql
   ====================================================================== */
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

/* ======================================================================
   032_inventario.sql
   ====================================================================== */
-- AGAsoft 032: inventario, entrega 1.
--  - Productos y servicios: tipo (los productos son inventariables, los servicios no), cuenta de costo de ventas y bodega por defecto.
--  - Bodegas: cada una con su cuenta auxiliar de la clase 14 (los traslados entre bodegas se contabilizan entre cuentas 14).
--  - Las líneas de compra por producto se guardan en compras.lineas (producto_id, bodega_id, cantidad, costo): no cambia la tabla.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.bodegas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  cuenta text not null check (cuenta ~ '^14[0-9]{6}$'),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists bodegas_empresa on public.bodegas (empresa_id);

alter table public.productos add column if not exists tipo text not null default 'producto';
alter table public.productos drop constraint if exists productos_tipo_check;
alter table public.productos add constraint productos_tipo_check check (tipo in ('producto', 'servicio'));
alter table public.productos add column if not exists cuenta_costo text not null default '';
alter table public.productos add column if not exists bodega_id uuid references public.bodegas(id) on delete set null;

-- Las bodegas se ven y se editan como los demás datos de la empresa; no se borran si tienen movimientos (se desactivan).
alter table public.bodegas enable row level security;
drop policy if exists bodegas_ver on public.bodegas;
create policy bodegas_ver on public.bodegas for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists bodegas_crear on public.bodegas;
create policy bodegas_crear on public.bodegas for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists bodegas_editar on public.bodegas;
create policy bodegas_editar on public.bodegas for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

/* ======================================================================
   033_inventario_docs.sql
   ====================================================================== */
-- AGAsoft 033: inventario, entrega 2. Documentos de inventario: AI ajuste de inventario (inventario inicial, conteo físico,
-- faltantes y sobrantes) y, en la siguiente entrega, TR traslado entre bodegas.
-- El costo de ventas de las facturas y las devoluciones de las notas crédito se calculan en la app con el método de la empresa
-- (promedio ponderado o PEPS) desde los documentos, igual que el resto de la contabilidad: no se guardan aparte.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.inventario_docs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('AI', 'TR')),
  numero bigint not null,
  fecha date not null default current_date,
  tercero_id uuid references public.terceros(id),
  concepto text not null default '',
  -- AI: cuenta contrapartida del ajuste. TR: no aplica.
  cuenta_contra text not null default '',
  -- AI: [{producto_id, bodega_id, sentido: entrada|salida, cantidad, costo}]   TR: [{producto_id, bodega_id, bodega_destino, cantidad}]
  lineas jsonb not null default '[]'::jsonb,
  observaciones text not null default '',
  estado text not null default 'contabilizado' check (estado in ('contabilizado', 'anulado')),
  anulado_motivo text not null default '',
  anulado_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists inventario_docs_empresa on public.inventario_docs (empresa_id, fecha);

create or replace function public.validar_inventario_doc() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'anulado' then raise exception 'Un documento de inventario anulado no se puede modificar.'; end if;
  if jsonb_array_length(new.lineas) = 0 then raise exception 'El documento necesita al menos un producto.'; end if;
  if new.tipo = 'AI' and new.cuenta_contra !~ '^[0-9]{8}$' then raise exception 'Escoge la cuenta contrapartida del ajuste (auxiliar de 8 dígitos).'; end if;
  if new.tipo = 'AI' and new.tercero_id is null then raise exception 'Escoge el tercero del ajuste.'; end if;
  return new;
end $$;
drop trigger if exists inventario_docs_validar on public.inventario_docs;
create trigger inventario_docs_validar before insert or update on public.inventario_docs for each row execute function public.validar_inventario_doc();

alter table public.inventario_docs enable row level security;
drop policy if exists inventario_docs_ver on public.inventario_docs;
create policy inventario_docs_ver on public.inventario_docs for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists inventario_docs_crear on public.inventario_docs;
create policy inventario_docs_crear on public.inventario_docs for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists inventario_docs_editar on public.inventario_docs;
create policy inventario_docs_editar on public.inventario_docs for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists inventario_docs_borrar on public.inventario_docs;
create policy inventario_docs_borrar on public.inventario_docs for delete to authenticated using (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

/* ======================================================================
   034_centros_costo.sql
   ====================================================================== */
-- AGAsoft 034: centros de costo.
-- Hasta 3 niveles independientes por empresa (los nombra la empresa, por ejemplo Máquinas y Obras). La configuración
-- (activo, alcance: 'resultado' o 'todo', nombres y niveles habilitados) se guarda en empresas.contabilidad->'cc'.
-- Cada línea contable lleva cc1, cc2 y cc3 (id del centro de cada nivel). El nivel 1 es obligatorio en las cuentas del alcance.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.centros_costo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nivel smallint not null check (nivel between 1 and 3),
  codigo text not null check (length(trim(codigo)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, nivel, codigo)
);
create index if not exists centros_costo_empresa on public.centros_costo (empresa_id);

alter table public.centros_costo enable row level security;
drop policy if exists centros_costo_ver on public.centros_costo;
create policy centros_costo_ver on public.centros_costo for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists centros_costo_crear on public.centros_costo;
create policy centros_costo_crear on public.centros_costo for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists centros_costo_editar on public.centros_costo;
create policy centros_costo_editar on public.centros_costo for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));

-- Ningún comprobante se guarda si una línea de una cuenta del alcance no tiene el centro de costo del nivel 1.
create or replace function public.validar_cc_comprobante() returns trigger
language plpgsql set search_path = public as $$
declare cfg jsonb; l jsonb; i int := 0;
begin
  if new.estado = 'anulado' then return new; end if;
  select contabilidad->'cc' into cfg from empresas where id = new.empresa_id;
  if cfg is null or coalesce((cfg->>'activo')::boolean, false) = false then return new; end if;
  for l in select * from jsonb_array_elements(coalesce(new.lineas, '[]'::jsonb)) loop
    i := i + 1;
    if (coalesce(cfg->>'alcance', 'resultado') = 'todo' or coalesce(l->>'cuenta', '') ~ '^[4-7]')
       and coalesce(l->>'cc1', '') = '' and (coalesce((l->>'debito')::numeric, 0) <> 0 or coalesce((l->>'credito')::numeric, 0) <> 0) then
      raise exception 'Línea %: la cuenta % lleva centro de costo y no lo tiene.', i, l->>'cuenta';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists comprobantes_validar_cc on public.comprobantes;
create trigger comprobantes_validar_cc before insert or update on public.comprobantes for each row execute function public.validar_cc_comprobante();

notify pgrst, 'reload schema';

/* ======================================================================
   035_centros_documentos.sql
   ====================================================================== */
-- AGAsoft 035: centros de costo en facturas, notas, recibos, compras, nómina e inventario.
-- Cada documento lleva un centro general (cc) y cada línea puede cambiarlo; productos y empleados traen su distribución.
-- Una distribución es una lista [{"cc1": id, "cc2": id, "cc3": id, "pct": 100}] (varias partes = reparto por porcentajes).
-- Requiere 034_centros_costo.sql. Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.documentos add column if not exists cc jsonb not null default '[]'::jsonb;
alter table public.items add column if not exists cc jsonb not null default '[]'::jsonb;
alter table public.compras add column if not exists cc jsonb not null default '[]'::jsonb;
alter table public.productos add column if not exists cc jsonb not null default '[]'::jsonb;
alter table public.empleados add column if not exists cc jsonb not null default '[]'::jsonb;
alter table public.inventario_docs add column if not exists cc jsonb not null default '[]'::jsonb;

-- Guardar factura, nota o recibo: igual que antes, ahora con el centro general y el de cada línea.
create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    -- Los electrónicos se pueden modificar mientras no los haya aceptado la DIAN; aceptados se corrigen con una nota.
    if d.estado = 'emitido' and d.electronica and exists (select 1 from fe_envios e where e.documento_id = did and e.estado = 'aceptado') then
      raise exception 'Este documento ya fue aceptado por la DIAN: no se modifica, se corrige con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', d.electronica, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, retenciones, ref_id, concepto, observaciones, cc,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), coalesce(d.retenciones, '{}'::jsonb), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.cc, '[]'::jsonb), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), retenciones = coalesce(d.retenciones, '{}'::jsonb), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''), cc = coalesce(d.cc, '[]'::jsonb),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta, cc)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), ''), coalesce(x->'cc', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;
notify pgrst, 'reload schema';

/* ======================================================================
   036_bodega_ventas.sql
   ====================================================================== */
-- AGAsoft 036: bodega en cada línea de factura y nota, y bodegas que no venden.
-- items.bodega_id: de qué bodega sale (factura) o a cuál vuelve (nota crédito) el producto. Vacío = la bodega del producto.
-- bodegas.vende: false = la bodega solo almacena (no se escoge en facturas; la mercancía se traslada a una bodega que vende).
-- Requiere 035_centros_documentos.sql. Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

alter table public.items add column if not exists bodega_id uuid references public.bodegas(id) on delete set null;
alter table public.bodegas add column if not exists vende boolean not null default true;

-- Guardar factura, nota o recibo: igual que 035, ahora con la bodega de cada línea.
create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    -- Los electrónicos se pueden modificar mientras no los haya aceptado la DIAN; aceptados se corrigen con una nota.
    if d.estado = 'emitido' and d.electronica and exists (select 1 from fe_envios e where e.documento_id = did and e.estado = 'aceptado') then
      raise exception 'Este documento ya fue aceptado por la DIAN: no se modifica, se corrige con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', d.electronica, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, retenciones, ref_id, concepto, observaciones, cc,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), coalesce(d.retenciones, '{}'::jsonb), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.cc, '[]'::jsonb), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), retenciones = coalesce(d.retenciones, '{}'::jsonb), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''), cc = coalesce(d.cc, '[]'::jsonb),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta, cc, bodega_id)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), ''), coalesce(x->'cc', '[]'::jsonb), nullif(x->>'bodega_id', '')::uuid
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;
notify pgrst, 'reload schema';

/* ======================================================================
   037_operacion.sql
   ====================================================================== */
-- AGAsoft 037: Operación (módulo opcional por empresa).
-- Registros operativos que NO generan movimientos contables: horas máquina, viajes, jornales, servicios…
-- Cada empresa arma sus tipos de operación (op_tipos.config: listas, campos, fórmulas, tarifas por, reglas y salidas).
-- Ninguna tabla tiene columnas de una actividad: lo propio de cada empresa va en jsonb (datos, criterios, config).
-- Se activa por empresa en Configuración › Operación (empresas.contabilidad->'operacion'->'activo').
-- Los cierres (documento soporte, factura desde cotización) llegan en entregas siguientes; op_cortes y las columnas
-- cierre_* quedan creadas desde ya para no pedir otro SQL.
-- Se puede correr más de una vez. Ejecutar en Supabase: SQL Editor > New query > pegar > Run.

create table if not exists public.op_tipos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  plantilla text not null default 'libre',
  config jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);
create index if not exists op_tipos_empresa on public.op_tipos (empresa_id);

-- Elementos de las listas de cada tipo (equipos, obras, vehículos, rutas, lotes…).
create table if not exists public.op_elementos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id uuid not null references public.op_tipos(id) on delete cascade,
  lista text not null,
  codigo text not null default '',
  nombre text not null check (length(trim(nombre)) > 0),
  datos jsonb not null default '{}'::jsonb,
  tercero_id uuid references public.terceros(id),
  centro_id uuid references public.centros_costo(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists op_elementos_tipo on public.op_elementos (empresa_id, tipo_id, lista);

-- Tarifas con vigencia. criterios = {tercero: uuid, equipo: uuid, …} (vacío = aplica a todos). La más específica gana.
create table if not exists public.op_tarifas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id uuid not null references public.op_tipos(id) on delete cascade,
  uso text not null default 'pago' check (uso in ('pago', 'cobro')),
  criterios jsonb not null default '{}'::jsonb,
  modo text not null default 'unidad' check (modo in ('unidad', 'registro', 'fijo')),
  valor numeric(18,2) not null check (valor > 0),
  desde date,
  hasta date,
  producto_id uuid references public.productos(id),
  nota text not null default '',
  creado_en timestamptz not null default now(),
  check (hasta is null or desde is null or hasta >= desde)
);
create index if not exists op_tarifas_tipo on public.op_tarifas (empresa_id, tipo_id);

-- Cortes (liquidación de un periodo). Se usan desde la entrega 2.
create table if not exists public.op_cortes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id uuid not null references public.op_tipos(id) on delete cascade,
  desde date not null,
  hasta date not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrado')),
  volantes jsonb not null default '[]'::jsonb,
  generados jsonb not null default '[]'::jsonb,
  creado_en timestamptz not null default now(),
  check (hasta >= desde)
);
create index if not exists op_cortes_tipo on public.op_cortes (empresa_id, tipo_id, desde);

-- Cada anotación. datos = valores de los campos del tipo; cantidad y valor se calculan con la configuración.
-- cierre_pago (DS o nómina) y cierre_cobro (factura) son dos cierres independientes de las mismas horas.
create table if not exists public.op_registros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_id uuid not null references public.op_tipos(id) on delete cascade,
  fecha date not null,
  tercero_id uuid not null references public.terceros(id),
  datos jsonb not null default '{}'::jsonb,
  cantidad_pagada numeric(14,2),
  nota text not null default '',
  clase text not null default 'registro' check (clase in ('registro', 'cargo')),
  corte_id uuid references public.op_cortes(id) on delete set null,
  cotizacion_id uuid,
  cierre_pago uuid,
  cierre_cobro uuid,
  creado_en timestamptz not null default now()
);
create index if not exists op_registros_tipo on public.op_registros (empresa_id, tipo_id, fecha);

-- Un registro de un corte cerrado o ya cerrado (pagado o facturado) no se cambia ni se borra.
create or replace function public.validar_op_registro() returns trigger
language plpgsql set search_path = public as $$
declare c text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.cierre_pago is not null or old.cierre_cobro is not null then
      if tg_op = 'DELETE' or new.datos is distinct from old.datos or new.fecha is distinct from old.fecha or new.tercero_id is distinct from old.tercero_id or new.cantidad_pagada is distinct from old.cantidad_pagada then
        raise exception 'Este registro ya se pagó o se facturó: no se puede cambiar.';
      end if;
    end if;
    select estado into c from public.op_cortes where id = old.corte_id;
    if c = 'cerrado' and (tg_op = 'DELETE' or new.datos is distinct from old.datos or new.fecha is distinct from old.fecha or new.cantidad_pagada is distinct from old.cantidad_pagada) then
      raise exception 'El registro pertenece a un corte cerrado.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists op_registros_validar on public.op_registros;
create trigger op_registros_validar before update or delete on public.op_registros for each row execute function public.validar_op_registro();

do $$ declare t text; begin
  foreach t in array array['op_tipos', 'op_elementos', 'op_tarifas', 'op_cortes', 'op_registros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.puede_ver(empresa_id))', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_crear', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.puede_editar(empresa_id))', t || '_crear', t);
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id))', t || '_editar', t);
    execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.puede_editar(empresa_id))', t || '_borrar', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

/* ======================================================================
   038_cotizaciones.sql
   ====================================================================== */
-- Cotizaciones (Ventas). No mueven contabilidad: fijan el precio de cobro.
-- Una cotización puede amarrarse a un tipo de Operación y a elementos (obra, equipo…): las horas de esos
-- registros se facturan desde Operación con el precio de la línea que coincida.
-- Requiere 037_operacion.sql. Correr una vez en el SQL Editor de Supabase.

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  numero bigint not null,
  fecha date not null default current_date,
  vence date,
  tercero_id uuid not null references public.terceros(id),
  estado text not null default 'abierta' check (estado in ('abierta', 'aceptada', 'rechazada', 'cerrada')),
  op_tipo_id uuid references public.op_tipos(id) on delete set null,
  -- {campo: elemento_id}: solo los registros con esos elementos se cobran con esta cotización.
  criterios jsonb not null default '{}'::jsonb,
  -- [{producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, op, criterios}]
  lineas jsonb not null default '[]'::jsonb,
  observaciones text not null default '',
  condiciones text not null default '',
  bruto numeric(16,2) not null default 0,
  descuento numeric(16,2) not null default 0,
  base numeric(16,2) not null default 0,
  iva numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  creado_por uuid default auth.uid() references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index if not exists cotizaciones_empresa on public.cotizaciones (empresa_id, fecha);

alter table public.cotizaciones enable row level security;
drop policy if exists cotizaciones_ver on public.cotizaciones;
create policy cotizaciones_ver on public.cotizaciones for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists cotizaciones_crear on public.cotizaciones;
create policy cotizaciones_crear on public.cotizaciones for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists cotizaciones_editar on public.cotizaciones;
create policy cotizaciones_editar on public.cotizaciones for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists cotizaciones_borrar on public.cotizaciones;
create policy cotizaciones_borrar on public.cotizaciones for delete to authenticated using (public.puede_editar(empresa_id));

-- El registro de Operación apunta a su cotización (opcional: si no, se busca por obra/equipo).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'op_registros_cotizacion_fk') then
    alter table public.op_registros add constraint op_registros_cotizacion_fk foreign key (cotizacion_id) references public.cotizaciones(id) on delete set null;
  end if;
end $$;

notify pgrst, 'reload schema';

/* ======================================================================
   039_op_ajuste.sql
   ====================================================================== */
-- Operación: la cotización es el proyecto. Ajuste adicional al operador por unidad (p. ej. +$1.000 la hora)
-- que se suma a su tarifa de programación solo en los registros de ese proyecto.
-- Requiere 038_cotizaciones.sql. Correr una vez en el SQL Editor de Supabase.
alter table public.cotizaciones add column if not exists ajuste_op numeric(16,2) not null default 0 check (ajuste_op >= 0);
notify pgrst, 'reload schema';

/* ======================================================================
   040_documento_soporte_electronico.sql
   ====================================================================== */
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

/* ======================================================================
   041_nomina_electronica.sql
   ====================================================================== */
-- AGAsoft 041: nómina electrónica (DIAN por Factus).
--  - nominas_e: un documento por empleado y mes. tipo 'NIE' = nómina individual electrónica,
--    'NIAE' = nota de ajuste que elimina una NIE validada (ref_id = la NIE).
--  - body guarda lo que se envió (devengados, deducciones, horas) para consultarlo después.
--  - fe_envios.nomina_e_id: los envíos quedan en el mismo historial que facturas y documentos soporte.
--  - Una NIE o NIAE validada por la DIAN no se modifica ni se elimina.
-- Requiere 019_nomina.sql, 023_facturacion_electronica.sql y 040_documento_soporte_electronico.sql. Se puede correr más de una vez.
-- Ejecutar en Supabase: SQL Editor > New query > pegar > Run. Después redesplegar la función fe-factus.

create table if not exists public.nominas_e (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null default 'NIE' check (tipo in ('NIE', 'NIAE')),
  numero bigint not null,
  anio int not null check (anio between 2000 and 2100),
  mes int not null check (mes between 1 and 12),
  empleado_id uuid references public.empleados(id) on delete restrict,
  tercero_id uuid not null references public.terceros(id),
  ref_id uuid references public.nominas_e(id) on delete restrict,
  body jsonb not null default '{}'::jsonb,
  devengado numeric(18,2) not null default 0,
  deducciones numeric(18,2) not null default 0,
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, numero)
);
create index if not exists nominas_e_empresa on public.nominas_e (empresa_id, anio, mes);

alter table public.fe_envios add column if not exists nomina_e_id uuid references public.nominas_e(id) on delete cascade;
alter table public.fe_envios drop constraint if exists fe_envios_origen;
alter table public.fe_envios add constraint fe_envios_origen check (documento_id is not null or compra_id is not null or nomina_e_id is not null);
create index if not exists fe_envios_nomina_e on public.fe_envios (nomina_e_id);

create or replace function public.nomina_e_validada(nid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from fe_envios e where e.nomina_e_id = nid and e.estado = 'aceptado');
$$;

create or replace function public.nominas_e_proteger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Al borrar la empresa entera (cascada) no se bloquea.
  if tg_op = 'DELETE' and not exists (select 1 from empresas x where x.id = old.empresa_id) then return old; end if;
  if tg_op in ('UPDATE', 'DELETE') and public.nomina_e_validada(old.id) then
    raise exception 'La DIAN ya validó esta nómina electrónica: no se puede modificar ni eliminar. Corrígela con una nota de ajuste.'; end if;
  if tg_op in ('INSERT', 'UPDATE') and new.tipo = 'NIAE' and (new.ref_id is null or not exists (
      select 1 from nominas_e r where r.id = new.ref_id and r.empresa_id = new.empresa_id and r.tipo = 'NIE' and public.nomina_e_validada(r.id))) then
    raise exception 'La nota de ajuste debe referirse a una nómina electrónica validada por la DIAN.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists nominas_e_proteger on public.nominas_e;
create trigger nominas_e_proteger before insert or update or delete on public.nominas_e for each row execute function public.nominas_e_proteger();

alter table public.nominas_e enable row level security;
drop policy if exists nominas_e_ver on public.nominas_e;
create policy nominas_e_ver on public.nominas_e for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists nominas_e_crear on public.nominas_e;
create policy nominas_e_crear on public.nominas_e for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists nominas_e_editar on public.nominas_e;
create policy nominas_e_editar on public.nominas_e for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists nominas_e_borrar on public.nominas_e;
create policy nominas_e_borrar on public.nominas_e for delete to authenticated using (public.puede_editar(empresa_id));

notify pgrst, 'reload schema';

/* ======================================================================
   042_trasladar_cuenta.sql
   ====================================================================== */
-- 042: Trasladar movimientos de una cuenta auxiliar a otra (reescribe la historia).
-- Cambia la cuenta en todos los documentos de la empresa (facturas, notas, recibos, compras, egresos,
-- comprobantes, nómina, inventario) y en su configuración (parámetros, tarifas, retenciones, formas de pago,
-- productos y bodegas). Solo el dueño de la empresa (o el administrador). Correr una vez en Supabase.

-- Mientras corre el traslado, las validaciones de edición dejan pasar el cambio de cuenta
-- (documentos validados por la DIAN: la cuenta contable no va en el XML, así que no se altera lo enviado).
create or replace function public.en_traslado() returns boolean
language sql stable as $$ select coalesce(current_setting('agasoft.traslado', true), '') = '1' $$;

create or replace function public.editar_guardado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.en_traslado() then return new; end if;
  if old.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
  return new;
end $$;

create or replace function public.compras_antes_de_cambiar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.en_traslado() then return new; end if;
  if old.electronica and public.compra_validada(old.id) then
    raise exception 'La DIAN ya validó este documento: no se puede modificar ni anular. Corrígelo con una nota de ajuste.'; end if;
  if new.tipo = 'NA' then
    if new.ref_id is null or not exists (select 1 from compras d where d.id = new.ref_id and d.empresa_id = new.empresa_id and d.tipo = 'DS' and d.tercero_id = new.tercero_id) then
      raise exception 'La nota de ajuste debe referirse a un documento soporte del mismo proveedor.'; end if;
  end if;
  return new;
end $$;

create or replace function public.trasladar_cuenta(p_empresa uuid, p_desde text, p_hasta text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a text := '"' || p_desde || '"';
  b text := '"' || p_hasta || '"';
  n int := 0; k int;
begin
  if not public.es_dueno(p_empresa) then raise exception 'Solo el dueño de la empresa puede trasladar movimientos.'; end if;
  if p_desde !~ '^[0-9]{8}$' or p_hasta !~ '^[0-9]{8}$' or p_desde = p_hasta then
    raise exception 'Escoge dos cuentas auxiliares distintas de 8 dígitos.'; end if;
  if not exists (select 1 from cuentas where empresa_id = p_empresa and codigo = p_hasta and activa) then
    raise exception 'La cuenta % no existe o está inactiva.', p_hasta; end if;
  if exists (select 1 from bodegas where empresa_id = p_empresa and cuenta = p_desde) and p_hasta !~ '^14' then
    raise exception 'La cuenta % es de una bodega: la cuenta nueva debe ser de la clase 14.', p_desde; end if;

  perform set_config('agasoft.traslado', '1', true);

  update items set cuenta = p_hasta where empresa_id = p_empresa and cuenta = p_desde;
  get diagnostics k = row_count; n := n + k;

  update documentos set
    cuenta_pago = case when cuenta_pago = p_desde then p_hasta else cuenta_pago end,
    retenciones = replace(retenciones::text, a, b)::jsonb
  where empresa_id = p_empresa and (cuenta_pago = p_desde or strpos(retenciones::text, a) > 0);
  get diagnostics k = row_count; n := n + k;

  update compras set
    lineas = replace(lineas::text, a, b)::jsonb,
    aplicaciones = replace(aplicaciones::text, a, b)::jsonb,
    retenciones = replace(retenciones::text, a, b)::jsonb,
    cuenta_pago = case when cuenta_pago = p_desde then p_hasta else cuenta_pago end,
    cuenta_retefuente = case when cuenta_retefuente = p_desde then p_hasta else cuenta_retefuente end
  where empresa_id = p_empresa and estado <> 'anulado'
    and (strpos(lineas::text, a) > 0 or strpos(aplicaciones::text, a) > 0 or strpos(retenciones::text, a) > 0 or cuenta_pago = p_desde or cuenta_retefuente = p_desde);
  get diagnostics k = row_count; n := n + k;

  update comprobantes set lineas = replace(lineas::text, a, b)::jsonb
  where empresa_id = p_empresa and estado <> 'anulado' and strpos(lineas::text, a) > 0;
  get diagnostics k = row_count; n := n + k;

  update nominas set
    lineas = replace(lineas::text, a, b)::jsonb,
    cuenta_neto = case when cuenta_neto = p_desde then p_hasta else cuenta_neto end
  where empresa_id = p_empresa and estado <> 'anulado' and (strpos(lineas::text, a) > 0 or cuenta_neto = p_desde);
  get diagnostics k = row_count; n := n + k;

  update inventario_docs set cuenta_contra = p_hasta where empresa_id = p_empresa and cuenta_contra = p_desde;
  get diagnostics k = row_count; n := n + k;

  update productos set
    cuenta_ingreso = case when cuenta_ingreso = p_desde then p_hasta else cuenta_ingreso end,
    cuenta_devolucion = case when cuenta_devolucion = p_desde then p_hasta else cuenta_devolucion end,
    cuenta_costo = case when cuenta_costo = p_desde then p_hasta else cuenta_costo end
  where empresa_id = p_empresa and p_desde in (cuenta_ingreso, cuenta_devolucion, cuenta_costo);
  get diagnostics k = row_count; n := n + k;

  update bodegas set cuenta = p_hasta where empresa_id = p_empresa and cuenta = p_desde;
  get diagnostics k = row_count; n := n + k;

  -- Configuración de la empresa: parámetros, tarifas de IVA, retenciones, formas de pago y versiones anteriores.
  update empresas set contabilidad = replace(contabilidad::text, a, b)::jsonb
  where id = p_empresa and strpos(contabilidad::text, a) > 0;

  return jsonb_build_object('registros', n);
end $$;

revoke all on function public.trasladar_cuenta(uuid, text, text) from public, anon;
grant execute on function public.trasladar_cuenta(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';

/* ======================================================================
   043_bloqueo_periodos.sql
   ====================================================================== */
-- 043: Bloqueo de periodos (no es el comprobante de cierre de cuentas).
-- Cada empresa tiene "bloqueado_hasta": ningún documento con fecha hasta ese día se crea, modifica, anula ni elimina.
-- Solo el dueño lo cambia, con la función bloquear_periodo, y queda registrado quién y cuándo. Correr una vez en Supabase.

alter table public.empresas add column if not exists bloqueado_hasta date;

create table if not exists public.bloqueos_log (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  hasta date,
  anterior date,
  usuario uuid default auth.uid(),
  correo text not null default coalesce(auth.jwt()->>'email', ''),
  en timestamptz not null default now()
);
create index if not exists bloqueos_log_empresa on public.bloqueos_log (empresa_id, en desc);
alter table public.bloqueos_log enable row level security;
drop policy if exists bloqueos_log_ver on public.bloqueos_log;
create policy bloqueos_log_ver on public.bloqueos_log for select to authenticated using (public.puede_ver(empresa_id));

-- La fecha de bloqueo solo cambia por bloquear_periodo (no con un guardado normal de la empresa).
create or replace function public.empresas_bloqueo() returns trigger
language plpgsql as $$
begin
  if new.bloqueado_hasta is distinct from old.bloqueado_hasta and coalesce(current_setting('agasoft.bloqueo', true), '') <> '1' then
    new.bloqueado_hasta := old.bloqueado_hasta;
  end if;
  return new;
end $$;
drop trigger if exists empresas_bloqueo on public.empresas;
create trigger empresas_bloqueo before update on public.empresas for each row execute function public.empresas_bloqueo();

create or replace function public.bloquear_periodo(p_empresa uuid, p_hasta date) returns void
language plpgsql security definer set search_path = public as $$
declare ant date;
begin
  if not public.es_dueno(p_empresa) then raise exception 'Solo el dueño de la empresa puede bloquear o desbloquear periodos.'; end if;
  select bloqueado_hasta into ant from empresas where id = p_empresa;
  perform set_config('agasoft.bloqueo', '1', true);
  update empresas set bloqueado_hasta = p_hasta where id = p_empresa;
  insert into bloqueos_log (empresa_id, hasta, anterior) values (p_empresa, p_hasta, ant);
end $$;
revoke all on function public.bloquear_periodo(uuid, date) from public, anon;
grant execute on function public.bloquear_periodo(uuid, date) to authenticated;

-- Revisa la fila vieja (editar, anular, eliminar) y la nueva (crear, editar). Los borradores de ventas no cuentan.
create or replace function public.revisar_bloqueo() returns trigger
language plpgsql security definer set search_path = public as $$
declare h date; e uuid; f date;
begin
  if public.en_traslado() then return coalesce(new, old); end if;
  e := case when tg_op = 'DELETE' then old.empresa_id else new.empresa_id end;
  select bloqueado_hasta into h from empresas where id = e;
  if h is null then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' and old.fecha <= h and not (tg_table_name = 'documentos' and old.estado = 'borrador') then
    f := old.fecha;
  elsif tg_op <> 'DELETE' and new.fecha <= h and not (tg_table_name = 'documentos' and new.estado = 'borrador') then
    f := new.fecha;
  end if;
  if f is not null then
    raise exception 'El periodo está bloqueado hasta el %: no se puede crear, modificar, anular ni eliminar un documento con fecha %. El dueño puede desbloquearlo en Configuración › Bloqueo de periodos.', to_char(h, 'DD/MM/YYYY'), to_char(f, 'DD/MM/YYYY');
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['documentos', 'compras', 'comprobantes', 'nominas', 'inventario_docs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_bloqueo', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.revisar_bloqueo()', t || '_bloqueo', t);
  end loop;
end $$;

-- Líneas de facturas y pagos de recibos: siguen la fecha de su documento.
create or replace function public.revisar_bloqueo_hijo() returns trigger
language plpgsql security definer set search_path = public as $$
declare h date; d record; pid uuid;
begin
  if public.en_traslado() then return coalesce(new, old); end if;
  pid := case when tg_table_name = 'items' then coalesce(new.documento_id, old.documento_id) else coalesce(new.recibo_id, old.recibo_id) end;
  select x.fecha, x.estado, e.bloqueado_hasta as hasta into d from documentos x join empresas e on e.id = x.empresa_id where x.id = pid;
  if d.hasta is not null and d.fecha <= d.hasta and d.estado <> 'borrador' then
    raise exception 'El periodo está bloqueado hasta el %: no se puede modificar un documento con fecha %.', to_char(d.hasta, 'DD/MM/YYYY'), to_char(d.fecha, 'DD/MM/YYYY');
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists items_bloqueo on public.items;
create trigger items_bloqueo before insert or update or delete on public.items for each row execute function public.revisar_bloqueo_hijo();
drop trigger if exists aplicaciones_bloqueo on public.aplicaciones;
create trigger aplicaciones_bloqueo before insert or update or delete on public.aplicaciones for each row execute function public.revisar_bloqueo_hijo();

notify pgrst, 'reload schema';

/* ======================================================================
   044_nit_fijo.sql
   ====================================================================== */
-- 044: El NIT de la empresa queda fijo después de su primer documento electrónico aceptado por la DIAN en producción.
create or replace function public.empresas_nit_fijo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nit is distinct from old.nit and exists (select 1 from fe_envios where empresa_id = old.id and estado = 'aceptado' and ambiente = 'produccion') then
    raise exception 'El NIT no se puede cambiar: la empresa ya emitió facturas electrónicas en producción con este NIT.';
  end if;
  return new;
end $$;
drop trigger if exists empresas_nit_fijo on public.empresas;
create trigger empresas_nit_fijo before update of nit on public.empresas for each row execute function public.empresas_nit_fijo();
notify pgrst, 'reload schema';

/* ======================================================================
   045_cuentas_cartera.sql
   ====================================================================== */
-- 045: Cuentas con cartera. Cada cuenta puede marcarse para seguir sus saldos por tercero y documento cruce
-- (cartera, cuentas por pagar, edades). null = hereda de la cuenta padre; por defecto 1305, 1330 y 2205.
-- El documento cruce y el vencimiento de los comprobantes van dentro de comprobantes.lineas (cruce, vence): no necesitan columna.
-- Correr una vez en Supabase.
alter table public.cuentas add column if not exists cartera boolean;
notify pgrst, 'reload schema';

/* ======================================================================
   046_conciliaciones.sql
   ====================================================================== */
-- 046: Conciliación bancaria. Una conciliación por cuenta de bancos y mes: el extracto cargado (o traído del banco),
-- los cruces con el libro auxiliar y el saldo final según el extracto. Correr una vez en Supabase.
create table if not exists public.conciliaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cuenta text not null check (cuenta ~ '^[0-9]{8}$'),
  periodo text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  saldo_extracto numeric(18,2),  -- vacío mientras no se escriba el saldo del extracto
  -- [{id, fecha, descripcion, referencia, debito, credito}]  débito = sale de la cuenta, crédito = entra (como el banco)
  extracto jsonb not null default '[]'::jsonb,
  -- [{l: [claves del libro], b: [ids del extracto], auto}]
  cruces jsonb not null default '[]'::jsonb,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  cerrada_en timestamptz,
  cerrada_por text not null default '',
  creado_en timestamptz not null default now(),
  unique (empresa_id, cuenta, periodo)
);
create index if not exists conciliaciones_empresa on public.conciliaciones (empresa_id, cuenta, periodo);

alter table public.conciliaciones enable row level security;
drop policy if exists conciliaciones_ver on public.conciliaciones;
create policy conciliaciones_ver on public.conciliaciones for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists conciliaciones_crear on public.conciliaciones;
create policy conciliaciones_crear on public.conciliaciones for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists conciliaciones_editar on public.conciliaciones;
create policy conciliaciones_editar on public.conciliaciones for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists conciliaciones_borrar on public.conciliaciones;
create policy conciliaciones_borrar on public.conciliaciones for delete to authenticated using (public.puede_editar(empresa_id));

-- Por si la tabla ya se había creado con saldo obligatorio.
alter table public.conciliaciones alter column saldo_extracto drop not null, alter column saldo_extracto drop default;

notify pgrst, 'reload schema';

/* ======================================================================
   047_activos_fijos.sql
   ====================================================================== */
-- 047: Activos fijos (propiedad, planta y equipo) y su depreciación. Correr una vez en Supabase.
-- Los tipos de activo (vida útil y cuentas) se guardan en empresas.contabilidad.activos_tipos.
-- La depreciación de cada mes es un comprobante tipo DP; cada línea lleva el activo y el mes que deprecia.
create table if not exists public.activos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  tipo text not null,
  origen text not null default 'nuevo' check (origen in ('nuevo', 'saldo')),  -- saldo = viene de otro programa
  fecha_compra date,
  inicio text check (inicio is null or inicio ~ '^[0-9]{4}-[0-9]{2}$'),       -- mes en que empieza a depreciarse en AGAsoft
  costo numeric(18,2) not null default 0,
  residual numeric(18,2) not null default 0,
  dep_inicial numeric(18,2) not null default 0,                                -- depreciación acumulada al empezar (saldo inicial)
  vida_meses integer not null default 0,                                       -- nuevo: vida útil; saldo: vigencia que le queda
  cambios jsonb not null default '[]'::jsonb,                                  -- [{desde:'AAAA-MM', restantes}] cambios de vida útil
  cta_activo text not null default '', cta_dep text not null default '', cta_gasto text not null default '',
  cc1 uuid, cc2 uuid, cc3 uuid,
  ubicacion text not null default '',
  serie text not null default '',
  compra_id uuid references public.compras(id) on delete set null,          -- factura de compra o documento soporte del activo
  tercero_id uuid references public.terceros(id) on delete set null,        -- proveedor o tercero del activo (si no tiene factura)
  adiciones jsonb not null default '[]'::jsonb,                              -- repotenciaciones [{id, fecha, desde, valor, detalle, restantes, compra_id}]
  estado text not null default 'activo' check (estado in ('activo', 'baja')),
  baja_fecha date,
  baja_motivo text not null default '',
  creado_en timestamptz not null default now(),
  unique (empresa_id, codigo)
);
create index if not exists activos_empresa on public.activos (empresa_id);
-- Por si la tabla ya se creó con una versión anterior de este archivo.
alter table public.activos add column if not exists tercero_id uuid references public.terceros(id) on delete set null;
alter table public.activos add column if not exists adiciones jsonb not null default '[]'::jsonb;

alter table public.activos enable row level security;
drop policy if exists activos_ver on public.activos;
create policy activos_ver on public.activos for select to authenticated using (public.puede_ver(empresa_id));
drop policy if exists activos_crear on public.activos;
create policy activos_crear on public.activos for insert to authenticated with check (public.puede_editar(empresa_id));
drop policy if exists activos_editar on public.activos;
create policy activos_editar on public.activos for update to authenticated using (public.puede_editar(empresa_id)) with check (public.puede_editar(empresa_id));
drop policy if exists activos_borrar on public.activos;
create policy activos_borrar on public.activos for delete to authenticated using (public.puede_editar(empresa_id));

-- Comprobante de depreciación (DP).
alter table public.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table public.comprobantes add constraint comprobantes_tipo_check check (tipo in ('CC', 'SI', 'CI', 'PN', 'DP'));

notify pgrst, 'reload schema';

/* ======================================================================
   048_cierre_con_bloqueo.sql
   ====================================================================== */
-- El comprobante de cierre (CI) se puede crear, anular o eliminar aunque el periodo esté bloqueado.
-- Todo lo demás sigue igual que en 043_bloqueo_periodos.sql.
create or replace function public.revisar_bloqueo() returns trigger
language plpgsql security definer set search_path = public as $$
declare h date; e uuid; f date;
begin
  if public.en_traslado() then return coalesce(new, old); end if;
  if tg_table_name = 'comprobantes' and (case when tg_op = 'DELETE' then old.tipo else new.tipo end) = 'CI'
     and (tg_op = 'INSERT' or old.tipo = 'CI') then return coalesce(new, old); end if;
  e := case when tg_op = 'DELETE' then old.empresa_id else new.empresa_id end;
  select bloqueado_hasta into h from empresas where id = e;
  if h is null then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' and old.fecha <= h and not (tg_table_name = 'documentos' and old.estado = 'borrador') then
    f := old.fecha;
  elsif tg_op <> 'DELETE' and new.fecha <= h and not (tg_table_name = 'documentos' and new.estado = 'borrador') then
    f := new.fecha;
  end if;
  if f is not null then
    raise exception 'El periodo está bloqueado hasta el %: no se puede crear, modificar, anular ni eliminar un documento con fecha %. El dueño puede desbloquearlo en Configuración › Bloqueo de periodos.', to_char(h, 'DD/MM/YYYY'), to_char(f, 'DD/MM/YYYY');
  end if;
  return coalesce(new, old);
end $$;

/* ======================================================================
   049_recibos_saldos_iniciales.sql
   ====================================================================== */
-- Recibos de caja que abonan a saldos de cartera que dejaron los comprobantes (saldos iniciales, notas de contabilidad).
-- documentos.cruces: [{cuenta, cruce, valor}] en el recibo. El egreso no necesita cambio (usa compras.aplicaciones).
alter table public.documentos add column if not exists cruces jsonb not null default '[]'::jsonb;

-- La misma función de 036_bodega_ventas.sql, ahora guardando también "cruces".
create or replace function public.guardar_documento(p_doc jsonb, p_items jsonb, p_apl jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := (p_doc->>'empresa_id')::uuid;
  did uuid := nullif(p_doc->>'id', '')::uuid;
  d record;
begin
  -- Fechas o referencias vacías llegan como '' y no se pueden convertir: se quitan.
  p_doc := p_doc - array['vence', 'ref_id', 'fecha', 'id']::text[] || jsonb_strip_nulls(jsonb_build_object(
    'vence', nullif(p_doc->>'vence', ''), 'ref_id', nullif(p_doc->>'ref_id', ''), 'fecha', nullif(p_doc->>'fecha', ''), 'id', nullif(p_doc->>'id', '')));
  if not public.puede_editar(eid) then raise exception 'No tienes permiso para registrar documentos en esta empresa.'; end if;
  if not exists (select 1 from terceros where id = (p_doc->>'tercero_id')::uuid and empresa_id = eid) then raise exception 'El cliente no pertenece a esta empresa.'; end if;
  if did is not null then
    select * into d from documentos where id = did for update;
    if not found or d.empresa_id <> eid then raise exception 'Documento no encontrado.'; end if;
    -- Los documentos que no son electrónicos se pueden editar después de guardados.
    if d.estado = 'anulado' then raise exception 'El documento está anulado.'; end if;
    -- Los electrónicos se pueden modificar mientras no los haya aceptado la DIAN; aceptados se corrigen con una nota.
    if d.estado = 'emitido' and d.electronica and exists (select 1 from fe_envios e where e.documento_id = did and e.estado = 'aceptado') then
      raise exception 'Este documento ya fue aceptado por la DIAN: no se modifica, se corrige con una nota.'; end if;
    if d.estado = 'emitido' then p_doc := p_doc || jsonb_build_object('electronica', d.electronica, 'tipo', d.tipo); end if;
  end if;
  select * into d from jsonb_populate_record(null::documentos, p_doc);
  if did is null then
    insert into documentos (empresa_id, tipo, electronica, fecha, vence, tercero_id, forma_pago, medio_pago, cuenta_pago, retenciones, ref_id, concepto, observaciones, cc, cruces,
      bruto, descuento, base, iva, retefuente_pct, reteiva_pct, reteica_milaje, retefuente, reteiva, reteica, total, neto, anticipo)
    values (eid, d.tipo, coalesce(d.electronica, false), coalesce(d.fecha, current_date), d.vence, d.tercero_id, coalesce(d.forma_pago, 'contado'), coalesce(d.medio_pago, 'efectivo'), coalesce(trim(d.cuenta_pago), ''), coalesce(d.retenciones, '{}'::jsonb), d.ref_id,
      coalesce(d.concepto, ''), coalesce(d.observaciones, ''), coalesce(d.cc, '[]'::jsonb), coalesce(d.cruces, '[]'::jsonb), coalesce(d.bruto, 0), coalesce(d.descuento, 0), coalesce(d.base, 0), coalesce(d.iva, 0),
      coalesce(d.retefuente_pct, 0), coalesce(d.reteiva_pct, 0), coalesce(d.reteica_milaje, 0), coalesce(d.retefuente, 0), coalesce(d.reteiva, 0),
      coalesce(d.reteica, 0), coalesce(d.total, 0), coalesce(d.neto, 0), coalesce(d.anticipo, 0))
    returning id into did;
  else
    update documentos set electronica = coalesce(d.electronica, false), fecha = coalesce(d.fecha, current_date), vence = d.vence, tercero_id = d.tercero_id, forma_pago = coalesce(d.forma_pago, 'contado'),
      medio_pago = coalesce(d.medio_pago, 'efectivo'), cuenta_pago = coalesce(trim(d.cuenta_pago), ''), retenciones = coalesce(d.retenciones, '{}'::jsonb), ref_id = d.ref_id, concepto = coalesce(d.concepto, ''), observaciones = coalesce(d.observaciones, ''), cc = coalesce(d.cc, '[]'::jsonb), cruces = coalesce(d.cruces, '[]'::jsonb),
      bruto = coalesce(d.bruto, 0), descuento = coalesce(d.descuento, 0), base = coalesce(d.base, 0), iva = coalesce(d.iva, 0),
      retefuente_pct = coalesce(d.retefuente_pct, 0), reteiva_pct = coalesce(d.reteiva_pct, 0), reteica_milaje = coalesce(d.reteica_milaje, 0),
      retefuente = coalesce(d.retefuente, 0), reteiva = coalesce(d.reteiva, 0), reteica = coalesce(d.reteica, 0), total = coalesce(d.total, 0),
      neto = coalesce(d.neto, 0), anticipo = coalesce(d.anticipo, 0)
    where id = did;
  end if;
  delete from items where documento_id = did;
  insert into items (documento_id, empresa_id, orden, producto_id, codigo, descripcion, unidad, cantidad, precio, descuento_pct, iva_pct, cuenta, cc, bodega_id)
  select did, eid, (o - 1)::int, nullif(x->>'producto_id', '')::uuid, coalesce(x->>'codigo', ''), coalesce(x->>'descripcion', ''), coalesce(x->>'unidad', 'UND'),
    coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'precio')::numeric, 0), coalesce((x->>'descuento_pct')::numeric, 0), coalesce((x->>'iva_pct')::numeric, 0),
    coalesce(trim(x->>'cuenta'), ''), coalesce(x->'cc', '[]'::jsonb), nullif(x->>'bodega_id', '')::uuid
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as a(x, o);
  delete from aplicaciones where recibo_id = did;
  insert into aplicaciones (recibo_id, empresa_id, factura_id, valor)
  select did, eid, (x->>'factura_id')::uuid, (x->>'valor')::numeric
  from jsonb_array_elements(coalesce(p_apl, '[]'::jsonb)) as a(x)
  where (x->>'valor')::numeric > 0;
  if exists (select 1 from aplicaciones a join documentos f on f.id = a.factura_id where a.recibo_id = did and (f.empresa_id <> eid or f.tipo <> 'FV')) then
    raise exception 'Un pago apunta a una factura que no es de esta empresa.';
  end if;
  return did;
end $$;

/* ======================================================================
   050_modulos_por_cuenta.sql
   ====================================================================== */
-- 050: módulos por cuenta, escogidos por el administrador en /admin.
--  - perfiles.modulos: null = la cuenta usa los módulos de su plan (como antes).
--    {clave: true|false, '*': false} = módulos escogidos a mano; '*' vale para los que no estén en la lista
--    (así los módulos nuevos de AGAsoft llegan apagados). Lo de la cuenta gana sobre el plan.
--  - ajustes_app.modulos_nuevos: con qué módulos entran las cuentas que se registren de ahora en adelante
--    (null = según su plan). Las cuentas que ya existen no cambian.
-- La base no se apaga nunca: ventas, compras y gastos, comprobantes, terceros, productos, configuración y electrónicos.
-- Correr una vez en Supabase › SQL Editor. Se puede correr más de una vez.

alter table public.perfiles add column if not exists modulos jsonb;

create table if not exists public.ajustes_app (
  id integer primary key default 1 check (id = 1),
  modulos_nuevos jsonb,
  actualizado_en timestamptz not null default now()
);
alter table public.ajustes_app enable row level security;
drop policy if exists ajustes_admin on public.ajustes_app;
create policy ajustes_admin on public.ajustes_app for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- Solo el administrador cambia los módulos de una cuenta (la cuenta no puede encenderse módulos sola).
create or replace function public.proteger_modulos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.modulos is distinct from old.modulos and auth.uid() is not null and not public.es_admin() then
    raise exception 'Solo el administrador de AGAsoft cambia los módulos de una cuenta.';
  end if;
  return new;
end $$;
drop trigger if exists perfiles_modulos on public.perfiles;
create trigger perfiles_modulos before update of modulos on public.perfiles for each row execute function public.proteger_modulos();

-- El primer usuario queda como administrador. Los demás entran con 15 días de prueba gratis
-- y con los módulos de cuentas nuevas que haya escogido el administrador.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
declare primero boolean;
begin
  select not exists (select 1 from public.perfiles) into primero;
  insert into public.perfiles (id, nombre, correo, es_admin, aprobado, prueba_hasta, modulos)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', ''), coalesce(new.email, ''), primero, true,
    case when primero then null else public.hoy_co() + 15 end,
    case when primero then null else (select a.modulos_nuevos from public.ajustes_app a where a.id = 1) end)
  on conflict (id) do nothing;
  return new;
end $$;

notify pgrst, 'reload schema';

/* ======================================================================
   Limpieza para una instalación nueva
   ====================================================================== */
-- Los planes viejos (Básico, Profesional, Contador, Empresa Plus) quedan inactivos por las migraciones 009/029/030.
-- En una base nueva nadie los usa: se borran para que en /admin solo queden Emprendedor, Pyme y Empresa.
delete from public.planes p
where not p.activo
  and not exists (select 1 from public.perfiles x where x.plan_id = p.id or x.plan_solicitado = p.id);

notify pgrst, 'reload schema';
