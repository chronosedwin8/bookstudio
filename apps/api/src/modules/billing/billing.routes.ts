import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as service from './billing.service.js';
import { verifyWebhookSignature } from './mercadopago.service.js';
import { borrarEnlace, enlaceParaImporte, guardarEnlace, listarEnlaces } from './payment-links.service.js';
import { listPlans, listVisiblePlans, updatePlan } from './plans.js';

/**
 * Cobros.
 *
 * Desde el 30 de septiembre de 2026 BookStudio no cobra: ni tarjeta dentro de la
 * aplicacion, ni pagina de Mercado Pago con cuenta, ni renovacion automatica. El
 * cliente paga en el enlace de Mercado Pago de su importe y la administracion
 * activa la licencia (Clientes) o salda la cuenta de cobro al recibir el pago.
 *
 * Aqui quedan: el catalogo con el enlace de cada plan, la licencia y las facturas
 * de cada cual, la gestion de planes y enlaces, y el aviso de Mercado Pago para
 * los cobros ya hechos (por ejemplo, una renovacion automatica anterior).
 */
export const billingRouter = Router();

/**
 * Catalogo: precios y el enlace de pago de cada plan.
 *
 * Es la unica fuente de los precios que se anuncian, tambien para la portada. Un
 * plan sin enlace para su importe exacto sale sin enlace: la interfaz ofrece
 * escribir en vez de mandar a pagar una cantidad equivocada.
 */
billingRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const planes = await listVisiblePlans();
    res.json({
      currency: 'COP',
      contactEmail: 'hola@bookstudio.uk',
      plans: await Promise.all(
        planes.map(async (p) => ({
          id: p.id,
          name: p.name,
          amountCop: p.amountCop,
          monthlyCop: p.monthlyCop,
          periodMonths: p.periodMonths,
          summary: p.summary,
          maxTeachers: p.maxTeachers,
          maxStudents: p.maxStudents,
          paymentLink: await enlaceParaImporte(p.amountCop),
        })),
      ),
    });
  }),
);

/**
 * Aviso de Mercado Pago. Va antes de requireAuth porque lo llama Mercado Pago, no
 * una persona. Se conserva para los cobros que ya existian (renovaciones
 * automaticas dadas de alta antes del cambio): se responde 200 siempre que el
 * aviso se haya entendido, para que no lo reintente en bucle.
 */
billingRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const tipo = req.body?.type ?? req.query.type;
    const dataId = String(req.body?.data?.id ?? req.query['data.id'] ?? '');

    // La firma es defensa adicional: el estado real se relee de Mercado Pago.
    const firmaValida = verifyWebhookSignature(req.header('x-signature'), req.header('x-request-id'), dataId);
    if (env.MP_WEBHOOK_SECRET && !firmaValida) {
      throw HttpError.unauthorized('Firma de la notificación no válida');
    }

    if (tipo === 'payment' && dataId) {
      await service.handlePaymentNotification(dataId);
    }

    res.status(200).json({ received: true });
  }),
);

billingRouter.use(requireAuth);

/** Licencia vigente de quien consulta. */
billingRouter.get(
  '/subscription',
  asyncHandler(async (req, res) => {
    res.json({ subscription: await service.getSubscription(req.auth!.userId) });
  }),
);

billingRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    res.json({ invoices: await service.listInvoices(req.auth!.userId) });
  }),
);

/**
 * Apagar una renovacion automatica dada de alta antes del cambio. Ya no se puede
 * encender (pedia cuenta de Mercado Pago), pero quien la tenga puede quitarla.
 */
billingRouter.put(
  '/auto-renew',
  validate(z.object({ autoRenew: z.literal(false) })),
  asyncHandler(async (req, res) => {
    res.json(await service.cancelAutoRenew(req.auth!.userId));
  }),
);

/** Panel de administracion: todas las licencias del sistema. */
billingRouter.get(
  '/subscriptions',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json({ subscriptions: await service.listAllSubscriptions() });
  }),
);

/* ---------------------------------------------------------------------------
 * Planes y enlaces de pago: solo la administracion.
 *
 * Cambiar un precio o un enlace es tocar dinero, asi que no basta con esconder el
 * boton del panel: estas rutas exigen rol de administracion aqui, que es donde de
 * verdad se decide.
 * ------------------------------------------------------------------------ */

const planPatchSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
  summary: z.string().max(400).trim().optional(),
  // Enteros: el peso colombiano no tiene centavos.
  amountCop: z.number().int().min(1000, 'El importe minimo es 1.000 COP').max(999_000_000).optional(),
  monthlyCop: z.number().int().min(1000).max(999_000_000).nullable().optional(),
  periodMonths: z.number().int().min(1).max(60).optional(),
  maxTeachers: z.number().int().min(1).max(100_000).nullable().optional(),
  maxStudents: z.number().int().min(1).max(1_000_000).nullable().optional(),
  visible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

/** Todos los planes, tambien los retirados, cada uno con su enlace si lo tiene. */
billingRouter.get(
  '/plans',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const planes = await listPlans();
    res.json({
      plans: await Promise.all(planes.map(async (p) => ({ ...p, paymentLink: await enlaceParaImporte(p.amountCop) }))),
    });
  }),
);

billingRouter.patch(
  '/plans/:id',
  requireRole('admin'),
  validate(planPatchSchema),
  asyncHandler(async (req, res) => {
    const plan = await updatePlan(req.params.id, req.body, req.auth!.userId);
    res.json({ plan: { ...plan, paymentLink: await enlaceParaImporte(plan.amountCop) } });
  }),
);

billingRouter.get(
  '/payment-links',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json({ links: await listarEnlaces() });
  }),
);

/** Pone o cambia el enlace de un importe. */
billingRouter.put(
  '/payment-links',
  requireRole('admin'),
  validate(
    z.object({
      amountCop: z.number().int().min(1000, 'El importe minimo es 1.000 COP').max(2_000_000_000),
      url: z.string().trim().max(500),
      label: z.string().trim().max(120).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json({ link: await guardarEnlace(req.body, req.auth!.userId) });
  }),
);

billingRouter.delete(
  '/payment-links/:id',
  requireRole('admin'),
  validate(z.object({ id: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    await borrarEnlace(req.params.id);
    res.status(204).end();
  }),
);
