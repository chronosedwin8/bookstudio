<script setup lang="ts">
import { computed, ref } from 'vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import { useElementWidth } from '@/composables/useElementWidth';
import type { Book } from '@/types/api';

const props = defineProps<{ book: Book; canDelete?: boolean }>();

defineEmits<{ remove: [book: Book] }>();

const ASPECT: Record<Book['layoutFormat'], number> = {
  square: 1,
  portrait: 3 / 4,
  landscape: 4 / 3,
};

const aspectRatio = computed(() => ASPECT[props.book.layoutFormat]);
const cssAspect = computed(() => `${aspectRatio.value}`);

const coverBox = ref<HTMLElement | null>(null);
const coverWidth = useElementWidth(coverBox);
</script>

<template>
  <li class="card flex flex-col p-4">
    <RouterLink
      :to="{ name: 'book-reader', params: { id: book.id } }"
      class="mb-3 block overflow-hidden rounded border border-slate-200 bg-white transition hover:ring-2 hover:ring-brand-400"
      :title="`Leer ${book.title}`"
    >
      <div ref="coverBox" class="w-full" :style="{ aspectRatio: cssAspect }">
        <PagePreview
          v-if="book.cover && coverWidth > 0"
          :background-color="book.cover.backgroundColor"
          :background-pattern="book.cover.backgroundPattern"
          :elements="book.cover.elements"
          :aspect-ratio="aspectRatio"
          :width="coverWidth"
        />
      </div>
    </RouterLink>

    <h3 class="truncate font-semibold text-slate-900" :title="book.title">{{ book.title }}</h3>
    <p class="mt-0.5 text-xs text-slate-500">
      {{ book.pageCount ?? 0 }} páginas · {{ book.layoutFormat }}
      <span v-if="book.isPublished" class="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">Publicado</span>
    </p>

    <div class="mt-3 flex gap-2 border-t border-slate-100 pt-3">
      <RouterLink :to="{ name: 'book-reader', params: { id: book.id } }" class="btn-secondary flex-1">Leer</RouterLink>
      <RouterLink :to="{ name: 'book-editor', params: { id: book.id } }" class="btn-secondary flex-1">Editar</RouterLink>
      <button
        v-if="canDelete"
        type="button"
        class="btn-danger"
        :aria-label="`Eliminar ${book.title}`"
        @click="$emit('remove', book)"
      >×</button>
    </div>
  </li>
</template>
