<script setup lang="ts">
import { computed, ref } from 'vue';
import PagePreview from '@/components/canvas/PagePreview.vue';
import { TEMPLATES, TEMPLATES_BY_ID, TEMPLATE_GROUPS, type PageTemplate } from '@/utils/templates';
import type { CanvasElement } from '@/types/api';

defineProps<{ aspectRatio: number; busy?: boolean }>();

const emit = defineEmits<{
  close: [];
  pick: [template: PageTemplate];
}>();

const search = ref('');
const query = computed(() => search.value.trim().toLowerCase());

const groups = computed(() => {
  if (!query.value) {
    return TEMPLATE_GROUPS.map((group) => ({
      label: group.label,
      templates: group.ids.map((id) => TEMPLATES_BY_ID.get(id)!).filter(Boolean),
    }));
  }

  const matches = TEMPLATES.filter(
    (t) => t.label.toLowerCase().includes(query.value) || t.description.toLowerCase().includes(query.value),
  );
  return matches.length ? [{ label: `Resultados (${matches.length})`, templates: matches }] : [];
});

/**
 * Las plantillas no tienen id ni capa: PagePreview espera elementos completos,
 * asi que se rellenan los campos que solo existen una vez guardados en la base.
 */
function toPreviewElements(template: PageTemplate): CanvasElement[] {
  return template.elements.map((element, index) => ({
    id: `${template.id}-${index}`,
    pageId: template.id,
    type: element.type,
    zIndex: index,
    transformMatrix: element.transformMatrix,
    properties: element.properties,
    isLocked: false,
    opacity: 1,
    updatedAt: '',
  }));
}

const THUMB_WIDTH = 230;
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="font-bold text-slate-900">Plantillas</h2>
          <p class="text-xs text-slate-500">Se añaden como una página nueva después de la actual.</p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="border-b border-slate-100 px-5 py-3">
        <input v-model="search" type="search" class="input" placeholder="Buscar plantilla (comic, tabla, venn...)" />
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <section v-for="group in groups" :key="group.label" class="mb-6">
          <h3 class="label">{{ group.label }}</h3>

          <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li v-for="template in group.templates" :key="template.id">
              <button
                type="button"
                class="w-full overflow-hidden rounded-lg border-2 border-slate-200 bg-white text-left transition hover:border-brand-400 disabled:opacity-50"
                :disabled="busy"
                @click="emit('pick', template)"
              >
                <div class="grid place-items-center overflow-hidden bg-slate-100 p-2">
                  <PagePreview
                    :background-color="template.backgroundColor"
                    :background-pattern="template.backgroundPattern"
                    :elements="toPreviewElements(template)"
                    :aspect-ratio="aspectRatio"
                    :width="THUMB_WIDTH"
                  />
                </div>
                <div class="px-3 py-2">
                  <p class="truncate text-sm font-semibold text-slate-800">{{ template.label }}</p>
                  <p class="text-xs leading-tight text-slate-500">{{ template.description }}</p>
                </div>
              </button>
            </li>
          </ul>
        </section>

        <p v-if="!groups.length" class="py-8 text-center text-sm text-slate-500">
          Ninguna plantilla coincide con "{{ search }}".
        </p>
      </div>
    </div>
  </div>
</template>
