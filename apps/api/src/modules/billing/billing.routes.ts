import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { createRateLimiter } from '../../lib/rate-limit.js';
import { HttpError } from '../../lib/http-error.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as service from './billing.service.js';
import { isBillingEnabled, verifyWebhookSignature } from './mercadopago.service.js';
import { listPlans, listVisiblePlans, updatePlan } from './plans.js';

const checkoutSchema = z.object({
  // No es un enum: los planes viven en la base y se comprueban al cobrar, que es
  // donde importa. Aqui solo se limita la forma.
  plan: z.string().min(2).max(40),
  /** Token de la tarjeta creado en el navegador; la tarjeta nunca llega al servidor. */
  token: z.string().min(8).max(120).optional(),
  paymentMethodId: z.string().min(2).max(40),
  installments: z.coerce.number().int().min(1).max(36).default(1),
  payerEmail: z.string().email().max(255).toLowerCase().trim(),
  payerDocType: z.string().max(10).optional(),
  payerDocNumber: z.string().max(30).optional(),
  organization: z.string().max(160).trim().optional(),
  autoRenew: z.boolean().default(false),
});

/** Alta y pago en un solo paso: el visitante no tiene cuenta todavia. */
const signupCheckoutSchema = checkoutSchema.extend({
  fullName: z.string().min(2, 'Escribe tu nombre').max(100).trim(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
});

const autoRenewSchema = z.object({ autoRenew: z.boolean() });

/**
 * Un intento de cobro cada pocos segundos por persona. Protege de un doble clic y
 * de alguien probando numeros de tarjeta robados contra la pasarela.
 */
const checkoutLimiter = createRateLimiter(6, 10 * 60_000);

export const billingRouter = Router();

/**
 * Catalogo y clave publica: lo unico que el navegador necesita saber.
 *
 * Es la unica fuente de los precios que se anuncian, tambien para la portada.
 * Antes la portada llevaba los suyos escritos aparte y podian dejar de coincidir
 * con lo que se cobra, que en una pagina de precios es el peor fallo posible.
 */
billingRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const planes = await listVisiblePlans();
    res.json({
      enabled: isBillingEnabled(),
      publicKey: env.MP_PUBLIC_KEY,
      currency: 'COP',
      plans: planes.map((p) => ({
        id: p.id,
        name: p.name,
        amountCop: p.amountCop,
        monthlyCop: p.monthlyCop,
        periodMonths: p.periodMonths,
        summary: p.summary,
        maxTeachers: p.maxTeachers,
        maxStudents: p.maxStudents,
      })),
    });
  }),
);

/**
 * Aviso de Mercado Pago. Va antes de requireAuth porque lo llama Mercado Pago, no
 * una persona: se responde 200 siempre que el aviso se haya entendido, para que no
 * lo reintente en bucle.
 */
billingRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const tipo = req.body?.type ?? req.query.type;
    const dataId = String(req.body?.data?.id ?? req.query['data.id'] ?? '');

    // La firma es defensa adicional: el estado real se relee de Mercado Pago.
    const firmaValida = verifyWebhookSignature(
      req.header('x-signature'),
      req.header('x-request-id'),
      dataId,
    );
    if (env.MP_WEBHOOK_SECRET && !firmaValida) {
      throw HttpError.unauthorized('Firma de la notificación no válida');
    }

    if (tipo === 'payment' && dataId) {
      await service.handlePaymentNotification(dataId);
    }

    res.status(200).json({ received: true });
  }),
);

/**
 * Contratacion sin cuenta previa: crea el usuario y cobra en la misma operacion.
 * Va antes de requireAuth porque quien entra aqui todavia no se ha registrado.
 */
billingRouter.post(
  '/signup-checkout',
  validate(signupCheckoutSchema),
  asyncHandler(async (req, res) => {
    if (checkoutLimiter.hit(req.ip ?? 'desconocida')) {
      throw new HttpError(429, 'Demasiados intentos de pago. Espera unos minutos.', 'TOO_MANY_REQUESTS');
    }
    res.status(201).json(await service.signupAndCheckout(req.body));
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

billingRouter.post(
  '/checkout',
  validate(checkoutSchema),
  asyncHandler(async (req, res) => {
    if (checkoutLimiter.hit(req.auth!.userId)) {
      throw new HttpError(429, 'Demasiados intentos de pago. Espera unos minutos.', 'TOO_MANY_REQUESTS');
    }

    const result = await service.checkout(req.auth!.userId, req.body.payerEmail, req.body);
    res.status(201).json(result);
  }),
);

billingRouter.put(
  '/auto-renew',
  validate(autoRenewSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.setAutoRenew(req.auth!.userId, req.body.autoRenew));
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
 * Planes: solo la administracion.
 *
 * Cambiar un precio es tocar dinero, asi que no basta con esconder el boton del
 * panel: estas rutas exigen rol de administracion aqui, que es donde de verdad
 * se decide.
 * ------------------------------------------------------------------------ */

const planPatchSchema = z.object({
  name: z.string().min(2).max(80).trim().optional(),
  summary: z.string().max(400).trim().optional(),
  // Enteros: el peso colombiano no tiene centavos, y un precio con decimales
  // solo sirve para que la pasarela lo redondee por su cuenta.
  amountCop: z.number().int().min(1000, 'El importe minimo es 1.000 COP').max(999_000_000).optional(),
  monthlyCop: z.number().int().min(1000).max(999_000_000).nullable().optional(),
  periodMonths: z.number().int().min(1).max(60).optional(),
  maxTeachers: z.number().int().min(1).max(100_000).nullable().optional(),
  maxStudents: z.number().int().min(1).max(1_000_000).nullable().optional(),
  visible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

/** Todos los planes, tambien los retirados: la administracion los gestiona. */
billingRouter.get(
  '/plans',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json({ plans: await listPlans() });
  }),
);

billingRouter.patch(
  '/plans/:id',
  requireRole('admin'),
  validate(planPatchSchema),
  asyncHandler(async (req, res) => {
    const plan = await updatePlan(req.params.id, req.body, req.auth!.userId);
    res.json({ plan });
  }),
);
