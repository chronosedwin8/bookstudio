<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { useSeo } from '@/composables/useSeo';
import { billingApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { SITE } from '@/utils/site';
import type { BillingConfig, Invoice, Subscription } from '@/types/api';

/**
 * Facturacion y licencia.
 *
 * Los datos de la tarjeta NUNCA pasan por aqui ni por nuestro servidor: el SDK de
 * Mercado Pago los convierte en un token de un solo uso dentro de un iframe suyo, y
 * es ese token lo que viaja. Tampoco se envia el importe: lo decide el servidor.
 */
useSeo({
  title: `Facturacion · ${SITE.name}`,
  description: 'Consulta tu licencia, sus fechas y tus facturas, y gestiona la renovacion automatica.',
  path: '/clientes/facturacion',
});

const route = useRoute();

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

onMounted(async () => {
  await load();
  // Se llega aqui recien contratado desde /contratar.
  if (route.query.bienvenida === '1' && subscription.value?.status === 'activa') {
    notice.value = 'Bienvenido. Tu licencia esta activa y tu cuenta lista para usarse.';
  }
});
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

        <!-- Contratar o renovar -->
        <section
          v-if="config?.enabled && (!subscription || subscription.status !== 'activa')"
          class="card mt-8 p-6"
        >
          <h2 class="text-xl font-black text-slate-900">
            {{ subscription ? 'Renovar o cambiar de plan' : 'Contratar un plan' }}
          </h2>
          <p class="mt-1 text-sm text-slate-600">
            El pago se hace en la pagina de contratacion, con tarjeta y en un solo paso.
          </p>
          <RouterLink :to="{ name: 'checkout' }" class="btn-primary mt-4 inline-flex">
            {{ subscription ? 'Renovar ahora' : 'Ver planes y contratar' }}
          </RouterLink>
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
