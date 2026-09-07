<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import RichContent from './RichContent.vue';
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
const ventana = ref<HTMLElement | null>(null);
const posicion = ref({ left: 0, top: 0 });

const esVentana = computed(() => props.activa?.interaction.kind === 'popup');
const info = computed(() => props.activa?.interaction ?? null);

/**
 * Coloca el globo junto al raton sin que se salga por ningun borde. Se mide
 * despues de pintarlo porque su alto depende de cuanto lleve dentro.
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
    if (!valor) return;
    if (valor.interaction.kind === 'popup') {
      // El foco entra en la ventana: sin esto, Escape y el tabulador se quedan
      // en la pagina de detras y quien navega con teclado se pierde.
      await new Promise(requestAnimationFrame);
      ventana.value?.focus();
      return;
    }
    posicion.value = { left: -9999, top: -9999 }; // fuera de vista mientras se mide
    await new Promise(requestAnimationFrame);
    colocar();
    // Una imagen sin cargar mide cero: al llegar, el globo cambia de alto.
    const img = globo.value?.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', colocar, { once: true });
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
    <!-- Globo: tarjeta pequena junto al cursor. No intercepta el raton, o al
         aparecer bajo el puntero se taparia a si mismo y parpadearia. -->
    <div
      v-if="activa && info && !esVentana"
      ref="globo"
      role="tooltip"
      class="pointer-events-none fixed z-[120] max-w-[19rem] overflow-hidden rounded-xl
             bg-slate-900/95 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-sm"
      :style="{ left: `${posicion.left}px`, top: `${posicion.top}px` }"
    >
      <img
        v-if="info.imageUrl"
        :src="info.imageUrl"
        alt=""
        class="max-h-36 w-full object-cover"
      />
      <div class="px-3 py-2">
        <p v-if="info.title" class="mb-1 text-[13px] font-semibold leading-tight">{{ info.title }}</p>
        <RichContent :blocks="info.content" :fallback="info.text" compact />
      </div>
    </div>

    <!-- Ventana: centrada, con cabecera propia y cuerpo desplazable. -->
    <div
      v-if="activa && info && esVentana"
      class="fixed inset-0 z-[120] grid place-items-center bg-slate-900/70 p-4 backdrop-blur-[2px]"
      @click.self="emit('cerrar')"
    >
      <div
        ref="ventana"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-label="info.title || 'Información ampliada'"
        class="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white
               shadow-2xl ring-1 ring-slate-900/10 focus:outline-none"
      >
        <!-- Cabecera: se queda fija mientras el cuerpo se desplaza, para que el
             aspa siga a mano en una ficha larga. -->
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200
                 bg-slate-50 px-5 py-3"
        >
          <h2 class="text-base font-semibold leading-snug text-slate-800">
            {{ info.title || 'Más información' }}
          </h2>
          <button
            type="button"
            class="-mr-1 shrink-0 rounded-full px-2 text-2xl leading-none text-slate-400
                   transition hover:bg-slate-200 hover:text-slate-700"
            aria-label="Cerrar"
            @click="emit('cerrar')"
          >&times;</button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <img
            v-if="info.imageUrl"
            :src="info.imageUrl"
            alt=""
            class="max-h-72 w-full object-cover"
          />
          <div class="px-5 py-4 text-slate-700">
            <RichContent :blocks="info.content" :fallback="info.text" />
          </div>
        </div>

        <footer class="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-2 text-right">
          <button type="button" class="btn-secondary py-1 text-xs" @click="emit('cerrar')">Cerrar</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
