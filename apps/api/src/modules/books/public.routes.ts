import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { answerSchema, muralQuerySchema, sharedQuestionParamsSchema, shareTokenSchema } from './books.schemas.js';
import { answerSharedQuestion, getSharedBook } from './books.service.js';
import { listMural } from './mural.service.js';

/** Acceso de solo lectura por enlace compartido; no exige cuenta. */
export const publicRouter = Router();

publicRouter.get(
  '/books/:token',
  optionalAuth,
  validate(shareTokenSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ book: await getSharedBook(req.params.token, req.auth?.userId) });
  }),
);

publicRouter.post(
  '/books/:token/questions/:elementId/answer',
  optionalAuth,
  validate(sharedQuestionParamsSchema, 'params'),
  validate(answerSchema),
  asyncHandler(async (req, res) => {
    const result = await answerSharedQuestion(
      req.params.token,
      req.params.elementId,
      req.body.answer,
      req.auth?.userId,
    );
    res.json({ result });
  }),
);

/**
 * El mural. Se sirve sin cuenta a proposito: es la vitrina publica del colegio y
 * tiene que poder ensenarse a una familia que no entra en la plataforma.
 */
publicRouter.get(
  '/mural',
  validate(muralQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await listMural(req.query as never));
  }),
);
