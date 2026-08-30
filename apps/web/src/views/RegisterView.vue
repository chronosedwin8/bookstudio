<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const fullName = ref('');
const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

async function onSubmit(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    await auth.register({ fullName: fullName.value, email: email.value, password: password.value, role: 'teacher' });
    await router.push({ name: 'dashboard' });
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
      <h1 class="mb-1 text-2xl font-black text-slate-900">Crear cuenta docente</h1>
      <p class="mb-6 text-sm text-slate-500">Empieza a crear bibliotecas para tus clases</p>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <div>
          <label class="label" for="fullName">Nombre completo</label>
          <input id="fullName" v-model.trim="fullName" type="text" required minlength="2" maxlength="100" class="input" placeholder="Ana Docente" />
        </div>

        <div>
          <label class="label" for="email">Correo electrónico</label>
          <input id="email" v-model.trim="email" type="email" required class="input" placeholder="profe@escuela.edu" />
        </div>

        <div>
          <label class="label" for="password">Contraseña</label>
          <input id="password" v-model="password" type="password" required minlength="8" autocomplete="new-password" class="input" placeholder="Mínimo 8 caracteres" />
        </div>

        <AlertMessage :message="error" />

        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ loading ? 'Creando...' : 'Crear cuenta' }}
        </button>
      </form>

      <p class="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
        Ya tienes cuenta?
        <RouterLink :to="{ name: 'login' }" class="font-semibold text-brand-600 hover:underline">Entrar</RouterLink>
      </p>
    </div>
  </div>
</template>
