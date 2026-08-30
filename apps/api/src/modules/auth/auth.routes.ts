import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createStudentSchema, loginSchema, qrLoginSchema, registerSchema } from './auth.schemas.js';
import * as service from './auth.service.js';

export const authRouter = Router();

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
