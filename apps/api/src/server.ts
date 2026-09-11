import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { precalentarPlanes } from './modules/billing/plans.js';

// El catalogo de planes se lee una vez al arrancar: asi el nombre de un plan ya
// esta disponible en la primera respuesta, sin esperar a que alguien pida /config.
void precalentarPlanes();

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
