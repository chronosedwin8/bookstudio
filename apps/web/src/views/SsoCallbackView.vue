<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Aterrizaje de la entrada con la cuenta del colegio.
 *
 * El servidor devuelve el token en el fragmento de la direccion (tras la
 * almohadilla) porque esa parte no se envia al servidor ni queda en los registros
 * del proxy. Aqui se recoge, se limpia de la barra de direcciones y se sigue.
 */
const router = useRouter();
const auth = useAuthStore();
const error = ref<string | null>(null);

onMounted(async () => {
  const fragmento = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = fragmento.get('token');
  const destino = fragmento.get('redirect') || '/dashboard';

  if (!token) {
    error.value = 'No llegó la sesión desde Microsoft. Vuelve a intentarlo.';
    return;
  }

  try {
    await auth.adoptarToken(token);
    // Borra el token de la barra de direcciones antes de continuar, para que no
    // quede en el historial ni se comparta al copiar el enlace.
    history.replaceState(null, '', window.location.pathname);
    await router.replace(destino.startsWith('/') && !destino.startsWith('//') ? destino : '/dashboard');
  } catch {
    error.value = 'La sesión no es válida. Vuelve a entrar.';
  }
});
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-gradient-to-br from-brand-50 to-slate-100 px-4">
    <div class="card w-full max-w-md p-8 text-center">
      <template v-if="error">
        <AlertMessage :message="error" />
        <RouterLink :to="{ name: 'login' }" class="btn-primary mt-4 inline-flex">Volver a entrar</RouterLink>
      </template>
      <p v-else class="text-slate-600">Entrando con tu cuenta del colegio...</p>
    </div>
  </div>
</template>
