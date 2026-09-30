import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { env } from '../../config/env.js';
import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { signAccessToken, type UserRole } from '../../lib/tokens.js';
import * as mp from './mercadopago.service.js';
import { addMonths, getPlan, getPlanParaContratar } from './plans.js';

/**
 * Pagar en la pagina de Mercado Pago (Checkout Pro).
 *
 * A diferencia del pago con tarjeta dentro de BookStudio, aqui el cliente se va a
 * Mercado Pago, entra con SU cuenta y paga alli (tarjetas guardadas, saldo, PSE,
 * Efecty). Es lo que recomiendan las pasarelas en Colombia: los pagos con cuenta
 * pasan menos controles que los de invitado y se rechazan menos.
 *
 * El problema es que el resultado llega DESPUES, por dos caminos que pueden
 * cruzarse: el aviso de Mercado Pago y la consulta que hace el navegador al volver.
 * Por eso todo gira alrededor de un intento guardado antes de salir:
 *
 *   1. Se apunta el intento (que se paga, cuanto, para quien) y se crea la pagina.
 *   2. Cuando un pago aprobado llega por cualquiera de los dos caminos, se cumple:
 *      se crea la cuenta y la licencia, o se salda la cuenta de cobro.
 *   3. Se cumple UNA sola vez: la fila del intento se bloquea y, si ya esta
 *      cumplida, no se hace nada. Da igual cual de los dos caminos llegue antes.
 *
 * Reglas que no se negocian:
 *   - El importe sale del servidor, y al cumplir se comprueba que el pago lo
 *     cubre y que es en pesos. Un pago menor no se da por bueno.
 *   - El estado del pago se pide siempre a Mercado Pago con nuestro token; nunca
 *     se cree lo que diga la URL de vuelta.
 *   - La cuenta nueva no existe hasta que el pago esta aprobado: quien abandona no
 *     deja cuentas a medias ni ocupa su correo.
 */

/** Estados de Mercado Pago que dan el pago por bueno. */
const APROBADO = new Set(['approved']);
/** Estados de un pago que todavia puede acabar aprobado (PSE, Efecty, revision). */
const EN_TRAMITE = new Set(['pending', 'in_process', 'in_mediation', 'authorized']);

interface IntentoRow {
  id: string;
  reference: string;
  kind: 'plan' | 'charge';
  amount_cop: string;
  owner_id: string | null;
  plan: string | null;
  organization: string | null;
  auto_renew: boolean;
  payer_email: string | null;
  signup_name: string | null;
  signup_password_hash: string | null;
  claim_hash: string | null;
  charge_id: string | null;
  init_point: string | null;
  status: 'abierta' | 'pagada' | 'revisar';
  last_mp_status: string | null;
  last_mp_detail: string | null;
  user_id: string | null;
  fulfilled_at: Date | null;
}

const huella = (secreto: string): string => createHash('sha256').update(secreto).digest('hex');

/** A donde vuelve el cliente desde Mercado Pago. */
const urlDeVuelta = (reference: string): string =>
  `${(env.APP_URL || 'https://bookstudio.uk').replace(/\/$/, '')}/pago/resultado?ref=${encodeURIComponent(reference)}`;

export interface IntentoCreado {
  reference: string;
  /** La pagina de pago de Mercado Pago, a la que hay que mandar al cliente. */
  initPoint: string;
  /**
   * Solo en altas nuevas: el secreto que el navegador guarda para recibir la
   * sesion de su cuenta al volver. No viaja a Mercado Pago ni a ninguna URL.
   */
  claim?: string;
}

async function guardarPreferencia(intento: { id: string; reference: string }, preferencia: mp.MpPreference): Promise<void> {
  await query('UPDATE payment_intents SET mp_preference_id = $2, init_point = $3 WHERE id = $1', [
    intento.id,
    preferencia.id,
    preferencia.init_point,
  ]);
}

// ------------------------------------------------------------ contratar un plan

export interface IntentoPlanInput {
  plan: string;
  payerEmail: string;
  organization?: string;
  autoRenew: boolean;
  /** Presente cuando quien paga aun no tiene cuenta. */
  signup?: { fullName: string; password: string };
}

export async function crearIntentoPlan(
  ownerId: string | null,
  input: IntentoPlanInput,
): Promise<IntentoCreado> {
  if (!mp.isBillingEnabled()) throw HttpError.badRequest('Los pagos no estan configurados');
  const plan = await getPlanParaContratar(input.plan);
  const correo = input.payerEmail.trim().toLowerCase();

  let claim: string | undefined;
  let hash: string | null = null;
  let nombre: string | null = null;

  if (!ownerId) {
    if (!input.signup) throw HttpError.badRequest('Faltan los datos de la cuenta');
    // Se comprueba ya, para no mandar a pagar a quien luego no podria tener cuenta.
    const existe = await query('SELECT 1 FROM users WHERE email = $1', [correo]);
    if (existe.rowCount) {
      throw HttpError.conflict('Ya existe una cuenta con ese correo. Inicia sesión y paga desde tu panel.');
    }
    hash = await bcrypt.hash(input.signup.password, 12);
    nombre = input.signup.fullName.trim().slice(0, 100);
    claim = randomBytes(32).toString('base64url');
  }

  const reference = mp.newExternalReference(`bs-mp-${plan.id}`);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payment_intents
       (reference, kind, amount_cop, owner_id, plan, organization, auto_renew, payer_email,
        signup_name, signup_password_hash, claim_hash)
     VALUES ($1, 'plan', $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      reference,
      plan.amountCop,
      ownerId,
      plan.id,
      input.organization?.trim() || null,
      input.autoRenew,
      correo,
      nombre,
      hash,
      claim ? huella(claim) : null,
    ],
  );

  const preferencia = await mp.createPreference({
    externalReference: reference,
    title: `BookStudio · Plan ${plan.name} (${plan.periodMonths} ${plan.periodMonths === 1 ? 'mes' : 'meses'})`,
    amountCop: plan.amountCop,
    payerEmail: correo,
    backUrl: urlDeVuelta(reference),
  });
  await guardarPreferencia({ id: rows[0].id, reference }, preferencia);

  return { reference, initPoint: preferencia.init_point, ...(claim ? { claim } : {}) };
}

// ------------------------------------------------------------ cuenta de cobro

export async function crearIntentoCobro(
  userId: string,
  cobro: { id: string; number: number; amountCop: number; status: string },
  payerEmail?: string,
): Promise<IntentoCreado> {
  if (!mp.isBillingEnabled()) throw HttpError.badRequest('Los pagos no estan configurados');
  if (cobro.status === 'pagada') throw HttpError.badRequest('Esta cuenta ya esta pagada');
  if (cobro.status !== 'emitida') throw HttpError.badRequest('Esta cuenta no se puede pagar');

  const reference = mp.newExternalReference(`bs-mp-cobro-${cobro.number}`);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO payment_intents (reference, kind, amount_cop, owner_id, charge_id, payer_email)
     VALUES ($1, 'charge', $2, $3, $4, $5) RETURNING id`,
    [reference, cobro.amountCop, userId, cobro.id, payerEmail?.trim().toLowerCase() || null],
  );

  const preferencia = await mp.createPreference({
    externalReference: reference,
    title: `BookStudio · Cuenta de cobro ${cobro.number}`,
    amountCop: cobro.amountCop,
    payerEmail: payerEmail?.trim() || undefined,
    backUrl: urlDeVuelta(reference),
  });
  await guardarPreferencia({ id: rows[0].id, reference }, preferencia);

  return { reference, initPoint: preferencia.init_point };
}

// ------------------------------------------------------------ cumplir

/**
 * Aplica un pago de Mercado Pago a su intento, si lo tiene.
 *
 * Devuelve falso si el pago no es de ningun intento: entonces es un pago de los
 * de siempre (tarjeta dentro de BookStudio, renovacion) y lo trata el aviso
 * normal. Es seguro llamarlo varias veces con el mismo pago.
 */
export async function aplicarPago(pago: mp.MpPayment): Promise<boolean> {
  const referencia = pago.external_reference;
  if (!referencia) return false;

  const { rows } = await query<{ id: string }>('SELECT id FROM payment_intents WHERE reference = $1', [referencia]);
  if (!rows[0]) return false;

  await withTransaction(async (client) => {
    // Bloqueo: el aviso de Mercado Pago y la consulta del navegador pueden llegar
    // a la vez. El segundo espera aqui y, al ver el intento cumplido, no hace nada.
    const { rows: bloqueado } = await client.query<IntentoRow>(
      'SELECT * FROM payment_intents WHERE reference = $1 FOR UPDATE',
      [referencia],
    );
    const intento = bloqueado[0];
    if (!intento || intento.status !== 'abierta') return;

    await client.query(
      `UPDATE payment_intents SET last_mp_status = $2, last_mp_detail = $3, mp_payment_id = $4 WHERE id = $1`,
      [intento.id, pago.status, pago.status_detail ?? null, String(pago.id)],
    );
    if (!APROBADO.has(pago.status)) return;

    // El pago tiene que cubrir lo que se esperaba, y en pesos.
    const cubre = Math.round(Number(pago.transaction_amount)) >= Number(intento.amount_cop)
      && (!pago.currency_id || pago.currency_id === 'COP');
    if (!cubre) {
      await marcarRevisar(client, intento, pago, null);
      return;
    }

    if (intento.kind === 'charge') await cumplirCobro(client, intento, pago);
    else await cumplirPlan(client, intento, pago);
  });

  return true;
}

async function registrarPago(
  client: pg.PoolClient,
  datos: { subscriptionId: string | null; ownerId: string | null; chargeId: string | null; amountCop: number },
  pago: mp.MpPayment,
): Promise<void> {
  await client.query(
    `INSERT INTO payments
       (subscription_id, owner_id, charge_id, mp_payment_id, amount_cop, status, status_detail,
        payment_method, installments, payer_email, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (mp_payment_id) DO NOTHING`,
    [
      datos.subscriptionId,
      datos.ownerId,
      datos.chargeId,
      String(pago.id),
      datos.amountCop,
      pago.status,
      pago.status_detail ?? null,
      pago.payment_method_id ?? null,
      pago.installments ?? null,
      pago.payer?.email ?? null,
      pago.date_approved ?? new Date().toISOString(),
    ],
  );
}

async function marcarRevisar(
  client: pg.PoolClient,
  intento: IntentoRow,
  pago: mp.MpPayment,
  ownerId: string | null,
): Promise<void> {
  // El dinero ha entrado: se apunta siempre, aunque no se pueda aplicar solo.
  await registrarPago(client, { subscriptionId: null, ownerId, chargeId: intento.charge_id, amountCop: Math.round(Number(pago.transaction_amount)) }, pago);
  await client.query(`UPDATE payment_intents SET status = 'revisar', fulfilled_at = NOW() WHERE id = $1`, [intento.id]);
}

async function cumplirCobro(client: pg.PoolClient, intento: IntentoRow, pago: mp.MpPayment): Promise<void> {
  const { rows } = await client.query<{ subscription_id: string | null; owner_id: string | null; status: string }>(
    `SELECT c.subscription_id, o.owner_id, c.status
       FROM charges c JOIN organizations o ON o.id = c.organization_id
      WHERE c.id = $1 FOR UPDATE OF c`,
    [intento.charge_id],
  );
  const cobro = rows[0];
  if (!cobro || cobro.status === 'anulada') {
    await marcarRevisar(client, intento, pago, intento.owner_id);
    return;
  }

  await registrarPago(
    client,
    { subscriptionId: cobro.subscription_id, ownerId: cobro.owner_id, chargeId: intento.charge_id, amountCop: Number(intento.amount_cop) },
    pago,
  );
  await client.query(
    `UPDATE charges SET status = 'pagada', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1 AND status <> 'anulada'`,
    [intento.charge_id],
  );
  await client.query(
    `UPDATE payment_intents SET status = 'pagada', user_id = owner_id, fulfilled_at = NOW() WHERE id = $1`,
    [intento.id],
  );
}

async function cumplirPlan(client: pg.PoolClient, intento: IntentoRow, pago: mp.MpPayment): Promise<void> {
  let ownerId = intento.owner_id;

  // Alta nueva: la cuenta se crea ahora, con el pago ya aprobado.
  if (!ownerId) {
    const ocupado = await client.query('SELECT 1 FROM users WHERE email = $1', [intento.payer_email]);
    if (ocupado.rowCount || !intento.signup_password_hash || !intento.payer_email) {
      // Alguien registro ese correo mientras se pagaba. El pago queda apuntado y la
      // administracion lo resuelve; la pantalla de vuelta lo explica.
      await marcarRevisar(client, intento, pago, null);
      return;
    }
    const nuevo = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'teacher') RETURNING id`,
      [intento.payer_email, intento.signup_password_hash, intento.signup_name ?? intento.payer_email],
    );
    ownerId = nuevo.rows[0].id;
    await client.query(
      'INSERT INTO student_portfolios (student_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [ownerId, `Portafolio de ${intento.signup_name ?? intento.payer_email}`.slice(0, 150)],
    );
  }

  const plan = await getPlan(intento.plan ?? '');
  const meses = plan?.periodMonths ?? 12;
  const ahora = new Date();
  const suscripcion = await client.query<{ id: string }>(
    `INSERT INTO subscriptions
       (owner_id, organization, plan, status, amount_cop, max_teachers, max_students,
        auto_renew, payer_email, starts_at, expires_at)
     VALUES ($1, $2, $3, 'activa', $4, $5, $6, FALSE, $7, $8, $9)
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

  await registrarPago(
    client,
    { subscriptionId: suscripcion.rows[0].id, ownerId, chargeId: null, amountCop: Number(intento.amount_cop) },
    pago,
  );

  await client.query(
    `UPDATE payment_intents
        SET status = 'pagada', user_id = $2, subscription_id = $3, fulfilled_at = NOW(),
            -- La contrasena ya vive en su cuenta: no se guarda dos veces.
            signup_password_hash = NULL
      WHERE id = $1`,
    [intento.id, ownerId, suscripcion.rows[0].id],
  );
}

// ------------------------------------------------------------ al volver

export type EstadoIntento = 'aprobado' | 'en_tramite' | 'rechazado' | 'esperando' | 'revisar';

export interface RespuestaEstado {
  estado: EstadoIntento;
  kind: 'plan' | 'charge';
  detalle: string | null;
  /** Para volver a intentarlo en Mercado Pago si se rechazo. */
  initPoint: string | null;
  /** Si pidio renovacion automatica: se activa desde su panel una vez dentro. */
  autoRenew: boolean;
  /** Alta nueva aprobada: la sesion de su cuenta, solo con el secreto correcto. */
  session?: { token: string; user: { id: string; email: string; fullName: string; role: string } };
}

function claimValido(recibido: string | undefined, guardado: string | null): boolean {
  if (!recibido || !guardado) return false;
  const a = Buffer.from(huella(recibido), 'utf8');
  const b = Buffer.from(guardado, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Como va el pago de un intento, para la pantalla de vuelta.
 *
 * Solo lo puede consultar quien lo creo: con su sesion si ya tenia cuenta, o con
 * el secreto que guardo su navegador si era un alta nueva. A cualquier otro se le
 * responde que no existe.
 *
 * Si el intento sigue abierto se le pregunta a Mercado Pago en el momento: asi el
 * resultado no depende de que su aviso haya llegado (o de que llegue: en local no
 * llega nunca).
 */
export async function consultarIntento(
  reference: string,
  quien: { userId?: string; role?: string; claim?: string },
): Promise<RespuestaEstado> {
  const leer = async () =>
    (await query<IntentoRow>('SELECT * FROM payment_intents WHERE reference = $1', [reference])).rows[0];

  let intento = await leer();
  if (!intento) throw HttpError.notFound('Pago no encontrado');

  const esSuyo = intento.owner_id
    ? quien.userId === intento.owner_id || quien.role === 'admin'
    : claimValido(quien.claim, intento.claim_hash);
  if (!esSuyo) throw HttpError.notFound('Pago no encontrado');

  if (intento.status === 'abierta') {
    try {
      const pagos = await mp.searchPaymentsByReference(reference);
      // Primero el aprobado, si lo hay; si no, el mas reciente dice como va.
      const elegido = pagos.find((p) => APROBADO.has(p.status)) ?? pagos[0];
      if (elegido) {
        await aplicarPago(elegido);
        intento = (await leer())!;
      }
    } catch {
      // Si Mercado Pago no responde ahora, se contesta con lo que ya se sabe.
    }
  }

  const base = {
    kind: intento.kind,
    detalle: intento.last_mp_detail,
    initPoint: intento.init_point,
    autoRenew: intento.auto_renew,
  };

  if (intento.status === 'revisar') return { ...base, estado: 'revisar' };

  if (intento.status === 'pagada') {
    const respuesta: RespuestaEstado = { ...base, estado: 'aprobado' };
    // Alta nueva: se entrega la sesion para que entre sin escribir la contrasena.
    if (!intento.owner_id && intento.user_id && claimValido(quien.claim, intento.claim_hash)) {
      const { rows } = await query<{ id: string; email: string; full_name: string; role: string }>(
        'SELECT id, email, full_name, role FROM users WHERE id = $1',
        [intento.user_id],
      );
      const u = rows[0];
      if (u) {
        respuesta.session = {
          token: signAccessToken({ sub: u.id, role: u.role as UserRole, kind: 'session' }),
          user: { id: u.id, email: u.email, fullName: u.full_name, role: u.role },
        };
      }
    }
    return respuesta;
  }

  const ultimo = intento.last_mp_status;
  if (ultimo && EN_TRAMITE.has(ultimo)) return { ...base, estado: 'en_tramite' };
  if (ultimo) return { ...base, estado: 'rechazado' };
  return { ...base, estado: 'esperando' };
}
