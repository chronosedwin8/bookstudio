import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { isTrialUser } from '../auth/trial.service.js';
import { HttpError } from '../../lib/http-error.js';
import {
  clearCache,
  importSection,
  isPhidiasEnabled,
  listSections,
  syncGroups,
} from './phidias.service.js';

const importSchema = z.object({
  sectionId: z.coerce.number().int().positive(),
  /** Sin este campo se crea la biblioteca de la seccion; con el, se usa la indicada. */
  libraryId: z.string().uuid().optional(),
});

export const phidiasRouter = Router();

// Solo docentes y administradores: expone datos personales del alumnado.
phidiasRouter.use(requireAuth, requireRole('teacher', 'admin'));

/**
 * Las cuentas de prueba quedan fuera. Tienen rol de docente para poder usar el
 * editor completo, pero aqui se listan nombres y correos de menores reales: no es
 * algo a lo que deba llegar cualquiera que pulse "probar sin registro".
 */
phidiasRouter.use(
  asyncHandler(async (req, _res, next) => {
    if (await isTrialUser(req.auth!.userId)) {
      throw HttpError.forbidden('Las cuentas de prueba no pueden consultar Phidias');
    }
    next();
  }),
);

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

/**
 * Pone al dia el curso de todo el alumnado traido de Phidias.
 *
 * Se ejecuta a mano: al empezar el ano, cuando cambian las matriculas, o para
 * rellenar las cuentas creadas antes de que se guardara el curso.
 */
phidiasRouter.post(
  '/sync-groups',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    clearCache();
    res.json(await syncGroups());
  }),
);
