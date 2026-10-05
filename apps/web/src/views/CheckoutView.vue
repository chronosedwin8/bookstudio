<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { useSeo } from '@/composables/useSeo';
import { billingApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { SITE } from '@/utils/site';
import { DIAS_REEMBOLSO } from '@/utils/legal';
import type { BillingConfig, BillingPlan } from '@/types/api';
import { duracionTexto, pesos } from '@/utils/precio';
import { abrirPago, esperarConfirmacion } from '@/utils/paddle';

/**
 * Contratar: elegir plan, pagarlo con su enlace de Mercado Pago y mandar el
 * comprobante.
 *
 * Desde el 30 de septiembre de 2026 BookStudio no cobra dentro de la aplicacion.
 * El formulario de tarjeta y la pagina de Mercado Pago con cuenta pedian estar
 * registrado en Mercado Pago o rechazaban pagos buenos; el enlace de pago no pide
 * nada de eso: se paga con tarjeta, PSE o Efecty, con o sin cuenta.
 *
 * La contrapartida es que BookStudio no se entera solo de quien ha pagado. Por eso
 * el tercer paso: el cliente manda el comprobante con el correo de su cuenta, y la
 * administracion activa la licencia.
 */
const route = useRoute();
const auth = useAuthStore();

useSeo({
  title: `Contratar · ${SITE.name}`,
  description: 'Elige tu plan y págalo con el enlace seguro de Mercado Pago: tarjeta, PSE o Efecty.',
  path: '/contratar',
});

const config = ref<BillingConfig | null>(null);
const plan = ref<BillingPlan | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const correo = computed(() => config.value?.contactEmail || SITE.email);
const tieneCuenta = computed(() => auth.isAuthenticated && !auth.isTrial);

/**
 * Correo con el comprobante, ya redactado.
 *
 * Lo que la administracion necesita para activar la licencia sin preguntar:
 * que plan, cuanto, y a que cuenta de BookStudio. Si hay sesion, el correo de la
 * cuenta ya va escrito.
 */
const mailtoComprobante = computed(() => {
  if (!plan.value) return `mailto:${correo.value}`;
  const asunto = `Comprobante de pago · Plan ${plan.value.name}`;
  const cuerpo = [
    'Hola, ya pagué con el enlace de Mercado Pago.',
    '',
    `Plan: ${plan.value.name} (${pesos(plan.value.amountCop)} por ${duracionTexto(plan.value)})`,
    `Correo de mi cuenta en BookStudio: ${tieneCuenta.value ? auth.user?.email ?? '' : ''}`,
    'Nombre y centro u organización: ',
    'Número de operación de Mercado Pago: ',
    '',
    'Adjunto el comprobante.',
  ].join('\n');
  return `mailto:${correo.value}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
});

/* --- Pagar con Paddle, la alternativa a Mercado Pago --- */

const paddle = computed(() => (config.value?.paddle?.enabled && config.value.paddle.clientToken ? config.value.paddle : null));
const pagandoPaddle = ref(false);
/** null: sin empezar · esperando: cobrado en la ventana, confirmando · pagado · revisar */
const estadoPaddle = ref<'esperando' | 'pagado' | 'revisar' | null>(null);
const errorPaddle = ref<string | null>(null);

/** Volver aqui, con el plan elegido, despues de entrar o crear la cuenta. */
const vueltaTrasEntrar = computed(() => ({ name: 'login', query: { redirect: `/contratar?plan=${plan.value?.id ?? ''}` } }));

async function pagarConPaddle(): Promise<void> {
  if (!plan.value || !paddle.value) return;
  pagandoPaddle.value = true;
  errorPaddle.value = null;
  estadoPaddle.value = null;
  try {
    const intento = await billingApi.paddlePlan(plan.value.id);
    const fin = await abrirPago(
      { clientToken: paddle.value.clientToken!, environment: paddle.value.environment },
      intento.transactionId,
      intento.email,
      () => (estadoPaddle.value = 'esperando'),
    );
    if (fin !== 'completado') {
      if (fin === 'error') errorPaddle.value = 'Paddle no pudo completar el pago. No se te ha cobrado; puedes intentarlo de nuevo.';
      return;
    }
    estadoPaddle.value = 'esperando';
    estadoPaddle.value = await esperarConfirmacion(() => billingApi.paddleIntent(intento.reference));
  } catch (err) {
    errorPaddle.value = errorMessage(err);
  } finally {
    pagandoPaddle.value = false;
  }
}

onMounted(async () => {
  try {
    config.value = await billingApi.config();
    // El plan puede venir preseleccionado desde la portada: /contratar?plan=escuela
    const pedido = String(route.query.plan ?? '');
    plan.value = config.value.plans.find((p) => p.id === pedido) ?? null;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
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
        Elige tu plan y págalo con el enlace seguro de Mercado Pago. <strong>No necesitas cuenta de Mercado
        Pago</strong>: puedes pagar con tarjeta de crédito o débito, PSE o Efecty.
        <span v-if="paddle"> También puedes pagar con <strong>Paddle</strong>, con tarjeta internacional, y la licencia se activa sola.</span>
      </p>

      <AlertMessage class="mt-4" :message="error" />

      <p v-if="loading" class="mt-8 text-sm text-slate-500">Cargando planes...</p>

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
                :aria-pressed="plan?.id === item.id"
                @click="plan = item"
              >
                <h3 class="font-black text-slate-900">{{ item.name }}</h3>
                <p class="mt-1 text-sm text-slate-500">{{ item.summary }}</p>
                <p class="mt-4 text-2xl font-black text-slate-900">{{ pesos(item.amountCop) }}</p>
                <p class="text-xs text-slate-500">
                  por {{ duracionTexto(item) }}<span v-if="item.monthlyCop && item.periodMonths > 1"> · {{ pesos(item.monthlyCop) }}/mes</span>
                </p>
              </button>
            </li>
          </ul>
        </section>

        <p v-if="!plan" class="mt-6 text-sm text-slate-500">Elige un plan para ver cómo pagarlo.</p>

        <template v-else>
          <!-- 2. Pagar -->
          <section class="mt-10">
            <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">
              2 · Paga con Mercado Pago{{ paddle ? ' o con Paddle' : '' }}
            </h2>
            <div class="card mt-3 p-5">
              <div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <p class="font-bold text-slate-800">Plan {{ plan.name }}</p>
                <p class="text-xl font-black text-slate-900">
                  {{ pesos(plan.amountCop) }} <span class="text-sm font-bold text-slate-500">/ {{ duracionTexto(plan) }}</span>
                </p>
              </div>

              <template v-if="plan.paymentLink">
                <a
                  :href="plan.paymentLink"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn-primary w-full py-3 text-base"
                >Pagar {{ pesos(plan.amountCop) }} en Mercado Pago ↗</a>
                <p class="mt-2 text-xs leading-relaxed text-slate-500">
                  Se abre la página segura de Mercado Pago en otra pestaña. Paga con tarjeta, PSE o Efecty, con o sin
                  cuenta de Mercado Pago. Al terminar, guarda el comprobante: lo necesitas en el paso 3.
                </p>
              </template>

              <p v-else class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Este plan todavía no tiene enlace de pago. Escríbenos a
                <a :href="`mailto:${correo}`" class="font-semibold underline">{{ correo }}</a>
                y te lo enviamos.
              </p>

              <!-- Paddle: tarjeta internacional y otros medios, sin comprobante que enviar -->
              <div v-if="paddle" class="mt-5 border-t border-slate-100 pt-4">
                <p class="text-sm font-semibold text-slate-700">O paga con Paddle</p>
                <p class="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Tarjeta de crédito o débito (también internacional) y los demás medios que ofrezca Paddle en tu país.
                  La licencia se activa sola al confirmarse el pago: no hace falta enviar comprobante.
                </p>

                <AlertMessage class="mt-3" :message="errorPaddle" />
                <p v-if="estadoPaddle === 'pagado'" class="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  ¡Pago confirmado! Tu licencia del plan {{ plan.name }} ya está activa.
                  <RouterLink :to="{ name: 'dashboard' }" class="font-semibold underline">Ir a mis libros</RouterLink>
                </p>
                <p v-else-if="estadoPaddle === 'revisar'" class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Hemos recibido el pago, pero hay que revisarlo a mano antes de activar la licencia. Te escribimos en
                  menos de un día hábil; si quieres, escríbenos a <a :href="`mailto:${correo}`" class="underline">{{ correo }}</a>.
                </p>
                <p v-else-if="estadoPaddle === 'esperando'" class="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-800">
                  {{ pagandoPaddle ? 'Confirmando el pago con Paddle…' : 'Paddle todavía no nos ha confirmado el pago. Se activará solo en cuanto llegue; puedes cerrar esta página.' }}
                </p>

                <template v-if="estadoPaddle !== 'pagado'">
                  <button
                    v-if="tieneCuenta"
                    type="button"
                    class="btn-secondary mt-3 w-full py-3 text-base"
                    :disabled="pagandoPaddle"
                    @click="pagarConPaddle"
                  >{{ pagandoPaddle ? 'Abriendo el pago…' : `Pagar ${pesos(plan.amountCop)} con Paddle` }}</button>
                  <p v-else class="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    Para pagar con Paddle, la licencia se activa en tu cuenta:
                    <RouterLink :to="vueltaTrasEntrar" class="font-semibold text-brand-700 underline">entra</RouterLink>
                    o
                    <RouterLink :to="{ name: 'register' }" class="font-semibold text-brand-700 underline">crea tu cuenta</RouterLink>
                    y vuelve aquí.
                  </p>
                </template>
              </div>

              <p class="mt-3 text-xs leading-relaxed text-slate-500">
                Al pagar aceptas los
                <RouterLink :to="{ name: 'legal-terminos' }" class="underline hover:text-brand-700">términos del servicio</RouterLink>
                y el
                <RouterLink :to="{ name: 'legal-privacidad' }" class="underline hover:text-brand-700">aviso de privacidad</RouterLink>.
                Tienes {{ DIAS_REEMBOLSO }} días para pedir la devolución:
                <RouterLink :to="{ name: 'legal-reembolsos' }" class="underline hover:text-brand-700">política de reembolsos</RouterLink>.
              </p>
            </div>
          </section>

          <!-- 3. Comprobante -->
          <section class="mt-10">
            <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">3 · Envíanos el comprobante</h2>
            <div class="card mt-3 p-5">
              <p class="text-sm text-slate-700">
                Envía el comprobante de Mercado Pago a <strong>{{ correo }}</strong> con el <strong>correo de tu
                cuenta en BookStudio</strong>. Activamos tu licencia en un máximo de un día hábil y te avisamos.
              </p>
              <a :href="mailtoComprobante" class="btn-secondary mt-4 inline-flex">✉️ Enviar el comprobante</a>

              <p v-if="!tieneCuenta" class="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                ¿Aún no tienes cuenta en BookStudio?
                <RouterLink :to="{ name: 'register' }" class="font-semibold text-brand-600 underline">Créala aquí</RouterLink>
                con el mismo correo que pondrás en el mensaje: la licencia se activa sobre esa cuenta.
              </p>
            </div>
          </section>
        </template>
      </template>

      <p class="mt-10 text-xs leading-relaxed text-slate-500">
        El cobro lo procesa Mercado Pago. Importes en pesos colombianos. ¿Dudas o necesitas factura a nombre de tu
        centro? Escríbenos a <a :href="`mailto:${correo}`" class="underline">{{ correo }}</a>.
      </p>
    </main>
  </div>
</template>
