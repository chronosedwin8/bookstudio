/**
 * Paddle.js: la ventana de pago de Paddle, encima de BookStudio.
 *
 * Se descarga solo al ir a pagar (no en cada pagina) y se inicia una vez: Paddle
 * no admite dos Initialize. Lo que pase en la ventana llega por un unico
 * eventCallback, que aqui se reparte al pago que este abierto.
 *
 * Que la ventana diga "completado" NO da nada por pagado: quien lo decide es el
 * servidor, preguntando a la API de Paddle (ver pago-paddle.service.ts).
 */

const SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js';

interface PaddleEvento {
  name?: string;
  data?: unknown;
  error?: { detail?: string };
}

interface PaddleGlobal {
  Environment: { set: (env: 'sandbox' | 'production') => void };
  Initialize: (opciones: { token: string; eventCallback: (e: PaddleEvento) => void }) => void;
  Checkout: {
    open: (opciones: {
      transactionId: string;
      customer?: { email: string };
      settings?: Record<string, unknown>;
    }) => void;
    close: () => void;
  };
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

/** En que acabo la ventana de pago, segun ella. */
export type FinVentana = 'completado' | 'cerrado' | 'error';

let carga: Promise<PaddleGlobal> | null = null;
let alTerminar: ((fin: FinVentana) => void) | null = null;

function cargarScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar el pago de Paddle. Revisa tu conexión.'));
    document.head.appendChild(s);
  });
}

/** Carga e inicia Paddle.js. Si ya estaba, devuelve el mismo. */
export function iniciarPaddle(token: string, entorno: 'production' | 'sandbox' = 'production'): Promise<PaddleGlobal> {
  if (!carga) {
    carga = cargarScript()
      .then(() => {
        const P = window.Paddle;
        if (!P) throw new Error('Paddle no se inició');
        if (entorno === 'sandbox') P.Environment.set('sandbox');
        P.Initialize({
          token,
          eventCallback: (e) => {
            if (e.name === 'checkout.completed') alTerminar?.('completado');
            else if (e.name === 'checkout.closed') alTerminar?.('cerrado');
            else if (e.name === 'checkout.error') alTerminar?.('error');
          },
        });
        return P;
      })
      .catch((err) => {
        carga = null;
        throw err;
      });
  }
  return carga;
}

/**
 * Escuchar la ventana que abre Paddle.js por su cuenta: en el enlace de pago por
 * defecto (/pagar?_ptxn=...) la abre el propio Paddle al iniciarse.
 */
export function escucharVentana(cb: (fin: FinVentana) => void): void {
  alTerminar = cb;
}

/**
 * Abre la ventana de pago de un cobro ya creado en el servidor y espera a que
 * acabe. "completado" llega en cuanto Paddle cobra; la ventana sigue abierta
 * mostrando su recibo hasta que la persona la cierra, y entonces llega "cerrado".
 */
export async function abrirPago(
  config: { clientToken: string; environment: 'production' | 'sandbox' },
  transactionId: string,
  email?: string | null,
  alCompletar?: () => void,
): Promise<FinVentana> {
  const P = await iniciarPaddle(config.clientToken, config.environment);
  return new Promise((resolve) => {
    let completado = false;
    alTerminar = (fin) => {
      if (fin === 'completado') {
        completado = true;
        alCompletar?.();
        return;
      }
      alTerminar = null;
      resolve(completado ? 'completado' : fin);
    };
    P.Checkout.open({
      transactionId,
      ...(email ? { customer: { email } } : {}),
      settings: { displayMode: 'overlay', locale: 'es', theme: 'light', variant: 'one-page' },
    });
  });
}

/**
 * Espera a que el servidor confirme el pago: el aviso de Paddle puede tardar unos
 * segundos en llegar. Pregunta cada poco y se rinde a los 90 s (el pago no se
 * pierde: se aplica igual cuando llegue el aviso).
 */
export async function esperarConfirmacion(
  consultar: () => Promise<{ estado: 'pagado' | 'esperando' | 'revisar' }>,
  limiteMs = 90_000,
): Promise<'pagado' | 'esperando' | 'revisar'> {
  const fin = Date.now() + limiteMs;
  let espera = 1500;
  for (;;) {
    const { estado } = await consultar();
    if (estado !== 'esperando' || Date.now() > fin) return estado;
    await new Promise((r) => setTimeout(r, espera));
    espera = Math.min(espera * 1.5, 6000);
  }
}
