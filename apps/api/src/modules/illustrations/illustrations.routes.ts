import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { createRateLimiter } from '../../lib/rate-limit.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { analizarSchema, guardarSchema } from './illustrations.schemas.js';
import * as service from './illustrations.service.js';

export const illustrationsRouter = Router();

illustrationsRouter.use(requireAuth);

/**
 * Un tope por persona.
 *
 * En modo local no cuesta dinero, pero componer escenas en bucle si carga la
 * base de datos; y con la IA encendida cada peticion nueva se paga. Sesenta a la
 * hora dan para preparar una unidad entera sin notarlo.
 */
const limitador = createRateLimiter(60, 60 * 60_000);

/** Que puede prometer la interfaz: si hay IA de verdad o se compone aqui. */
illustrationsRouter.get('/estado', (_req, res) => {
  res.json(service.estado());
});

/**
 * De un texto a una escena.
 *
 * No devuelve dibujo: devuelve QUE debe aparecer. Quien dibuja es el navegador,
 * a partir de esto y siempre igual.
 */
illustrationsRouter.post(
  '/analizar',
  validate(analizarSchema),
  asyncHandler(async (req, res) => {
    if (limitador.hit(req.auth!.userId)) {
      throw HttpError.badRequest('Has pedido muchas ilustraciones seguidas. Prueba dentro de un rato.');
    }

    const { ilustracion, reutilizada, aviso } = await service.generar(req.auth!.userId, req.body);
    res.status(reutilizada ? 200 : 201).json({ ilustracion, reutilizada, aviso });
  }),
);

/** Guardar una escena retocada a mano, para reutilizarla. */
illustrationsRouter.post(
  '/',
  validate(guardarSchema),
  asyncHandler(async (req, res) => {
    if (limitador.hit(req.auth!.userId)) {
      throw HttpError.badRequest('Has guardado muchas ilustraciones seguidas. Prueba dentro de un rato.');
    }

    const ilustracion = await service.guardar(req.auth!.userId, req.body.prompt, req.body.escena);
    res.status(201).json({ ilustracion });
  }),
);

illustrationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const ilustraciones = await service.listar(req.auth!.userId);
    res.json({ ilustraciones });
  }),
);

illustrationsRouter.get(
  '/:id',
  validate(z.object({ id: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    const ilustracion = await service.obtener(req.auth!.userId, req.params.id);
    res.json({ ilustracion });
  }),
);
