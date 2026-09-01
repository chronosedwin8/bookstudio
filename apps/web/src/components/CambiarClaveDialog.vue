<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { useCierreExterior } from '@/composables/useCierreExterior';
import { authApi } from '@/services/api';
import { errorMessage } from '@/services/http';

/**
 * Cambio de contrasena por la propia persona.
 *
 * Quien entra con codigo QR no tiene ninguna, asi que la primera vez no se le pide la
 * anterior: su credencial es el codigo, y exigirle algo que no tiene le dejaria sin
 * poder ponerse una nunca.
 */
const props = defineProps<{
  /** Falso para las cuentas que entran por QR y aun no tienen contrasena. */
  tienePassword?: boolean;
}>();

const emit = defineEmits<{ close: []; changed: [] }>();
const cierre = useCierreExterior(() => emit('close'));

const actual = ref('');
const nueva = ref('');
const repetida = ref('');
const guardando = ref(false);
const error = ref<string | null>(null);
const listo = ref(false);

const campo = ref<HTMLInputElement | null>(null);
onMounted(() => campo.value?.focus());

const coinciden = computed(() => nueva.value.length > 0 && nueva.value === repetida.value);
const puedeGuardar = computed(
  () =>
    nueva.value.length >= 8 &&
    coinciden.value &&
    (!props.tienePassword || actual.value.length > 0) &&
    !guardando.value,
);

async function guardar(): Promise<void> {
  if (!puedeGuardar.value) return;
  guardando.value = true;
  error.value = null;
  try {
    await authApi.changePassword({
      currentPassword: props.tienePassword ? actual.value : undefined,
      newPassword: nueva.value,
    });
    listo.value = true;
    emit('changed');
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
    aria-labelledby="clave-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-md rounded-xl bg-white shadow-2xl">
      <header class="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <h2 id="clave-titulo" class="text-lg font-black text-slate-900">
          {{ tienePassword ? 'Cambiar mi contraseña' : 'Ponerme una contraseña' }}
        </h2>
        <button type="button" class="btn-secondary shrink-0" @click="emit('close')">Cerrar</button>
      </header>

      <div class="p-5">
        <AlertMessage class="mb-3" :message="error" />

        <div v-if="listo" class="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          <p class="font-semibold">Contraseña cambiada.</p>
          <p class="mt-1">Úsala la próxima vez que entres. Guárdala donde no se te pierda.</p>
          <button type="button" class="btn-primary mt-3" @click="emit('close')">Entendido</button>
        </div>

        <form v-else class="space-y-4" @submit.prevent="guardar">
          <p v-if="!tienePassword" class="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Entras con tu código QR y todavía no tienes contraseña. Si te pones una, podrás entrar
            también escribiendo tu usuario, sin necesitar el código.
          </p>

          <div v-if="tienePassword">
            <label class="label" for="clave-actual">Contraseña actual</label>
            <input
              id="clave-actual"
              ref="campo"
              v-model="actual"
              type="password"
              required
              class="input"
              autocomplete="current-password"
            />
          </div>

          <div>
            <label class="label" for="clave-nueva">Contraseña nueva</label>
            <input
              id="clave-nueva"
              v-model="nueva"
              type="password"
              required
              minlength="8"
              class="input"
              autocomplete="new-password"
            />
            <p class="mt-1 text-xs text-slate-500">Al menos 8 caracteres.</p>
          </div>

          <div>
            <label class="label" for="clave-repetida">Repítela</label>
            <input
              id="clave-repetida"
              v-model="repetida"
              type="password"
              required
              class="input"
              autocomplete="new-password"
            />
            <p v-if="repetida && !coinciden" class="mt-1 text-xs font-semibold text-red-600">
              Las dos contraseñas no son iguales.
            </p>
          </div>
        </form>
      </div>

      <footer v-if="!listo" class="flex justify-end gap-2 border-t border-slate-200 p-5">
        <button type="button" class="btn-primary" :disabled="!puedeGuardar" @click="guardar">
          {{ guardando ? 'Guardando...' : 'Guardar' }}
        </button>
      </footer>
    </div>
  </div>
</template>
