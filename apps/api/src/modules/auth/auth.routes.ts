import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  changePasswordSchema,
  createStudentSchema,
  loginSchema,
  qrLoginSchema,
  registerSchema,
} from './auth.schemas.js';
import { createRateLimiter } from '../../lib/rate-limit.js';
import { HttpError } from '../../lib/http-error.js';
import { createTrialSession } from './trial.service.js';
import { env } from '../../config/env.js';
import * as service from './auth.service.js';
import * as sso from './sso.service.js';

export const authRouter = Router();

/** Un puñado de cuentas de prueba por IP y hora: evita llenar la base de datos. */
const trialLimiter = createRateLimiter(5, 60 * 60_000);

/**
 * Acceso de prueba sin registro. No pide ningun dato: crea una cuenta temporal con
 * cupos muy pequenos (un libro, dos paginas).
 */
authRouter.post(
  '/trial',
  asyncHandler(async (req, res) => {
    if (trialLimiter.hit(req.ip ?? 'desconocida')) {
      throw new HttpError(429, 'Se han creado varias pruebas desde aqui. Intentalo mas tarde.', 'TOO_MANY_REQUESTS');
    }
    res.status(201).json(await createTrialSession());
  }),
);

authRouter.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await service.register(req.body);
    res.status(201).json(result);
  }),
);

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.login(req.body));
  }),
);

authRouter.post(
  '/login/qr',
  validate(qrLoginSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.loginWithQr(req.body.token));
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await service.getUserById(req.auth!.userId) });
  }),
);

authRouter.post(
  '/students',
  requireAuth,
  requireRole('teacher', 'admin'),
  validate(createStudentSchema),
  asyncHandler(async (req, res) => {
    const result = await service.createStudentWithQr(req.auth!.userId, req.body);
    res.status(201).json(result);
  }),
);

/** Cambio de contrasena por la propia persona. Todos los roles pueden hacerlo. */
authRouter.post(
  '/password',
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await service.changeOwnPassword(req.auth!.userId, req.body.currentPassword, req.body.newPassword);
    res.status(204).end();
  }),
);


// --- Entrada con la cuenta del colegio (Microsoft Entra ID) ---

/** Dice al navegador si merece la pena pintar el boton de Microsoft. */
authRouter.get('/sso/config', (_req, res) => {
  res.json({ enabled: sso.ssoConfigurado(), domain: env.ENTRA_ALLOWED_DOMAIN });
});

/** Manda a identificarse a Microsoft. */
authRouter.get(
  '/sso/start',
  asyncHandler(async (req, res) => {
    res.redirect(sso.urlDeEntrada(sso.destinoSeguro(req.query.redirect)));
  }),
);

/**
 * Vuelta de Microsoft. Termina en el navegador, no en JSON, asi que los errores
 * se cuentan en la propia pagina de entrada en lugar de en una pantalla en blanco.
 */
authRouter.get(
  '/sso/callback',
  asyncHandler(async (req, res) => {
    const app = env.APP_URL.replace(/\/$/, '');
    const { code, state, error_description: descripcion } = req.query as Record<string, string | undefined>;

    if (descripcion) {
      res.redirect(`${app}/login?sso=${encodeURIComponent(descripcion.slice(0, 200))}`);
      return;
    }
    if (!code || !state) {
      res.redirect(`${app}/login?sso=${encodeURIComponent('Microsoft no devolvio el codigo de entrada')}`);
      return;
    }

    try {
      const resultado = await sso.completarEntrada(code, state);
      // El token viaja en el fragmento: lo que va tras la almohadilla no llega al
      // servidor ni queda en los registros del proxy, y el navegador lo borra en
      // cuanto la pagina de entrada lo recoge.
      res.redirect(`${app}/login/sso#token=${resultado.token}&redirect=${encodeURIComponent(resultado.redirect)}`);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo entrar con la cuenta del colegio';
      res.redirect(`${app}/login?sso=${encodeURIComponent(mensaje.slice(0, 200))}`);
    }
  }),
);
