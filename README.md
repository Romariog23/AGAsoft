# AGAsoft

Software contable para Colombia. Primer módulo: **ventas**.

- Factura de venta con IVA por línea (0 %, 5 %, 19 %), descuentos y retenciones que practica el cliente (retefuente, reteIVA, reteICA).
- Nota crédito (devoluciones, anulación, rebajas, descuentos) y nota débito, siempre amarradas a una factura emitida.
- Recibo de caja que abona a una o varias facturas, o registra anticipos. Se puede anular con motivo.
- Cartera por cliente con edades (por vencer, 1–30, 31–60, 61–90, más de 90 días) y descarga en CSV.
- Numeraciones: resolución DIAN para facturas (prefijo, rango, vigencia) y consecutivos propios para notas y recibos.
- Clientes y productos, con importación desde CSV (Excel, Alegra, World Office).
- Varias empresas por usuario. El dueño da acceso por correo como *responsable* (crea y emite) o *consulta* (solo ve). El administrador aprueba usuarios nuevos.
- Representación gráfica imprimible o en PDF.

**Todavía no se conecta con la DIAN.** Los documentos llevan el aviso "Documento de prueba". La conexión (proveedor tecnológico o directa) se agrega en una siguiente etapa.

## Probar sin configurar nada

Sin las variables de Supabase la app abre en **modo demostración**: los datos quedan solo en el navegador y hay un botón para cargar una empresa de ejemplo.

```bash
npm install
npm run dev     # abre http://localhost:5173
npm test        # pruebas de cálculos (DV, totales, retenciones, cartera, valor en letras)
```

## Poner en producción (Supabase + Vercel)

1. Crea un proyecto **nuevo** en Supabase (aparte del calendario).
2. En *SQL Editor > New query* pega todo `supabase/schema.sql` y dale *Run*.
3. En Vercel importa este repositorio y agrega las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings > API).
4. Entra a la app y crea tu cuenta: **el primer usuario que se registra queda como administrador**. Los demás esperan a que los apruebes en *Usuarios*.

En Supabase > Authentication > Providers > Email puedes apagar "Confirm email" si no quieres que lleguen correos de confirmación.

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/calc.js` | Cálculos puros: NIT y DV, totales, retenciones, cartera, valor en letras, catálogos DIAN |
| `src/store.js` | Datos: modo Supabase o modo demostración (navegador) |
| `src/main.js` | Pantallas |
| `supabase/schema.sql` | Tablas, permisos por empresa y funciones para guardar, emitir y anular |

Los documentos emitidos no se pueden editar ni borrar (en la base de datos solo se escriben con funciones que lo validan). Una factura se corrige con nota crédito o débito.
