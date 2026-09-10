<script setup lang="ts">
import { computed, ref } from 'vue';
import TableRenderer from '@/components/canvas/TableRenderer.vue';
import {
  crearTabla,
  DESCRIPCION_DISENO,
  DISENOS,
  MAX_COLUMNAS,
  MAX_FILAS,
  NOMBRES_DISENO,
  type Diseno,
  type Tabla,
} from '@/utils/tablas';

/**
 * Insertar una tabla: se elige el tamano y el diseno, y se ve antes de ponerla.
 *
 * La vista previa es la tabla de verdad, con el mismo componente que la dibuja en
 * la pagina: lo que se elige es exactamente lo que sale.
 */
const emit = defineEmits<{ close: []; pick: [tabla: Tabla] }>();

const filas = ref(3);
const columnas = ref(3);
const diseno = ref<Diseno>('lineas');

/** Tamanos habituales, para no pelearse con dos numeritos. */
const ATAJOS = [
  { label: '2 x 2', f: 2, c: 2 },
  { label: '3 x 3', f: 3, c: 3 },
  { label: '4 x 2', f: 4, c: 2 },
  { label: '5 x 3', f: 5, c: 3 },
  { label: '8 x 4', f: 8, c: 4 },
];

/** Con datos de muestra, que una tabla vacia no deja ver el diseno. */
function conMuestra(d: Diseno, f: number, c: number): Tabla {
  const base = crearTabla(f, c, d);
  const ejemplos = [
    ['Nombre', 'Curso', 'Nota', 'Fecha', 'Grupo', 'Notas', 'Extra', 'Mas', 'Otro', 'Fin'],
    ['Ana', '5A', '9', '12/03', 'Rojo', '-', '-', '-', '-', '-'],
    ['Luis', '5B', '8', '13/03', 'Azul', '-', '-', '-', '-', '-'],
    ['Sara', '5A', '10', '14/03', 'Verde', '-', '-', '-', '-', '-'],
  ];
  const celdas = base.celdas.map((fila, i) =>
    fila.map((_, j) => ejemplos[Math.min(i, ejemplos.length - 1)][j] ?? ''),
  );
  return { ...base, celdas };
}

const previa = computed(() => conMuestra(diseno.value, Math.min(filas.value, 4), Math.min(columnas.value, 4)));

function insertar(): void {
  emit('pick', crearTabla(filas.value, columnas.value, diseno.value));
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 class="font-bold text-slate-900">Insertar una tabla</h2>
          <p class="text-xs text-slate-500">Después podrás escribir dentro y cambiar todo desde el panel derecho.</p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <p class="label">Tamaño</p>
        <div class="flex flex-wrap items-end gap-3">
          <label class="text-xs text-slate-600">
            Filas
            <input
              v-model.number="filas"
              type="number"
              :min="1"
              :max="MAX_FILAS"
              class="input mt-0.5 w-20"
            />
          </label>
          <label class="text-xs text-slate-600">
            Columnas
            <input
              v-model.number="columnas"
              type="number"
              :min="1"
              :max="MAX_COLUMNAS"
              class="input mt-0.5 w-20"
            />
          </label>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="atajo in ATAJOS"
              :key="atajo.label"
              type="button"
              class="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-brand-400"
              @click="filas = atajo.f; columnas = atajo.c"
            >{{ atajo.label }}</button>
          </div>
        </div>

        <p class="label mt-4">Diseño</p>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="d in DISENOS" :key="d">
            <button
              type="button"
              class="flex h-full w-full flex-col overflow-hidden rounded-lg border-2 text-left transition"
              :class="diseno === d ? 'border-brand-500' : 'border-slate-200 hover:border-brand-300'"
              @click="diseno = d"
            >
              <div class="h-28 w-full bg-white p-1">
                <TableRenderer :tabla="conMuestra(d, 3, 3)" />
              </div>
              <div class="border-t border-slate-100 px-2.5 py-1.5">
                <p class="text-sm font-semibold text-slate-800">{{ NOMBRES_DISENO[d] }}</p>
                <p class="text-[11px] leading-tight text-slate-500">{{ DESCRIPCION_DISENO[d] }}</p>
              </div>
            </button>
          </li>
        </ul>

        <p class="label mt-4">Así quedará</p>
        <div class="h-40 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
          <TableRenderer :tabla="previa" />
        </div>
      </div>

      <footer class="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancelar</button>
        <button type="button" class="btn-primary" @click="insertar">Insertar tabla</button>
      </footer>
    </div>
  </div>
</template>
