import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { clearCache, importSection, isPhidiasEnabled, listSections } from './phidias.service.js';

const importSchema = z.object({
  sectionId: z.coerce.number().int().positive(),
  /** Sin este campo se crea la biblioteca de la seccion; con el, se usa la indicada. */
  libraryId: z.string().uuid().optional(),
});

export const phidiasRouter = Router();

// Solo docentes y administradores: expone datos personales del alumnado.
phidiasRouter.use(requireAuth, requireRole('teacher', 'admin'));

phidiasRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ enabled: isPhidiasEnabled() });
  }),
);

phidiasRouter.get(
  '/sections',
  asyncHandler(async (_req, res) => {
    res.json({ sections: await listSections() });
  }),
);

phidiasRouter.post(
  '/import',
  validate(importSchema),
  asyncHandler(async (req, res) => {
    const result = await importSection(req.body.sectionId, req.auth!.userId, req.body.libraryId);
    res.status(201).json({ result });
  }),
);

/** Fuerza releer Phidias tras un cambio de matriculas. */
phidiasRouter.post(
  '/refresh',
  asyncHandler(async (_req, res) => {
    clearCache();
    res.json({ ok: true });
  }),
);
