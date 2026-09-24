<script setup lang="ts">
import { computed, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { usersApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { partirNombre, tieneLetrasDanadas } from '@/utils/nombres';

/**
 * Corregir el nombre de un alumno, en dos partes.
 *
 * Cada via de alta escribia el nombre a su manera (Phidias "NOMBRES APELLIDOS",
 * Microsoft "APELLIDOS NOMBRES", a mano como cada cual) y en la lista de clase
 * salian mezclados. Con las dos partes aparte, el nombre se compone siempre igual,
 * apellidos primero, y la correccion ya no la vuelve a pisar ninguna importacion.
 */
const props = defineProps<{
  userId: string;
  fullName: string;
  givenName?: string | null;
  familyName?: string | null;
}>();
const emit = defineEmits<{ close: []; saved: [fullName: string] }>();
const cierre = useCierreExterior(() => emit('close'));

// Si ya se conocen las partes se usan; si no, se propone un reparto para corregir.
const propuesta = props.givenName || props.familyName
  ? { nombres: props.givenName ?? '', apellidos: props.familyName ?? '' }
  : partirNombre(props.fullName);

const apellidos = ref(propuesta.apellidos);
const nombres = ref(propuesta.nombres);
const guardando = ref(false);
const error = ref<string | null>(null);

const resultado = computed(() => `${apellidos.value} ${nombres.value}`.replace(/\s+/g, ' ').trim());
const danado = computed(() => tieneLetrasDanadas(resultado.value));
const listo = computed(() => apellidos.value.trim() && nombres.value.trim() && !danado.value);

/** Por si el reparto propuesto salio al reves: un clic en vez de reescribir. */
function intercambiar(): void {
  [apellidos.value, nombres.value] = [nombres.value, apellidos.value];
}

async function guardar(): Promise<void> {
  if (!listo.value) return;
  guardando.value = true;
  error.value = null;
  try {
    const usuario = await usersApi.update(props.userId, {
      givenName: nombres.value.trim(),
      familyName: apellidos.value.trim(),
    });
    emit('saved', usuario.fullName);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9400] grid place-items-start overflow-y-auto bg-slate-900/70 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="nombre-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <form class="mx-auto w-full max-w-md rounded-xl bg-white shadow-2xl" @submit.prevent="guardar">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div class="min-w-0">
          <h2 id="nombre-titulo" class="text-lg font-black text-slate-900">Corregir el nombre</h2>
          <p class="mt-0.5 truncate text-sm text-slate-500" :title="fullName">Ahora: {{ fullName }}</p>
        </div>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="space-y-3 p-5">
        <AlertMessage :message="error" />

        <label class="block">
          <span class="label">Apellidos</span>
          <input v-model="apellidos" type="text" class="input" maxlength="60" required autocomplete="off" />
        </label>

        <div class="flex justify-center">
          <button type="button" class="text-xs font-semibold text-brand-600 hover:underline" @click="intercambiar">
            ⇅ Intercambiar apellidos y nombres
          </button>
        </div>

        <label class="block">
          <span class="label">Nombres</span>
          <input v-model="nombres" type="text" class="input" maxlength="60" required autocomplete="off" />
        </label>

        <p class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Se verá así en las listas: <strong>{{ resultado || '—' }}</strong>
        </p>

        <p v-if="danado" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Hay letras dañadas (<span aria-hidden="true">�</span>). Escribe la letra correcta, por ejemplo la tilde o
          la eñe, antes de guardar.
        </p>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-secondary" :disabled="guardando" @click="emit('close')">Cancelar</button>
          <button type="submit" class="btn-primary" :disabled="guardando || !listo">
            {{ guardando ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
