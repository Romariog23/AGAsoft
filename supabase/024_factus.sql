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
