<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useSeo } from '@/composables/useSeo';
import { contactApi, usersApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { PLANS, SITE } from '@/utils/site';
import type { UserStats } from '@/types/api';

/**
 * Portal de clientes.
 *
 * Para quien aun no es cliente: formulario de demo o presupuesto. Para el
 * administrador de un centro que ya lo usa: el consumo real de su instalacion.
 */
const auth = useAuthStore();

useSeo({
  title: `Portal de clientes · ${SITE.name}`,
  description:
    'Pide una demostracion o un presupuesto de BookStudio para tu centro u organizacion, ' +
    'y consulta el uso de tu instalacion.',
  path: '/clientes',
});

const form = ref({ name: '', email: '', organization: '', plan: 'centro', people: '', message: '' });
const sending = ref(false);
const sent = ref(false);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  sending.value = true;
  error.value = null;
  try {
    await contactApi.send({
      name: form.value.name,
      email: form.value.email,
      organization: form.value.organization || undefined,
      plan: form.value.plan,
      people: form.value.people ? Number(form.value.people) : undefined,
      message: form.value.message,
    });
    sent.value = true;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    sending.value = false;
  }
}

// --- Consumo real de la instalacion, solo para administradores ---
const stats = ref<UserStats | null>(null);

onMounted(async () => {
  if (auth.user?.role !== 'admin') return;
  try {
    stats.value = await usersApi.stats();
  } catch {
    // Sin permisos o sin conexion: el panel simplemente no se muestra.
    stats.value = null;
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
        <RouterLink
          :to="auth.isAuthenticated ? { name: 'dashboard' } : { name: 'login' }"
          class="btn-secondary"
        >{{ auth.isAuthenticated ? 'Mis libros' : 'Entrar' }}</RouterLink>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-12">
      <h1 class="text-3xl font-black text-slate-900">Portal de clientes</h1>
      <p class="mt-2 max-w-2xl text-slate-600">
        Cuentanos que necesitas y te respondemos con una propuesta concreta. Si ya usas
        {{ SITE.name }} en tu centro, aqui abajo tienes el consumo de tu instalacion.
      </p>

      <!-- Consumo de la instalacion -->
      <section v-if="stats" class="card mt-8 p-6">
        <h2 class="font-bold text-slate-800">Tu instalacion</h2>
        <p class="text-xs text-slate-500">Datos reales de este servidor, actualizados al abrir la pagina.</p>

        <ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <li v-for="item in [
            { label: 'Cuentas', value: stats.total },
            { label: 'Docentes', value: stats.teachers },
            { label: 'Alumnado', value: stats.students },
            { label: 'Administradores', value: stats.admins },
            { label: 'Inactivas', value: stats.inactive },
            { label: 'Desde Phidias', value: stats.fromPhidias },
          ]" :key="item.label" class="rounded-lg bg-slate-50 p-3 text-center">
            <p class="text-xl font-black text-slate-800">{{ item.value }}</p>
            <p class="text-xs text-slate-500">{{ item.label }}</p>
          </li>
        </ul>

        <p class="mt-4 text-xs text-slate-500">
          El plan Escuela cubre hasta 5 profesores y 500 estudiantes. Ahora mismo tienes
          {{ stats.teachers }} docentes y {{ stats.students }} estudiantes; si te acercas al limite
          te avisamos antes de que ocurra.
        </p>
      </section>

      <div class="mt-10 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <!-- Formulario -->
        <section>
          <h2 class="text-xl font-black text-slate-900">Pide una demo o un presupuesto</h2>

          <div v-if="sent" class="card mt-4 border-emerald-300 bg-emerald-50 p-6">
            <p class="font-bold text-emerald-800">Solicitud recibida</p>
            <p class="mt-1 text-sm text-emerald-700">
              Te escribiremos a <strong>{{ form.email }}</strong> para concretar la demostracion y
              enviarte la propuesta.
            </p>
          </div>

          <form v-else class="card mt-4 space-y-4 p-6" @submit.prevent="submit">
            <AlertMessage :message="error" />

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label" for="c-name">Tu nombre</label>
                <input id="c-name" v-model.trim="form.name" type="text" required minlength="2" class="input" />
              </div>
              <div>
                <label class="label" for="c-email">Correo de contacto</label>
                <input id="c-email" v-model.trim="form.email" type="email" required class="input" />
              </div>
              <div>
                <label class="label" for="c-org">Centro u organizacion</label>
                <input id="c-org" v-model.trim="form.organization" type="text" class="input" />
              </div>
              <div>
                <label class="label" for="c-people">Cuantas personas lo usarian</label>
                <input id="c-people" v-model="form.people" type="number" min="1" class="input" placeholder="Ej. 350" />
              </div>
            </div>

            <div>
              <label class="label" for="c-plan">Plan que te encaja</label>
              <select id="c-plan" v-model="form.plan" class="input">
                <option v-for="plan in PLANS" :key="plan.id" :value="plan.id">
                  {{ plan.name }} — {{ plan.price }} {{ plan.period }}
                </option>
                <option value="no-lo-se">Todavia no lo se</option>
              </select>
            </div>

            <div>
              <label class="label" for="c-message">Que necesitas</label>
              <textarea
                id="c-message"
                v-model.trim="form.message"
                required
                minlength="10"
                maxlength="4000"
                rows="5"
                class="input resize-y"
                placeholder="Cuentanos para que lo quieres usar, cuanta gente sois y si teneis alguna restriccion tecnica."
              />
            </div>

            <button type="submit" class="btn-primary w-full py-3" :disabled="sending">
              {{ sending ? 'Enviando...' : 'Enviar solicitud' }}
            </button>

            <p class="text-xs leading-relaxed text-slate-500">
              Usamos estos datos solo para responderte. No los cedemos a terceros ni te apuntamos a
              ningun boletin.
            </p>
          </form>
        </section>

        <!-- Que incluye -->
        <aside class="space-y-6">
          <section class="card p-6">
            <h2 class="font-bold text-slate-800">Que pasa despues</h2>
            <ol class="mt-3 space-y-3 text-sm text-slate-600">
              <li class="flex gap-3">
                <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-black text-brand-700">1</span>
                <span>Te respondemos con una propuesta y, si quieres, una demo en directo.</span>
              </li>
              <li class="flex gap-3">
                <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-black text-brand-700">2</span>
                <span>Montamos un entorno de prueba con tus grupos reales.</span>
              </li>
              <li class="flex gap-3">
                <span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-black text-brand-700">3</span>
                <span>Formacion inicial al profesorado y puesta en marcha.</span>
              </li>
            </ol>
          </section>

          <section class="card p-6">
            <h2 class="font-bold text-slate-800">Prefieres alojarlo tu?</h2>
            <p class="mt-2 text-sm text-slate-600">
              El plan Institucional incluye la instalacion en vuestros propios servidores. Necesitais
              Node.js 20 y PostgreSQL 17. Puede vivir en la red interna del centro, sin salida a
              internet.
            </p>
            <RouterLink :to="{ name: 'landing' }" class="btn-secondary mt-4 inline-flex">
              Ver los planes
            </RouterLink>
          </section>
        </aside>
      </div>
    </main>

    <footer class="border-t border-slate-200 bg-slate-50 py-8 text-center text-xs text-slate-500">
      <RouterLink :to="{ name: 'landing' }" class="hover:text-brand-700">Volver a la portada</RouterLink>
    </footer>
  </div>
</template>
