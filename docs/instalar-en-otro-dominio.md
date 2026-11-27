# Instalar AGAsoft vacío en otra base de datos y otro dominio

Esta guía deja una copia de AGAsoft **vacía** (toda la estructura, sin empresas, terceros, documentos ni usuarios) en un proyecto nuevo de Supabase, publicada en Vercel con su propio dominio. La instalación actual (www.agasoft.co) no se toca.

Lo que vas a tener al final:

| Pieza | Instalación actual | Instalación nueva |
|---|---|---|
| Base de datos | Supabase de AGAsoft | Proyecto nuevo de Supabase |
| Página | Vercel, proyecto `agasoft` | Vercel, proyecto nuevo (mismo repositorio) |
| Dominio | www.agasoft.co | El dominio nuevo |
| Factura electrónica | Función `fe-factus` | Función `fe-factus` en el proyecto nuevo, con sus propios secretos |

> **Antes de empezar, una decisión.** Si el proyecto nuevo de Vercel usa el mismo repositorio y la rama `main`, **cada cambio que se una a `main` se publica en las dos páginas**. Eso es lo normal si las dos instalaciones deben ser iguales. Si la nueva debe evolucionar aparte, conviene que use otra rama (por ejemplo `otro-proceso`) o una copia del repositorio. Y en cualquier caso, **cada SQL nuevo (050, 051…) hay que correrlo en las dos bases**.

---

## 1. Proyecto nuevo de Supabase

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) › **New project**.
2. Escoge la organización (en la "AGA", que es Pro, cada proyecto adicional suma su propio cobro de cómputo; revisa el valor en *Billing* antes de crearlo), ponle nombre, una contraseña fuerte para la base (guárdala en tu gestor de claves, no en el chat) y la región más cercana a Colombia (por ejemplo **South America (São Paulo)**).
3. Espera a que termine de crearse (1–2 minutos).

## 2. Crear las tablas (SQL único)

1. En el proyecto nuevo: **SQL Editor › New query**.
2. Abre el archivo [`supabase/instalar_todo.sql`](../supabase/instalar_todo.sql) del repositorio, copia **todo** y pégalo.
3. Dale **Run**. Debe terminar con "Success. No rows returned".

Ese archivo es `schema.sql` más todas las migraciones (002 a la última) en orden, y al final borra los planes viejos que ya no se usan, así que quedan solo **Emprendedor, Pyme y Empresa**. Se puede correr dos veces sin daño (se probó así en una base limpia).

Si el editor se queda pegado por el tamaño, corre por partes en este orden: `schema.sql`, y luego cada `0xx_*.sql` de menor a mayor.

> Cuando haya una migración nueva, el archivo se vuelve a armar con `node scripts/armar-instalacion.mjs`.

## 3. Ajustes de Auth en Supabase

1. **Authentication › URL Configuration**
   - *Site URL*: `https://tu-dominio-nuevo.com`
   - *Redirect URLs*: agrega `https://tu-dominio-nuevo.com/**` y, mientras pruebas, también la dirección `https://<proyecto>.vercel.app/**`.
2. **Authentication › Providers › Email**: igual que en AGAsoft hoy. Si no quieres correos de confirmación, apaga *Confirm email*.
3. (Opcional) **Authentication › Emails › SMTP Settings**: si vas a mandar correos de verdad (recuperar clave), configura un SMTP propio; el de Supabase tiene un límite muy bajo por hora.

## 4. Función de factura electrónica (`fe-factus`)

1. **Edge Functions › Deploy a new function › Via Editor**.
2. Nombre: **`fe-factus`** exactamente (revisa después en la lista que el panel no le haya puesto un nombre automático como `swift-service`; la app la busca por ese nombre).
3. Copia todo [`supabase/functions/fe-factus/index.ts`](../supabase/functions/fe-factus/index.ts) y pégalo en el archivo principal del editor (en el panel se llama `fe-factus-index.ts`). Es un solo archivo; no hay que agregar más.
4. **Deploy**.
5. **Edge Functions › Secrets** (o *Project Settings › Edge Functions*), agrega:

| Secreto | Para qué |
|---|---|
| `FACTUS_CLIENT_ID` | client_id de Factus en producción |
| `FACTUS_CLIENT_SECRET` | client_secret de Factus en producción |
| `FACTUS_CLIENT_ID_PRUEBAS` | (opcional) client_id del sandbox |
| `FACTUS_CLIENT_SECRET_PRUEBAS` | (opcional) client_secret del sandbox |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen puestos por Supabase; no hay que crearlos. Si la instalación nueva factura con otra cuenta de integrador de Factus, usa las credenciales de esa cuenta; si es la misma, puedes repetir las de hoy. Cada empresa sigue poniendo solo su correo y contraseña de Factus dentro de AGAsoft.

Si al facturar sale un error 401 de la función, entra a la función › **Details** y apaga **Verify JWT** (la función ya valida al usuario por su cuenta).

## 5. Proyecto nuevo en Vercel

1. [vercel.com/new](https://vercel.com/new) › importa el repositorio `romariog23/agasoft` (Vercel deja importar el mismo repositorio en varios proyectos).
2. Ponle otro nombre (por ejemplo `agasoft-otro`). Framework: Vite (lo detecta solo).
3. Si decidiste usar otra rama: *Settings › Git › Production Branch*.
4. **Environment Variables** (Supabase nuevo › *Project Settings › API*):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto nuevo (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | clave pública (`sb_publishable_…` o la *anon*). **Nunca** la service_role. |
| `VITE_CALENDARIO_URL` | (opcional) URL del Supabase de AGA Calendar, si quieres el calendario adentro |
| `VITE_CALENDARIO_KEY` | (opcional) clave pública de ese Supabase |
| `VITE_CALENDARIO_APP` | (opcional) dirección de la app del calendario |

5. **Deploy**. Si agregas o cambias variables después, hay que volver a publicar (*Deployments › Redeploy*).

## 6. Dominio (Hostinger)

1. En Vercel, proyecto nuevo › **Settings › Domains** › agrega `tu-dominio-nuevo.com` y `www.tu-dominio-nuevo.com`. Vercel te muestra los registros que pide.
2. En Hostinger › **Dominios › DNS / Nameservers** del dominio nuevo:
   - Registro **A**, nombre `@`, valor el que muestra Vercel (hoy `76.76.21.21`).
   - Registro **CNAME**, nombre `www`, valor el que muestra Vercel (por ejemplo `cname.vercel-dns.com`).
   - Borra otros registros A o CNAME de `@` y `www` que Hostinger traiga por defecto (página de parqueo).
3. Espera a que Vercel marque el dominio como *Valid Configuration* (minutos, a veces unas horas). El certificado HTTPS sale solo.
4. Vuelve al paso 3 y confirma que la *Site URL* de Supabase es el dominio definitivo.

## 7. Tu usuario administrador

1. Entra a `https://tu-dominio-nuevo.com` y **regístrate** con tu correo.
2. **El primer usuario que se registra queda como administrador** (sin prueba de 15 días). Los demás entran con prueba gratis y los ves en `https://tu-dominio-nuevo.com/admin`.
3. En `/admin` revisa los planes: quedan Emprendedor, Pyme y Empresa con los precios y módulos de la migración 030. Si en la instalación actual marcaste módulos o precios distintos desde `/admin`, eso **no** se copia (vive en los datos, no en el código): márcalos igual en la nueva.

4. En `/admin` › **Módulos de cuentas nuevas** escoge con qué módulos entran las cuentas que se registren (por ejemplo, solo la base). A cada cuenta le das más con el botón **Módulos** en *Cuentas*.

## 8. Lo que no se copia solo

- **Datos**: ninguno, a propósito. Cada empresa nueva arranca con el PUC que carga la app al crearla.
- **Planes y módulos** ajustados a mano en `/admin` (ver paso 7).
- **Copia nocturna** (`.github/workflows/respaldo-nocturno.yml`): usa los secretos de GitHub de la instalación actual. Para respaldar la nueva haría falta un segundo juego de secretos y un segundo workflow; se arma cuando lo necesites.
- **Rangos de numeración de Factus**: cada empresa los trae con el botón *Traer a AGAsoft* o los crea desde Configuración.

## Lista rápida

- [ ] Proyecto Supabase nuevo
- [ ] `instalar_todo.sql` corrido sin errores
- [ ] Auth › URL Configuration con el dominio nuevo
- [ ] Función `fe-factus` con ese nombre exacto + secretos de Factus
- [ ] Proyecto Vercel con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- [ ] Dominio en Vercel + registros A y CNAME en Hostinger
- [ ] Registrarte primero (quedas como administrador)
- [ ] Revisar planes y módulos en `/admin`
