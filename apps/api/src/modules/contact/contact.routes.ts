import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createRateLimiter } from '../../lib/rate-limit.js';
import { validate } from '../../middleware/validate.js';

/**
 * Solicitudes de la web comercial.
 *
 * El envio es publico (quien pide una demo aun no tiene cuenta), pero leerlas es
 * cosa de administracion. Se limita el ritmo por IP para que el formulario no se
 * convierta en un buzon de spam.
 */
const createSchema = z.object({
  name: z.string().min(2, 'Escribe tu nombre').max(120).trim(),
  email: z.string().email('Email invalido').max(255).toLowerCase().trim(),
  organization: z.string().max(160).trim().optional(),
  plan: z.string().max(40).trim().optional(),
  people: z.coerce.number().int().min(1).max(100_000).optional(),
  message: z.string().min(10, 'Cuentanos un poco mas').max(4000).trim(),
});

const listQuerySchema = z.object({
  status: z.enum(['nuevo', 'atendido', 'descartado']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const updateSchema = z.object({
  status: z.enum(['nuevo', 'atendido', 'descartado']),
});

const idSchema = z.object({ id: z.string().uuid() });

/**
 * Tope por IP. Una hora y 20 envios: en un centro educativo todo el personal sale
 * por la misma IP publica, asi que una ventana estrecha bloquearia a gente real
 * antes que a un robot. Solo cuentan los envios validos: los que rechaza el
 * esquema ni siquiera llegan hasta aqui.
 */
const limiter = createRateLimiter(20, 60 * 60_000);

export const contactRouter = Router();

contactRouter.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (limiter.hit(req.ip ?? 'desconocida')) {
      res.status(429).json({
        error: { code: 'TOO_MANY_REQUESTS', message: 'Has enviado varias solicitudes. Intentalo mas tarde.' },
      });
      return;
    }

    const { name, email, organization, plan, people, message } = req.body;
    await query(
      `INSERT INTO contact_requests (name, email, organization, plan, people, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name, email, organization ?? null, plan ?? null, people ?? null, message],
    );

    res.status(201).json({ received: true });
  }),
);

contactRouter.get(
  '/',
  requireAuth,
  requireRole('admin'),
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { status, limit } = req.query as unknown as z.infer<typeof listQuerySchema>;
    const { rows } = await query(
      `SELECT id, name, email, organization, plan, people, message, status, created_at AS "createdAt"
       FROM contact_requests
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [status ?? null, limit],
    );
    res.json({ requests: rows });
  }),
);

contactRouter.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validate(idSchema, 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('UPDATE contact_requests SET status = $2 WHERE id = $1', [
      req.params.id,
      req.body.status,
    ]);
    if (!rowCount) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } });
      return;
    }
    res.status(204).end();
  }),
);
