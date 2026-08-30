<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const qrToken = ref('');
const error = ref<string | null>(null);
const loading = ref(false);

async function submit(token: string): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    await auth.loginWithQr(token);
    await router.push({ name: 'dashboard' });
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

// Permite abrir directamente el enlace codificado en el QR: /login/qr?t=<token>
onMounted(() => {
  const fromUrl = route.query.t;
  if (typeof fromUrl === 'string' && fromUrl.length > 10) {
    qrToken.value = fromUrl;
    void submit(fromUrl);
  }
});
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-gradient-to-br from-amber-50 to-orange-100 px-4">
    <div class="card w-full max-w-md p-8">
      <div class="mb-6 text-center">
        <div class="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-xl bg-amber-500 text-2xl">🔑</div>
        <h1 class="text-2xl font-black text-slate-900">Entrar con código</h1>
        <p class="mt-1 text-sm text-slate-600">Escanea el QR que te dio tu profe o pega el código aquí</p>
      </div>

      <form class="space-y-4" @submit.prevent="submit(qrToken)">
        <div>
          <label class="label" for="qr">Código del QR</label>
          <textarea id="qr" v-model.trim="qrToken" rows="4" required class="input font-mono text-xs" placeholder="eyJhbGciOi..." />
        </div>

        <AlertMessage :message="error" />

        <button type="submit" class="btn-primary w-full" :disabled="loading || qrToken.length < 10">
          {{ loading ? 'Entrando...' : 'Entrar' }}
        </button>
      </form>

      <p class="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
        Eres docente?
        <RouterLink :to="{ name: 'login' }" class="font-semibold text-brand-600 hover:underline">Entra con tu correo</RouterLink>
      </p>
    </div>
  </div>
</template>
