import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  billingDataSchema,
  chargeParamsSchema,
  createChargeSchema,
  createTeacherSchema,
  linkOwnerSchema,
  orgParamsSchema,
  organizationSchema,
  payChargeSchema,
  teacherParamsSchema,
  updateChargeSchema,
  updateTeacherSchema,
} from './clients.schemas.js';
import * as service from './clients.service.js';

export const clientsRouter = Router();

clientsRouter.use(requireAuth);

/**
 * La administracion de BookStudio puede mirar el portal de cualquier cliente
 * pasando su id; un cliente sin este parametro siempre acaba en el suyo, y con el
 * id de otro recibe un 404.
 */
const orgQuerySchema = z.object({ organizationId: z.string().uuid().optional() });
const deQuery = (req: { query: unknown }) => (req.query as { organizationId?: string }).organizationId;

// --- Portal del cliente ---

clientsRouter.get(
  '/portal',
  validate(orgQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ portal: await service.getPortal(req.auth!.userId, req.auth!.role, deQuery(req)) });
  }),
);

clientsRouter.patch(
  '/billing-data',
  validate(orgQuerySchema, 'query'),
  validate(billingDataSchema),
  asyncHandler(async (req, res) => {
    res.json({
      organization: await service.updateBillingData(req.auth!.userId, req.auth!.role, req.body, deQuery(req)),
    });
  }),
);

// --- Equipo docente ---

clientsRouter.get(
  '/team',
  validate(orgQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ team: await service.listTeam(req.auth!.userId, req.auth!.role, deQuery(req)) });
  }),
);

clientsRouter.post(
  '/team',
  validate(orgQuerySchema, 'query'),
  validate(createTeacherSchema),
  asyncHandler(async (req, res) => {
    const creado = await service.createTeacher(req.auth!.userId, req.auth!.role, req.body, deQuery(req));
    res.status(201).json(creado);
  }),
);

clientsRouter.patch(
  '/team/:id',
  validate(teacherParamsSchema, 'params'),
  validate(orgQuerySchema, 'query'),
  validate(updateTeacherSchema),
  asyncHandler(async (req, res) => {
    res.json({
      member: await service.updateTeacher(
        req.auth!.userId,
        req.auth!.role,
        req.params.id,
        req.body,
        deQuery(req),
      ),
    });
  }),
);

clientsRouter.delete(
  '/team/:id',
  validate(teacherParamsSchema, 'params'),
  validate(orgQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await service.removeTeacher(req.auth!.userId, req.auth!.role, req.params.id, deQuery(req)));
  }),
);

// --- Cuentas de cobro ---

clientsRouter.get(
  '/charges/:id',
  validate(chargeParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ charge: await service.getCharge(req.auth!.userId, req.auth!.role, req.params.id) });
  }),
);

clientsRouter.post(
  '/charges/:id/pay',
  validate(chargeParamsSchema, 'params'),
  validate(payChargeSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.payCharge(req.auth!.userId, req.auth!.role, req.params.id, req.body));
  }),
);

// --- Administracion de BookStudio ---

clientsRouter.get(
  '/organizations',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json({ organizations: await service.listOrganizations() });
  }),
);

clientsRouter.post(
  '/organizations',
  requireRole('admin'),
  validate(organizationSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ organization: await service.createOrganization(req.body) });
  }),
);

clientsRouter.post(
  '/organizations/:id/owner',
  requireRole('admin'),
  validate(orgParamsSchema, 'params'),
  validate(linkOwnerSchema),
  asyncHandler(async (req, res) => {
    res.json({ organization: await service.linkOwner(req.params.id, req.body.email) });
  }),
);

clientsRouter.get(
  '/organizations/:id/charges',
  requireRole('admin'),
  validate(orgParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ charges: await service.listCharges(req.params.id) });
  }),
);

clientsRouter.post(
  '/organizations/:id/charges',
  requireRole('admin'),
  validate(orgParamsSchema, 'params'),
  validate(createChargeSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ charge: await service.createCharge(req.params.id, req.auth!.userId, req.body) });
  }),
);

clientsRouter.patch(
  '/charges/:id',
  requireRole('admin'),
  validate(chargeParamsSchema, 'params'),
  validate(updateChargeSchema),
  asyncHandler(async (req, res) => {
    res.json({ charge: await service.updateCharge(req.params.id, req.body) });
  }),
);
