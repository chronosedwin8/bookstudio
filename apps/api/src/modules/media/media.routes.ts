import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { geocode } from './geocode.service.js';
import { MAX_ANONYMOUS_PAGE_SIZE, search } from './openverse.service.js';
import { storeDataUrl, uploadLimits } from './uploads.service.js';

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Escribe al menos 2 caracteres').max(120).trim(),
  type: z.enum(['images', 'audio']).default('images'),
  page: z.coerce.number().int().min(1).max(50).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_ANONYMOUS_PAGE_SIZE).default(20),
  /** gif limita la busqueda a imagenes animadas. */
  extension: z.enum(['gif', 'png', 'jpg', 'svg']).optional(),
});

const geocodeQuerySchema = z.object({
  q: z.string().min(2, 'Escribe al menos 2 caracteres').max(160).trim(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

const uploadSchema = z.object({
  // 90 MB en base64 cubre el limite de video (60 MB) mas el sobrecoste de codificacion.
  dataUrl: z.string().min(32).max(90 * 1024 * 1024),
});

export const mediaRouter = Router();

mediaRouter.use(requireAuth);

mediaRouter.get(
  '/search',
  validate(searchQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q, type, page, pageSize, extension } = req.query as unknown as z.infer<typeof searchQuerySchema>;
    res.json(await search({ query: q, type, page, pageSize, extension }));
  }),
);

mediaRouter.get(
  '/geocode',
  validate(geocodeQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query as unknown as z.infer<typeof geocodeQuerySchema>;
    res.json({ results: await geocode(q, limit) });
  }),
);

mediaRouter.get('/limits', (_req, res) => {
  res.json({ allowedMimeTypes: uploadLimits.allowedMimeTypes, maxBytes: uploadLimits.maxBytes });
});

mediaRouter.post(
  '/uploads',
  validate(uploadSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await storeDataUrl(req.auth!.userId, req.body.dataUrl));
  }),
);
