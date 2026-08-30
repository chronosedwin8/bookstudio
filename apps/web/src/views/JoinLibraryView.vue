<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import { useLibrariesStore } from '@/stores/libraries';

/**
 * Inscripcion por enlace: /unirse/CODIGO.
 *
 * Si no hay sesion se manda a iniciar sesion conservando el destino, para que al
 * volver la inscripcion se complete sola.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const libraries = useLibrariesStore();

const error = ref<string | null>(null);
const code = String(route.params.code ?? '').toUpperCase();

onMounted(async () => {
  await auth.restore();

  if (!auth.isAuthenticated) {
    await router.replace({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }

  try {
    const library = await libraries.join(code);
    await router.replace({ name: 'library', params: { id: library.id } });
  } catch (err) {
    error.value = errorMessage(err);
  }
});
</script>

<template>
  <div class="mx-auto grid max-w-md place-items-center px-4 py-16 text-center">
    <template v-if="error">
      <h1 class="text-xl font-black text-slate-900">No se pudo completar la inscripción</h1>
      <p class="mt-1 font-mono text-sm tracking-widest text-slate-500">{{ code }}</p>
      <AlertMessage class="mt-4 w-full" :message="error" />
      <RouterLink :to="{ name: 'dashboard' }" class="btn-secondary mt-4">Ir a mis libros</RouterLink>
    </template>

    <p v-else class="text-sm text-slate-500">Inscribiendote en la clase {{ code }}...</p>
  </div>
</template>
