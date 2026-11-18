import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Dos páginas: la app (index.html) y el panel del administrador (admin.html, en /admin).
const r = f => fileURLToPath(new URL(f, import.meta.url));
export default defineConfig({
  build: { rollupOptions: { input: { main: r('./index.html'), admin: r('./admin.html') } } },
});
