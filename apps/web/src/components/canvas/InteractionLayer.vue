<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ElementInteraction } from '@/types/api';

/**
 * Globo y ventana de informacion ampliada.
 *
 * Se dibuja con `Teleport` al final del `body`, y no dentro de la pagina, por dos
 * razones que no se ven hasta que fallan:
 *
 *  1. La pagina se pinta con `transform: scale(...)`. Un globo dentro heredaria
 *     esa escala y, en una miniatura, su texto quedaria ilegible.
 *  2. El lector monta las hojas en 3D. Dentro de un elemento transformado, un
 *     `position: fixed` deja de referirse a la ventana y pasa a referirse a la
 *     hoja, asi que el globo se iria girando con el papel al pasar de pagina.
 *
 * Fuera del arbol de la pagina no ocurre ninguna de las dos cosas.
 */
const props = defineProps<{
  /** Que mostrar y donde; null cuando no hay nada abierto. */
  activa: { interaction: ElementInteraction; x: number; y: number } | null;
}>();

const emit = defineEmits<{ cerrar: [] }>();

const globo = ref<HTMLElement | null>(null);
const posicion = ref({ left: 0, top: 0 });

const esVentana = computed(() => props.activa?.interaction.kind === 'popup');

/**
 * Coloca el globo junto al raton sin que se salga por ningun borde. Se mide
 * despues de pintarlo porque su alto depende de cuanto texto lleve.
 */
function colocar(): void {
  const caja = globo.value?.getBoundingClientRect();
  if (!caja || !props.activa) return;

  const margen = 12;
  const libreDebajo = window.innerHeight - props.activa.y;

  posicion.value = {
    left: Math.min(Math.max(margen, props.activa.x - caja.width / 2), window.innerWidth - caja.width - margen),
    // Si no cabe debajo del cursor, se pone encima en vez de recortarse.
    top: libreDebajo > caja.height + margen * 2
      ? props.activa.y + margen
      : Math.max(margen, props.activa.y - caja.height - margen),
  };
}

watch(
  () => props.activa,
  async (valor) => {
    if (!valor || valor.interaction.kind === 'popup') return;
    posicion.value = { left: -9999, top: -9999 }; // fuera de vista mientras se mide
    await new Promise(requestAnimationFrame);
    colocar();
  },
  { immediate: true },
);

/** Escape cierra la ventana; es lo que espera cualquiera que la abra sin raton. */
function alPulsarTecla(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.activa) emit('cerrar');
}

onMounted(() => window.addEventListener('keydown', alPulsarTecla));
onBeforeUnmount(() => window.removeEventListener('keydown', alPulsarTecla));
</script>

<template>
  <Teleport to="body">
    <!-- Globo: texto corto junto al cursor. No intercepta el raton, o al
         aparecer bajo el puntero se taparia a si mismo y parpadearia. -->
    <div
      v-if="activa && !esVentana"
      ref="globo"
      role="tooltip"
      class="pointer-events-none fixed z-[120] max-w-xs rounded-lg bg-slate-900/95 px-3 py-2
             text-[13px] leading-snug text-white shadow-xl"
      :style="{ left: `${posicion.left}px`, top: `${posicion.top}px` }"
    >
      <p v-if="activa.interaction.title" class="mb-0.5 font-semibold">{{ activa.interaction.title }}</p>
      <!-- `whitespace-pre-line` respeta los saltos que escribio el autor sin
           convertir el texto en HTML: es texto plano y se queda en texto plano. -->
      <p class="whitespace-pre-line">{{ activa.interaction.text }}</p>
    </div>

    <!-- Ventana: texto largo y, si lo hay, una imagen. -->
    <div
      v-if="activa && esVentana"
      class="fixed inset-0 z-[120] grid place-items-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Informacion ampliada"
      @click.self="emit('cerrar')"
    >
      <div class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div class="mb-3 flex items-start justify-between gap-3">
          <h2 class="text-lg font-semibold text-slate-800">
            {{ activa.interaction.title || 'Más información' }}
          </h2>
          <button
            type="button"
            class="shrink-0 rounded-full px-2 text-xl leading-none text-slate-400 hover:text-slate-700"
            aria-label="Cerrar"
            @click="emit('cerrar')"
          >×</button>
        </div>

        <img
          v-if="activa.interaction.imageUrl"
          :src="activa.interaction.imageUrl"
          alt=""
          class="mb-3 max-h-64 w-full rounded-lg object-contain"
        />

        <p class="whitespace-pre-line text-sm leading-relaxed text-slate-700">
          {{ activa.interaction.text }}
        </p>
      </div>
    </div>
  </Teleport>
</template>
