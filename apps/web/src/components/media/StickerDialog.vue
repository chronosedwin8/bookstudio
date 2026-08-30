<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import IconRenderer from '@/components/canvas/IconRenderer.vue';
import ShapeRenderer from '@/components/canvas/ShapeRenderer.vue';
import { EMOJI_GROUPS, ALL_EMOJIS } from '@/utils/emojis';
import { SHAPES, SHAPE_GROUPS, type ShapeName } from '@/utils/shapes';

interface IconEntry {
  n: string;
  p: string[];
  k: string;
}

const emit = defineEmits<{
  close: [];
  pickShape: [shape: ShapeName];
  pickIcon: [icon: { name: string; paths: string[]; viewBox: string }];
  pickEmoji: [char: string];
}>();

const props = defineProps<{ tab?: 'shapes' | 'icons' | 'emojis' }>();

const tab = ref<'shapes' | 'icons' | 'emojis'>(props.tab ?? 'shapes');
const search = ref('');

// --- Iconos: el catalogo (505 kB) solo se descarga al abrir su pestana ---
const icons = shallowRef<IconEntry[]>([]);
const iconViewBox = ref('0 0 24 24');
const loadingIcons = ref(false);
let iconsRequested = false;

async function loadIcons(): Promise<void> {
  if (iconsRequested) return;
  iconsRequested = true;
  loadingIcons.value = true;
  try {
    const data = (await import('@/assets/icons.json')).default as {
      viewBox: string;
      iconos: IconEntry[];
    };
    iconViewBox.value = data.viewBox;
    icons.value = data.iconos;
  } finally {
    loadingIcons.value = false;
  }
}

watch(tab, (value) => value === 'icons' && void loadIcons(), { immediate: true });

const query = computed(() => search.value.trim().toLowerCase());

/** Se limita el resultado: pintar 2048 SVG a la vez bloquea el navegador. */
const MAX_RESULTS = 240;

const filteredIcons = computed(() => {
  if (!query.value) return icons.value.slice(0, MAX_RESULTS);
  return icons.value.filter((i) => i.n.includes(query.value) || i.k.includes(query.value)).slice(0, MAX_RESULTS);
});

const filteredEmojiGroups = computed(() => {
  if (!query.value) return EMOJI_GROUPS;
  const matches = ALL_EMOJIS.filter((item) => item.keywords.includes(query.value));
  return matches.length ? [{ label: `Resultados (${matches.length})`, emojis: matches }] : [];
});

const filteredShapeGroups = computed(() => {
  if (!query.value) return SHAPE_GROUPS;
  const matches = SHAPE_GROUPS.flatMap((group) =>
    group.shapes.filter((name) => SHAPES[name].label.toLowerCase().includes(query.value)),
  );
  return matches.length ? [{ label: `Resultados (${matches.length})`, shapes: matches }] : [];
});

const TABS = [
  { id: 'shapes', label: 'Formas' },
  { id: 'icons', label: 'Iconos' },
  { id: 'emojis', label: 'Emojis' },
] as const;

const placeholder = computed(
  () =>
    ({
      shapes: 'Buscar forma (estrella, flecha...)',
      icons: 'Buscar icono en ingles (house, cat, star...)',
      emojis: 'Buscar emoji (perro, sol, libro...)',
    })[tab.value],
);
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div class="flex gap-1">
          <button
            v-for="item in TABS"
            :key="item.id"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold transition"
            :class="tab === item.id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'"
            @click="tab = item.id"
          >{{ item.label }}</button>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="border-b border-slate-100 px-5 py-3">
        <input v-model="search" type="search" class="input" :placeholder="placeholder" />
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <!-- Formas -->
        <template v-if="tab === 'shapes'">
          <section v-for="group in filteredShapeGroups" :key="group.label" class="mb-5">
            <h3 class="label">{{ group.label }}</h3>
            <div class="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              <button
                v-for="name in group.shapes"
                :key="name"
                type="button"
                class="grid aspect-square place-items-center rounded-lg border border-slate-200 p-2 transition hover:border-brand-400 hover:bg-brand-50"
                :title="SHAPES[name].label"
                :aria-label="SHAPES[name].label"
                @click="emit('pickShape', name)"
              >
                <ShapeRenderer
                  :shape="name"
                  fill-color="#93C5FD"
                  stroke-color="#1D4ED8"
                  :stroke-width="2"
                />
              </button>
            </div>
          </section>
          <p v-if="!filteredShapeGroups.length" class="py-8 text-center text-sm text-slate-500">
            Ninguna forma coincide con "{{ search }}".
          </p>
        </template>

        <!-- Iconos -->
        <template v-else-if="tab === 'icons'">
          <p v-if="loadingIcons" class="py-8 text-center text-sm text-slate-500">Cargando iconos...</p>

          <template v-else>
            <div class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
              <button
                v-for="icon in filteredIcons"
                :key="icon.n"
                type="button"
                class="grid aspect-square place-items-center rounded-lg border border-slate-200 p-2 text-slate-700 transition hover:border-brand-400 hover:bg-brand-50"
                :title="icon.n"
                :aria-label="icon.n"
                @click="emit('pickIcon', { name: icon.n, paths: icon.p, viewBox: iconViewBox })"
              >
                <IconRenderer source="library" :paths="icon.p" :view-box="iconViewBox" color="#334155" />
              </button>
            </div>

            <p v-if="!filteredIcons.length" class="py-8 text-center text-sm text-slate-500">
              Ningun icono coincide con "{{ search }}". Prueba en inglés.
            </p>
            <p v-else-if="filteredIcons.length === MAX_RESULTS" class="mt-4 text-center text-xs text-slate-400">
              Mostrando los primeros {{ MAX_RESULTS }}. Afina la busqueda para ver más.
            </p>
            <p class="mt-4 text-center text-[11px] text-slate-400">
              Iconos de Lucide, licencia ISC (open source).
            </p>
          </template>
        </template>

        <!-- Emojis -->
        <template v-else>
          <section v-for="group in filteredEmojiGroups" :key="group.label" class="mb-5">
            <h3 class="label">{{ group.label }}</h3>
            <div class="grid grid-cols-8 gap-1.5 sm:grid-cols-10 md:grid-cols-12">
              <button
                v-for="item in group.emojis"
                :key="item.char"
                type="button"
                class="grid aspect-square place-items-center rounded-lg text-2xl transition hover:bg-brand-50"
                :title="item.keywords.split(' ')[0]"
                @click="emit('pickEmoji', item.char)"
              >{{ item.char }}</button>
            </div>
          </section>
          <p v-if="!filteredEmojiGroups.length" class="py-8 text-center text-sm text-slate-500">
            Ningun emoji coincide con "{{ search }}".
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
