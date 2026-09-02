import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import helmet from 'helmet';
import morgan from 'morgan';
import { CSP_DIRECTIVES } from './config/csp.js';
import { env, isProduction } from './config/env.js';
import { pool } from './db/pool.js';
import { asyncHandler } from './lib/async-handler.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { booksRouter } from './modules/books/books.routes.js';
import { publicRouter } from './modules/books/public.routes.js';
import { librariesRouter } from './modules/libraries/libraries.routes.js';
import { mediaRouter } from './modules/media/media.routes.js';
import { phidiasRouter } from './modules/phidias/phidias.routes.js';
import { quizzesRouter } from './modules/quizzes/quizzes.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { STORAGE_ROOT } from './modules/media/uploads.service.js';

/**
 * Origenes de la red local (RFC 1918) y del propio equipo. En desarrollo se aceptan
 * sin listarlos uno a uno para poder probar desde tablets y moviles de la escuela.
 */
const PRIVATE_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d{1,5})?$/;

function corsOrigin(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
): void {
  const allowList = env.CORS_ORIGIN.split(',').map((o) => o.trim());

  // Sin cabecera Origin (curl, apps nativas) o en la lista explicita.
  if (!origin || allowList.includes('*') || allowList.includes(origin)) return callback(null, true);
  if (!isProduction && PRIVATE_ORIGIN.test(origin)) return callback(null, true);

  callback(new Error(`Origen no permitido por CORS: ${origin}`));
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // crossOriginResourcePolicy relajado para que el frontend en otro puerto cargue /storage.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // La politica por defecto de helmet es default-src 'self', que en produccion
      // (donde este mismo servidor sirve la web) bloquearia el SDK de Mercado Pago y
      // dejaria el formulario de pago cargando para siempre. En desarrollo la web la
      // sirve Vite, asi que la cabecera no llegaria a aplicarse: se desactiva para no
      // romper las pruebas por HTTP en la red local.
      contentSecurityPolicy: isProduction ? { directives: CSP_DIRECTIVES } : false,
    }),
  );
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '90mb' }));
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  app.use(
    '/storage',
    express.static(STORAGE_ROOT, {
      // Los archivos subidos nunca deben ejecutarse ni interpretarse como HTML.
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      },
      dotfiles: 'deny',
      index: false,
      maxAge: '1d',
    }),
  );

  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'up', uptime: process.uptime() });
    }),
  );

  app.use('/api/auth', authRouter);
  app.use('/api/libraries', librariesRouter);
  app.use('/api/books', booksRouter);
  // Enlaces compartidos: sin requireAuth, la propia ruta decide que exige.
  app.use('/api/public', publicRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/phidias', phidiasRouter);
  app.use('/api/quizzes', quizzesRouter);
  // El webhook de Mercado Pago vive dentro y se salta requireAuth a proposito.
  app.use('/api/billing', billingRouter);

  // --- Frontend compilado ---
  //
  // En produccion el mismo proceso sirve la API y la aplicacion: un solo contenedor
  // que desplegar, sin CORS entre ambos y sin proxy delante. Si no hay build (por
  // ejemplo en desarrollo, donde manda Vite) esta parte no se monta.
  const webDist = join(process.cwd(), 'apps', 'web', 'dist');

  if (existsSync(webDist)) {
    app.use(
      express.static(webDist, {
        // El index nunca se cachea: es quien referencia los assets con hash.
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
        maxAge: '30d',
        index: false,
      }),
    );

    // Cualquier otra ruta la resuelve el enrutador del navegador.
    app.get(/^\/(?!api|storage).*/, (_req, res) => {
      res.sendFile(join(webDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
