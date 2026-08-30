<script setup lang="ts">
import QuestionRenderer from '@/components/canvas/QuestionRenderer.vue';
import { QUESTION_BLOCKS, type QuestionBlock } from '@/utils/questions';

const emit = defineEmits<{
  close: [];
  pick: [block: QuestionBlock];
}>();
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="font-bold text-slate-900">Preguntas</h2>
          <p class="text-xs text-slate-500">
            Bloques listos para usar. Los textos, las imagenes y la respuesta correcta se
            cambian luego en el panel derecho.
          </p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="block in QUESTION_BLOCKS" :key="block.id">
            <button
              type="button"
              class="flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-slate-200 text-left transition hover:border-brand-400"
              @click="emit('pick', block)"
            >
              <div class="h-52 w-full overflow-hidden bg-slate-100 p-2">
                <QuestionRenderer
                  :kind="block.properties.kind"
                  :prompt="block.properties.prompt"
                  :options="block.properties.options"
                  :feedback-correct="block.properties.feedbackCorrect"
                  :feedback-wrong="block.properties.feedbackWrong"
                  :accent-color="block.properties.accentColor"
                  :allow-retry="block.properties.allowRetry"
                  preview
                />
              </div>
              <div class="px-3 py-2">
                <p class="text-sm font-semibold text-slate-800">{{ block.label }}</p>
                <p class="text-xs leading-tight text-slate-500">{{ block.description }}</p>
              </div>
            </button>
          </li>
        </ul>

        <p class="mt-4 text-center text-[11px] leading-tight text-slate-400">
          La respuesta correcta se comprueba en el servidor: al alumno le llegan las opciones
          sin marcar, asi que no puede verla inspeccionando la pagina.
        </p>
      </div>
    </div>
  </div>
</template>
