<script setup lang="ts">
import { computed } from 'vue';
import ChartInspector from './ChartInspector.vue';
import QuestionInspector from './QuestionInspector.vue';
import {
  FONT_GROUPS,
  type CanvasElement,
  type ChartProperties,
  type QuestionProperties,
  type ShapeProperties,
  type TextProperties,
} from '@/types/api';

const props = defineProps<{
  element: CanvasElement | null;
  isManager: boolean;
}>();

const emit = defineEmits<{
  patch: [payload: { properties?: Record<string, unknown>; isLocked?: boolean; opacity?: number }];
  move: [direction: 'front' | 'forward' | 'backward' | 'back'];
  remove: [];
}>();

/** Tipos que admiten enlace; el resto no muestra el campo. */
const LINKABLE = ['text', 'image', 'shape', 'icon'] as const;

const canLink = computed(() => LINKABLE.includes(props.element?.type as (typeof LINKABLE)[number]));
const linkUrl = computed(() => String(props.element?.properties.linkUrl ?? ''));

/** Vacia el campo o guarda la URL; el backend rechaza esquemas no navegables. */
function patchLink(value: string): void {
  patchProperty('linkUrl', value.trim());
}

const text = computed(() => props.element?.properties as unknown as TextProperties | undefined);
const shape = computed(() => props.element?.properties as unknown as ShapeProperties | undefined);
const question = computed(() => props.element?.properties as unknown as QuestionProperties | undefined);
const chart = computed(() => props.element?.properties as unknown as ChartProperties | undefined);

function patchProperty(key: string, value: unknown): void {
  if (!props.element) return;
  emit('patch', { properties: { ...props.element.properties, [key]: value } });
}

// El catalogo vive en types/api.ts para no duplicarlo con el enum del backend.

/** Plantillas de formula habituales en primaria y secundaria. */
const MATH_SAMPLES = [
  { label: 'Fraccion', latex: '\frac{a}{b}' },
  { label: 'Potencia', latex: 'x^{2}' },
  { label: 'Raiz', latex: '\sqrt{x}' },
  { label: 'Ecuacion', latex: 'ax^2 + bx + c = 0' },
  { label: 'Pitagoras', latex: 'a^2 + b^2 = c^2' },
  { label: 'Sumatorio', latex: '\sum_{i=1}^{n} i' },
  { label: 'Integral', latex: '\int_{a}^{b} f(x)\,dx' },
  { label: 'Matriz', latex: '\begin{pmatrix} a & b \\ c & d \end{pmatrix}' },
] as const;
// Tonos hueso y opalo recomendados para reducir el contraste excesivo.
const SOFT_BACKGROUNDS = ['transparent', '#F7F4EC', '#EDF2F0', '#FBF3E4', '#EFEAF6', '#FFFFFF'] as const;
</script>

<template>
  <aside class="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-4">
    <p v-if="!element" class="text-sm text-slate-500">Selecciona un elemento para editarlo.</p>

    <template v-else>
      <div>
        <h2 class="text-sm font-bold capitalize text-slate-800">{{ element.type }}</h2>
        <p class="mt-0.5 text-xs text-slate-400">
          {{ Math.round(element.transformMatrix.width) }}% × {{ Math.round(element.transformMatrix.height) }}% ·
          {{ Math.round(element.transformMatrix.angle) }}°
        </p>
      </div>

      <!-- Capas -->
      <section>
        <h3 class="label">Capa (z-index {{ element.zIndex }})</h3>
        <div class="grid grid-cols-4 gap-1">
          <button type="button" class="btn-secondary px-0 py-1.5 text-xs" title="Traer al frente" @click="emit('move', 'front')">⤒</button>
          <button type="button" class="btn-secondary px-0 py-1.5 text-xs" title="Subir una" @click="emit('move', 'forward')">↑</button>
          <button type="button" class="btn-secondary px-0 py-1.5 text-xs" title="Bajar una" @click="emit('move', 'backward')">↓</button>
          <button type="button" class="btn-secondary px-0 py-1.5 text-xs" title="Enviar al fondo" @click="emit('move', 'back')">⤓</button>
        </div>
      </section>

      <!-- Opacidad -->
      <section>
        <label class="label" :for="`opacity-${element.id}`">Opacidad · {{ Math.round(element.opacity * 100) }}%</label>
        <input
          :id="`opacity-${element.id}`"
          type="range"
          min="0" max="1" step="0.05"
          class="w-full accent-brand-600"
          :value="element.opacity"
          @input="emit('patch', { opacity: Number(($event.target as HTMLInputElement).value) })"
        />
      </section>

      <!-- Bloqueo (solo docentes) -->
      <section v-if="isManager">
        <label class="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            class="h-4 w-4 rounded"
            :checked="element.isLocked"
            @change="emit('patch', { isLocked: !element.isLocked })"
          />
          Bloquear elemento (plantilla)
        </label>
      </section>
      <p v-else-if="element.isLocked" class="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
        Bloqueado por el docente.
      </p>

      <!-- Propiedades de texto -->
      <section v-if="element.type === 'text' && text" class="space-y-3 border-t border-slate-100 pt-3">
        <div>
          <label class="label" :for="`text-${element.id}`">Contenido</label>
          <textarea
            :id="`text-${element.id}`"
            rows="4"
            class="input"
            :value="text.text"
            @change="patchProperty('text', ($event.target as HTMLTextAreaElement).value)"
          />
        </div>

        <div>
          <label class="label" :for="`font-${element.id}`">Tipografía</label>
          <select :id="`font-${element.id}`" class="input" :value="text.fontFamily" @change="patchProperty('fontFamily', ($event.target as HTMLSelectElement).value)">
            <optgroup v-for="group in FONT_GROUPS" :key="group.label" :label="group.label">
              <!-- Cada opción se muestra con su propia tipografía para elegir de un vistazo. -->
              <option
                v-for="font in group.fonts"
                :key="font"
                :value="font"
                :style="{ fontFamily: `'${font}', sans-serif` }"
              >{{ font }}</option>
            </optgroup>
          </select>
        </div>

        <div>
          <label class="label">Lista</label>
          <div class="grid grid-cols-3 gap-1">
            <button
              v-for="option in [
                { id: 'none', label: 'Sin lista' },
                { id: 'bullet', label: '• Vinetas' },
                { id: 'number', label: '1. Numeros' },
              ]"
              :key="option.id"
              type="button"
              class="btn-secondary px-1 py-1.5 text-[11px]"
              :class="(text.listStyle ?? 'none') === option.id && 'bg-brand-50 text-brand-700'"
              @click="patchProperty('listStyle', option.id)"
            >{{ option.label }}</button>
          </div>
        </div>

        <div>
          <label class="label" :for="`lh-${element.id}`">
            Interlineado · {{ (text.lineHeight ?? 1.35).toFixed(2) }}
          </label>
          <input
            :id="`lh-${element.id}`"
            type="range" min="0.9" max="2.4" step="0.05"
            class="w-full accent-brand-600"
            :value="text.lineHeight ?? 1.35"
            @input="patchProperty('lineHeight', Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div>
          <label class="label" :for="`size-${element.id}`">Tamaño · {{ text.fontSize }}px</label>
          <input
            :id="`size-${element.id}`"
            type="range" min="24" max="120" step="2"
            class="w-full accent-brand-600"
            :value="text.fontSize"
            @change="patchProperty('fontSize', Number(($event.target as HTMLInputElement).value))"
          />
          <p class="mt-0.5 text-[11px] text-slate-400">Mínimo accesible: 24px</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" :for="`color-${element.id}`">Texto</label>
            <input :id="`color-${element.id}`" type="color" class="h-9 w-full rounded border border-slate-300" :value="text.color" @change="patchProperty('color', ($event.target as HTMLInputElement).value)" />
          </div>
          <div>
            <label class="label" :for="`align-${element.id}`">Alineacion</label>
            <select :id="`align-${element.id}`" class="input" :value="text.textAlign" @change="patchProperty('textAlign', ($event.target as HTMLSelectElement).value)">
              <option value="left">Izquierda</option>
              <option value="center">Centro</option>
              <option value="right">Derecha</option>
            </select>
          </div>
        </div>

        <div>
          <span class="label">Fondo suave</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="bg in SOFT_BACKGROUNDS"
              :key="bg"
              type="button"
              class="h-7 w-7 rounded border-2"
              :class="text.backgroundColor === bg ? 'border-brand-600' : 'border-slate-300'"
              :style="bg === 'transparent' ? { backgroundImage: 'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)', backgroundSize: '8px 8px' } : { backgroundColor: bg }"
              :title="bg"
              @click="patchProperty('backgroundColor', bg)"
            />
          </div>
        </div>

        <div class="flex flex-wrap gap-1">
          <button type="button" class="btn-secondary px-2.5 py-1 text-xs font-bold" :class="text.bold && 'bg-brand-50 text-brand-700'" @click="patchProperty('bold', !text.bold)">B</button>
          <button type="button" class="btn-secondary px-2.5 py-1 text-xs italic" :class="text.italic && 'bg-brand-50 text-brand-700'" @click="patchProperty('italic', !text.italic)">I</button>
          <button type="button" class="btn-secondary px-2.5 py-1 text-xs underline" :class="text.underline && 'bg-brand-50 text-brand-700'" @click="patchProperty('underline', !text.underline)">U</button>
          <button type="button" class="btn-secondary px-2.5 py-1 text-xs line-through" :class="text.strikethrough && 'bg-brand-50 text-brand-700'" @click="patchProperty('strikethrough', !text.strikethrough)">S</button>
        </div>
      </section>

      <!-- Propiedades de forma -->
      <section v-else-if="element.type === 'shape' && shape" class="space-y-3 border-t border-slate-100 pt-3">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" :for="`fill-${element.id}`">Relleno</label>
            <input :id="`fill-${element.id}`" type="color" class="h-9 w-full rounded border border-slate-300" :value="shape.fillColor === 'transparent' ? '#ffffff' : shape.fillColor" @change="patchProperty('fillColor', ($event.target as HTMLInputElement).value)" />
          </div>
          <div>
            <label class="label" :for="`stroke-${element.id}`">Borde</label>
            <input :id="`stroke-${element.id}`" type="color" class="h-9 w-full rounded border border-slate-300" :value="shape.strokeColor === 'transparent' ? '#000000' : shape.strokeColor" @change="patchProperty('strokeColor', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>

        <div>
          <label class="label" :for="`sw-${element.id}`">Grosor · {{ shape.strokeWidth }}</label>
          <input :id="`sw-${element.id}`" type="range" min="0" max="20" step="1" class="w-full accent-brand-600" :value="shape.strokeWidth" @change="patchProperty('strokeWidth', Number(($event.target as HTMLInputElement).value))" />
        </div>

        <div>
          <label class="label" :for="`label-${element.id}`">Texto interior</label>
          <input :id="`label-${element.id}`" type="text" class="input" :value="shape.label" @change="patchProperty('label', ($event.target as HTMLInputElement).value)" />
        </div>
      </section>

      <!-- Pregunta -->
      <section v-if="element.type === 'question' && question">
        <h3 class="label">Pregunta</h3>
        <QuestionInspector :question="question" @patch="emit('patch', { properties: $event })" />
      </section>

      <!-- Formula matemática -->
      <section v-if="element.type === 'math'">
        <label class="label" :for="`latex-${element.id}`">Formula (LaTeX)</label>
        <textarea
          :id="`latex-${element.id}`"
          class="input min-h-[5rem] resize-y font-mono text-xs"
          :value="String(element.properties.latex ?? '')"
          @change="patchProperty('latex', ($event.target as HTMLTextAreaElement).value)"
        />
        <div class="mt-1.5 flex flex-wrap gap-1">
          <button
            v-for="sample in MATH_SAMPLES"
            :key="sample.latex"
            type="button"
            class="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
            :title="sample.latex"
            @click="patchProperty('latex', sample.latex)"
          >{{ sample.label }}</button>
        </div>
        <label class="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            class="h-4 w-4 rounded"
            :checked="element.properties.displayMode !== false"
            @change="patchProperty('displayMode', ($event.target as HTMLInputElement).checked)"
          />
          Formula en bloque (centrada y grande)
        </label>
      </section>

      <!-- Gráfica -->
      <section v-if="element.type === 'chart' && chart">
        <h3 class="label">Gráfica</h3>
        <ChartInspector :chart="chart" @patch="emit('patch', { properties: $event })" />
      </section>

      <!-- Enlace: se abre al pulsar el elemento en el modo lectura -->
      <section v-if="canLink">
        <label class="label" :for="`link-${element.id}`">Enlace</label>
        <input
          :id="`link-${element.id}`"
          type="url"
          class="input"
          placeholder="https://..."
          :value="linkUrl"
          @change="patchLink(($event.target as HTMLInputElement).value)"
        />
        <p class="mt-1 text-[11px] leading-tight text-slate-400">
          {{ linkUrl
            ? 'Se abrira en una pestana nueva al pulsarlo en el modo lectura.'
            : 'Pega una dirección para convertir este elemento en un enlace.' }}
        </p>
      </section>

      <button type="button" class="btn-danger mt-auto w-full" @click="emit('remove')">Eliminar elemento</button>
    </template>
  </aside>
</template>
