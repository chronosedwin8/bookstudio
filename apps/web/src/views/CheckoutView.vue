<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { useSeo } from '@/composables/useSeo';
import { billingApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { SITE } from '@/utils/site';
import type { BillingConfig, BillingPlan } from '@/types/api';
import { duracionTexto, pesos } from '@/utils/precio';

/**
 * Contratacion directa: se elige plan, se crean las credenciales y se paga en la
 * misma pantalla. Al terminar, la persona entra a la aplicacion sin volver a
 * identificarse: el servidor devuelve la sesion junto con el resultado del cobro.
 *
 * Los datos de la tarjeta los recoge el formulario de Mercado Pago y se convierten
 * en un token de un solo uso; no pasan por este codigo ni por nuestro servidor.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

useSeo({
  title: `Contratar · ${SITE.name}`,
  description: 'Elige tu plan, crea tu cuenta y empieza a usar BookStudio en el mismo paso.',
  path: '/contratar',
});

const config = ref<BillingConfig | null>(null);
const plan = ref<BillingPlan | null>(null);
const loading = ref(true);
const paying = ref(false);
const error = ref<string | null>(null);
const brickReady = ref(false);
/** Motivo por el que el formulario de pago no llego a estar listo. */
const brickFailed = ref<string | null>(null);

const form = ref({
  fullName: '',
  email: '',
  password: '',
  organization: '',
  autoRenew: true,
});

/** El formato del dinero es el mismo en toda la aplicacion; vive en un solo sitio. */
const cop = { format: pesos };

/** Cuando ya hay sesion, el cobro va contra la cuenta existente. */
const yaTieneCuenta = computed(() => auth.isAuthenticated && !auth.isTrial);

const datosCompletos = computed(
  () =>
    yaTieneCuenta.value ||
    (form.value.fullName.trim().length >= 2 &&
      /.+@.+\..+/.test(form.value.email) &&
      form.value.password.length >= 8),
);

const CONTENEDOR = 'mp-brick';
const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
/** Si en este tiempo no hay formulario, algo lo esta bloqueando. */
const ESPERA_MAXIMA_MS = 15_000;
/**
 * Y si el propio SDK no llega en este tiempo, se da por perdido.
 *
 * Una peticion que se queda colgada no dispara onload ni onerror: sin este plazo,
 * la promesa no se resuelve nunca y la pantalla se queda en "Cargando el
 * formulario seguro..." indefinidamente. Pasa con una VPN o una red que descarta
 * los paquetes en silencio.
 */
const ESPERA_SDK_MS = 12_000;

let mercadoPago: unknown = null;
let brickController: { unmount?: () => void } | null = null;
let sdkCargando: Promise<void> | null = null;
let intentosSdk = 0;
let vigilanteActual: { bloqueos: () => string[]; parar: () => void } | null = null;
/** Distingue el montaje vigente de los que quedaron atras al cambiar de plan. */
let generacion = 0;
let temporizador: number | undefined;

function loadSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  // Un unico <script> aunque se pida el SDK varias veces seguidas.
  if (!sdkCargando) {
    sdkCargando = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');

      /*
       * En los reintentos se pide la MISMA direccion con un parametro distinto.
       *
       * Sin el, el navegador no vuelve a pedir nada: reaprovecha la peticion
       * anterior, que sigue colgada, y "Reintentar" no hace nada aunque la red ya
       * funcione. Comprobado: tras pulsarlo no salia ni una peticion. El SDK
       * ignora el parametro y responde lo mismo byte a byte.
       */
      intentosSdk++;
      script.src = intentosSdk === 1 ? SDK_URL : `${SDK_URL}?reintento=${intentosSdk}`;

      /**
       * Al fallar se olvida la promesa y se retira el <script> muerto.
       *
       * Sin esto, "Reintentar" devolvia la misma promesa ya rechazada (o peor,
       * una que nunca se iba a resolver) y el boton no hacia absolutamente nada.
       */
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

/**
 * Desmonta con el mando que devuelve Mercado Pago. Vaciar el div a mano deja al SDK
 * apuntando a un iframe que ya no existe, y el formulario siguiente no llega a estar
 * listo nunca.
 */
function desmontar(): void {
  try {
    brickController?.unmount?.();
  } catch {
    // Ya estaba desmontado: no hay nada que rescatar.
  }
  brickController = null;
}

/**
 * Escucha lo que la politica de seguridad del sitio bloquea mientras se monta el
 * pago.
 *
 * El SDK de Mercado Pago inyecta un script en linea que nuestra politica no
 * permite (y no se puede permitir por su huella: cambia en cada carga). Hoy el
 * formulario funciona igual, comprobado en Chrome y en Firefox. Pero si algun dia
 * dejara de funcionar por eso, el sintoma seria otra pantalla muerta sin
 * explicacion. Asi al menos se dice en voz alta.
 */
function vigilanciaCsp(): { bloqueos: () => string[]; parar: () => void } {
  const vistos: string[] = [];

  const alBloquear = (evento: SecurityPolicyViolationEvent) => {
    if (!/mercadopago|mlstatic|mercadolibre/i.test(evento.sourceFile ?? '')) return;
    vistos.push(`${evento.violatedDirective} <- ${evento.blockedURI || evento.sourceFile}`);
  };

  document.addEventListener('securitypolicyviolation', alBloquear);
  return {
    bloqueos: () => vistos,
    parar: () => document.removeEventListener('securitypolicyviolation', alBloquear),
  };
}

async function mountBrick(): Promise<void> {
  if (!plan.value || !config.value?.enabled) return;

  const mio = ++generacion;
  brickReady.value = false;
  brickFailed.value = null;
  window.clearTimeout(temporizador);

  // El hueco del formulario vive dentro de un v-if. El SDK busca el elemento por su
  // id una sola vez y no reintenta, asi que hay que dejar que Vue lo pinte primero.
  await nextTick();
  desmontar();

  /*
   * El reloj se pone ANTES de tocar nada, no despues de descargar el SDK.
   *
   * Estaba armado despues, asi que si la descarga se quedaba colgada no saltaba
   * nunca: la pantalla decia "Cargando el formulario seguro..." indefinidamente,
   * sin error y sin boton de reintentar. Comprobado dejando la peticion al SDK
   * en el aire: 35 segundos y ni un aviso.
   */
  // Solo uno a la vez: cambiar de plan remonta, y el anterior sobraba.
  vigilanteActual?.parar();
  const vigilarCsp = vigilanciaCsp();
  vigilanteActual = vigilarCsp;

  temporizador = window.setTimeout(() => {
    if (mio !== generacion || brickReady.value) return;

    // El aviso general sirve para casi todos los casos. Solo si ademas la politica
    // de seguridad bloqueo algo se dice, porque entonces el problema es nuestro y
    // no hay nada que la persona pueda desactivar para arreglarlo.
    const bloqueos = vigilarCsp.bloqueos();
    brickFailed.value = bloqueos.length
      ? 'El formulario de pago no cargo: la politica de seguridad de este sitio bloqueo una parte ' +
        'de la pasarela. Es un fallo nuestro, no tuyo. Escribenos y lo resolvemos.'
      : 'El formulario de pago no termino de cargar. Suele ser un bloqueador de anuncios, la ' +
        'proteccion contra rastreo del navegador o una VPN: desactivalos para este sitio y reintenta.';

    if (bloqueos.length) {
      // eslint-disable-next-line no-console
      console.warn('[pago] bloqueado por la politica de seguridad:', bloqueos.join(' | '));
    }

    // Se ha dado por perdido: ya no hace falta seguir escuchando.
    vigilarCsp.parar();
  }, ESPERA_MAXIMA_MS);

  try {
    await loadSdk();
    if (mio !== generacion) return;

    if (!document.getElementById(CONTENEDOR)) {
      throw new Error('No se encontro el hueco del formulario de pago.');
    }

    mercadoPago ??= new (window as unknown as {
      MercadoPago: new (key: string, options: { locale: string }) => unknown;
    }).MercadoPago(config.value.publicKey, { locale: 'es-CO' });

    const correo = (form.value.email || auth.user?.email || '').trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brickController = await (mercadoPago as any).bricks().create('cardPayment', CONTENEDOR, {
      initialization: {
        amount: plan.value.amountCop,
        // Si no hay correo se omite el dato: el propio formulario lo pedira.
        ...(correo ? { payer: { email: correo } } : {}),
      },
      customization: { paymentMethods: { maxInstallments: 12 } },
      callbacks: {
        onReady: () => {
          if (mio !== generacion) return;
          window.clearTimeout(temporizador);
          vigilarCsp.parar();
          brickReady.value = true;
          brickFailed.value = null;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSubmit: async (data: any) => {
          await pay(data);
        },
        onError: (brickError: { message?: string }) => {
          if (mio !== generacion) return;
          window.clearTimeout(temporizador);
          vigilarCsp.parar();
          brickFailed.value = brickError?.message ?? 'No se pudo cargar el formulario de pago.';
        },
      },
    });
  } catch (err) {
    if (mio !== generacion) return;
    window.clearTimeout(temporizador);
    vigilarCsp.parar();
    brickFailed.value = err instanceof Error ? err.message : 'No se pudo cargar el formulario de pago.';
  }
}

onBeforeUnmount(() => {
  window.clearTimeout(temporizador);
  vigilanteActual?.parar();
  desmontar();
});

function choosePlan(selected: BillingPlan): void {
  plan.value = selected;
  error.value = null;
  // Un plan de un mes se anuncia como "sin permanencia": llegar al pago con la
  // renovacion ya marcada contradice lo que dice la portada. En los anuales la
  // renovacion sigue siendo lo esperable, porque nadie quiere que su licencia
  // caduque a mitad de curso.
  form.value.autoRenew = selected.periodMonths > 1;
  void mountBrick();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pay(data: any): Promise<void> {
  if (!plan.value) return;
  if (!datosCompletos.value) {
    error.value = 'Completa tu nombre, correo y contrasena antes de pagar.';
    return;
  }

  paying.value = true;
  error.value = null;

  const comun = {
    plan: plan.value.id,
    token: data.token,
    paymentMethodId: data.payment_method_id,
    installments: Number(data.installments ?? 1),
    payerDocType: data.payer?.identification?.type,
    payerDocNumber: data.payer?.identification?.number,
    organization: form.value.organization || undefined,
    autoRenew: form.value.autoRenew,
  };

  try {
    if (yaTieneCuenta.value) {
      await billingApi.checkout({
        ...comun,
        payerEmail: data.payer?.email ?? auth.user!.email,
      });
    } else {
      // El servidor crea la cuenta y cobra en la misma operacion; si la tarjeta se
      // rechaza, no queda ninguna cuenta a medias.
      const result = await billingApi.signupCheckout({
        ...comun,
        fullName: form.value.fullName,
        password: form.value.password,
        payerEmail: form.value.email,
      });
      auth.applySession({ user: result.user as never, token: result.sessionToken });
    }

    await router.push({ name: 'billing', query: { bienvenida: '1' } });
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    paying.value = false;
  }
}

onMounted(async () => {
  let preseleccionado: BillingPlan | undefined;
  try {
    config.value = await billingApi.config();
    if (auth.user?.email && !auth.isTrial) form.value.email = auth.user.email;

    // El plan puede venir preseleccionado desde la portada: /contratar?plan=escuela
    const pedido = String(route.query.plan ?? '');
    preseleccionado = config.value.plans.find((p) => p.id === pedido);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }

  // Despues de apagar "loading": hasta entonces la seccion del pago no esta en el
  // DOM y el SDK no encontraria donde pintarse.
  if (preseleccionado) choosePlan(preseleccionado);
});
</script>

<template>
  <div class="min-h-full bg-slate-50">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <RouterLink :to="{ name: 'landing' }" class="flex items-center gap-2 font-black text-brand-700">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">B</span>
          {{ SITE.name }}
        </RouterLink>
        <RouterLink v-if="!auth.isAuthenticated" :to="{ name: 'login' }" class="btn-secondary">
          Ya tengo cuenta
        </RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-10">
      <h1 class="text-3xl font-black text-slate-900">Contratar {{ SITE.name }}</h1>
      <p class="mt-2 text-slate-600">
        Eliges plan, creas tu cuenta y pagas en el mismo paso. Al terminar entras directo al editor.
      </p>

      <AlertMessage class="mt-4" :message="error" />

      <p v-if="loading" class="mt-8 text-sm text-slate-500">Cargando planes...</p>

      <p v-else-if="config && !config.enabled" class="card mt-8 p-6 text-sm text-amber-700">
        Los pagos no están disponibles ahora mismo. Vuelve a intentarlo en unos minutos.
      </p>

      <template v-else-if="config">
        <!-- 1. Plan -->
        <section class="mt-8">
          <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">1 · Elige tu plan</h2>

          <ul class="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <li v-for="item in config.plans" :key="item.id">
              <button
                type="button"
                class="flex h-full w-full flex-col rounded-xl border-2 bg-white p-5 text-left transition"
                :class="plan?.id === item.id
                  ? 'border-brand-500 shadow-lg ring-2 ring-brand-200'
                  : 'border-slate-200 hover:border-brand-300'"
                @click="choosePlan(item)"
              >
                <h3 class="font-black text-slate-900">{{ item.name }}</h3>
                <p class="mt-1 text-sm text-slate-500">{{ item.summary }}</p>
                <p class="mt-4 text-2xl font-black text-slate-900">{{ cop.format(item.amountCop) }}</p>
                <p class="text-xs text-slate-500">
                  por {{ duracionTexto(item) }}<span v-if="item.monthlyCop && item.periodMonths > 1"> · {{ cop.format(item.monthlyCop) }}/mes</span>
                </p>
              </button>
            </li>
          </ul>
        </section>

        <template v-if="plan">
          <!-- 2. Cuenta -->
          <section class="mt-10">
            <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">
              2 · {{ yaTieneCuenta ? 'Tu cuenta' : 'Crea tu cuenta' }}
            </h2>

            <div v-if="yaTieneCuenta" class="card mt-3 p-5 text-sm text-slate-600">
              Se cargará a tu cuenta <strong>{{ auth.user?.email }}</strong>.
            </div>

            <div v-else class="card mt-3 grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <label class="label" for="co-name">Nombre y apellidos</label>
                <input id="co-name" v-model.trim="form.fullName" type="text" required class="input" />
              </div>
              <div>
                <label class="label" for="co-email">Correo</label>
                <input id="co-email" v-model.trim="form.email" type="email" required class="input" />
                <p class="mt-1 text-xs text-slate-500">Será tu usuario para entrar.</p>
              </div>
              <div>
                <label class="label" for="co-pass">Contraseña</label>
                <input
                  id="co-pass"
                  v-model="form.password"
                  type="password"
                  required
                  minlength="8"
                  class="input"
                  autocomplete="new-password"
                />
                <p class="mt-1 text-xs text-slate-500">Mínimo 8 caracteres.</p>
              </div>
              <div>
                <label class="label" for="co-org">Centro u organización (opcional)</label>
                <input id="co-org" v-model.trim="form.organization" type="text" class="input" />
              </div>
            </div>
          </section>

          <!-- 3. Pago -->
          <section class="mt-10">
            <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">3 · Paga</h2>

            <div class="card mt-3 p-5">
              <div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <p class="font-bold text-slate-800">Plan {{ plan.name }}</p>
                <p class="text-xl font-black text-slate-900">
                  {{ cop.format(plan.amountCop) }} <span class="text-sm font-bold text-slate-500">/ {{ duracionTexto(plan) }}</span>
                </p>
              </div>

              <label class="mb-4 flex items-start gap-2 text-sm text-slate-700">
                <input v-model="form.autoRenew" type="checkbox" class="mt-0.5 h-4 w-4 rounded" />
                <span>
                  Renovar automáticamente al vencer
                  <span class="block text-xs text-slate-500">
                    Puedes desactivarlo cuando quieras desde tu panel.
                  </span>
                </span>
              </label>

              <p v-if="!datosCompletos" class="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Completa los datos de tu cuenta para poder pagar.
              </p>

              <p v-if="!brickReady && !brickFailed" class="text-sm text-slate-500">
                Cargando el formulario seguro...
              </p>

              <div v-if="brickFailed" class="rounded-lg bg-red-50 p-4 text-sm text-red-800">
                <p>{{ brickFailed }}</p>
                <button type="button" class="btn-secondary mt-3" @click="mountBrick()">
                  Reintentar
                </button>
              </div>

              <!-- Mercado Pago monta aquí su formulario; la tarjeta no toca nuestro código -->
              <div id="mp-brick"></div>

              <p v-if="paying" class="mt-3 text-sm font-semibold text-brand-600">
                Procesando el pago y creando tu cuenta...
              </p>

              <p class="mt-4 text-xs leading-relaxed text-slate-500">
                El cobro lo procesa Mercado Pago. En tu extracto aparecerá como
                <strong>BookStudio</strong>. Los datos de la tarjeta no pasan por nuestros servidores.
              </p>
            </div>
          </section>
        </template>

        <p v-else class="mt-6 text-sm text-slate-500">Elige un plan para continuar.</p>
      </template>
    </main>
  </div>
</template>
