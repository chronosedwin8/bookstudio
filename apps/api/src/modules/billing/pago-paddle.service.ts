import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { env } from '../../config/env.js';
import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import * as paddle from './paddle.service.js';
import { addMonths, getPlan, getPlanParaContratar } from './plans.js';

/**
 * Pagar con Paddle, como alternativa a los enlaces de Mercado Pago.
 *
 * El dinero entra por la ventana de pago de Paddle, encima de BookStudio, y el
 * resultado llega despues por dos caminos que pueden cruzarse: el aviso firmado
 * de Paddle y la consulta del navegador al cerrar la ventana. Todo gira, como en
 * la integracion de Mercado Pago que hubo hasta el 30 de septiembre de 2026,
 * alrededor de un intento guardado ANTES de cobrar:
 *
 *   1. Se apunta el intento (que se paga, cuanto, quien) y se crea el cobro.
 *   2. Cuando Paddle dice que esta pagado, se cumple: licencia o cuenta saldada.
 *   3. Se cumple UNA vez: la fila se bloquea y, si ya esta cumplida, no se toca.
 *
 * Reglas que no se negocian:
 *   - El importe sale del servidor. Al cumplir se comprueba que lo cobrado (sin
 *     impuestos) cubre lo esperado y que es en pesos.
 *   - El estado se pide siempre a la API de Paddle con nuestra clave. Ni el aviso
 *     ni el navegador deciden: el aviso solo dice que cobro mirar.
 *   - Para pagar hace falta sesion: la licencia se cuelga de una cuenta que ya
 *     existe, y nadie ocupa un correo pagando a medias.
 */

interface IntentoRow {
  id: string;
  reference: string;
  kind: 'plan' | 'charge';
  amount_cop: string;
  owner_id: string | null;
  plan: string | null;
  organization: string | null;
  payer_email: string | null;
  charge_id: string | null;
  status: 'abierta' | 'pagada' | 'revisar';
  paddle_transaction_id: string | null;
  paddle_status: string | null;
  subscription_id: string | null;
}

export interface IntentoPaddle {
  reference: string;
  transactionId: string;
  /** Para precargar el correo en la ventana de pago. */
  email: string | null;
}

const nuevaReferencia = (base: string) => `bs-pd-${base}-${randomBytes(6).toString('hex')}`.slice(0, 80);

function exigirPaddle(): void {
  if (!paddle.isPaddleEnabled()) throw HttpError.badRequest('El pago con Paddle no está disponible');
}

async function correoDe(userId: string): Promise<string | null> {
  const { rows } = await query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  return rows[0]?.email ?? null;
}

async function abrir(
  datos: { kind: 'plan' | 'charge'; amountCop: number; ownerId: string; plan?: string; organization?: string | null; chargeId?: string },
  cobro: Omit<paddle.CobroNuevo, 'referencia' | 'importeCop'>,
): Promise<IntentoPaddle> {
  const email = await correoDe(datos.ownerId);
  const reference = nuevaReferencia(datos.kind === 'plan' ? datos.plan ?? 'plan' : 'cobro');
  // Primero el cobro en Paddle y despues el intento: si Paddle falla no queda
  // nada a medias aqui. El orden no abre carrera: nadie puede pagar un cobro
  // cuyo id aun no se ha devuelto al navegador.
  const tx = await paddle.crearTransaccion({ ...cobro, importeCop: datos.amountCop, referencia: reference });
  await query(
    `INSERT INTO payment_intents
       (reference, provider, kind, amount_cop, owner_id, plan, organization, payer_email, charge_id,
        paddle_transaction_id, paddle_status)
     VALUES ($1, 'paddle', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      reference,
      datos.kind,
      datos.amountCop,
      datos.ownerId,
      datos.plan ?? null,
      datos.organization ?? null,
      email,
      datos.chargeId ?? null,
      tx.id,
      tx.status,
    ],
  );
  return { reference, transactionId: tx.id, email };
}

// ------------------------------------------------------------ crear

export async function crearIntentoPlan(ownerId: string, planId: string, organization?: string): Promise<IntentoPaddle> {
  exigirPaddle();
  const plan = await getPlanParaContratar(planId);
  const periodo = `${plan.periodMonths} ${plan.periodMonths === 1 ? 'mes' : 'meses'}`;
  return abrir(
    { kind: 'plan', amountCop: plan.amountCop, ownerId, plan: plan.id, organization: organization?.trim() || null },
    { nombre: `Plan ${plan.name}`, descripcion: `BookStudio · Plan ${plan.name} (${periodo})`, plan: plan.id },
  );
}

export async function crearIntentoCobro(
  userId: string,
  cobro: { id: string; number: number; amountCop: number; status: string; concept: string },
): Promise<IntentoPaddle> {
  exigirPaddle();
  if (cobro.status === 'pagada') throw HttpError.badRequest('Esta cuenta ya está pagada');
  if (cobro.status !== 'emitida') throw HttpError.badRequest('Esta cuenta no se puede pagar');
  return abrir(
    { kind: 'charge', amountCop: cobro.amountCop, ownerId: userId, chargeId: cobro.id },
    { nombre: `Cuenta de cobro ${cobro.number}`, descripcion: `BookStudio · Cuenta de cobro ${cobro.number}: ${cobro.concept}` },
  );
}

// ------------------------------------------------------------ cumplir

/**
 * Aplica un cobro de Paddle a su intento. Seguro de llamar varias veces y desde
 * los dos caminos a la vez. Devuelve falso si el cobro no es de BookStudio (la
 * cuenta de Paddle es compartida con otros productos y sus avisos llegan aqui).
 */
export async function aplicarTransaccion(tx: paddle.PaddleTransaction): Promise<boolean> {
  const referencia = String(tx.custom_data?.bookstudio_ref ?? '');
  if (!referencia.startsWith('bs-pd-')) return false;

  await withTransaction(async (client) => {
    const { rows } = await client.query<IntentoRow>(
      `SELECT * FROM payment_intents WHERE reference = $1 AND provider = 'paddle' FOR UPDATE`,
      [referencia],
    );
    const intento = rows[0];
    if (!intento || intento.status !== 'abierta') return;
    // El aviso tiene que ser del cobro que se creo para este intento.
    if (intento.paddle_transaction_id && intento.paddle_transaction_id !== tx.id) return;

    await client.query('UPDATE payment_intents SET paddle_status = $2, paddle_transaction_id = $3 WHERE id = $1', [
      intento.id,
      tx.status,
      tx.id,
    ]);
    if (!paddle.PAGADA.has(tx.status)) return;

    // Lo cobrado, sin impuestos, tiene que cubrir lo esperado, y en pesos.
    const cobradoCop = Math.floor(Number(tx.details?.totals?.subtotal ?? 0) / 100);
    const cubre = tx.currency_code === 'COP' && cobradoCop >= Number(intento.amount_cop);
    if (!cubre) {
      await marcarRevisar(client, intento, tx, cobradoCop);
      return;
    }

    if (intento.kind === 'charge') await cumplirCobro(client, intento, tx);
    else await cumplirPlan(client, intento, tx);
  });
  return true;
}

async function registrarPago(
  client: pg.PoolClient,
  datos: { subscriptionId: string | null; ownerId: string | null; chargeId: string | null; amountCop: number; email: string | null },
  tx: paddle.PaddleTransaction,
): Promise<void> {
  const metodo = tx.payments?.find((p) => p.status === 'captured')?.method_details?.type ?? null;
  await client.query(
    `INSERT INTO payments
       (subscription_id, owner_id, charge_id, paddle_transaction_id, amount_cop, status, status_detail,
        payment_method, payer_email, paid_at)
     VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7, $8, COALESCE($9::timestamptz, NOW()))
     ON CONFLICT (paddle_transaction_id) WHERE paddle_transaction_id IS NOT NULL DO NOTHING`,
    [
      datos.subscriptionId,
      datos.ownerId,
      datos.chargeId,
      tx.id,
      datos.amountCop,
      `Paddle ${tx.id}`,
      metodo ? `paddle_${metodo}`.slice(0, 60) : 'paddle',
      datos.email,
      tx.billed_at,
    ],
  );
}

async function marcarRevisar(client: pg.PoolClient, intento: IntentoRow, tx: paddle.PaddleTransaction, cobradoCop: number): Promise<void> {
  // El dinero ha entrado: se apunta siempre, aunque no se pueda aplicar solo.
  await registrarPago(
    client,
    { subscriptionId: null, ownerId: intento.owner_id, chargeId: intento.charge_id, amountCop: cobradoCop, email: intento.payer_email },
    tx,
  );
  await client.query(`UPDATE payment_intents SET status = 'revisar', fulfilled_at = NOW() WHERE id = $1`, [intento.id]);
}

async function cumplirCobro(client: pg.PoolClient, intento: IntentoRow, tx: paddle.PaddleTransaction): Promise<void> {
  const { rows } = await client.query<{ subscription_id: string | null; owner_id: string | null; status: string }>(
    `SELECT c.subscription_id, o.owner_id, c.status
       FROM charges c JOIN organizations o ON o.id = c.organization_id
      WHERE c.id = $1 FOR UPDATE OF c`,
    [intento.charge_id],
  );
  const cobro = rows[0];
  // Anulada o ya pagada por otro camino (Mercado Pago, a mano): el pago se
  // apunta y la administracion decide (devolverlo o aplicarlo a otra cuenta).
  if (!cobro || cobro.status !== 'emitida') {
    await marcarRevisar(client, intento, tx, Number(intento.amount_cop));
    return;
  }
  await registrarPago(
    client,
    {
      subscriptionId: cobro.subscription_id,
      ownerId: cobro.owner_id ?? intento.owner_id,
      chargeId: intento.charge_id,
      amountCop: Number(intento.amount_cop),
      email: intento.payer_email,
    },
    tx,
  );
  await client.query(`UPDATE charges SET status = 'pagada', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1`, [
    intento.charge_id,
  ]);
  await client.query(
    `UPDATE payment_intents SET status = 'pagada', user_id = owner_id, fulfilled_at = NOW() WHERE id = $1`,
    [intento.id],
  );
}

async function cumplirPlan(client: pg.PoolClient, intento: IntentoRow, tx: paddle.PaddleTransaction): Promise<void> {
  const ownerId = intento.owner_id;
  if (!ownerId) {
    await marcarRevisar(client, intento, tx, Number(intento.amount_cop));
    return;
  }
  const plan = await getPlan(intento.plan ?? '');
  const meses = plan?.periodMonths ?? 12;

  /*
   * Renovar el mismo plan alarga la licencia vigente desde su vencimiento: pagar
   * antes de tiempo no debe hacer perder los dias que quedaban. Un plan distinto
   * (o no tener licencia) abre una licencia nueva desde hoy.
   */
  const vigente = await client.query<{ id: string }>(
    `UPDATE subscriptions s
        SET expires_at = GREATEST(COALESCE(s.expires_at, NOW()), NOW()) + make_interval(months => $3),
            amount_cop = $4
      WHERE s.id = (
        SELECT id FROM subscriptions
         WHERE owner_id = $1 AND plan = $2 AND status = 'activa'
         ORDER BY expires_at DESC NULLS LAST LIMIT 1
      )
      RETURNING s.id`,
    [ownerId, intento.plan, meses, Number(intento.amount_cop)],
  );

  let subscriptionId = vigente.rows[0]?.id;
  if (!subscriptionId) {
    const ahora = new Date();
    const nueva = await client.query<{ id: string }>(
      `INSERT INTO subscriptions
         (owner_id, organization, organization_id, plan, status, amount_cop, max_teachers, max_students,
          auto_renew, payer_email, starts_at, expires_at)
       VALUES ($1, $2, (SELECT id FROM organizations WHERE owner_id = $1 ORDER BY created_at LIMIT 1),
               $3, 'activa', $4, $5, $6, FALSE, $7, $8, $9)
       RETURNING id`,
      [
        ownerId,
        intento.organization,
        intento.plan,
        Number(intento.amount_cop),
        plan?.maxTeachers ?? null,
        plan?.maxStudents ?? null,
        intento.payer_email,
        ahora,
        addMonths(ahora, meses),
      ],
    );
    subscriptionId = nueva.rows[0].id;
  }

  await registrarPago(
    client,
    { subscriptionId, ownerId, chargeId: null, amountCop: Number(intento.amount_cop), email: intento.payer_email },
    tx,
  );
  await client.query(
    `UPDATE payment_intents SET status = 'pagada', user_id = owner_id, subscription_id = $2, fulfilled_at = NOW() WHERE id = $1`,
    [intento.id, subscriptionId],
  );
}

// ------------------------------------------------------------ consultar

export type EstadoPaddle = 'pagado' | 'esperando' | 'revisar';

/**
 * Como va un intento, para la pantalla que espera al cerrar la ventana de pago.
 * Solo lo ve quien lo creo (o la administracion). Si sigue abierto se le
 * pregunta a Paddle en el momento: asi no depende de que el aviso haya llegado.
 */
export async function consultarIntento(
  reference: string,
  quien: { userId: string; role: string },
): Promise<{ estado: EstadoPaddle; kind: 'plan' | 'charge' }> {
  const leer = async () =>
    (await query<IntentoRow>(`SELECT * FROM payment_intents WHERE reference = $1 AND provider = 'paddle'`, [reference]))
      .rows[0];

  let intento = await leer();
  if (!intento || (intento.owner_id !== quien.userId && quien.role !== 'admin')) {
    throw HttpError.notFound('Pago no encontrado');
  }

  if (intento.status === 'abierta' && intento.paddle_transaction_id) {
    try {
      await aplicarTransaccion(await paddle.leerTransaccion(intento.paddle_transaction_id));
      intento = (await leer())!;
    } catch {
      // Si Paddle no responde ahora, se contesta con lo que ya se sabe.
    }
  }

  const estado: EstadoPaddle =
    intento.status === 'pagada' ? 'pagado' : intento.status === 'revisar' ? 'revisar' : 'esperando';
  return { estado, kind: intento.kind };
}

/** Lo que el navegador necesita para abrir Paddle.js. El token es publico. */
export function configuracionPublica(): { enabled: boolean; clientToken: string | null; environment: string } {
  const enabled = paddle.isPaddleEnabled();
  return { enabled, clientToken: enabled ? env.PADDLE_CLIENT_TOKEN : null, environment: env.PADDLE_ENV };
}
