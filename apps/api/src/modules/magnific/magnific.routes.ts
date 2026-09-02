import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { createRateLimiter } from '../../lib/rate-limit.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { generateImageSchema, taskParamsSchema } from './magnific.schemas.js';
import * as service from './magnific.service.js';

export const magnificRouter = Router();

magnificRouter.use(requireAuth);

/**
 * Cada imagen cuesta dinero, asi que hay un tope por persona: veinte a la hora
 * dan de sobra para preparar una clase y evitan que un dedo atascado en el boton
 * (o una pestana olvidada) se lleve los creditos del colegio.
 */
const limitador = createRateLimiter(20, 60 * 60_000);

/** Dice al navegador si pintar el boton, y si esta persona puede usarlo. */
magnificRouter.get('/config', (req, res) => {
  res.json({
    enabled: service.magnificConfigurado(),
    canGenerate: service.magnificConfigurado() && service.puedeGenerar(req.auth!.role),
  });
});

magnificRouter.post(
  '/images',
  validate(generateImageSchema),
  asyncHandler(async (req, res) => {
    if (!service.puedeGenerar(req.auth!.role)) {
      throw HttpError.forbidden('La generacion de imagenes esta reservada al profesorado');
    }
    if (limitador.hit(req.auth!.userId)) {
      throw HttpError.badRequest('Has generado muchas imagenes seguidas. Prueba dentro de un rato.');
    }

    res.status(202).json(await service.generar(req.auth!.userId, req.body));
  }),
);

/** Consulta como va. Al terminar devuelve ya la imagen guardada por nosotros. */
magnificRouter.get(
  '/images/:taskId',
  validate(taskParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await service.consultar(req.auth!.userId, req.params.taskId));
  }),
);
