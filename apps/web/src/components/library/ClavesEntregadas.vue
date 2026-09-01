<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ClaveEntregada } from '@/types/api';

/**
 * Claves que hay que repartir tras dar de alta a alumnado.
 *
 * Solo aparecen quienes las necesitan: los que estrenan cuenta y los que nunca
 * cambiaron la inicial. A quien ya se puso la suya no se le muestra nada, porque
 * darle una clave que no funciona confunde mas que ayudar.
 */
const props = defineProps<{ credentials: ClaveEntregada[] }>();
const emit = defineEmits<{ close: [] }>();

const copiado = ref(false);

const nuevos = computed(() => props.credentials.filter((c) => c.isNew).length);
const antiguos = computed(() => props.credentials.length - nuevos.value);

/** Texto plano, que es lo que se pega en un correo o se imprime. */
const comoTexto = computed(() =>
  props.credentials
    .map((c) => `${c.fullName}\t${c.email}\t${c.password}`)
    .join('\n'),
);

async function copiar(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`Nombre\tUsuario\tContraseña\n${comoTexto.value}`);
    copiado.value = true;
    setTimeout(() => (copiado.value = false), 2000);
  } catch {
    // Sin portapapeles queda la tabla para seleccionar a mano.
  }
}
</script>

<template>
  <section class="card border-2 border-amber-300 bg-amber-50 p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="font-bold text-amber-900">Claves para repartir</h3>
        <p class="mt-0.5 text-sm text-amber-800">
          <span v-if="nuevos">{{ nuevos }} {{ nuevos === 1 ? 'cuenta nueva' : 'cuentas nuevas' }}</span>
          <span v-if="nuevos && antiguos"> · </span>
          <span v-if="antiguos">
            {{ antiguos }} que {{ antiguos === 1 ? 'aún no había' : 'aún no habían' }} cambiado la suya
          </span>
        </p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn-secondary" @click="copiar">
          {{ copiado ? 'Copiado' : 'Copiar lista' }}
        </button>
        <button type="button" class="btn-secondary" @click="emit('close')">Ya las repartí</button>
      </div>
    </div>

    <div class="mt-4 overflow-x-auto rounded-lg border border-amber-200 bg-white">
      <table class="w-full text-sm">
        <thead class="border-b border-amber-200 text-left text-xs uppercase tracking-wide text-amber-700">
          <tr>
            <th class="px-3 py-2">Alumno</th>
            <th class="px-3 py-2">Usuario</th>
            <th class="px-3 py-2">Contraseña</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-amber-100">
          <tr v-for="clave in credentials" :key="clave.email">
            <td class="px-3 py-2 font-medium text-slate-800">{{ clave.fullName }}</td>
            <td class="px-3 py-2 font-mono text-xs text-slate-600">{{ clave.email }}</td>
            <td class="px-3 py-2 font-mono font-bold text-slate-900">{{ clave.password }}</td>
            <td class="px-3 py-2 text-right">
              <span
                v-if="clave.isNew"
                class="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
              >nueva</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-3 text-xs text-amber-800">
      Esta lista solo se ve ahora: cópiala antes de cerrarla. Diles que la cambien la primera vez que
      entren, desde su nombre en la esquina superior derecha.
    </p>
  </section>
</template>
