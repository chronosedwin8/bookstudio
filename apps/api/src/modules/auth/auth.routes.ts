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
import * as service from './auth.service.js';

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
