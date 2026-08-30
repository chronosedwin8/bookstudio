import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * Cliente de Mercado Pago.
 *
 * El token de acceso NUNCA sale de aqui: con el se puede cobrar, devolver y leer
 * todas las operaciones de la cuenta. Al navegador solo llega la clave publica.
 *
 * Se habla con la API por HTTP en vez de usar el SDK oficial para no anadir una
 * dependencia que solo se usaria en cuatro llamadas.
 */
const API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 25_000;

/** Lo que aparece en el extracto de la tarjeta del cliente. */
export const STATEMENT_DESCRIPTOR = 'BookStudio';

export function isBillingEnabled(): boolean {
  return env.MP_ACCESS_TOKEN.length > 0;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** Evita cobrar dos veces si se reintenta la misma peticion. */
  idempotencyKey?: string;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isBillingEnabled()) {
    throw HttpError.badRequest('Los pagos no estan configurados en el servidor');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (options.idempotencyKey) headers['X-Idempotency-Key'] = options.idempotencyKey;

  try {
    const response = await fetch(`${API}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      // El detalle de Mercado Pago es util para el usuario ("fondos insuficientes"),
      // pero no se propaga tal cual nada que revele configuracion interna.
      const message =
        (data as { message?: string }).message ?? `Mercado Pago respondio ${response.status}`;
      throw new HttpError(
        response.status === 400 ? 400 : 502,
        message,
        'MERCADOPAGO_ERROR',
        (data as { cause?: unknown }).cause,
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new HttpError(504, 'Mercado Pago tardo demasiado en responder', 'MERCADOPAGO_TIMEOUT');
    }
    throw new HttpError(502, 'No se pudo contactar con Mercado Pago', 'MERCADOPAGO_UNREACHABLE');
  } finally {
    clearTimeout(timeout);
  }
}

// --- Pagos ---

export interface MpPayment {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  installments?: number;
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string | null;
  payer?: { email?: string };
  external_reference?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentInput {
  /** Token de la tarjeta generado en el navegador; la PAN nunca toca el servidor. */
  token?: string;
  paymentMethodId: string;
  amountCop: number;
  description: string;
  installments: number;
  payerEmail: string;
  payerDocType?: string;
  payerDocNumber?: string;
  /** Identificador propio para reconciliar despues. */
  externalReference: string;
  metadata?: Record<string, unknown>;
}

export async function createPayment(input: CreatePaymentInput): Promise<MpPayment> {
  const body: Record<string, unknown> = {
    transaction_amount: input.amountCop,
    description: input.description,
    payment_method_id: input.paymentMethodId,
    installments: input.installments,
    external_reference: input.externalReference,
    // Lo que vera el cliente en el extracto de su tarjeta.
    statement_descriptor: STATEMENT_DESCRIPTOR,
    notification_url: env.MP_WEBHOOK_URL || undefined,
    metadata: input.metadata,
    payer: {
      email: input.payerEmail,
      ...(input.payerDocNumber
        ? { identification: { type: input.payerDocType ?? 'CC', number: input.payerDocNumber } }
        : {}),
    },
  };

  if (input.token) body.token = input.token;

  return request<MpPayment>('/v1/payments', {
    method: 'POST',
    body,
    // Reintentar la misma compra no genera un segundo cobro.
    idempotencyKey: input.externalReference,
  });
}

export async function getPayment(paymentId: string | number): Promise<MpPayment> {
  return request<MpPayment>(`/v1/payments/${paymentId}`);
}

// --- Suscripciones (renovacion automatica) ---

export interface MpPreapproval {
  id: string;
  status: string;
  init_point?: string;
  next_payment_date?: string;
  payer_email?: string;
}

export interface CreatePreapprovalInput {
  payerEmail: string;
  amountCop: number;
  reason: string;
  externalReference: string;
  backUrl: string;
  /** Token de tarjeta: con el la suscripcion queda autorizada sin pasar por MP. */
  cardTokenId?: string;
}

/**
 * Crea la suscripcion anual. Si se envia una tarjeta ya tokenizada queda
 * autorizada directamente; si no, Mercado Pago devuelve un enlace de autorizacion.
 */
export async function createPreapproval(input: CreatePreapprovalInput): Promise<MpPreapproval> {
  return request<MpPreapproval>('/preapproval', {
    method: 'POST',
    body: {
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      ...(input.cardTokenId ? { card_token_id: input.cardTokenId, status: 'authorized' } : {}),
      auto_recurring: {
        frequency: 1,
        frequency_type: 'years',
        transaction_amount: input.amountCop,
        currency_id: 'COP',
      },
    },
    idempotencyKey: input.externalReference,
  });
}

export async function getPreapproval(id: string): Promise<MpPreapproval> {
  return request<MpPreapproval>(`/preapproval/${id}`);
}

/** Cancela la renovacion automatica; la licencia sigue vigente hasta su vencimiento. */
export async function cancelPreapproval(id: string): Promise<MpPreapproval> {
  return request<MpPreapproval>(`/preapproval/${id}`, {
    method: 'PUT',
    body: { status: 'cancelled' },
  });
}

// --- Webhooks ---

/**
 * Comprueba la firma de una notificacion.
 *
 * Es una defensa adicional, no la unica: el contenido del aviso nunca se cree tal
 * cual, siempre se vuelve a pedir el pago a Mercado Pago con nuestro token.
 */
export function verifyWebhookSignature(
  signatureHeader: string | undefined,
  requestId: string | undefined,
  dataId: string | undefined,
): boolean {
  if (!env.MP_WEBHOOK_SECRET) return false;
  if (!signatureHeader || !dataId) return false;

  // Formato: "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8c1584"
  const partes = Object.fromEntries(
    signatureHeader.split(',').map((trozo) => {
      const [clave, valor] = trozo.split('=');
      return [clave?.trim(), valor?.trim()];
    }),
  );

  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId ?? ''};ts:${ts};`;
  const esperado = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex');

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  // timingSafeEqual exige la misma longitud y no debe filtrar por tiempo.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Referencia unica para cada intento de cobro. */
export function newExternalReference(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
