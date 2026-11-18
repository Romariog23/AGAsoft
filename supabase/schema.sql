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
create or replace function public.admin_cuentas() returns table (
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
