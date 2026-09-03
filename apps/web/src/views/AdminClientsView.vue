<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { clientsApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import type { AdminOrganization, Charge, ChargeItem } from '@/types/api';

/**
 * Administracion de clientes.
 *
 * Desde aqui se dan de alta los clientes, se les pone titular y se les emiten
 * cuentas de cobro que ellos pagan desde su portal. Es la cara de BookStudio, no
 * la del cliente: solo la ve administracion.
 */
const clientes = ref<AdminOrganization[]>([]);
const cargando = ref(true);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

/** Cliente abierto en el panel lateral. */
const abierto = ref<AdminOrganization | null>(null);
const cobros = ref<Charge[]>([]);
const busqueda = ref('');

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fecha = (valor: string | null) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const ESTADO_COBRO: Record<Charge['status'], { texto: string; clase: string }> = {
  borrador: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-600' },
  emitida: { texto: 'Por pagar', clase: 'bg-amber-100 text-amber-800' },
  pagada: { texto: 'Pagada', clase: 'bg-emerald-100 text-emerald-700' },
  anulada: { texto: 'Anulada', clase: 'bg-slate-200 text-slate-500' },
};

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    clientes.value = await clientsApi.organizations();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

const visibles = computed(() => {
  const q = busqueda.value.trim().toLowerCase();
  if (!q) return clientes.value;
  return clientes.value.filter((c) =>
    [c.name, c.legalName, c.taxId, c.ownerEmail].some((campo) => (campo ?? '').toLowerCase().includes(q)),
  );
});

const totalPendiente = computed(() => clientes.value.reduce((s, c) => s + c.pendingCop, 0));

async function abrir(cliente: AdminOrganization): Promise<void> {
  abierto.value = cliente;
  cobros.value = [];
  try {
    cobros.value = await clientsApi.chargesOf(cliente.id);
  } catch (err) {
    error.value = errorMessage(err);
  }
}

// --- Alta de cliente ---

const creandoCliente = ref(false);
const nuevoCliente = ref({ name: '', legalName: '', taxId: '', contactEmail: '', city: '' });
const guardandoCliente = ref(false);

async function crearCliente(): Promise<void> {
  guardandoCliente.value = true;
  error.value = null;
  try {
    const creado = await clientsApi.createOrganization({ ...nuevoCliente.value });
    aviso.value = `Cliente "${creado.name}" creado. Asígnale un titular para que vea su portal.`;
    nuevoCliente.value = { name: '', legalName: '', taxId: '', contactEmail: '', city: '' };
    creandoCliente.value = false;
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardandoCliente.value = false;
  }
}

// --- Titular ---

const correoTitular = ref('');

async function asignarTitular(): Promise<void> {
  if (!abierto.value) return;
  error.value = null;
  try {
    await clientsApi.linkOwner(abierto.value.id, correoTitular.value.trim());
    aviso.value = 'Titular asignado. Ya puede entrar a su portal.';
    correoTitular.value = '';
    await cargar();
    const refrescado = clientes.value.find((c) => c.id === abierto.value?.id);
    if (refrescado) abierto.value = refrescado;
  } catch (err) {
    error.value = errorMessage(err);
  }
}

// --- Licencia otorgada ---

/**
 * Licencia acordada fuera de la plataforma. Los cupos vacios son ilimitados, y
 * con "cobrarla" se emite ademas su cuenta de cobro por el mismo importe, que es
 * el caso normal: se acuerda la licencia y se cobra.
 */
const licencia = ref({
  plan: 'institucional' as 'individual' | 'escuela' | 'institucional',
  months: 12,
  amountCop: 0,
  maxTeachers: '' as number | '',
  maxStudents: '' as number | '',
  issueCharge: true,
  dueDays: 30,
});
const otorgando = ref(false);

async function otorgarLicencia(): Promise<void> {
  if (!abierto.value || otorgando.value) return;
  otorgando.value = true;
  error.value = null;
  try {
    const resultado = await clientsApi.grantPlan(abierto.value.id, {
      plan: licencia.value.plan,
      months: licencia.value.months,
      amountCop: licencia.value.amountCop,
      // Vacio = sin limite, que es como se guarda en la licencia.
      maxTeachers: licencia.value.maxTeachers === '' ? null : Number(licencia.value.maxTeachers),
      maxStudents: licencia.value.maxStudents === '' ? null : Number(licencia.value.maxStudents),
      issueCharge: licencia.value.issueCharge,
      dueDays: licencia.value.dueDays,
    });
    aviso.value = resultado.charge
      ? `Licencia otorgada y cuenta de cobro ${resultado.charge.number} emitida por ${cop.format(resultado.charge.amountCop)}.`
      : 'Licencia otorgada.';
    await abrir(abierto.value);
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    otorgando.value = false;
  }
}

// --- Emitir una cuenta de cobro ---

const nuevaCuenta = ref<{ concept: string; dueDate: string; notes: string; items: ChargeItem[] }>({
  concept: '',
  dueDate: '',
  notes: '',
  items: [{ description: '', quantity: 1, unitCop: 0 }],
});
const emitiendo = ref(false);

const totalNuevaCuenta = computed(() =>
  nuevaCuenta.value.items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCop) || 0), 0),
);

const cuentaValida = computed(
  () =>
    nuevaCuenta.value.concept.trim().length >= 3 &&
    nuevaCuenta.value.items.length > 0 &&
    nuevaCuenta.value.items.every((l) => l.description.trim().length >= 2 && Number(l.unitCop) > 0),
);

function anadirLinea(): void {
  if (nuevaCuenta.value.items.length >= 30) return;
  nuevaCuenta.value.items.push({ description: '', quantity: 1, unitCop: 0 });
}

function quitarLinea(indice: number): void {
  if (nuevaCuenta.value.items.length <= 1) return;
  nuevaCuenta.value.items.splice(indice, 1);
}

async function emitir(ahora: boolean): Promise<void> {
  if (!abierto.value || !cuentaValida.value) return;
  emitiendo.value = true;
  error.value = null;
  try {
    const creada = await clientsApi.createCharge(abierto.value.id, {
      concept: nuevaCuenta.value.concept.trim(),
      items: nuevaCuenta.value.items.map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        unitCop: Number(l.unitCop),
      })),
      dueDate: nuevaCuenta.value.dueDate || null,
      notes: nuevaCuenta.value.notes,
      issue: ahora,
    });
    aviso.value = ahora
      ? `Cuenta ${creada.number} emitida. El cliente ya la ve en su portal.`
      : `Cuenta ${creada.number} guardada como borrador. El cliente todavía no la ve.`;
    nuevaCuenta.value = { concept: '', dueDate: '', notes: '', items: [{ description: '', quantity: 1, unitCop: 0 }] };
    await abrir(abierto.value);
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    emitiendo.value = false;
  }
}

async function cambiarEstadoCuenta(cobro: Charge, status: 'emitida' | 'anulada'): Promise<void> {
  error.value = null;
  try {
    await clientsApi.updateCharge(cobro.id, { status });
    aviso.value = status === 'emitida' ? `Cuenta ${cobro.number} emitida.` : `Cuenta ${cobro.number} anulada.`;
    if (abierto.value) await abrir(abierto.value);
    await cargar();
  } catch (err) {
    error.value = errorMessage(err);
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black text-slate-900">Clientes</h1>
        <p class="mt-1 text-sm text-slate-600">
          {{ clientes.length }} cliente(s) ·
          <span :class="totalPendiente ? 'font-semibold text-amber-700' : ''">
            {{ cop.format(totalPendiente) }} por cobrar
          </span>
        </p>
      </div>
      <button type="button" class="btn-primary" @click="creandoCliente = !creandoCliente">
        {{ creandoCliente ? 'Cancelar' : 'Nuevo cliente' }}
      </button>
    </header>

    <div class="mt-4 space-y-2">
      <AlertMessage :message="error" />
      <AlertMessage :message="aviso" variant="success" />
    </div>

    <!-- Alta -->
    <form
      v-if="creandoCliente"
      class="mt-4 grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2"
      @submit.prevent="crearCliente"
    >
      <div class="sm:col-span-2">
        <label class="label" for="c-nombre">Nombre del cliente</label>
        <input id="c-nombre" v-model.trim="nuevoCliente.name" type="text" class="input" maxlength="160" required />
      </div>
      <div>
        <label class="label" for="c-razon">Razón social</label>
        <input id="c-razon" v-model.trim="nuevoCliente.legalName" type="text" class="input" maxlength="200" />
      </div>
      <div>
        <label class="label" for="c-nit">NIT</label>
        <input id="c-nit" v-model.trim="nuevoCliente.taxId" type="text" class="input" maxlength="40" />
      </div>
      <div>
        <label class="label" for="c-correo">Correo de contacto</label>
        <input id="c-correo" v-model.trim="nuevoCliente.contactEmail" type="email" class="input" maxlength="255" />
      </div>
      <div>
        <label class="label" for="c-ciudad">Ciudad</label>
        <input id="c-ciudad" v-model.trim="nuevoCliente.city" type="text" class="input" maxlength="120" />
      </div>
      <div class="sm:col-span-2">
        <button type="submit" class="btn-primary" :disabled="guardandoCliente || nuevoCliente.name.length < 2">
          {{ guardandoCliente ? 'Creando...' : 'Crear cliente' }}
        </button>
      </div>
    </form>

    <input
      v-model="busqueda"
      type="search"
      class="input mt-4 max-w-md"
      placeholder="Buscar por nombre, NIT o correo del titular"
    />

    <p v-if="cargando" class="mt-4 text-sm text-slate-500">Cargando clientes...</p>

    <p
      v-else-if="!visibles.length"
      class="mt-4 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500"
    >
      {{ clientes.length ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes.' }}
    </p>

    <div v-else class="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table class="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr class="bg-slate-50 text-left">
            <th class="px-3 py-2 font-semibold text-slate-600">Cliente</th>
            <th class="px-3 py-2 font-semibold text-slate-600">Titular</th>
            <th class="px-3 py-2 font-semibold text-slate-600">Plan</th>
            <th class="px-3 py-2 text-right font-semibold text-slate-600">Docentes</th>
            <th class="px-3 py-2 text-right font-semibold text-slate-600">Alumnos</th>
            <th class="px-3 py-2 text-right font-semibold text-slate-600">Por cobrar</th>
            <th class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in visibles" :key="c.id" class="border-t border-slate-100">
            <td class="px-3 py-2">
              <p class="font-medium text-slate-800">{{ c.name }}</p>
              <p class="text-[11px] text-slate-500">{{ c.taxId ? `NIT ${c.taxId}` : 'sin NIT' }}</p>
            </td>
            <td class="px-3 py-2 text-slate-600">
              <span v-if="c.ownerEmail">{{ c.ownerEmail }}</span>
              <span v-else class="font-semibold text-amber-700">sin titular</span>
            </td>
            <td class="px-3 py-2 text-slate-600">
              <span v-if="c.plan">{{ c.plan }}</span>
              <span v-else class="text-slate-400">—</span>
              <span v-if="c.expiresAt" class="block text-[11px] text-slate-400">
                hasta {{ fecha(c.expiresAt) }}
              </span>
            </td>
            <td class="px-3 py-2 text-right tabular-nums text-slate-700">{{ c.teachers }}</td>
            <td class="px-3 py-2 text-right tabular-nums text-slate-700">{{ c.students }}</td>
            <td
              class="px-3 py-2 text-right tabular-nums font-semibold"
              :class="c.pendingCop ? 'text-amber-700' : 'text-slate-400'"
            >
              {{ c.pendingCop ? cop.format(c.pendingCop) : '—' }}
            </td>
            <td class="px-3 py-2 text-right">
              <button type="button" class="btn-secondary text-sm" @click="abrir(c)">Abrir</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Panel del cliente -->
    <div
      v-if="abierto"
      class="fixed inset-0 z-[9000] flex justify-end bg-slate-900/50"
      @click.self="abierto = null"
    >
      <div class="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl">
        <header class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div class="min-w-0">
            <h2 class="truncate text-lg font-bold text-slate-900">{{ abierto.name }}</h2>
            <p class="truncate text-xs text-slate-500">
              {{ abierto.legalName ?? 'sin razón social' }}
              <span v-if="abierto.taxId"> · NIT {{ abierto.taxId }}</span>
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <RouterLink
              :to="{ name: 'client-portal', query: { cliente: abierto.id } }"
              class="btn-secondary text-sm"
            >Ver su portal</RouterLink>
            <button type="button" class="btn-secondary" @click="abierto = null">Cerrar</button>
          </div>
        </header>

        <div class="flex-1 space-y-5 overflow-y-auto p-5">
          <!-- Titular -->
          <section>
            <h3 class="label">Titular de la cuenta</h3>
            <p v-if="abierto.ownerEmail" class="text-sm text-slate-700">
              {{ abierto.ownerName }} · {{ abierto.ownerEmail }}
            </p>
            <p v-else class="text-sm text-amber-700">
              Sin titular: nadie puede ver este portal todavía.
            </p>
            <form class="mt-2 flex flex-wrap items-end gap-2" @submit.prevent="asignarTitular">
              <div class="min-w-[14rem] flex-1">
                <label class="label" for="titular">Correo de una cuenta existente</label>
                <input id="titular" v-model.trim="correoTitular" type="email" class="input" maxlength="255" />
              </div>
              <button type="submit" class="btn-secondary" :disabled="!correoTitular.includes('@')">
                {{ abierto.ownerEmail ? 'Cambiar titular' : 'Asignar titular' }}
              </button>
            </form>
          </section>

          <!-- Licencia -->
          <section class="rounded-lg border border-slate-200 p-4">
            <h3 class="label">Otorgar licencia</h3>
            <p class="mb-3 text-xs text-slate-500">
              Para acuerdos cerrados fuera de la plataforma. Sustituye a la licencia vigente del
              cliente; deja los cupos vacíos para que sean ilimitados.
            </p>

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="label" for="lic-plan">Plan</label>
                <select id="lic-plan" v-model="licencia.plan" class="input">
                  <option value="individual">Individual</option>
                  <option value="escuela">Escuela</option>
                  <option value="institucional">Institucional y empresas</option>
                </select>
              </div>
              <div>
                <label class="label" for="lic-meses">Meses de vigencia</label>
                <input id="lic-meses" v-model.number="licencia.months" type="number" class="input" min="1" max="120" />
              </div>
              <div>
                <label class="label" for="lic-doc">Cupo de docentes</label>
                <input
                  id="lic-doc"
                  v-model="licencia.maxTeachers"
                  type="number"
                  class="input"
                  min="1"
                  placeholder="Vacío = ilimitado"
                />
              </div>
              <div>
                <label class="label" for="lic-alu">Cupo de estudiantes</label>
                <input
                  id="lic-alu"
                  v-model="licencia.maxStudents"
                  type="number"
                  class="input"
                  min="1"
                  placeholder="Vacío = ilimitado"
                />
              </div>
              <div>
                <label class="label" for="lic-importe">Importe acordado (COP)</label>
                <input
                  id="lic-importe"
                  v-model.number="licencia.amountCop"
                  type="number"
                  class="input"
                  min="0"
                  step="100000"
                />
              </div>
              <div>
                <label class="label" for="lic-dias">Días para pagar</label>
                <input id="lic-dias" v-model.number="licencia.dueDays" type="number" class="input" min="1" max="365" />
              </div>
            </div>

            <label class="mt-3 flex items-start gap-2 text-sm text-slate-700">
              <input v-model="licencia.issueCharge" type="checkbox" class="mt-0.5 h-4 w-4 rounded" />
              <span>
                Emitir también su cuenta de cobro
                <span class="block text-xs text-slate-500">
                  Con importe cero no se emite nada: una cuenta de cobro de cero pesos no significa
                  nada.
                </span>
              </span>
            </label>

            <button type="button" class="btn-primary mt-3" :disabled="otorgando" @click="otorgarLicencia">
              {{ otorgando ? 'Otorgando...' : 'Otorgar licencia' }}
            </button>
          </section>

          <!-- Nueva cuenta de cobro -->
          <section class="rounded-lg border border-slate-200 p-4">
            <h3 class="label">Emitir una cuenta de cobro</h3>

            <div>
              <label class="label" for="concepto">Concepto</label>
              <input
                id="concepto"
                v-model.trim="nuevaCuenta.concept"
                type="text"
                class="input"
                maxlength="200"
                placeholder="Ej: Renovación anual del plan Escuela"
              />
            </div>

            <div class="mt-3 space-y-2">
              <label class="label mb-0">Líneas</label>
              <div v-for="(linea, i) in nuevaCuenta.items" :key="i" class="flex flex-wrap items-end gap-2">
                <div class="min-w-[10rem] flex-1">
                  <input
                    v-model.trim="linea.description"
                    type="text"
                    class="input py-1 text-sm"
                    maxlength="200"
                    placeholder="Concepto de la línea"
                  />
                </div>
                <div class="w-20">
                  <input
                    v-model.number="linea.quantity"
                    type="number"
                    class="input py-1 text-sm"
                    min="1"
                    max="9999"
                    aria-label="Cantidad"
                  />
                </div>
                <div class="w-36">
                  <input
                    v-model.number="linea.unitCop"
                    type="number"
                    class="input py-1 text-sm"
                    min="1"
                    step="1000"
                    aria-label="Valor unitario en pesos"
                    placeholder="Valor unitario"
                  />
                </div>
                <button
                  type="button"
                  class="px-1.5 text-red-500 hover:text-red-700 disabled:opacity-30"
                  :disabled="nuevaCuenta.items.length <= 1"
                  aria-label="Quitar línea"
                  @click="quitarLinea(i)"
                >×</button>
              </div>
              <button type="button" class="text-xs font-semibold text-brand-600 hover:underline" @click="anadirLinea">
                + Añadir línea
              </button>
            </div>

            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label class="label" for="vence">Vence el (opcional)</label>
                <input id="vence" v-model="nuevaCuenta.dueDate" type="date" class="input" />
              </div>
              <div>
                <label class="label" for="notas">Nota para el cliente</label>
                <input id="notas" v-model.trim="nuevaCuenta.notes" type="text" class="input" maxlength="2000" />
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
              <p class="text-sm text-slate-600">
                Total <strong class="tabular-nums text-slate-900">{{ cop.format(totalNuevaCuenta) }}</strong>
              </p>
              <div class="ml-auto flex gap-2">
                <button
                  type="button"
                  class="btn-secondary"
                  :disabled="!cuentaValida || emitiendo"
                  @click="emitir(false)"
                >Guardar borrador</button>
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="!cuentaValida || emitiendo"
                  @click="emitir(true)"
                >{{ emitiendo ? 'Emitiendo...' : 'Emitir al cliente' }}</button>
              </div>
            </div>
          </section>

          <!-- Cuentas existentes -->
          <section>
            <h3 class="label">Cuentas de cobro</h3>
            <p v-if="!cobros.length" class="text-sm text-slate-500">Todavía no se le ha emitido ninguna.</p>
            <ul v-else class="divide-y divide-slate-100 rounded-lg border border-slate-200">
              <li v-for="c in cobros" :key="c.id" class="p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-800">{{ c.number }} · {{ c.concept }}</p>
                    <p class="text-[11px] text-slate-500">
                      {{ c.status === 'borrador' ? 'creada' : 'emitida' }} el
                      {{ fecha(c.issuedAt ?? c.createdAt) }}
                      <span v-if="c.dueDate"> · vence {{ c.dueDate }}</span>
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="tabular-nums font-bold text-slate-900">{{ cop.format(c.amountCop) }}</p>
                    <span class="rounded px-1.5 py-0.5 text-[11px] font-bold" :class="ESTADO_COBRO[c.status].clase">
                      {{ ESTADO_COBRO[c.status].texto }}
                    </span>
                  </div>
                </div>
                <div v-if="c.status !== 'pagada'" class="mt-2 flex gap-3">
                  <button
                    v-if="c.status === 'borrador'"
                    type="button"
                    class="text-xs font-semibold text-brand-600 hover:underline"
                    @click="cambiarEstadoCuenta(c, 'emitida')"
                  >Emitir</button>
                  <button
                    v-if="c.status !== 'anulada'"
                    type="button"
                    class="text-xs font-semibold text-red-600 hover:underline"
                    @click="cambiarEstadoCuenta(c, 'anulada')"
                  >Anular</button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
