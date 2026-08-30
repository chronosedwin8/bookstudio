<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { phidiasApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { PhidiasImportResult, PhidiasSection } from '@/types/api';

const props = defineProps<{
  /** Con biblioteca de destino se añaden los alumnos a ella; sin ella se crea una nueva. */
  libraryId?: string;
  libraryName?: string;
}>();

const emit = defineEmits<{
  close: [];
  imported: [result: PhidiasImportResult];
}>();

const sections = ref<PhidiasSection[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const search = ref('');
const importing = ref<number | null>(null);
const done = ref<PhidiasImportResult | null>(null);

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return sections.value;
  return sections.value.filter(
    (s) =>
      s.name.toLowerCase().includes(term) ||
      s.course.toLowerCase().includes(term) ||
      s.level.toLowerCase().includes(term),
  );
});

/** Agrupadas por nivel: 52 secciones sueltas son difíciles de recorrer. */
const grouped = computed(() => {
  const map = new Map<string, PhidiasSection[]>();
  for (const section of filtered.value) {
    map.set(section.level, [...(map.get(section.level) ?? []), section]);
  }
  return [...map.entries()].map(([level, items]) => ({ level, items }));
});

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    sections.value = await phidiasApi.sections();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function importSection(section: PhidiasSection): Promise<void> {
  const destino = props.libraryName ? `la clase "${props.libraryName}"` : 'una clase nueva';
  if (!window.confirm(`Añadir los ${section.studentCount} alumnos de ${section.name} a ${destino}?`)) return;

  importing.value = section.id;
  error.value = null;
  try {
    const result = await phidiasApi.importSection(section.id, props.libraryId);
    done.value = result;
    emit('imported', result);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    importing.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="fixed inset-0 z-[10000] grid place-items-center bg-slate-900/60 p-4" @click.self="emit('close')">
    <div class="card flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden">
      <header class="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div class="min-w-0">
          <h2 class="font-bold text-slate-900">Traer alumnos desde Phidias</h2>
          <p class="truncate text-xs text-slate-500">
            {{ libraryName
              ? `Se añadirán a "${libraryName}"`
              : 'Se creará una clase nueva con los alumnos de la sección' }}
          </p>
        </div>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="border-b border-slate-100 px-5 py-3">
        <input v-model.trim="search" type="search" class="input" placeholder="Filtrar por grupo (K9A, KINDER, SECUNDARIA...)" />
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <AlertMessage :message="error" />

        <div v-if="done" class="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
          <p class="font-bold text-emerald-800">Listo: {{ done.libraryName }}</p>
          <p class="text-emerald-700">
            {{ done.created }} cuentas nuevas, {{ done.reused }} ya existian,
            {{ done.enrolled }} inscripciones.
            <span v-if="done.skipped">{{ done.skipped }} sin correo institucional se omitieron.</span>
          </p>
          <p class="mt-1 text-xs text-emerald-700">
            Código de la clase: <strong class="font-mono tracking-widest">{{ done.codeInvite }}</strong>.
            Entran con su correo y la contraseña inicial que fijaste en el servidor.
          </p>
        </div>

        <p v-if="loading" class="py-8 text-center text-sm text-slate-500">
          Consultando Phidias... (la primera vez tarda unos segundos)
        </p>

        <template v-else>
          <section v-for="group in grouped" :key="group.level" class="mb-5">
            <h3 class="label">{{ group.level }}</h3>
            <ul class="grid gap-2 sm:grid-cols-2">
              <li
                v-for="section in group.items"
                :key="section.id"
                class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-slate-800">{{ section.name }}</p>
                  <p class="truncate text-xs text-slate-500">{{ section.course }}</p>
                  <p class="text-xs text-slate-400">
                    {{ section.studentCount }} alumnos
                    <span v-if="section.withoutEmail" class="text-amber-600">
                      · {{ section.withoutEmail }} sin correo
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  class="btn-secondary shrink-0 px-2 py-1 text-xs"
                  :disabled="importing !== null || section.studentCount === 0"
                  @click="importSection(section)"
                >{{ importing === section.id ? 'Trayendo...' : 'Traer' }}</button>
              </li>
            </ul>
          </section>

          <p v-if="!grouped.length" class="py-8 text-center text-sm text-slate-500">
            Ninguna sección coincide con "{{ search }}".
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
