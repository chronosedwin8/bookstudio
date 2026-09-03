import { nextTick, onBeforeUnmount, ref } from 'vue';

/**
 * Formulario de tarjeta de Mercado Pago.
 *
 * Vive aparte porque lo usan dos pantallas —contratar un plan y pagar una cuenta
 * de cobro— y porque cada detalle de aqui viene de un fallo real: el formulario
 * se quedaba cargando para siempre y nadie sabia por que.
 *
 * Los datos de la tarjeta los recoge el formulario de Mercado Pago dentro de su
 * propio iframe y se convierten en un token de un solo uso. No pasan por este
 * codigo ni por nuestro servidor.
 */

/** Si en este tiempo no hay formulario, algo lo esta bloqueando. */
const ESPERA_MAXIMA_MS = 15_000;

let sdkCargando: Promise<void> | null = null;

function cargarSdk(): Promise<void> {
  if ((window as unknown as { MercadoPago?: unknown }).MercadoPago) return Promise.resolve();
  // Un unico <script> aunque se pida el SDK varias veces seguidas.
  if (!sdkCargando) {
    sdkCargando = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://sdk.mercadopago.com/js/v2';
      script.onload = () => resolve();
      script.onerror = () => {
        sdkCargando = null;
        reject(new Error('No se pudo cargar la pasarela de pago. Revisa tu conexion.'));
      };
      document.head.appendChild(script);
    });
  }
  return sdkCargando;
}

export interface DatosTarjeta {
  token?: string;
  payment_method_id: string;
  installments?: number | string;
  payer?: { email?: string; identification?: { type?: string; number?: string } };
}

export interface OpcionesPago {
  /** Id del div donde Mercado Pago monta su formulario. */
  contenedor: string;
  publicKey: () => string;
  /** Importe a cobrar, en pesos enteros. */
  amount: () => number | null;
  /** Correo con el que precargar el formulario; puede faltar. */
  email?: () => string;
  maxInstallments?: number;
  /** Que hacer cuando la persona envia la tarjeta. */
  alPagar: (datos: DatosTarjeta) => Promise<void>;
}

export function usePagoTarjeta(opciones: OpcionesPago) {
  const listo = ref(false);
  /** Motivo por el que el formulario no llego a estar listo. */
  const fallo = ref<string | null>(null);

  let mercadoPago: unknown = null;
  let mando: { unmount?: () => void } | null = null;
  /** Distingue el montaje vigente de los que quedaron atras al cambiar de importe. */
  let generacion = 0;
  let temporizador: number | undefined;

  /**
   * Desmonta con el mando que devuelve Mercado Pago. Vaciar el div a mano deja al
   * SDK apuntando a un iframe que ya no existe, y el formulario siguiente no llega
   * a estar listo nunca.
   */
  function desmontar(): void {
    try {
      mando?.unmount?.();
    } catch {
      // Ya estaba desmontado: no hay nada que rescatar.
    }
    mando = null;
  }

  async function montar(): Promise<void> {
    const importe = opciones.amount();
    const clave = opciones.publicKey();
    if (!importe || !clave) return;

    const mio = ++generacion;
    listo.value = false;
    fallo.value = null;
    window.clearTimeout(temporizador);

    // El hueco del formulario vive dentro de un v-if. El SDK busca el elemento por
    // su id una sola vez y no reintenta, asi que hay que dejar que Vue lo pinte.
    await nextTick();
    desmontar();

    try {
      await cargarSdk();
      if (mio !== generacion) return;

      if (!document.getElementById(opciones.contenedor)) {
        throw new Error('No se encontro el hueco del formulario de pago.');
      }

      mercadoPago ??= new (window as unknown as {
        MercadoPago: new (key: string, options: { locale: string }) => unknown;
      }).MercadoPago(clave, { locale: 'es-CO' });

      // Sin esto, un bloqueador de anuncios deja "Cargando..." para siempre y nadie
      // sabe que ha pasado.
      temporizador = window.setTimeout(() => {
        if (mio === generacion && !listo.value) {
          fallo.value =
            'El formulario de pago no termino de cargar. Casi siempre es un bloqueador de anuncios ' +
            'o la proteccion contra rastreo del navegador: desactivalos para este sitio y reintenta.';
        }
      }, ESPERA_MAXIMA_MS);

      const correo = (opciones.email?.() ?? '').trim();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mando = await (mercadoPago as any).bricks().create('cardPayment', opciones.contenedor, {
        initialization: {
          amount: importe,
          // Si no hay correo se omite el dato: el propio formulario lo pedira.
          ...(correo ? { payer: { email: correo } } : {}),
        },
        customization: { paymentMethods: { maxInstallments: opciones.maxInstallments ?? 12 } },
        callbacks: {
          onReady: () => {
            if (mio !== generacion) return;
            window.clearTimeout(temporizador);
            listo.value = true;
            fallo.value = null;
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onSubmit: async (datos: any) => {
            await opciones.alPagar(datos as DatosTarjeta);
          },
          onError: (err: { message?: string }) => {
            if (mio !== generacion) return;
            window.clearTimeout(temporizador);
            fallo.value = err?.message ?? 'No se pudo cargar el formulario de pago.';
          },
        },
      });
    } catch (err) {
      if (mio !== generacion) return;
      window.clearTimeout(temporizador);
      fallo.value = err instanceof Error ? err.message : 'No se pudo cargar el formulario de pago.';
    }
  }

  onBeforeUnmount(() => {
    window.clearTimeout(temporizador);
    desmontar();
  });

  return { listo, fallo, montar, desmontar };
}
