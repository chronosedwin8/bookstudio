import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';

const server = createApp().listen(env.PORT, () => {
  console.log(`[api] BookStudio API escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n[api] ${signal} recibido, cerrando...`);
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  });
}
