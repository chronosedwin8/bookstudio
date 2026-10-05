<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useSeo } from '@/composables/useSeo';
import { billingApi } from '@/services/api';
import { escucharVentana, iniciarPaddle } from '@/utils/paddle';
import { SITE } from '@/utils/site';
import { TITULAR } from '@/utils/legal';

/**
 * Enlace de pago por defecto de Paddle.
 *
 * Paddle exige una pagina de la web aprobada a la que mandar a pagar los cobros
 * que no se abren desde BookStudio (por ejemplo, el enlace de un correo de cobro):
 * la abre como /pagar?_ptxn=txn_..., y Paddle.js, al iniciarse, abre solo la
 * ventana de pago de ese cobro. Aqui no se decide nada: la licencia o la cuenta
 * de cobro se aplican en el servidor cuando Paddle confirma el pago.
 */
const route = useRoute();
useSeo({ title: `Pagar · ${SITE.name}`, description: 'Pago seguro con Paddle.' });

const cobro = typeof route.query._ptxn === 'string' ? route.query._ptxn : null;
const estado = ref<'cargando' | 'abierto' | 'completado' | 'cerrado' | 'sin-cobro' | 'no-disponible' | 'error'>(
  cobro ? 'cargando' : 'sin-cobro',
);

onMounted(async () => {
  if (!cobro) return;
  try {
    const { paddle } = await billingApi.config();
    if (!paddle?.enabled || !paddle.clientToken) {
      estado.value = 'no-disponible';
      return;
    }
    escucharVentana((fin) => {
      estado.value = fin === 'completado' ? 'completado' : estado.value === 'completado' ? 'completado' : fin === 'error' ? 'error' : 'cerrado';
    });
    await iniciarPaddle(paddle.clientToken, paddle.environment);
    estado.value = 'abierto';
  } catch {
    estado.value = 'error';
  }
});
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-slate-50 px-4">
    <div class="w-full max-w-md rounded-xl bg-white p-6 text-center shadow">
      <RouterLink :to="{ name: 'landing' }" class="inline-flex items-center gap-2 font-black text-brand-700">
        <span class="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">B</span>
        {{ SITE.name }}
      </RouterLink>

      <h1 class="mt-4 text-xl font-black text-slate-900">
        {{ estado === 'completado' ? '¡Pago recibido!' : 'Pago seguro con Paddle' }}
      </h1>

      <p v-if="estado === 'cargando' || estado === 'abierto'" class="mt-2 text-sm text-slate-600">
        Abriendo la ventana de pago de Paddle… Si no aparece, recarga la página.
      </p>
      <p v-else-if="estado === 'completado'" class="mt-2 text-sm text-slate-600">
        Paddle te enviará el recibo por correo. Tu licencia o tu cuenta de cobro se actualizan solas en cuanto
        Paddle nos confirma el pago.
      </p>
      <p v-else-if="estado === 'cerrado'" class="mt-2 text-sm text-slate-600">
        Cerraste la ventana sin pagar. No se te ha cobrado nada; recarga la página para volver a intentarlo.
      </p>
      <p v-else-if="estado === 'sin-cobro'" class="mt-2 text-sm text-slate-600">
        Este enlace no lleva ningún cobro. Para contratar un plan, entra en
        <RouterLink :to="{ name: 'checkout' }" class="font-semibold text-brand-700 underline">Contratar</RouterLink>.
      </p>
      <p v-else class="mt-2 text-sm text-red-700">
        Ahora mismo no se puede abrir el pago con Paddle. Inténtalo más tarde o escríbenos a
        <a :href="`mailto:${TITULAR.correo}`" class="underline">{{ TITULAR.correo }}</a>.
      </p>

      <p class="mt-6 text-xs text-slate-400">
        <RouterLink :to="{ name: 'legal-terminos' }" class="underline">Términos</RouterLink> ·
        <RouterLink :to="{ name: 'legal-reembolsos' }" class="underline">Reembolsos</RouterLink> ·
        <RouterLink :to="{ name: 'legal-privacidad' }" class="underline">Privacidad</RouterLink>
      </p>
    </div>
  </div>
</template>
