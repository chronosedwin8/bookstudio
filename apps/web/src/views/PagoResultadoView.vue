<script setup lang="ts">
/**
 * Vuelta desde la pagina de pago de Mercado Pago.
 *
 * Lo que diga la URL de vuelta no se cree: se pregunta al servidor, que a su vez
 * pregunta a Mercado Pago. Mientras el pago no este confirmado se vuelve a
 * preguntar cada pocos segundos, porque la confirmacion puede tardar un poco en
 * llegar (y con PSE o Efecty, bastante mas).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AvisoPagoSeguro from '@/components/AvisoPagoSeguro.vue';
import { useSeo } from '@/composables/useSeo';
import { billingApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import type { EstadoPagoMp } from '@/types/api';
import { SITE } from '@/utils/site';
import { irAMercadoPago, leerPagoPendiente, olvidarPagoPendiente } from '@/utils/pagoMercadoPago';

useSeo({ title: `Resultado del pago · ${SITE.name}`, description: 'Resultado del pago en Mercado Pago.', path: '/pago/resultado' });

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

// Mercado Pago devuelve la referencia en `external_reference`; la nuestra va en `ref`.
const reference = String(route.query.ref ?? route.query.external_reference ?? '');
const pendiente = reference ? leerPagoPendiente(reference) : null;

const estado = ref<EstadoPagoMp | null>(null);
const noEncontrado = ref(false);
const consultas = ref(0);

/** Cada cuanto y cuantas veces se pregunta antes de dejar de insistir. */
const CADA_MS = 3000;
const MAXIMO = 40; // dos minutos

let temporizador: number | undefined;

async function consultar(): Promise<void> {
  if (!reference) {
    noEncontrado.value = true;
    return;
  }
  consultas.value += 1;
  try {
    const r = await billingApi.mpEstado(reference, pendiente?.claim);
    estado.value = r;

    // Alta nueva aprobada: entra directamente, sin volver a escribir la contrasena.
    if (r.estado === 'aprobado' && r.session && !auth.isAuthenticated) {
      auth.applySession({ user: r.session.user as never, token: r.session.token });
    }
    if (r.estado === 'aprobado' || r.estado === 'revisar') {
      olvidarPagoPendiente();
      return;
    }
  } catch {
    // 404: el pago no es de este navegador (o de esta sesion). No se insiste.
    noEncontrado.value = true;
    return;
  }

  if (consultas.value < MAXIMO) temporizador = window.setTimeout(consultar, CADA_MS);
}

onMounted(consultar);
onBeforeUnmount(() => window.clearTimeout(temporizador));

const esCobro = computed(() => (estado.value?.kind ?? pendiente?.kind) === 'charge');
const siguePreguntando = computed(
  () => !noEncontrado.value && consultas.value < MAXIMO && (!estado.value || ['esperando', 'en_tramite'].includes(estado.value.estado)),
);

function reintentar(): void {
  if (estado.value?.initPoint) irAMercadoPago(estado.value.initPoint);
}

function continuar(): void {
  if (esCobro.value) void router.push({ name: 'client-portal', query: { t: 'cobros' } });
  else void router.push({ name: 'billing', query: { bienvenida: '1' } });
}
</script>

<template>
  <div class="min-h-full bg-slate-50 px-4 py-10">
    <main class="mx-auto max-w-xl">
      <RouterLink to="/" class="flex items-center gap-2 font-black text-brand-700">
        <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">B</span>
        <span class="text-lg">{{ SITE.name }}</span>
      </RouterLink>

      <section class="card mt-6 p-6" aria-live="polite">
        <!-- Aprobado -->
        <template v-if="estado?.estado === 'aprobado'">
          <p class="text-4xl" aria-hidden="true">✅</p>
          <h1 class="mt-2 text-2xl font-black text-slate-900">Pago aprobado</h1>
          <p v-if="esCobro" class="mt-2 text-slate-600">La cuenta de cobro ha quedado saldada. Gracias.</p>
          <template v-else>
            <p class="mt-2 text-slate-600">
              Tu licencia ya está activa.
              <template v-if="auth.isAuthenticated">Ya puedes empezar a crear.</template>
              <template v-else>Entra con tu correo<template v-if="pendiente?.email"> ({{ pendiente.email }})</template> y la contraseña que elegiste.</template>
            </p>
            <p v-if="estado.autoRenew" class="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Pediste la renovación automática: actívala desde <strong>Facturación</strong>, con un clic, para que
              Mercado Pago te pida autorizarla.
            </p>
          </template>
          <button v-if="auth.isAuthenticated" type="button" class="btn-primary mt-5" @click="continuar">
            {{ esCobro ? 'Volver a mi cuenta' : 'Ir a mi cuenta' }}
          </button>
          <RouterLink v-else :to="{ name: 'login', query: pendiente?.email ? { email: pendiente.email } : {} }" class="btn-primary mt-5 inline-flex">
            Entrar
          </RouterLink>
        </template>

        <!-- En tramite (PSE, Efecty) -->
        <template v-else-if="estado?.estado === 'en_tramite'">
          <p class="text-4xl" aria-hidden="true">⏳</p>
          <h1 class="mt-2 text-2xl font-black text-slate-900">Pago en trámite</h1>
          <p class="mt-2 text-slate-600">
            Mercado Pago aún no lo ha confirmado. Es lo normal con PSE y con pagos en efectivo: puede tardar
            desde unos minutos hasta un día hábil.
          </p>
          <p class="mt-2 text-slate-600">
            <template v-if="esCobro">La cuenta de cobro se saldará sola en cuanto llegue la confirmación.</template>
            <template v-else-if="auth.isAuthenticated">Tu licencia se activará sola en cuanto llegue la confirmación.</template>
            <template v-else>Tu cuenta se creará en cuanto llegue la confirmación; entonces podrás entrar con tu correo y tu contraseña.</template>
            No hace falta pagar otra vez.
          </p>
        </template>

        <!-- Rechazado -->
        <template v-else-if="estado?.estado === 'rechazado'">
          <p class="text-4xl" aria-hidden="true">⚠️</p>
          <h1 class="mt-2 text-2xl font-black text-slate-900">El pago no se aprobó</h1>
          <p class="mt-2 text-slate-600">No se ha cobrado nada. Puedes intentarlo otra vez, con otro medio de pago si quieres.</p>
          <AvisoPagoSeguro class="mt-4" tras-rechazo />
          <div class="mt-5 flex flex-wrap gap-2">
            <button v-if="estado.initPoint" type="button" class="btn-primary" @click="reintentar">
              Intentar de nuevo en Mercado Pago
            </button>
            <RouterLink
              :to="esCobro ? { name: 'client-portal', query: { t: 'cobros' } } : { name: 'checkout' }"
              class="btn-secondary"
            >Volver</RouterLink>
          </div>
        </template>

        <!-- Para revisar -->
        <template v-else-if="estado?.estado === 'revisar'">
          <p class="text-4xl" aria-hidden="true">📨</p>
          <h1 class="mt-2 text-2xl font-black text-slate-900">Pago recibido, lo revisamos</h1>
          <p class="mt-2 text-slate-600">
            Mercado Pago ha aprobado tu pago, pero no hemos podido aplicarlo solos (por ejemplo, porque el correo
            ya tenía una cuenta). No pagues otra vez: escríbenos a
            <a :href="`mailto:${SITE.email}`" class="font-semibold text-brand-600 underline">{{ SITE.email }}</a>
            y lo dejamos resuelto.
          </p>
        </template>

        <!-- No encontrado -->
        <template v-else-if="noEncontrado">
          <h1 class="text-2xl font-black text-slate-900">No encontramos este pago</h1>
          <p class="mt-2 text-slate-600">
            Puede que lo abrieras en otro navegador o que la sesión se cerrara. Si pagaste, no pasa nada: el pago
            se aplica solo. Entra con tu cuenta para ver tu licencia, o escríbenos a
            <a :href="`mailto:${SITE.email}`" class="font-semibold text-brand-600 underline">{{ SITE.email }}</a>.
          </p>
          <RouterLink :to="{ name: 'login' }" class="btn-primary mt-5 inline-flex">Entrar</RouterLink>
        </template>

        <!-- Esperando: aun no se ve el pago -->
        <template v-else>
          <p class="text-4xl" aria-hidden="true">🔄</p>
          <h1 class="mt-2 text-2xl font-black text-slate-900">Comprobando tu pago...</h1>
          <p class="mt-2 text-slate-600">Estamos preguntando a Mercado Pago. Esto suele tardar unos segundos.</p>
          <template v-if="!siguePreguntando">
            <p class="mt-3 text-sm text-slate-600">
              Todavía no vemos el pago. Si lo completaste, se aplicará solo en cuanto llegue la confirmación. Si no
              llegaste a pagar, puedes volver a intentarlo.
            </p>
            <button v-if="estado?.initPoint" type="button" class="btn-primary mt-4" @click="reintentar">
              Ir a pagar en Mercado Pago
            </button>
          </template>
        </template>

        <p v-if="siguePreguntando && estado?.estado !== 'aprobado'" class="mt-4 text-xs text-slate-400">
          Seguimos comprobando cada pocos segundos...
        </p>
      </section>
    </main>
  </div>
</template>
