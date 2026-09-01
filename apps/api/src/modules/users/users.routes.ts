import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as service from './users.service.js';
import { prepararAlmacen } from '../../lib/storage.js';

const listQuerySchema = z.object({
  search: z.string().max(120).trim().optional(),
  role: z.enum(['teacher', 'student', 'admin']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const createSchema = z.object({
  email: z.string().email('Email invalido').max(255).toLowerCase().trim(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  fullName: z.string().min(2).max(100).trim(),
  role: z.enum(['teacher', 'student', 'admin']).default('student'),
});

const updateSchema = z
  .object({
    fullName: z.string().min(2).max(100).trim().optional(),
    role: z.enum(['teacher', 'student', 'admin']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay campos para actualizar');

const passwordSchema = z.object({
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
});

const userIdSchema = z.object({ id: z.string().uuid() });

export const usersRouter = Router();

// Gestionar cuentas ajenas es cosa de administracion.
/**
 * Borra una cuenta con todo su contenido: libros, paginas, notas, bitacora y los
 * archivos que haya subido, tambien los de S3.
 *
 * Un administrador puede borrar a cualquiera; un docente, solo alumnado de sus
 * propias bibliotecas. La comprobacion vive en el servicio, no en la interfaz.
 */
usersRouter.delete(
  '/:id',
  requireAuth,
  requireRole('teacher', 'admin'),
  validate(userIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.assertPuedeBorrar(req.params.id, { id: req.auth!.userId, role: req.auth!.role });
    res.json({ deleted: await service.deleteUser(req.params.id, req.auth!.userId) });
  }),
);

usersRouter.use(requireAuth, requireRole('admin'));

usersRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await service.listUsers(req.query as never));
  }),
);

usersRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json({ stats: await service.getStats() });
  }),
);

usersRouter.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ user: await service.createUser(req.body) });
  }),
);

usersRouter.patch(
  '/:id',
  validate(userIdSchema, 'params'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    res.json({ user: await service.updateUser(req.params.id, req.auth!.userId, req.body) });
  }),
);

usersRouter.post(
  '/:id/password',
  validate(userIdSchema, 'params'),
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    await service.resetPassword(req.params.id, req.body.password);
    res.status(204).end();
  }),
);

/**
 * Estado del almacenamiento y creacion de la estructura de carpetas.
 *
 * Sirve para comprobar de un vistazo si el contenido va al disco del servidor o al
 * bucket, y para dejar el arbol creado la primera vez.
 */
usersRouter.post(
  '/storage/prepare',
  asyncHandler(async (_req, res) => {
    res.json(await prepararAlmacen());
  }),
);
