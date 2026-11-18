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
create policy empresas_ver on public.empresas for select to authenticated using (public.puede_ver(id));
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
  creado_en timestamptz not null default now(),
  check (siguiente >= desde)
);
-- Solo una numeración activa por tipo de documento.
create unique index if not exists numeraciones_una_activa on public.numeraciones (empresa_id, tipo) where activa;

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

-- Emite un borrador: valida y le asigna el siguiente consecutivo de su numeración.
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
    if d.tipo = 'NC' then
      select coalesce(sum(total), 0) into acred from documentos where tipo = 'NC' and estado = 'emitido' and ref_id = f.id;
      if acred + d.total > f.total then raise exception 'La nota crédito supera el valor pendiente de la factura (% disponible).', f.total - acred; end if;
    end if;
  end if;
  if d.tipo = 'RC' and d.total <= 0 then raise exception 'El recibo debe tener un valor mayor que cero.'; end if;

  select * into n from numeraciones where empresa_id = d.empresa_id and tipo = d.tipo and activa for update;
  if not found then raise exception 'No hay una numeración activa para este tipo de documento. Créala en Numeraciones.'; end if;
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
