<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

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
          <label class="label" for="email">Correo electronico</label>
          <input id="email" v-model.trim="email" type="email" required autocomplete="email" class="input" placeholder="profe@escuela.edu" />
        </div>

        <div>
          <label class="label" for="password">Contrasena</label>
          <input id="password" v-model="password" type="password" required autocomplete="current-password" class="input" placeholder="********" />
        </div>

        <AlertMessage :message="error" />

        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Entrando...' : 'Entrar' }}
        </button>
      </form>

      <div class="mt-6 space-y-2 border-t border-slate-200 pt-5 text-center text-sm">
        <p class="text-slate-600">
          Eres alumno?
          <RouterLink :to="{ name: 'login-qr' }" class="font-semibold text-brand-600 hover:underline">
            Entra con tu codigo QR
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
