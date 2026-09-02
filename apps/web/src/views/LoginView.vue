<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { ssoApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const loading = ref(false);
/** Entrada con la cuenta del colegio; solo se pinta si el servidor la tiene puesta. */
const sso = ref<{ enabled: boolean; domain: string }>({ enabled: false, domain: '' });

onMounted(async () => {
  // Un fallo al volver de Microsoft llega como parametro, no como excepcion.
  const aviso = route.query.sso;
  if (typeof aviso === 'string' && aviso) error.value = aviso;

  try {
    sso.value = await ssoApi.config();
  } catch {
    // Sin respuesta se asume apagado: mejor un boton de menos que uno que falla.
  }
});

function entrarConMicrosoft(): void {
  ssoApi.entrar((route.query.redirect as string) || '/dashboard');
}

async function onSubmit(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    await auth.login(email.value, password.value);
    await router.push((route.query.redirect as string) || { name: 'dashboard' });
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
    <div class="card w-full max-w-md p-8">
      <div class="mb-6 text-center">
        <div class="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-xl font-black text-white">
          B
        </div>
        <h1 class="text-2xl font-black text-slate-900">BookStudio</h1>
        <p class="mt-1 text-sm text-slate-500">Crea libros interactivos con tu clase</p>
      </div>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <div>
          <label class="label" for="email">Correo electrónico</label>
          <input id="email" v-model.trim="email" type="email" required autocomplete="email" class="input" placeholder="profe@escuela.edu" />
        </div>

        <div>
          <label class="label" for="password">Contraseña</label>
          <input id="password" v-model="password" type="password" required autocomplete="current-password" class="input" placeholder="********" />
        </div>

        <AlertMessage :message="error" />

        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Entrando...' : 'Entrar' }}
        </button>
      </form>

      <div v-if="sso.enabled" class="mt-5">
        <div class="mb-3 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
          <span class="h-px flex-1 bg-slate-200" />o<span class="h-px flex-1 bg-slate-200" />
        </div>
        <button
          type="button"
          class="btn-secondary w-full justify-center gap-2"
          @click="entrarConMicrosoft"
        >
          <span aria-hidden="true">🏫</span> Entrar con la cuenta del colegio
        </button>
        <p v-if="sso.domain" class="mt-1.5 text-center text-[11px] text-slate-400">
          Tu correo @{{ sso.domain }}
        </p>
      </div>

      <div class="mt-6 space-y-2 border-t border-slate-200 pt-5 text-center text-sm">
        <p class="text-slate-600">
          Eres alumno?
          <RouterLink :to="{ name: 'login-qr' }" class="font-semibold text-brand-600 hover:underline">
            Entra con tu código QR
          </RouterLink>
        </p>
        <p class="text-slate-600">
          No tienes cuenta?
          <RouterLink :to="{ name: 'register' }" class="font-semibold text-brand-600 hover:underline">
            Crear cuenta docente
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
