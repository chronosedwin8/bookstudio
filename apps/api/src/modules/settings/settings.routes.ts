import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { toolbarSchema } from './settings.schemas.js';
import * as service from './settings.service.js';

/** Ajustes de toda la plataforma: los lee cualquiera con sesion, los cambia la administracion. */
export const settingsRouter = Router();

settingsRouter.use(requireAuth);

settingsRouter.get(
  '/toolbar',
  asyncHandler(async (_req, res) => {
    res.json(await service.leerBarra());
  }),
);

settingsRouter.put(
  '/toolbar',
  requireRole('admin'),
  validate(toolbarSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.guardarBarra(req.body, req.auth!.userId));
  }),
);

/** Volver a la barra de fabrica. */
settingsRouter.delete(
  '/toolbar',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    await service.restablecerBarra();
    res.json({ value: null, updatedAt: null });
  }),
);
