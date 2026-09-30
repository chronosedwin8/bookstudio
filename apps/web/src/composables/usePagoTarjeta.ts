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

/**
 * Si el propio SDK no llega en este tiempo, se da por perdido. Una peticion colgada
 * (VPN, red que descarta paquetes) no dispara ni onload ni onerror: sin plazo, la
 * pantalla se quedaba en "Cargando el formulario seguro..." para siempre. Es el
 * mismo arreglo que ya tenia la pantalla de contratar.
 */
const ESPERA_SDK_MS = 12_000;
const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

let sdkCargando: Promise<void> | null = null;
let intentosSdk = 0;

function cargarSdk(): Promise<void> {
  if ((window as unknown as { MercadoPago?: unknown }).MercadoPago) return Promise.resolve();
  // Un unico <script> aunque se pida el SDK varias veces seguidas.
  if (!sdkCargando) {
    sdkCargando = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      // En los reintentos, la misma direccion con un parametro distinto: si no, el
      // navegador reaprovecha la peticion colgada y "Reintentar" no hace nada.
      intentosSdk++;
      script.src = intentosSdk === 1 ? SDK_URL : `${SDK_URL}?reintento=${intentosSdk}`;

      // Al fallar se olvida la promesa y se retira el <script> muerto, para que
      // reintentar vuelva a intentarlo de verdad.
      const rendirse = (motivo: string) => {
        window.clearTimeout(plazo);
        sdkCargando = null;
        script.remove();
        reject(new Error(motivo));
      };
      const plazo = window.setTimeout(
        () => rendirse(
          'La pasarela de pago no respondio. Si usas una VPN o una red con filtros, ' +
          'desactivalos para este sitio y reintenta.',
        ),
        ESPERA_SDK_MS,
      );

      script.onload = () => {
        window.clearTimeout(plazo);
        resolve();
      };
      script.onerror = () => rendirse('No se pudo cargar la pasarela de pago. Revisa tu conexion.');
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

    // El reloj va ANTES de cargar el SDK: armado despues, una descarga colgada
    // impedia que llegara a armarse nunca.
    temporizador = window.setTimeout(() => {
      if (mio === generacion && !listo.value) {
        fallo.value =
          'El formulario de pago no termino de cargar. Suele ser un bloqueador de anuncios, la ' +
          'proteccion contra rastreo del navegador o una VPN: desactivalos para este sitio y reintenta.';
      }
    }, ESPERA_MAXIMA_MS);

    try {
      await cargarSdk();
      if (mio !== generacion) return;

      if (!document.getElementById(opciones.contenedor)) {
        throw new Error('No se encontro el hueco del formulario de pago.');
      }

      mercadoPago ??= new (window as unknown as {
        MercadoPago: new (key: string, options: { locale: string }) => unknown;
      }).MercadoPago(clave, { locale: 'es-CO' });

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
