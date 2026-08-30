<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { useSeo } from '@/composables/useSeo';
import { billingApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { SITE } from '@/utils/site';
import type { BillingConfig, BillingPlan } from '@/types/api';

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

const form = ref({
  fullName: '',
  email: '',
  password: '',
  organization: '',
  autoRenew: true,
});

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Cuando ya hay sesion, el cobro va contra la cuenta existente. */
const yaTieneCuenta = computed(() => auth.isAuthenticated && !auth.isTrial);

const datosCompletos = computed(
  () =>
    yaTieneCuenta.value ||
    (form.value.fullName.trim().length >= 2 &&
      /.+@.+\..+/.test(form.value.email) &&
      form.value.password.length >= 8),
);

let mercadoPago: unknown = null;

function loadSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar la pasarela de pago'));
    document.head.appendChild(script);
  });
}

async function mountBrick(): Promise<void> {
  if (!plan.value || !config.value) return;
  brickReady.value = false;

  await loadSdk();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mercadoPago = new (window as any).MercadoPago(config.value.publicKey, { locale: 'es-CO' });

  const container = document.getElementById('mp-brick');
  if (container) container.innerHTML = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (mercadoPago as any).bricks().create('cardPayment', 'mp-brick', {
    initialization: {
      amount: plan.value.amountCop,
      payer: { email: form.value.email || auth.user?.email || undefined },
    },
    customization: { paymentMethods: { maxInstallments: 12 } },
    callbacks: {
      onReady: () => (brickReady.value = true),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSubmit: async (data: any) => {
        await pay(data);
      },
      onError: (brickError: { message?: string }) => {
        error.value = brickError?.message ?? 'No se pudo procesar el formulario de pago.';
      },
    },
  });
}

function choosePlan(selected: BillingPlan): void {
  plan.value = selected;
  error.value = null;
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
  try {
    config.value = await billingApi.config();
    if (auth.user?.email && !auth.isTrial) form.value.email = auth.user.email;

    // El plan puede venir preseleccionado desde la portada: /contratar?plan=escuela
    const pedido = String(route.query.plan ?? '');
    const encontrado = config.value.plans.find((p) => p.id === pedido);
    if (encontrado) choosePlan(encontrado);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
});

// Cambiar el correo antes de pagar debe reflejarse en el formulario de la pasarela.
watch(
  () => form.value.email,
  () => {
    if (plan.value && brickReady.value) void mountBrick();
  },
);
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
        Los pagos no estan disponibles ahora mismo. Vuelve a intentarlo en unos minutos.
      </p>

      <template v-else-if="config">
        <!-- 1. Plan -->
        <section class="mt-8">
          <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">1 · Elige tu plan</h2>

          <ul class="mt-3 grid gap-4 lg:grid-cols-3">
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
                  al ano<span v-if="item.monthlyCop"> · {{ cop.format(item.monthlyCop) }}/mes</span>
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
              Se cargara a tu cuenta <strong>{{ auth.user?.email }}</strong>.
            </div>

            <div v-else class="card mt-3 grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <label class="label" for="co-name">Nombre y apellidos</label>
                <input id="co-name" v-model.trim="form.fullName" type="text" required class="input" />
              </div>
              <div>
                <label class="label" for="co-email">Correo</label>
                <input id="co-email" v-model.trim="form.email" type="email" required class="input" />
                <p class="mt-1 text-xs text-slate-500">Sera tu usuario para entrar.</p>
              </div>
              <div>
                <label class="label" for="co-pass">Contrasena</label>
                <input
                  id="co-pass"
                  v-model="form.password"
                  type="password"
                  required
                  minlength="8"
                  class="input"
                  autocomplete="new-password"
                />
                <p class="mt-1 text-xs text-slate-500">Minimo 8 caracteres.</p>
              </div>
              <div>
                <label class="label" for="co-org">Centro u organizacion (opcional)</label>
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
                <p class="text-xl font-black text-slate-900">{{ cop.format(plan.amountCop) }} / ano</p>
              </div>

              <label class="mb-4 flex items-start gap-2 text-sm text-slate-700">
                <input v-model="form.autoRenew" type="checkbox" class="mt-0.5 h-4 w-4 rounded" />
                <span>
                  Renovar automaticamente cada ano
                  <span class="block text-xs text-slate-500">
                    Puedes desactivarlo cuando quieras desde tu panel.
                  </span>
                </span>
              </label>

              <p v-if="!datosCompletos" class="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Completa los datos de tu cuenta para poder pagar.
              </p>

              <p v-if="!brickReady" class="text-sm text-slate-500">Cargando el formulario seguro...</p>
              <!-- Mercado Pago monta aqui su formulario; la tarjeta no toca nuestro codigo -->
              <div id="mp-brick"></div>

              <p v-if="paying" class="mt-3 text-sm font-semibold text-brand-600">
                Procesando el pago y creando tu cuenta...
              </p>

              <p class="mt-4 text-xs leading-relaxed text-slate-500">
                El cobro lo procesa Mercado Pago. En tu extracto aparecera como
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
