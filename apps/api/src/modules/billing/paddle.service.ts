import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';

/**
 * Cliente minimo de la API de Paddle Billing.
 *
 * Solo lo que BookStudio usa: crear un cobro (transaction) por un importe que
 * decide el servidor, leerlo para saber si esta pagado, y comprobar la firma de
 * los avisos. Sin SDK: son tres llamadas y asi no entra una dependencia mas.
 *
 * El importe NO sale del catalogo de Paddle: los precios se editan en
 * /admin/planes y las cuentas de cobro llevan el suyo. Cada cobro se crea con un
 * precio fuera de catalogo por el importe exacto, colgado del producto de
 * BookStudio que le corresponde (para que los informes de Paddle lo agrupen).
 */

const API = () => (env.PADDLE_ENV === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');

export const isPaddleEnabled = (): boolean => Boolean(env.PADDLE_API_KEY && env.PADDLE_CLIENT_TOKEN);

/** Productos de BookStudio en el catalogo de Paddle (cuenta compartida con otros productos). */
const PRODUCTO_POR_PLAN: Record<string, string> = {
  mensual: 'pro_01m447ycgykn0wd6n2ck2rjqhh',
  individual: 'pro_01m447ycgykn0wd6n2ck2rjqhh',
  escuela: 'pro_01m447yd3sx0r2frd7g6ejqy5k',
  institucional: 'pro_01m447ydh6zyy14gfxx9eeskz9',
};

export interface PaddleTransaction {
  id: string;
  /** draft, ready, billed, paid, completed, canceled, past_due */
  status: string;
  currency_code: string;
  custom_data: Record<string, unknown> | null;
  customer_id: string | null;
  details: { totals: { subtotal: string; tax: string; total: string } };
  payments?: Array<{ status: string; method_details?: { type?: string } | null }>;
  billed_at: string | null;
}

async function llamar<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`${API()}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = (await r.json().catch(() => null)) as { data?: T; error?: { code?: string; detail?: string } } | null;
  if (!r.ok || !datos?.data) {
    const codigo = datos?.error?.code ?? `http_${r.status}`;
    // El caso que se ve antes de terminar la configuracion de Paddle: se explica.
    if (codigo === 'transaction_default_checkout_url_not_set') {
      throw HttpError.badRequest('El pago con Paddle todavía no está activo. Paga con Mercado Pago o escríbenos.');
    }
    console.error(`[paddle] ${metodo} ${ruta} -> ${codigo}: ${datos?.error?.detail ?? ''}`);
    throw new HttpError(502, 'Paddle no respondió como se esperaba. Inténtalo de nuevo en unos minutos.', 'PADDLE_ERROR');
  }
  return datos.data;
}

export interface CobroNuevo {
  /** Lo que se ve en el pago y en el recibo de Paddle. */
  nombre: string;
  descripcion: string;
  /** Pesos enteros, como en el resto de BookStudio. */
  importeCop: number;
  plan?: string;
  /** Viaja en custom_data y vuelve en cada aviso: une el cobro con su intento. */
  referencia: string;
}

/**
 * Crea el cobro en Paddle, sin cliente: los datos de quien paga los recoge la
 * propia ventana de pago. Los precios de BookStudio se anuncian sin IVA, asi que
 * van como `external`: Paddle suma el impuesto que toque segun el pais.
 */
export async function crearTransaccion(c: CobroNuevo): Promise<PaddleTransaction> {
  const producto = c.plan ? PRODUCTO_POR_PLAN[c.plan] : undefined;
  return llamar<PaddleTransaction>('POST', '/transactions', {
    items: [
      {
        quantity: 1,
        price: {
          name: c.nombre.slice(0, 150),
          description: c.descripcion.slice(0, 500),
          ...(producto
            ? { product_id: producto }
            : { product: { name: `BookStudio — ${c.nombre}`.slice(0, 200), tax_category: 'saas' } }),
          // Paddle cuenta en la unidad minima: centavos de peso.
          unit_price: { amount: String(Math.round(c.importeCop) * 100), currency_code: 'COP' },
          tax_mode: 'external',
          quantity: { minimum: 1, maximum: 1 },
        },
      },
    ],
    currency_code: 'COP',
    collection_mode: 'automatic',
    custom_data: { bookstudio_ref: c.referencia },
  });
}

export async function leerTransaccion(id: string): Promise<PaddleTransaction> {
  if (!/^txn_[a-z0-9]+$/.test(id)) throw HttpError.badRequest('Cobro de Paddle no válido');
  return llamar<PaddleTransaction>('GET', `/transactions/${id}`);
}

/** Estados de un cobro que ya tiene el dinero. */
export const PAGADA = new Set(['paid', 'completed']);

/**
 * Firma de un aviso de Paddle.
 *
 * La cabecera es `Paddle-Signature: ts=1671552777;h1=<hex>`, con h1 =
 * HMAC-SHA256(secreto, `${ts}:${cuerpo}`) sobre el cuerpo TAL CUAL llego. Se
 * rechaza un aviso de hace mas de `toleranciaSeg` para que no se pueda repetir
 * uno viejo. Puede traer varios h1 mientras se rota el secreto: vale cualquiera.
 */
export function firmaValida(
  cabecera: string | undefined,
  cuerpo: Buffer | string,
  secreto: string,
  ahoraSeg = Math.floor(Date.now() / 1000),
  toleranciaSeg = 300,
): boolean {
  if (!cabecera || !secreto) return false;
  const partes = cabecera.split(';').map((p) => p.trim().split('='));
  const ts = partes.find(([k]) => k === 'ts')?.[1];
  const firmas = partes.filter(([k]) => k === 'h1').map(([, v]) => v ?? '');
  if (!ts || !/^\d+$/.test(ts) || !firmas.length) return false;
  if (Math.abs(ahoraSeg - Number(ts)) > toleranciaSeg) return false;

  const esperada = createHmac('sha256', secreto)
    .update(`${ts}:`)
    .update(typeof cuerpo === 'string' ? Buffer.from(cuerpo, 'utf8') : cuerpo)
    .digest();
  return firmas.some((h) => {
    if (!/^[0-9a-f]{64}$/i.test(h)) return false;
    const recibida = Buffer.from(h, 'hex');
    return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
  });
}
