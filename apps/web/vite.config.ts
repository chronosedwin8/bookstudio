import vue from '@vitejs/plugin-vue';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type ServerOptions } from 'vite';

/** La API a la que el dev server reenvia /api y /storage. */
const apiTarget = process.env.VITE_API_TARGET ?? 'http://localhost:4000';

const certPath = (name: string) => fileURLToPath(new URL(`./.certs/${name}`, import.meta.url));

/**
 * HTTPS opcional para la red local. getUserMedia (camara y microfono) solo funciona
 * en contextos seguros: desde otro equipo http://192.168.x.x NO lo es y el navegador
 * bloquea la grabacion. Genera el par con `npm run red:cert` y se usa solo; para
 * volver a HTTP basta con VITE_HTTPS=false.
 */
function httpsOptions(): ServerOptions['https'] {
  if (process.env.VITE_HTTPS === 'false') return undefined;
  const key = process.env.VITE_HTTPS_KEY ?? certPath('lan-key.pem');
  const cert = process.env.VITE_HTTPS_CERT ?? certPath('lan-cert.pem');
  if (!existsSync(key) || !existsSync(cert)) return undefined;
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 0.0.0.0: accesible desde tablets y moviles de la misma red.
    host: true,
    https: httpsOptions(),
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      // Los archivos subidos se sirven desde la API; sin esto las fotos,
      // audios y videos del lienzo daban 404 en el navegador.
      '/storage': { target: apiTarget, changeOrigin: true },
    },
  },
});
