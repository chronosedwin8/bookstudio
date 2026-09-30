import { query, withTransaction } from '../../db/pool.js';
import * as mp from './mercadopago.service.js';
import { nombrePlan, type PlanId } from './plans.js';

/**
 * Suscripciones, licencias y facturas.
 *
 * Regla de oro: el importe sale siempre del catalogo del servidor y el estado de un
 * pago se toma siempre de lo que responde Mercado Pago, nunca de lo que diga el
 * navegador o el cuerpo de un webhook.
 */

export type SubscriptionStatus = 'pendiente' | 'activa' | 'vencida' | 'cancelada';

export interface Subscription {
  id: string;
  plan: PlanId;
  planName: string;
  status: SubscriptionStatus;
  organization: string | null;
  amountCop: number;
  autoRenew: boolean;
  maxTeachers: number | null;
  maxStudents: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  /** Dias que faltan para el vencimiento; negativo si ya vencio. */
  daysLeft: number | null;
  payerEmail: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: number;
  amountCop: number;
  status: string;
  statusDetail: string | null;
  paymentMethod: string | null;
  installments: number | null;
  payerEmail: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface SubscriptionRow {
  id: string;
  plan: PlanId;
  status: SubscriptionStatus;
  organization: string | null;
  amount_cop: string;
  auto_renew: boolean;
  max_teachers: number | null;
  max_students: number | null;
  starts_at: Date | null;
  expires_at: Date | null;
  payer_email: string | null;
  mp_preapproval_id: string | null;
}

const SUBSCRIPTION_COLUMNS = `id, plan, status, organization, amount_cop, auto_renew,
  max_teachers, max_students, starts_at, expires_at, payer_email, mp_preapproval_id`;

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function toSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    plan: row.plan,
    planName: nombrePlan(row.plan),
    status: row.status,
    organization: row.organization,
    amountCop: Number(row.amount_cop),
    autoRenew: row.auto_renew,
    maxTeachers: row.max_teachers,
    maxStudents: row.max_students,
    startsAt: row.starts_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    daysLeft: daysUntil(row.expires_at),
    payerEmail: row.payer_email,
  };
}

/**
 * Marca como vencidas las suscripciones cuya fecha ya paso.
 *
 * Se hace al consultar en vez de con una tarea programada: asi el estado siempre es
 * correcto aunque el servidor haya estado apagado.
 */
async function expireOverdue(): Promise<void> {
  await query(
    `UPDATE subscriptions SET status = 'vencida'
     WHERE status = 'activa' AND expires_at IS NOT NULL AND expires_at < NOW()`,
  );
}

/** Suscripcion vigente (o la ultima que hubo) de una persona. */
export async function getSubscription(ownerId: string): Promise<Subscription | null> {
  await expireOverdue();

  const { rows } = await query<SubscriptionRow>(
    `SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions
     WHERE owner_id = $1
     ORDER BY (status = 'activa') DESC, expires_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [ownerId],
  );

  return rows[0] ? toSubscription(rows[0]) : null;
}

export async function listInvoices(ownerId: string): Promise<Invoice[]> {
  const { rows } = await query<{
    id: string;
    invoice_number: string;
    amount_cop: string;
    status: string;
    status_detail: string | null;
    payment_method: string | null;
    installments: number | null;
    payer_email: string | null;
    paid_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, invoice_number, amount_cop, status, status_detail, payment_method,
            installments, payer_email, paid_at, created_at
     FROM payments WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [ownerId],
  );

  return rows.map((row) => ({
    id: row.id,
    invoiceNumber: Number(row.invoice_number),
    amountCop: Number(row.amount_cop),
    status: row.status,
    statusDetail: row.status_detail,
    paymentMethod: row.payment_method,
    installments: row.installments,
    payerEmail: row.payer_email,
    paidAt: row.paid_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  }));
}

// --- Contratacion ---

/**
 * Lo que dura una licencia, leido del plan en la propia consulta.
 *
 * Se calcula en SQL y no en JavaScript porque estas actualizaciones ocurren dentro
 * de la transaccion del aviso de pago, donde no conviene ir y volver a la base.
 * Si el plan hubiera desaparecido se toma un ano, que es lo que eran todos los
 * planes hasta que aparecio el mensual.
 */
const DURACION_DEL_PLAN = `(
  COALESCE((SELECT p.period_months FROM plans p WHERE p.id = s.plan), 12) * INTERVAL '1 month'
)`;

/** Estados de Mercado Pago que dan derecho a usar la licencia. */
const APPROVED = new Set(['approved', 'authorized']);

/**
 * Apaga la renovacion automatica de una licencia contratada antes del cambio a
 * enlaces de pago. Ya no se puede encender: pedia cuenta de Mercado Pago.
 */
export async function cancelAutoRenew(ownerId: string): Promise<{ subscription: Subscription | null }> {
  const { rows } = await query<SubscriptionRow>(
    `SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions
     WHERE owner_id = $1 AND auto_renew = TRUE
     ORDER BY created_at DESC LIMIT 1`,
    [ownerId],
  );
  const row = rows[0];
  if (row) {
    if (row.mp_preapproval_id) {
      // Si en Mercado Pago ya no existe, basta con apagarla de nuestro lado.
      await mp.cancelPreapproval(row.mp_preapproval_id).catch(() => undefined);
    }
    await query('UPDATE subscriptions SET auto_renew = FALSE, mp_preapproval_id = NULL WHERE id = $1', [row.id]);
  }
  return { subscription: await getSubscription(ownerId) };
}

// --- Webhook ---

/**
 * Procesa un aviso de Mercado Pago.
 *
 * El cuerpo del aviso solo se usa para saber QUE pago mirar; el estado se vuelve a
 * pedir a Mercado Pago con nuestro token, que es lo unico en lo que se confia.
 */
export async function handlePaymentNotification(paymentId: string): Promise<void> {
  const payment = await mp.getPayment(paymentId);

  const aprobado = APPROVED.has(payment.status);

  const ownerId = (payment.metadata?.owner_id ?? payment.metadata?.ownerId) as string | undefined;

  await withTransaction(async (client) => {
    // Si el pago ya existe se actualiza; si es una renovacion automatica, se crea.
    const existente = await client.query<{ id: string; subscription_id: string | null; charge_id: string | null }>(
      'SELECT id, subscription_id, charge_id FROM payments WHERE mp_payment_id = $1',
      [String(payment.id)],
    );

    if (existente.rows[0]) {
      await client.query(
        `UPDATE payments SET status = $2, status_detail = $3, paid_at = $4 WHERE id = $1`,
        [existente.rows[0].id, payment.status, payment.status_detail, payment.date_approved ?? null],
      );

      /*
       * Una cuenta de cobro pagada por PSE o Efecty se aprueba minutos u horas
       * despues. Sin esto se quedaria como pendiente para siempre y el cliente
       * veria una deuda que ya pago.
       */
      const chargeId = existente.rows[0].charge_id;
      if (chargeId && aprobado) {
        await client.query(
          `UPDATE charges SET status = 'pagada', paid_at = COALESCE(paid_at, NOW())
           WHERE id = $1 AND status <> 'anulada'`,
          [chargeId],
        );
      }

      const subscriptionId = existente.rows[0].subscription_id;
      if (subscriptionId && aprobado) {
        // Un pago que se aprueba mas tarde (PSE, Efecty) activa la licencia.
        // La duracion la dice el plan contratado: con el plan de un mes, dar un
        // ano seria regalar once. Si el plan ya no existiera, se asume anual.
        await client.query(
          `UPDATE subscriptions s
           SET status = 'activa',
               starts_at = COALESCE(s.starts_at, NOW()),
               expires_at = COALESCE(s.expires_at, NOW() + ${DURACION_DEL_PLAN})
           WHERE s.id = $1 AND s.status <> 'cancelada'`,
          [subscriptionId],
        );
      }
      return;
    }

    if (!ownerId) return;

    // Renovacion: se prolonga la licencia otro periodo desde su vencimiento, el
    // que dure el plan. Cobrar cada mes y dar un ano de licencia seria un regalo.
    const suscripcion = await client.query<{ id: string }>(
      `UPDATE subscriptions s
       SET status = 'activa',
           expires_at = GREATEST(COALESCE(s.expires_at, NOW()), NOW()) + ${DURACION_DEL_PLAN}
       WHERE s.id = (
         SELECT id FROM subscriptions
         WHERE owner_id = $1 AND status <> 'cancelada'
         ORDER BY created_at DESC LIMIT 1
       )
       RETURNING s.id`,
      [ownerId],
    );

    await client.query(
      `INSERT INTO payments
         (subscription_id, owner_id, mp_payment_id, amount_cop, status, status_detail,
          payment_method, installments, payer_email, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (mp_payment_id) DO NOTHING`,
      [
        suscripcion.rows[0]?.id ?? null,
        ownerId,
        String(payment.id),
        Math.round(payment.transaction_amount),
        payment.status,
        payment.status_detail,
        payment.payment_method_id ?? null,
        payment.installments ?? null,
        payment.payer?.email ?? null,
        payment.date_approved ?? null,
      ],
    );
  });
}

// --- Vista de administracion ---

export interface AdminSubscription extends Subscription {
  ownerName: string;
  ownerEmail: string;
  paidTotalCop: number;
}

export async function listAllSubscriptions(): Promise<AdminSubscription[]> {
  await expireOverdue();

  const { rows } = await query<
    SubscriptionRow & { owner_name: string; owner_email: string; paid_total: string }
  >(
    `SELECT s.id, s.plan, s.status, s.organization, s.amount_cop, s.auto_renew,
            s.max_teachers, s.max_students, s.starts_at, s.expires_at, s.payer_email,
            s.mp_preapproval_id,
            u.full_name AS owner_name, u.email AS owner_email,
            COALESCE((SELECT SUM(p.amount_cop) FROM payments p
                      WHERE p.subscription_id = s.id AND p.status = 'approved'), 0) AS paid_total
     FROM subscriptions s
     JOIN users u ON u.id = s.owner_id
     ORDER BY s.created_at DESC
     LIMIT 500`,
  );

  return rows.map((row) => ({
    ...toSubscription(row),
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    paidTotalCop: Number(row.paid_total),
  }));
}
