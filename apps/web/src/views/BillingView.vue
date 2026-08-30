<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useSeo } from '@/composables/useSeo';
import { billingApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { SITE } from '@/utils/site';
import type { BillingConfig, BillingPlan, Invoice, Subscription } from '@/types/api';

/**
 * Facturacion y licencia.
 *
 * Los datos de la tarjeta NUNCA pasan por aqui ni por nuestro servidor: el SDK de
 * Mercado Pago los convierte en un token de un solo uso dentro de un iframe suyo, y
 * es ese token lo que viaja. Tampoco se envia el importe: lo decide el servidor.
 */
const auth = useAuthStore();

useSeo({
  title: `Facturacion · ${SITE.name}`,
  description: 'Consulta tu licencia, sus fechas y tus facturas, y gestiona la renovacion automatica.',
  path: '/clientes/facturacion',
});

const config = ref<BillingConfig | null>(null);
const subscription = ref<Subscription | null>(null);
const invoices = ref<Invoice[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const STATUS_LABEL: Record<string, { text: string; class: string }> = {
  activa: { text: 'Activa', class: 'bg-emerald-100 text-emerald-700' },
  pendiente: { text: 'Pago pendiente', class: 'bg-amber-100 text-amber-700' },
  vencida: { text: 'Vencida', class: 'bg-red-100 text-red-700' },
  cancelada: { text: 'Cancelada', class: 'bg-slate-200 text-slate-600' },
};

/** Avisa cuando quedan menos de 30 dias, que es cuando conviene renovar. */
const porVencer = computed(
  () =>
    subscription.value?.status === 'activa' &&
    subscription.value.daysLeft !== null &&
    subscription.value.daysLeft <= 30,
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    config.value = await billingApi.config();
    subscription.value = await billingApi.subscription();
    invoices.value = await billingApi.invoices();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

// --- Renovacion automatica ---
const savingRenew = ref(false);

async function toggleAutoRenew(value: boolean): Promise<void> {
  savingRenew.value = true;
  error.value = null;
  notice.value = null;
  try {
    const result = await billingApi.setAutoRenew(value);
    subscription.value = result.subscription;
    if (result.authorizationUrl) {
      notice.value = 'Falta autorizar la renovacion en Mercado Pago. Se abrira en otra pestana.';
      window.open(result.authorizationUrl, '_blank', 'noopener');
    } else {
      notice.value = value ? 'Renovacion automatica activada.' : 'Renovacion automatica desactivada.';
    }
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    savingRenew.value = false;
  }
}

// --- Contratacion ---
const chosenPlan = ref<BillingPlan | null>(null);
const paying = ref(false);
const form = ref({
  organization: '',
  payerEmail: '',
  docType: 'CC',
  docNumber: '',
  installments: 1,
  autoRenew: true,
});

/** Instancia del SDK de Mercado Pago; se carga solo al abrir el formulario. */
let mercadoPago: unknown = null;
const brickReady = ref(false);

function loadSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Mercado Pago'));
    document.head.appendChild(script);
  });
}

async function choosePlan(plan: BillingPlan): Promise<void> {
  chosenPlan.value = plan;
  error.value = null;
  form.value.payerEmail = auth.user?.email ?? '';
  brickReady.value = false;

  try {
    await loadSdk();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mercadoPago = new (window as any).MercadoPago(config.value!.publicKey, { locale: 'es-CO' });
    await mountBrick(plan);
  } catch (err) {
    error.value = errorMessage(err);
  }
}

/**
 * Monta el formulario de tarjeta de Mercado Pago. Al enviarlo devuelve un token y
 * es lo unico que sale de aqui hacia nuestro servidor.
 */
async function mountBrick(plan: BillingPlan): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bricks = (mercadoPago as any).bricks();
  const container = document.getElementById('mp-card-brick');
  if (container) container.innerHTML = '';

  await bricks.create('cardPayment', 'mp-card-brick', {
    initialization: {
      amount: plan.amountCop,
      payer: { email: form.value.payerEmail || undefined },
    },
    customization: {
      visual: { style: { theme: 'default' } },
      paymentMethods: { maxInstallments: 12 },
    },
    callbacks: {
      onReady: () => (brickReady.value = true),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSubmit: async (data: any) => {
        await pay(plan, data);
      },
      onError: (brickError: { message?: string }) => {
        error.value = brickError?.message ?? 'No se pudo procesar el formulario de pago.';
      },
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pay(plan: BillingPlan, data: any): Promise<void> {
  paying.value = true;
  error.value = null;
  notice.value = null;
  try {
    const result = await billingApi.checkout({
      plan: plan.id,
      token: data.token,
      paymentMethodId: data.payment_method_id,
      installments: Number(data.installments ?? 1),
      payerEmail: data.payer?.email ?? form.value.payerEmail,
      payerDocType: data.payer?.identification?.type ?? form.value.docType,
      payerDocNumber: data.payer?.identification?.number ?? form.value.docNumber,
      organization: form.value.organization || undefined,
      autoRenew: form.value.autoRenew,
    });

    subscription.value = result.subscription;
    invoices.value = await billingApi.invoices();
    chosenPlan.value = null;

    notice.value =
      result.payment.status === 'approved'
        ? `Pago aprobado. Factura ${result.payment.invoiceNumber}. Tu licencia esta activa.`
        : `El pago quedo en estado "${result.payment.status}". Te avisaremos en cuanto se confirme.`;

    if (result.authorizationUrl) window.open(result.authorizationUrl, '_blank', 'noopener');
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    paying.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="bg-white">
    <header class="border-b border-slate-200 bg-slate-50">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <RouterLink :to="{ name: 'landing' }" class="flex items-center gap-2 font-black text-brand-700">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">B</span>
          {{ SITE.name }}
        </RouterLink>
        <RouterLink :to="{ name: 'dashboard' }" class="btn-secondary">Mis libros</RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-10">
      <h1 class="text-3xl font-black text-slate-900">Facturacion y licencia</h1>

      <div class="mt-4 space-y-2">
        <AlertMessage :message="error" />
        <AlertMessage :message="notice" variant="success" />
      </div>

      <p v-if="loading" class="mt-8 text-sm text-slate-500">Cargando...</p>

      <template v-else>
        <p v-if="config && !config.enabled" class="card mt-6 p-6 text-sm text-amber-700">
          Los pagos no estan configurados en este servidor. Escribenos y lo resolvemos.
        </p>

        <!-- Licencia vigente -->
        <section v-if="subscription" class="card mt-6 p-6">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-bold uppercase tracking-wide text-slate-400">Tu licencia</p>
              <h2 class="text-2xl font-black text-slate-900">{{ subscription.planName }}</h2>
              <p v-if="subscription.organization" class="text-sm text-slate-500">
                {{ subscription.organization }}
              </p>
            </div>
            <span
              class="rounded-full px-3 py-1 text-xs font-bold"
              :class="STATUS_LABEL[subscription.status]?.class"
            >{{ STATUS_LABEL[subscription.status]?.text ?? subscription.status }}</span>
          </div>

          <dl class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt class="text-xs text-slate-500">Importe anual</dt>
              <dd class="font-bold text-slate-800">{{ cop.format(subscription.amountCop) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-500">Inicio</dt>
              <dd class="font-bold text-slate-800">{{ fecha(subscription.startsAt) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-slate-500">Vence</dt>
              <dd class="font-bold" :class="porVencer ? 'text-amber-600' : 'text-slate-800'">
                {{ fecha(subscription.expiresAt) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-slate-500">Cupos</dt>
              <dd class="font-bold text-slate-800">
                {{ subscription.maxTeachers ?? 'Sin limite' }} docentes ·
                {{ subscription.maxStudents ?? 'sin limite' }} estudiantes
              </dd>
            </div>
          </dl>

          <p v-if="porVencer" class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Tu licencia vence en {{ subscription.daysLeft }} dias.
            {{ subscription.autoRenew ? 'Se renovara sola.' : 'Activa la renovacion o vuelve a contratarla.' }}
          </p>

          <!-- Renovacion automatica -->
          <label class="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 rounded"
              :checked="subscription.autoRenew"
              :disabled="savingRenew || subscription.status === 'cancelada'"
              @change="toggleAutoRenew(($event.target as HTMLInputElement).checked)"
            />
            <span>
              <span class="block text-sm font-semibold text-slate-800">Renovar automaticamente cada ano</span>
              <span class="block text-xs text-slate-500">
                Se cobrara {{ cop.format(subscription.amountCop) }} al vencimiento. Puedes desactivarlo
                cuando quieras; la licencia sigue vigente hasta la fecha ya pagada.
              </span>
            </span>
          </label>
        </section>

        <!-- Contratacion -->
        <section v-if="config?.enabled && (!subscription || subscription.status !== 'activa')" class="mt-8">
          <h2 class="text-xl font-black text-slate-900">
            {{ subscription ? 'Renovar o cambiar de plan' : 'Contratar un plan' }}
          </h2>

          <ul v-if="!chosenPlan" class="mt-4 grid gap-4 lg:grid-cols-3">
            <li v-for="plan in config.plans" :key="plan.id" class="card flex flex-col p-5">
              <h3 class="font-black text-slate-900">{{ plan.name }}</h3>
              <p class="mt-1 text-sm text-slate-500">{{ plan.summary }}</p>
              <p class="mt-4 text-2xl font-black text-slate-900">{{ cop.format(plan.amountCop) }}</p>
              <p class="text-xs text-slate-500">
                al ano<span v-if="plan.monthlyCop"> · equivale a {{ cop.format(plan.monthlyCop) }}/mes</span>
              </p>
              <button type="button" class="btn-primary mt-4" @click="choosePlan(plan)">Contratar</button>
            </li>
          </ul>

          <!-- Formulario de pago -->
          <div v-else class="card mt-4 p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 class="font-black text-slate-900">Plan {{ chosenPlan.name }}</h3>
                <p class="text-sm text-slate-500">{{ cop.format(chosenPlan.amountCop) }} al ano</p>
              </div>
              <button type="button" class="btn-secondary" @click="chosenPlan = null">Cambiar de plan</button>
            </div>

            <div class="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label" for="b-org">Centro u organizacion (para la factura)</label>
                <input id="b-org" v-model.trim="form.organization" type="text" class="input" />
              </div>
              <label class="flex items-start gap-2 pt-6 text-sm text-slate-700">
                <input v-model="form.autoRenew" type="checkbox" class="mt-0.5 h-4 w-4 rounded" />
                <span>Renovar automaticamente cada ano</span>
              </label>
            </div>

            <div class="mt-5">
              <p v-if="!brickReady" class="text-sm text-slate-500">Cargando el formulario seguro de pago...</p>
              <!-- Mercado Pago monta aqui su formulario; la tarjeta no toca nuestro codigo -->
              <div id="mp-card-brick"></div>
            </div>

            <p v-if="paying" class="mt-3 text-sm text-brand-600">Procesando el pago...</p>

            <p class="mt-4 text-xs leading-relaxed text-slate-500">
              El cobro lo procesa Mercado Pago. En tu extracto aparecera como
              <strong>BookStudio</strong>. Los datos de la tarjeta no pasan por nuestros servidores.
            </p>
          </div>
        </section>

        <!-- Facturas -->
        <section class="mt-10">
          <h2 class="text-xl font-black text-slate-900">Facturas</h2>

          <p v-if="!invoices.length" class="card mt-4 p-8 text-center text-sm text-slate-500">
            Todavia no hay pagos registrados.
          </p>

          <div v-else class="card mt-4 overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th class="px-3 py-2">Factura</th>
                  <th class="px-3 py-2">Fecha</th>
                  <th class="px-3 py-2">Importe</th>
                  <th class="px-3 py-2">Medio</th>
                  <th class="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="invoice in invoices" :key="invoice.id">
                  <td class="px-3 py-2 font-mono">#{{ invoice.invoiceNumber }}</td>
                  <td class="px-3 py-2">{{ fecha(invoice.paidAt ?? invoice.createdAt) }}</td>
                  <td class="px-3 py-2 font-semibold">{{ cop.format(invoice.amountCop) }}</td>
                  <td class="px-3 py-2 text-slate-500">
                    {{ invoice.paymentMethod ?? '—' }}
                    <span v-if="invoice.installments && invoice.installments > 1">
                      · {{ invoice.installments }} cuotas
                    </span>
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class="rounded px-2 py-0.5 text-xs font-semibold"
                      :class="invoice.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : invoice.status === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'"
                    >{{ invoice.status }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
