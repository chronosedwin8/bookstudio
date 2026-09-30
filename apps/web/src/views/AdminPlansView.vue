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
import type { EnlacePago, PlanAdmin } from '@/types/api';
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
    [planes.value, enlaces.value] = await Promise.all([billingApi.plans(), billingApi.paymentLinks()]);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

/* --------------------------------------------------------------------------
 * Enlaces de pago
 *
 * Se cobra con enlaces de Mercado Pago, uno por importe. Cada plan y cada cuenta
 * de cobro ofrece el enlace de su importe EXACTO: si se cambia un precio, hay que
 * poner el enlace del importe nuevo, o el plan se queda sin enlace (y el cliente
 * ve que escriba en vez de pagar una cantidad equivocada).
 * ----------------------------------------------------------------------- */
const enlaces = ref<EnlacePago[]>([]);
const nuevoEnlace = ref({ amountCop: 0, url: '', label: '' });
const guardandoEnlace = ref(false);

async function guardarEnlace(): Promise<void> {
  guardandoEnlace.value = true;
  error.value = null;
  try {
    const e = await billingApi.savePaymentLink({
      amountCop: Math.round(nuevoEnlace.value.amountCop),
      url: nuevoEnlace.value.url.trim(),
      label: nuevoEnlace.value.label.trim() || undefined,
    });
    aviso.value = `Enlace para ${pesos(e.amountCop)} guardado. Ya se ofrece en todo lo que cueste eso.`;
    nuevoEnlace.value = { amountCop: 0, url: '', label: '' };
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardandoEnlace.value = false;
  }
}

function editarEnlace(e: EnlacePago): void {
  nuevoEnlace.value = { amountCop: e.amountCop, url: e.url, label: e.label };
}

async function borrarEnlace(e: EnlacePago): Promise<void> {
  if (!window.confirm(`¿Quitar el enlace de ${pesos(e.amountCop)}? Lo que cueste eso se quedará sin enlace de pago.`)) return;
  error.value = null;
  try {
    await billingApi.deletePaymentLink(e.id);
    aviso.value = `Enlace de ${pesos(e.amountCop)} quitado.`;
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

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
        Estos importes son los que se muestran en la portada. Cada plan se paga con el enlace de Mercado
        Pago de su importe exacto: si cambias un precio, pon abajo el enlace del importe nuevo.
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
            <p class="mt-1 text-xs">
              <a
                v-if="plan.paymentLink"
                :href="plan.paymentLink"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold text-emerald-700 underline"
              >Enlace de pago ↗</a>
              <span v-else class="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800">
                Sin enlace de pago para {{ pesos(plan.amountCop) }}
              </span>
            </p>
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

    <!-- Enlaces de pago -->
    <section class="mt-10">
      <h2 class="text-xl font-black text-slate-900">Enlaces de pago</h2>
      <p class="mt-1 text-sm text-slate-600">
        Uno por importe. Se ofrece en cada plan y en cada cuenta de cobro que cueste exactamente eso. Solo se
        admiten enlaces de Mercado Pago (https://mpago.li/... o https://www.mercadopago.com.co/...).
      </p>

      <ul v-if="enlaces.length" class="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        <li v-for="e in enlaces" :key="e.id" class="flex flex-wrap items-center justify-between gap-3 p-3">
          <div class="min-w-0">
            <p class="font-bold tabular-nums text-slate-900">{{ pesos(e.amountCop) }}</p>
            <p class="truncate text-xs text-slate-500">
              <span v-if="e.label">{{ e.label }} · </span>
              <a :href="e.url" target="_blank" rel="noopener noreferrer" class="underline">{{ e.url }}</a>
            </p>
          </div>
          <span class="flex gap-3">
            <button type="button" class="text-xs font-semibold text-brand-600 hover:underline" @click="editarEnlace(e)">Cambiar</button>
            <button type="button" class="text-xs font-semibold text-red-600 hover:underline" @click="borrarEnlace(e)">Quitar</button>
          </span>
        </li>
      </ul>

      <form class="card mt-4 grid gap-3 p-4 sm:grid-cols-[10rem_1fr_12rem_auto] sm:items-end" @submit.prevent="guardarEnlace">
        <label class="block">
          <span class="label">Importe (COP)</span>
          <input v-model.number="nuevoEnlace.amountCop" type="number" min="1000" step="1000" class="input" required />
        </label>
        <label class="block">
          <span class="label">Enlace de Mercado Pago</span>
          <input v-model="nuevoEnlace.url" type="url" class="input" placeholder="https://mpago.li/..." required />
        </label>
        <label class="block">
          <span class="label">Para qué es (opcional)</span>
          <input v-model="nuevoEnlace.label" type="text" maxlength="120" class="input" placeholder="Plan Escuela" />
        </label>
        <button type="submit" class="btn-primary" :disabled="guardandoEnlace">
          {{ guardandoEnlace ? 'Guardando...' : 'Guardar enlace' }}
        </button>
      </form>
    </section>
  </main>
</template>
