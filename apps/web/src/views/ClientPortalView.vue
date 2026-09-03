<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AlertMessage from '@/components/AlertMessage.vue';
import PagarCuentaDialog from '@/components/clients/PagarCuentaDialog.vue';
import { clientsApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type { Charge, ClientPortal, TeamMember } from '@/types/api';

/**
 * Portal del cliente.
 *
 * Quien paga en los planes Escuela e Institucional no da clase: aqui lleva su
 * licencia, sus cuentas de cobro y las cuentas de su claustro. La administracion
 * de BookStudio puede abrir el portal de cualquier cliente pasando su id, para
 * atenderle por telefono viendo lo mismo que ve.
 */
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

/** Solo lo usa la administracion; un cliente siempre acaba en el suyo. */
const orgId = computed(() => (route.query.cliente as string) || undefined);

const portal = ref<ClientPortal | null>(null);
const equipo = ref<TeamMember[]>([]);
const cargando = ref(true);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);
const pagando = ref<Charge | null>(null);

type Pestana = 'resumen' | 'cobros' | 'equipo' | 'datos';
const PESTANAS: Array<{ id: Pestana; label: string; icono: string }> = [
  { id: 'resumen', label: 'Resumen', icono: '📊' },
  { id: 'cobros', label: 'Cuentas de cobro', icono: '🧾' },
  { id: 'equipo', label: 'Equipo docente', icono: '👥' },
  { id: 'datos', label: 'Datos de facturación', icono: '🏛️' },
];

// La pestaña viaja en la URL para que recargar no devuelva al principio.
const pestana = computed<Pestana>({
  get() {
    const pedida = String(route.query.t ?? '') as Pestana;
    return PESTANAS.some((p) => p.id === pedida) ? pedida : 'resumen';
  },
  set(valor) {
    void router.replace({ query: { ...route.query, t: valor } });
  },
});

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fecha = (valor: string | null) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    portal.value = await clientsApi.portal(orgId.value);
    equipo.value = await clientsApi.team(orgId.value);
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);
watch(orgId, cargar);

// --- Licencia ---

const licencia = computed(
  () => portal.value?.subscriptions.find((s) => s.status === 'activa') ?? portal.value?.subscriptions[0] ?? null,
);

const ESTADO_LICENCIA: Record<string, { texto: string; clase: string }> = {
  activa: { texto: 'Activa', clase: 'bg-emerald-100 text-emerald-700' },
  pendiente: { texto: 'Pago pendiente', clase: 'bg-amber-100 text-amber-700' },
  vencida: { texto: 'Vencida', clase: 'bg-red-100 text-red-700' },
  cancelada: { texto: 'Cancelada', clase: 'bg-slate-200 text-slate-600' },
};

const ESTADO_COBRO: Record<Charge['status'], { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-600' },
  emitida: { texto: 'Por pagar', clase: 'bg-amber-100 text-amber-800' },
  pagada: { texto: 'Pagada', clase: 'bg-emerald-100 text-emerald-700' },
  anulada: { texto: 'Anulada', clase: 'bg-slate-200 text-slate-500' },
};

const porPagar = computed(() => portal.value?.charges.filter((c) => c.status === 'emitida') ?? []);
const vencidas = computed(() => porPagar.value.filter((c) => (c.daysLeft ?? 1) < 0));

/** Cuánto del cupo se lleva usado, para la barra. */
function porcentaje(usado: number, tope: number | null): number {
  if (!tope) return 0;
  return Math.min(100, Math.round((usado / tope) * 100));
}

// --- Equipo ---

const nuevoDocente = ref({ fullName: '', email: '' });
const creando = ref(false);
/** Clave del docente recién creado; se muestra una sola vez. */
const claveEntregada = ref<{ fullName: string; email: string; password: string } | null>(null);

async function crearDocente(): Promise<void> {
  if (creando.value) return;
  creando.value = true;
  error.value = null;
  try {
    const creado = await clientsApi.createTeacher({ ...nuevoDocente.value }, orgId.value);
    claveEntregada.value = {
      fullName: creado.member.fullName,
      email: creado.member.email,
      password: creado.password,
    };
    nuevoDocente.value = { fullName: '', email: '' };
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    creando.value = false;
  }
}

async function cambiarEstado(miembro: TeamMember): Promise<void> {
  error.value = null;
  try {
    await clientsApi.updateTeacher(miembro.id, { isActive: !miembro.isActive }, orgId.value);
    aviso.value = miembro.isActive
      ? `${miembro.fullName} queda desactivado y libera un cupo.`
      : `${miembro.fullName} vuelve a estar activo.`;
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

const sacando = ref<TeamMember | null>(null);

async function sacarDelEquipo(): Promise<void> {
  if (!sacando.value) return;
  error.value = null;
  try {
    await clientsApi.removeTeacher(sacando.value.id, orgId.value);
    aviso.value = `${sacando.value.fullName} sale del equipo. Su cuenta y su contenido no se borran.`;
    sacando.value = null;
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

// --- Datos de facturación ---

const datos = ref({
  legalName: '',
  taxId: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  address: '',
  city: '',
});
const guardandoDatos = ref(false);

watch(
  portal,
  (valor) => {
    if (!valor) return;
    const o = valor.organization;
    datos.value = {
      legalName: o.legalName ?? '',
      taxId: o.taxId ?? '',
      contactName: o.contactName ?? '',
      contactEmail: o.contactEmail ?? '',
      contactPhone: o.contactPhone ?? '',
      address: o.address ?? '',
      city: o.city ?? '',
    };
  },
  { immediate: true },
);

async function guardarDatos(): Promise<void> {
  guardandoDatos.value = true;
  error.value = null;
  try {
    await clientsApi.updateBillingData({ ...datos.value }, orgId.value);
    aviso.value = 'Datos de facturación guardados.';
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardandoDatos.value = false;
  }
}

function alPagar(cobro: Charge): void {
  aviso.value = `La cuenta ${cobro.number} queda pagada.`;
  void cargar();
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-6">
    <p v-if="cargando" class="text-sm text-slate-500">Cargando el portal...</p>

    <template v-else-if="!portal">
      <AlertMessage :message="error ?? 'No hay ninguna cuenta de cliente asociada a este usuario.'" />
      <p class="mt-3 text-sm text-slate-600">
        Si contrataste un plan y esto no debería estar vacío, escríbenos y lo revisamos.
      </p>
    </template>

    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">Portal de cliente</p>
          <h1 class="mt-0.5 text-2xl font-black text-slate-900">{{ portal.organization.name }}</h1>
          <p v-if="portal.organization.legalName" class="text-sm text-slate-500">
            {{ portal.organization.legalName }}
            <span v-if="portal.organization.taxId"> · NIT {{ portal.organization.taxId }}</span>
          </p>
        </div>

        <div v-if="licencia" class="text-right">
          <span
            class="rounded px-2.5 py-1 text-xs font-bold"
            :class="ESTADO_LICENCIA[licencia.status]?.clase ?? 'bg-slate-100 text-slate-600'"
          >{{ ESTADO_LICENCIA[licencia.status]?.texto ?? licencia.status }}</span>
          <p class="mt-1 text-sm font-semibold text-slate-700">Plan {{ licencia.planName }}</p>
        </div>
      </header>

      <!-- Aviso de deuda: lo primero que hay que ver -->
      <div
        v-if="porPagar.length"
        class="mt-4 rounded-lg border p-4"
        :class="vencidas.length ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'"
      >
        <p class="font-bold" :class="vencidas.length ? 'text-red-800' : 'text-amber-800'">
          {{ porPagar.length }} cuenta(s) por pagar · {{ cop.format(portal.pendingCop) }}
          <span v-if="vencidas.length"> · {{ vencidas.length }} vencida(s)</span>
        </p>
        <button type="button" class="mt-2 text-sm font-semibold underline" @click="pestana = 'cobros'">
          Ver y pagar
        </button>
      </div>

      <nav class="sticky top-0 z-20 -mx-4 mt-5 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
        <ul class="flex gap-1 overflow-x-auto">
          <li v-for="opcion in PESTANAS" :key="opcion.id">
            <button
              type="button"
              class="whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition"
              :class="pestana === opcion.id
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'"
              @click="pestana = opcion.id"
            >
              <span aria-hidden="true">{{ opcion.icono }}</span> {{ opcion.label }}
            </button>
          </li>
        </ul>
      </nav>

      <div class="mt-4 space-y-2">
        <AlertMessage :message="error" />
        <AlertMessage :message="aviso" variant="success" />
      </div>

      <!-- ============ Resumen ============ -->
      <section v-if="pestana === 'resumen'" class="mt-5 space-y-5">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg border border-slate-200 p-4">
            <p class="text-xs uppercase tracking-wide text-slate-500">Por pagar</p>
            <p class="mt-1 text-2xl font-black tabular-nums" :class="portal.pendingCop ? 'text-amber-600' : 'text-slate-900'">
              {{ cop.format(portal.pendingCop) }}
            </p>
          </div>
          <div class="rounded-lg border border-slate-200 p-4">
            <p class="text-xs uppercase tracking-wide text-slate-500">Pagado en total</p>
            <p class="mt-1 text-2xl font-black tabular-nums text-slate-900">{{ cop.format(portal.paidCop) }}</p>
          </div>
          <div class="rounded-lg border border-slate-200 p-4">
            <p class="text-xs uppercase tracking-wide text-slate-500">Docentes</p>
            <p class="mt-1 text-2xl font-black tabular-nums text-slate-900">
              {{ portal.usage.teachers }}<span class="text-sm font-semibold text-slate-400">
                / {{ portal.usage.maxTeachers ?? '∞' }}</span>
            </p>
            <span v-if="portal.usage.maxTeachers" class="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200">
              <span
                class="block h-full rounded-full"
                :class="porcentaje(portal.usage.teachers, portal.usage.maxTeachers) >= 100 ? 'bg-amber-500' : 'bg-brand-500'"
                :style="{ width: `${porcentaje(portal.usage.teachers, portal.usage.maxTeachers)}%` }"
              />
            </span>
          </div>
          <div class="rounded-lg border border-slate-200 p-4">
            <p class="text-xs uppercase tracking-wide text-slate-500">Estudiantes</p>
            <p class="mt-1 text-2xl font-black tabular-nums text-slate-900">
              {{ portal.usage.students }}<span class="text-sm font-semibold text-slate-400">
                / {{ portal.usage.maxStudents ?? '∞' }}</span>
            </p>
            <span v-if="portal.usage.maxStudents" class="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200">
              <span
                class="block h-full rounded-full bg-brand-500"
                :style="{ width: `${porcentaje(portal.usage.students, portal.usage.maxStudents)}%` }"
              />
            </span>
          </div>
        </div>

        <!-- Licencias -->
        <div>
          <h2 class="label">Licencias</h2>
          <div v-if="!portal.subscriptions.length" class="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Todavía no hay ninguna licencia contratada.
          </div>
          <ul v-else class="divide-y divide-slate-100 rounded-lg border border-slate-200">
            <li v-for="s in portal.subscriptions" :key="s.id" class="flex flex-wrap items-center gap-3 p-4">
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-slate-800">Plan {{ s.planName }}</p>
                <p class="text-xs text-slate-500">
                  {{ fecha(s.startsAt) }} → {{ fecha(s.expiresAt) }}
                  <span v-if="s.daysLeft !== null && s.status === 'activa'">
                    · {{ s.daysLeft > 0 ? `quedan ${s.daysLeft} días` : 'vencida' }}
                  </span>
                </p>
              </div>
              <p class="tabular-nums font-semibold text-slate-700">{{ cop.format(s.amountCop) }}</p>
              <span
                class="rounded px-2 py-0.5 text-xs font-bold"
                :class="ESTADO_LICENCIA[s.status]?.clase ?? 'bg-slate-100 text-slate-600'"
              >{{ ESTADO_LICENCIA[s.status]?.texto ?? s.status }}</span>
              <span
                v-if="s.autoRenew"
                class="rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700"
              >Renovación automática</span>
            </li>
          </ul>
        </div>

        <!-- Historial de pagos -->
        <div>
          <h2 class="label">Histórico de pagos</h2>
          <p v-if="!portal.payments.length" class="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Aún no hay pagos registrados.
          </p>
          <div v-else class="overflow-x-auto rounded-lg border border-slate-200">
            <table class="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr class="bg-slate-50 text-left">
                  <th class="px-3 py-2 font-semibold text-slate-600">Comprobante</th>
                  <th class="px-3 py-2 font-semibold text-slate-600">Concepto</th>
                  <th class="px-3 py-2 font-semibold text-slate-600">Fecha</th>
                  <th class="px-3 py-2 font-semibold text-slate-600">Medio</th>
                  <th class="px-3 py-2 text-right font-semibold text-slate-600">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in portal.payments" :key="p.id" class="border-t border-slate-100">
                  <td class="px-3 py-2 tabular-nums font-medium text-slate-800">
                    {{ p.invoiceNumber }}
                    <span v-if="p.chargeNumber" class="text-xs font-normal text-slate-400">
                      (cuenta {{ p.chargeNumber }})
                    </span>
                  </td>
                  <td class="px-3 py-2 text-slate-600">{{ p.concept ?? 'Contratación de licencia' }}</td>
                  <td class="px-3 py-2 text-slate-600">{{ fecha(p.paidAt ?? p.createdAt) }}</td>
                  <td class="px-3 py-2 text-slate-600">{{ p.paymentMethod ?? '—' }}</td>
                  <td class="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                    {{ cop.format(p.amountCop) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ============ Cuentas de cobro ============ -->
      <section v-else-if="pestana === 'cobros'" class="mt-5">
        <p v-if="!portal.charges.length" class="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No hay cuentas de cobro.
        </p>

        <ul v-else class="space-y-3">
          <li
            v-for="c in portal.charges"
            :key="c.id"
            class="rounded-lg border p-4"
            :class="c.status === 'emitida' && (c.daysLeft ?? 1) < 0 ? 'border-red-300' : 'border-slate-200'"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold text-slate-900">
                  Cuenta {{ c.number }} · {{ c.concept }}
                </p>
                <p class="mt-0.5 text-xs text-slate-500">
                  Emitida el {{ fecha(c.issuedAt) }}
                  <span v-if="c.dueDate"> · vence el {{ c.dueDate }}</span>
                  <span
                    v-if="c.status === 'emitida' && c.daysLeft !== null && c.daysLeft !== undefined"
                    :class="c.daysLeft < 0 ? 'font-semibold text-red-600' : ''"
                  >
                    · {{ c.daysLeft < 0 ? `vencida hace ${-c.daysLeft} días` : `quedan ${c.daysLeft} días` }}
                  </span>
                </p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black tabular-nums text-slate-900">{{ cop.format(c.amountCop) }}</p>
                <span class="rounded px-2 py-0.5 text-xs font-bold" :class="ESTADO_COBRO[c.status].clase">
                  {{ ESTADO_COBRO[c.status].texto }}
                </span>
              </div>
            </div>

            <ul v-if="c.items.length" class="mt-3 space-y-1 border-t border-slate-100 pt-3">
              <li v-for="(linea, i) in c.items" :key="i" class="flex items-baseline gap-2 text-sm">
                <span class="min-w-0 flex-1 text-slate-600">
                  {{ linea.description }}
                  <span v-if="linea.quantity > 1" class="text-slate-400"> × {{ linea.quantity }}</span>
                </span>
                <span class="tabular-nums text-slate-700">{{ cop.format(linea.quantity * linea.unitCop) }}</span>
              </li>
            </ul>

            <p v-if="c.notes" class="mt-2 text-sm italic text-slate-500">{{ c.notes }}</p>

            <div v-if="c.status === 'emitida'" class="mt-3">
              <button type="button" class="btn-primary" @click="pagando = c">Pagar con Mercado Pago</button>
            </div>
            <p v-else-if="c.status === 'pagada'" class="mt-3 text-sm font-semibold text-emerald-700">
              Pagada el {{ fecha(c.paidAt) }}
            </p>
          </li>
        </ul>

        <p class="mt-4 text-xs leading-relaxed text-slate-400">
          BookStudio presta el servicio como comercio internacional y no está sujeto a la
          facturación electrónica de Colombia. Estas cuentas de cobro son el documento con el que
          se gestiona el pago.
        </p>
      </section>

      <!-- ============ Equipo ============ -->
      <section v-else-if="pestana === 'equipo'" class="mt-5 space-y-4">
        <div
          v-if="portal.usage.maxTeachers !== null"
          class="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"
        >
          El plan {{ licencia?.planName }} incluye <strong>{{ portal.usage.maxTeachers }} docentes</strong>
          y hay {{ portal.usage.teachers }} activos.
          <span v-if="portal.usage.teachers >= portal.usage.maxTeachers" class="font-semibold text-amber-700">
            No quedan cupos: desactiva una cuenta que no se use o pide una ampliación.
          </span>
        </div>

        <form class="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-4" @submit.prevent="crearDocente">
          <div class="min-w-[12rem] flex-1">
            <label class="label" for="nuevo-nombre">Nombre del docente</label>
            <input id="nuevo-nombre" v-model.trim="nuevoDocente.fullName" type="text" class="input" maxlength="100" />
          </div>
          <div class="min-w-[14rem] flex-1">
            <label class="label" for="nuevo-correo">Correo</label>
            <input id="nuevo-correo" v-model.trim="nuevoDocente.email" type="email" class="input" maxlength="255" />
          </div>
          <button
            type="submit"
            class="btn-primary"
            :disabled="creando || nuevoDocente.fullName.length < 2 || !nuevoDocente.email.includes('@')"
          >{{ creando ? 'Creando...' : 'Crear cuenta' }}</button>
        </form>

        <!-- La clave se muestra una sola vez -->
        <div v-if="claveEntregada" class="rounded-lg border-2 border-brand-300 bg-brand-50 p-4">
          <p class="font-bold text-brand-900">Cuenta creada para {{ claveEntregada.fullName }}</p>
          <p class="mt-2 text-sm text-brand-800">
            Entrégale estos datos. La contraseña <strong>no se puede volver a consultar</strong>;
            si se pierde, habrá que asignar otra.
          </p>
          <dl class="mt-3 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
            <dt class="font-semibold text-brand-900">Correo</dt>
            <dd class="font-mono text-brand-900">{{ claveEntregada.email }}</dd>
            <dt class="font-semibold text-brand-900">Contraseña</dt>
            <dd class="font-mono text-lg font-bold text-brand-900">{{ claveEntregada.password }}</dd>
          </dl>
          <button type="button" class="btn-secondary mt-3" @click="claveEntregada = null">Ya la anoté</button>
        </div>

        <ul v-if="equipo.length" class="divide-y divide-slate-100 rounded-lg border border-slate-200">
          <li v-for="m in equipo" :key="m.id" class="flex flex-wrap items-center gap-3 p-4">
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-slate-800">
                {{ m.fullName }}
                <span
                  v-if="m.id === portal.organization.ownerId"
                  class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600"
                >Titular</span>
                <span
                  v-if="m.role === 'admin'"
                  class="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700"
                  title="Las cuentas de administración no ocupan cupo del plan"
                >No ocupa cupo</span>
              </p>
              <p class="truncate text-xs text-slate-500">
                {{ m.email }} · {{ m.libraries }} biblioteca(s)
                <span v-if="m.passwordIsDefault" class="text-amber-700"> · aún no cambió su clave</span>
              </p>
            </div>

            <span
              class="rounded px-2 py-0.5 text-xs font-bold"
              :class="m.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'"
            >{{ m.isActive ? 'Activo' : 'Desactivado' }}</span>

            <button type="button" class="btn-secondary text-sm" @click="cambiarEstado(m)">
              {{ m.isActive ? 'Desactivar' : 'Activar' }}
            </button>
            <button
              v-if="m.id !== portal.organization.ownerId"
              type="button"
              class="text-sm font-semibold text-red-600 hover:underline"
              @click="sacando = m"
            >Sacar del equipo</button>
          </li>
        </ul>
      </section>

      <!-- ============ Datos de facturación ============ -->
      <section v-else class="mt-5 max-w-2xl">
        <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="guardarDatos">
          <div class="sm:col-span-2">
            <label class="label" for="razon">Razón social</label>
            <input id="razon" v-model.trim="datos.legalName" type="text" class="input" maxlength="200" />
          </div>
          <div>
            <label class="label" for="nit">NIT</label>
            <input id="nit" v-model.trim="datos.taxId" type="text" class="input" maxlength="40" />
          </div>
          <div>
            <label class="label" for="ciudad">Ciudad</label>
            <input id="ciudad" v-model.trim="datos.city" type="text" class="input" maxlength="120" />
          </div>
          <div class="sm:col-span-2">
            <label class="label" for="direccion">Dirección</label>
            <input id="direccion" v-model.trim="datos.address" type="text" class="input" maxlength="240" />
          </div>
          <div>
            <label class="label" for="contacto">Persona de contacto</label>
            <input id="contacto" v-model.trim="datos.contactName" type="text" class="input" maxlength="120" />
          </div>
          <div>
            <label class="label" for="telefono">Teléfono</label>
            <input id="telefono" v-model.trim="datos.contactPhone" type="text" class="input" maxlength="40" />
          </div>
          <div class="sm:col-span-2">
            <label class="label" for="correo-fact">Correo para facturación</label>
            <input id="correo-fact" v-model.trim="datos.contactEmail" type="email" class="input" maxlength="255" />
          </div>
          <div class="sm:col-span-2">
            <button type="submit" class="btn-primary" :disabled="guardandoDatos">
              {{ guardandoDatos ? 'Guardando...' : 'Guardar datos' }}
            </button>
          </div>
        </form>
      </section>
    </template>

    <PagarCuentaDialog
      v-if="pagando"
      :charge="pagando"
      @close="pagando = null"
      @pagada="alPagar"
    />

    <!-- Confirmación de salida del equipo -->
    <div
      v-if="sacando"
      class="fixed inset-0 z-[9000] grid place-items-center bg-slate-900/60 p-4"
      @click.self="sacando = null"
    >
      <div class="card w-full max-w-md p-5">
        <h2 class="font-bold text-slate-900">¿Sacar a {{ sacando.fullName }} del equipo?</h2>
        <p class="mt-2 text-sm text-slate-600">
          Su cuenta se desactiva y libera un cupo del plan. <strong>No se borra</strong> ni se pierde
          nada de lo que hicieron sus clases: los libros del alumnado siguen ahí.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="sacando = null">Cancelar</button>
          <button type="button" class="btn-danger" @click="sacarDelEquipo">Sacar del equipo</button>
        </div>
      </div>
    </div>
  </div>
</template>
