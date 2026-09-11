<script setup lang="ts">
/**
 * Precios de los planes.
 *
 * Lo que se toca aqui es lo que se cobra y lo que se anuncia en la portada: son
 * el mismo dato, no dos copias. Por eso la pantalla avisa antes de guardar y
 * muestra el importe ya formateado mientras se escribe, para que un cero de mas
 * se vea antes de confirmarlo y no despues, en un cargo real.
 */
import { computed, onMounted, ref } from 'vue';
import { useSeo } from '@/composables/useSeo';
import { billingApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { PlanAdmin } from '@/types/api';
import { duracionTexto, pesos } from '@/utils/precio';

useSeo({ title: 'Planes y precios · BookStudio', description: 'Configuración de los planes.' });

const planes = ref<PlanAdmin[]>([]);
const cargando = ref(true);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

/** El plan que se esta editando y una copia de trabajo; se descarta al cancelar. */
const editando = ref<string | null>(null);
const borrador = ref<PlanAdmin | null>(null);
const guardando = ref(false);

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    planes.value = await billingApi.plans();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

function abrir(plan: PlanAdmin): void {
  editando.value = plan.id;
  borrador.value = { ...plan };
  aviso.value = null;
  error.value = null;
}

function cerrar(): void {
  editando.value = null;
  borrador.value = null;
}

/** El total del periodo cuando se anuncia un precio mensual; es lo que se cobra. */
const totalDelPeriodo = computed(() => {
  const b = borrador.value;
  if (!b) return null;
  if (b.monthlyCop === null || b.periodMonths <= 1) return null;
  return b.monthlyCop * b.periodMonths;
});

/** Avisa cuando el "al mes" anunciado no cuadra con lo que se va a cobrar. */
const descuadre = computed(() => {
  const total = totalDelPeriodo.value;
  const b = borrador.value;
  if (total === null || !b) return null;
  if (total === b.amountCop) return null;
  return `El precio mensual por ${b.periodMonths} meses da ${pesos(total)}, y se cobrarán ${pesos(b.amountCop)}.`;
});

function numeroOpcional(valor: string): number | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

async function guardar(): Promise<void> {
  const b = borrador.value;
  if (!b) return;

  if (!Number.isFinite(b.amountCop) || b.amountCop < 1000) {
    error.value = 'El importe debe ser de al menos 1.000 COP.';
    return;
  }

  guardando.value = true;
  error.value = null;
  try {
    const actualizado = await billingApi.updatePlan(b.id, {
      name: b.name.trim(),
      summary: b.summary.trim(),
      amountCop: Math.round(b.amountCop),
      monthlyCop: b.monthlyCop === null ? null : Math.round(b.monthlyCop),
      periodMonths: b.periodMonths,
      maxTeachers: b.maxTeachers,
      maxStudents: b.maxStudents,
      visible: b.visible,
      sortOrder: b.sortOrder,
    });
    planes.value = planes.value.map((p) => (p.id === actualizado.id ? actualizado : p));
    aviso.value = `Plan "${actualizado.name}" guardado. La portada ya muestra el precio nuevo.`;
    cerrar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-8">
    <header>
      <h1 class="text-2xl font-black text-slate-900">Planes y precios</h1>
      <p class="mt-1 text-sm text-slate-600">
        Estos importes son los que se cobran y los que se muestran en la portada. Un cambio se ve
        en la web en menos de un minuto.
      </p>
    </header>

    <p v-if="aviso" class="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {{ aviso }}
    </p>
    <p v-if="error" class="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{{ error }}</p>

    <p v-if="cargando" class="mt-8 text-sm text-slate-500">Cargando planes...</p>

    <ul v-else class="mt-6 space-y-3">
      <li v-for="plan in planes" :key="plan.id" class="card p-5">
        <template v-if="editando === plan.id && borrador">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="label">Nombre</span>
              <input v-model="borrador.name" type="text" class="input mt-1" maxlength="80" />
            </label>

            <label class="block">
              <span class="label">Orden en la portada</span>
              <input v-model.number="borrador.sortOrder" type="number" min="0" max="999" class="input mt-1" />
            </label>

            <label class="block sm:col-span-2">
              <span class="label">Resumen</span>
              <input v-model="borrador.summary" type="text" class="input mt-1" maxlength="400" />
            </label>

            <label class="block">
              <span class="label">Importe que se cobra (COP)</span>
              <input v-model.number="borrador.amountCop" type="number" min="1000" step="1000" class="input mt-1" />
              <span class="mt-1 block text-xs font-bold text-slate-700">
                Se cobrará {{ pesos(borrador.amountCop || 0) }} por {{ duracionTexto(borrador) }}.
              </span>
            </label>

            <label class="block">
              <span class="label">Duración (meses)</span>
              <input v-model.number="borrador.periodMonths" type="number" min="1" max="60" class="input mt-1" />
            </label>

            <label class="block">
              <span class="label">Precio “al mes” anunciado (opcional)</span>
              <input
                :value="borrador.monthlyCop ?? ''"
                type="number"
                min="1000"
                step="1000"
                class="input mt-1"
                placeholder="Sin precio mensual"
                @input="borrador.monthlyCop = numeroOpcional(($event.target as HTMLInputElement).value)"
              />
              <span class="mt-1 block text-xs text-slate-500">
                Solo para comparar en la portada; el cargo sigue siendo el importe de arriba.
              </span>
            </label>

            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="label">Máx. profesores</span>
                <input
                  :value="borrador.maxTeachers ?? ''"
                  type="number"
                  min="1"
                  class="input mt-1"
                  placeholder="Sin límite"
                  @input="borrador.maxTeachers = numeroOpcional(($event.target as HTMLInputElement).value)"
                />
              </label>
              <label class="block">
                <span class="label">Máx. estudiantes</span>
                <input
                  :value="borrador.maxStudents ?? ''"
                  type="number"
                  min="1"
                  class="input mt-1"
                  placeholder="Sin límite"
                  @input="borrador.maxStudents = numeroOpcional(($event.target as HTMLInputElement).value)"
                />
              </label>
            </div>

            <label class="flex items-start gap-2 sm:col-span-2">
              <input v-model="borrador.visible" type="checkbox" class="mt-0.5 h-4 w-4 rounded" />
              <span class="text-sm text-slate-700">
                Ofrecer este plan
                <span class="block text-xs text-slate-500">
                  Si lo desactivas deja de aparecer en la portada y no se puede contratar, pero las
                  licencias ya vendidas siguen funcionando.
                </span>
              </span>
            </label>
          </div>

          <p v-if="descuadre" class="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {{ descuadre }}
          </p>

          <div class="mt-5 flex gap-2">
            <button type="button" class="btn-primary" :disabled="guardando" @click="guardar">
              {{ guardando ? 'Guardando...' : 'Guardar' }}
            </button>
            <button type="button" class="btn-secondary" :disabled="guardando" @click="cerrar">
              Cancelar
            </button>
          </div>
        </template>

        <div v-else class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="font-black text-slate-900">
              {{ plan.name }}
              <span
                v-if="!plan.visible"
                class="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600"
              >Retirado</span>
            </p>
            <p class="text-sm text-slate-500">{{ plan.summary }}</p>
          </div>

          <div class="flex items-center gap-5">
            <p class="text-right">
              <span class="block text-xl font-black text-slate-900">{{ pesos(plan.amountCop) }}</span>
              <span class="block text-xs text-slate-500">
                por {{ duracionTexto(plan) }}
                <template v-if="plan.monthlyCop && plan.periodMonths > 1">
                  · {{ pesos(plan.monthlyCop) }}/mes
                </template>
              </span>
            </p>
            <button type="button" class="btn-secondary" @click="abrir(plan)">Editar</button>
          </div>
        </div>
      </li>
    </ul>
  </main>
</template>
