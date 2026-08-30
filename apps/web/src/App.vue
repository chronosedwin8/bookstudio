<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

function handleLogout(): void {
  auth.logout();
  void router.push({ name: 'login' });
}
</script>

<template>
  <!--
    h-dvh (no min-h-screen) fija la altura: sin una altura definida, flex-1 no acota
    nada y el lienzo del editor y del lector crecian hasta desbordar la ventana.
  -->
  <div class="flex h-dvh flex-col overflow-hidden">
    <header v-if="auth.isAuthenticated" class="shrink-0 border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <RouterLink :to="{ name: 'dashboard' }" class="flex items-center gap-2 font-black text-brand-700">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">B</span>
          <span class="text-lg">BookStudio</span>
        </RouterLink>

        <div class="flex items-center gap-3">
          <RouterLink
            v-if="auth.user?.role === 'admin'"
            :to="{ name: 'admin-users' }"
            class="text-sm text-slate-600 hover:text-brand-700"
          >Usuarios</RouterLink>

          <div class="text-right">
            <p class="text-sm font-semibold leading-tight text-slate-800">{{ auth.user?.fullName }}</p>
            <p class="text-xs capitalize text-slate-500">{{ auth.user?.role }}</p>
          </div>
          <button type="button" class="btn-secondary" @click="handleLogout">Salir</button>
        </div>
      </div>
    </header>

    <!--
      Las vistas normales (panel, biblioteca) hacen scroll aqui dentro; el editor y
      el lector se declaran h-full y encajan exactamente sin barra de desplazamiento.
    -->
    <main class="min-h-0 flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
</template>
