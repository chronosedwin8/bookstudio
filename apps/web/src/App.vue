<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CambiarClaveDialog from '@/components/CambiarClaveDialog.vue';
import { clientsApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const cambiarClave = ref(false);

/**
 * La portada trae su propia cabecera, con el logotipo y el menu comercial.
 *
 * Si ademas se pintaba esta, quien tenia la sesion abierta veia dos barras
 * apiladas, las dos con el mismo logotipo. Manda la de la pagina.
 */
const SIN_CABECERA = new Set(['landing']);
const conCabecera = computed(
  () => auth.isAuthenticated && !SIN_CABECERA.has(String(route.name ?? '')),
);

/**
 * Si esta persona tiene cuenta de cliente, para pintar "Mi cuenta".
 *
 * Se pregunta una sola vez al iniciar sesion. Un enlace que lleva a una pantalla
 * vacia es peor que no tener enlace, y el alumnado no tiene nada que hacer ahi.
 */
const esCliente = ref(false);

watch(
  () => auth.user?.id,
  async (id) => {
    esCliente.value = false;
    if (!id || auth.user?.role === 'student') return;
    try {
      esCliente.value = await clientsApi.status();
    } catch {
      // Sin respuesta se asume que no: mejor un enlace de menos que uno que falla.
    }
  },
  { immediate: true },
);

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
    <header v-if="conCabecera" class="shrink-0 border-b border-slate-200 bg-white">
      <!--
        Los enlaces van pegados al logotipo y la cuenta se queda sola a la derecha,
        separada por una linea. Antes iba todo amontonado en el mismo grupo y, con
        cada enlace nuevo, el nombre y el boton de salir quedaban mas apretados.
        `flex-wrap` deja que en una pantalla estrecha los enlaces bajen de linea en
        vez de desbordarse o comprimir el resto.
      -->
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <RouterLink :to="{ name: 'dashboard' }" class="flex items-center gap-2 font-black text-brand-700">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">B</span>
          <span class="text-lg">BookStudio</span>
        </RouterLink>

        <nav aria-label="Secciones" class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <!-- El mural lo ve todo el mundo, tenga cuenta o no; aqui el enlace es
               para quien publica y quiere comprobar como ha quedado. -->
          <RouterLink :to="{ name: 'mural' }" class="enlace-cabecera">Mural</RouterLink>

          <RouterLink
            v-if="auth.user?.role === 'admin'"
            :to="{ name: 'admin-clients' }"
            class="enlace-cabecera"
          >Clientes</RouterLink>

          <RouterLink
            v-if="auth.user?.role === 'admin'"
            :to="{ name: 'admin-users' }"
            class="enlace-cabecera"
          >Usuarios</RouterLink>

          <RouterLink
            v-if="auth.user?.role === 'admin'"
            :to="{ name: 'admin-plans' }"
            class="enlace-cabecera"
          >Planes</RouterLink>

          <!--
            Solo a quien tiene cuenta de cliente. Se consulta una vez al entrar: un
            enlace que lleva a una pantalla vacia es peor que no tener enlace.
          -->
          <RouterLink
            v-if="esCliente"
            :to="{ name: 'client-portal' }"
            class="enlace-cabecera"
          >Mi cuenta</RouterLink>
        </nav>

        <!-- `ms-auto` empuja la cuenta al extremo; al bajar de linea sigue a la derecha. -->
        <div class="ms-auto flex items-center gap-3 border-s border-slate-200 ps-4">
          <!-- Cambiar la contrasena: al alcance de todos, tambien del alumnado -->
          <button
            type="button"
            class="text-right"
            title="Cambiar mi contraseña"
            @click="cambiarClave = true"
          >
            <span class="block text-sm font-semibold leading-tight text-slate-800 hover:text-brand-700">
              {{ auth.user?.fullName }}
            </span>
            <span class="block text-xs capitalize text-slate-500">{{ auth.user?.role }}</span>
          </button>
          <button type="button" class="btn-secondary" @click="handleLogout">Salir</button>
        </div>
      </div>
    </header>

    <CambiarClaveDialog
      v-if="cambiarClave"
      :tiene-password="Boolean(auth.user?.email && !auth.user.email.endsWith('@qr.local'))"
      @close="cambiarClave = false"
    />

    <!--
      Las vistas normales (panel, biblioteca) hacen scroll aqui dentro; el editor y
      el lector se declaran h-full y encajan exactamente sin barra de desplazamiento.
    -->
    <main class="min-h-0 flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
</template>
