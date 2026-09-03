<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { usePagoTarjeta, type DatosTarjeta } from '@/composables/usePagoTarjeta';
import { billingApi, clientsApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type { Charge } from '@/types/api';

/**
 * Pago de una cuenta de cobro.
 *
 * El importe no se envia: lo toma el servidor de la propia cuenta. Si viajara en
 * la peticion, cualquiera podria liquidar cinco millones con un peso.
 */
const props = defineProps<{ charge: Charge }>();
const emit = defineEmits<{ close: []; pagada: [charge: Charge] }>();

const auth = useAuthStore();
const cargando = ref(true);
const pagando = ref(false);
const error = ref<string | null>(null);
const resultado = ref<{ status: string; statusDetail: string; invoiceNumber: number | null } | null>(null);
const publicKey = ref('');

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const { fallo: falloFormulario, montar: montarFormulario } = usePagoTarjeta({
  contenedor: 'mp-brick-cobro',
  publicKey: () => publicKey.value,
  amount: () => props.charge.amountCop,
  email: () => auth.user?.email ?? '',
  alPagar: async (datos) => cobrar(datos),
});

onMounted(async () => {
  try {
    const config = await billingApi.config();
    if (!config.enabled) {
      error.value = 'Los pagos con tarjeta no estan disponibles ahora mismo.';
      return;
    }
    publicKey.value = config.publicKey;
    await montarFormulario();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
});

async function cobrar(datos: DatosTarjeta): Promise<void> {
  pagando.value = true;
  error.value = null;
  try {
    const respuesta = await clientsApi.payCharge(props.charge.id, {
      token: datos.token,
      paymentMethodId: datos.payment_method_id,
      installments: Number(datos.installments ?? 1),
      payerEmail: datos.payer?.email || auth.user?.email || '',
      payerDocType: datos.payer?.identification?.type,
      payerDocNumber: datos.payer?.identification?.number,
    });
    resultado.value = respuesta.payment;
    if (respuesta.charge.status === 'pagada') emit('pagada', respuesta.charge);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    pagando.value = false;
  }
}

/** Aprobado, o pendiente de confirmacion como en PSE y Efecty. */
const aprobado = computed(() => ['approved', 'authorized'].includes(resultado.value?.status ?? ''));
const enTramite = computed(() =>
  ['in_process', 'pending', 'in_mediation'].includes(resultado.value?.status ?? ''),
);
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4">
    <div class="card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <h2 class="font-bold text-slate-900">Pagar la cuenta {{ charge.number }}</h2>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="flex-1 space-y-4 overflow-y-auto p-5">
        <AlertMessage :message="error" />

        <div class="rounded-lg bg-slate-50 p-4">
          <p class="text-sm text-slate-600">{{ charge.concept }}</p>
          <p class="mt-1 text-2xl font-black tabular-nums text-slate-900">{{ cop.format(charge.amountCop) }}</p>
        </div>

        <!-- Resultado -->
        <template v-if="resultado">
          <div
            v-if="aprobado"
            class="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800"
          >
            <p class="font-bold">Pago aprobado.</p>
            <p v-if="resultado.invoiceNumber" class="mt-1">
              Comprobante n.º {{ resultado.invoiceNumber }}. La cuenta queda saldada.
            </p>
          </div>

          <div
            v-else-if="enTramite"
            class="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"
          >
            <p class="font-bold">Pago en trámite.</p>
            <p class="mt-1">
              Mercado Pago aún no lo ha confirmado, que es lo normal con PSE y pagos en efectivo.
              La cuenta se salda sola en cuanto llegue la confirmación; no hace falta pagar otra vez.
            </p>
          </div>

          <div v-else class="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <p class="font-bold">El pago no se pudo completar.</p>
            <p class="mt-1">{{ resultado.statusDetail || resultado.status }}</p>
          </div>
        </template>

        <template v-else>
          <p v-if="cargando" class="text-sm text-slate-500">Cargando el formulario seguro...</p>

          <div v-if="falloFormulario" class="rounded-lg bg-red-50 p-4 text-sm text-red-800">
            <p>{{ falloFormulario }}</p>
            <button type="button" class="btn-secondary mt-3" @click="montarFormulario()">Reintentar</button>
          </div>

          <!-- Mercado Pago monta aquí su formulario; la tarjeta no toca nuestro código -->
          <div id="mp-brick-cobro"></div>

          <p v-if="pagando" class="text-sm font-semibold text-brand-600">Procesando el pago...</p>

          <p class="text-xs leading-relaxed text-slate-500">
            El cobro lo procesa Mercado Pago. En el extracto aparecerá como <strong>BookStudio</strong>.
            Los datos de la tarjeta no pasan por nuestros servidores. El servicio se presta como
            comercio internacional y no está sujeto a la facturación electrónica de Colombia.
          </p>
        </template>
      </div>

      <footer v-if="resultado" class="border-t border-slate-200 px-5 py-3 text-right">
        <button type="button" class="btn-primary" @click="emit('close')">Listo</button>
      </footer>
    </div>
  </div>
</template>
