<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AlertMessage from '@/components/AlertMessage.vue';
import { phidiasApi, usersApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import { useAuthStore } from '@/stores/auth';
import type { ManagedUser, PhidiasSection, UserStats } from '@/types/api';

/** Panel de administracion: cuentas, roles, contrasenas e importacion de grupos. */
const auth = useAuthStore();

const users = ref<ManagedUser[]>([]);
const stats = ref<UserStats | null>(null);
const total = ref(0);
const totalPages = ref(1);
const page = ref(1);
const search = ref('');
const roleFilter = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref(false);

const ROLES = [
  { id: 'student', label: 'Alumno' },
  { id: 'teacher', label: 'Docente' },
  { id: 'admin', label: 'Administrador' },
];

const roleLabel = (role: string) => ROLES.find((r) => r.id === role)?.label ?? role;

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const result = await usersApi.list({
      search: search.value.trim() || undefined,
      role: roleFilter.value || undefined,
      page: page.value,
      pageSize: 25,
    });
    users.value = result.items;
    total.value = result.total;
    totalPages.value = result.totalPages;
    stats.value = await usersApi.stats();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void load();
  }, 350);
});
watch([roleFilter, page], () => void load());

// --- Alta manual ---
const form = ref({ email: '', fullName: '', password: '', role: 'student' });

async function createUser(): Promise<void> {
  busy.value = true;
  error.value = null;
  notice.value = null;
  try {
    const created = await usersApi.create({ ...form.value });
    notice.value = `Cuenta creada para ${created.fullName}`;
    form.value = { email: '', fullName: '', password: '', role: 'student' };
    await load();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}

async function changeRole(user: ManagedUser, role: string): Promise<void> {
  try {
    await usersApi.update(user.id, { role });
    await load();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

async function toggleActive(user: ManagedUser): Promise<void> {
  try {
    await usersApi.update(user.id, { isActive: !user.isActive });
    notice.value = `${user.fullName} ${user.isActive ? 'desactivado' : 'reactivado'}`;
    await load();
  } catch (err) {
    error.value = errorMessage(err);
  }
}

async function resetPassword(user: ManagedUser): Promise<void> {
  const password = window.prompt(`Nueva contrasena para ${user.fullName} (minimo 8 caracteres):`);
  if (!password) return;
  try {
    await usersApi.resetPassword(user.id, password);
    notice.value = `Contrasena actualizada para ${user.fullName}`;
  } catch (err) {
    error.value = errorMessage(err);
  }
}

// --- Importacion desde Phidias ---
const phidiasEnabled = ref(false);
const sections = ref<PhidiasSection[]>([]);
const sectionsLoaded = ref(false);
const loadingSections = ref(false);
const sectionSearch = ref('');
const importing = ref<number | null>(null);

const filteredSections = computed(() => {
  const term = sectionSearch.value.trim().toLowerCase();
  if (!term) return sections.value;
  return sections.value.filter(
    (s) =>
      s.name.toLowerCase().includes(term) ||
      s.course.toLowerCase().includes(term) ||
      s.level.toLowerCase().includes(term),
  );
});

async function loadSections(): Promise<void> {
  loadingSections.value = true;
  error.value = null;
  try {
    sections.value = await phidiasApi.sections();
    sectionsLoaded.value = true;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    loadingSections.value = false;
  }
}

async function importSection(section: PhidiasSection): Promise<void> {
  if (!window.confirm(`Importar ${section.name} con ${section.studentCount} alumnos?`)) return;
  importing.value = section.id;
  error.value = null;
  notice.value = null;
  try {
    const result = await phidiasApi.importSection(section.id);
    notice.value =
      `"${result.libraryName}" lista (codigo ${result.codeInvite}). ` +
      `${result.created} cuentas nuevas, ${result.reused} ya existian, ${result.enrolled} inscripciones` +
      (result.skipped ? `, ${result.skipped} sin correo se omitieron.` : '.');
    await load();
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    importing.value = null;
  }
}

onMounted(async () => {
  await load();
  try {
    phidiasEnabled.value = await phidiasApi.status();
  } catch {
    // Sin integracion configurada la seccion sencillamente no aparece.
    phidiasEnabled.value = false;
  }
});
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <RouterLink :to="{ name: 'dashboard' }" class="text-sm text-brand-600 hover:underline">&larr; Mis libros</RouterLink>

    <h1 class="mt-3 text-2xl font-black text-slate-900">Gestión de usuarios</h1>
    <p class="mt-1 text-sm text-slate-500">Cuentas, roles y contraseñas de todo el centro.</p>

    <div class="mt-4 space-y-2">
      <AlertMessage :message="error" />
      <AlertMessage :message="notice" variant="success" />
    </div>

    <!-- Resumen -->
    <ul v-if="stats" class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <li v-for="item in [
        { label: 'Total', value: stats.total },
        { label: 'Docentes', value: stats.teachers },
        { label: 'Alumnos', value: stats.students },
        { label: 'Admins', value: stats.admins },
        { label: 'Inactivos', value: stats.inactive },
        { label: 'De Phidias', value: stats.fromPhidias },
      ]" :key="item.label" class="card p-3 text-center">
        <p class="text-xl font-black text-slate-800">{{ item.value }}</p>
        <p class="text-xs text-slate-500">{{ item.label }}</p>
      </li>
    </ul>

    <!-- Alta manual -->
    <form class="card mt-6 grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5" @submit.prevent="createUser">
      <div class="lg:col-span-2">
        <label class="label" for="new-email">Correo</label>
        <input id="new-email" v-model.trim="form.email" type="email" required class="input" placeholder="alumno@colegio.edu" />
      </div>
      <div class="lg:col-span-2">
        <label class="label" for="new-name">Nombre completo</label>
        <input id="new-name" v-model.trim="form.fullName" type="text" required minlength="2" class="input" />
      </div>
      <div>
        <label class="label" for="new-role">Rol</label>
        <select id="new-role" v-model="form.role" class="input">
          <option v-for="role in ROLES" :key="role.id" :value="role.id">{{ role.label }}</option>
        </select>
      </div>
      <div class="lg:col-span-2">
        <label class="label" for="new-password">Contraseña inicial</label>
        <input id="new-password" v-model="form.password" type="text" required minlength="8" class="input" placeholder="mínimo 8 caracteres" />
      </div>
      <div class="flex items-end lg:col-span-3">
        <button type="submit" class="btn-primary" :disabled="busy">Crear cuenta</button>
      </div>
    </form>

    <!-- Importación desde Phidias -->
    <section v-if="phidiasEnabled" class="card mt-6 p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-bold text-slate-800">Importar grupos desde Phidias</h2>
          <p class="text-xs text-slate-500">
            Crea la biblioteca de la sección y da de alta a sus alumnos con su correo institucional.
          </p>
        </div>
        <button type="button" class="btn-secondary" :disabled="loadingSections" @click="loadSections">
          {{ loadingSections ? 'Consultando...' : sectionsLoaded ? 'Actualizar lista' : 'Ver grupos' }}
        </button>
      </div>

      <template v-if="sectionsLoaded">
        <input
          v-model.trim="sectionSearch"
          type="search"
          class="input mt-3 max-w-xs"
          placeholder="Filtrar (K9A, KINDER...)"
        />

        <ul class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="section in filteredSections"
            :key="section.id"
            class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-bold text-slate-800">{{ section.name }}</p>
              <p class="truncate text-xs text-slate-500">{{ section.level }} · {{ section.course }}</p>
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
              :disabled="importing !== null"
              @click="importSection(section)"
            >{{ importing === section.id ? 'Importando...' : 'Importar' }}</button>
          </li>
        </ul>

        <p v-if="!filteredSections.length" class="mt-3 text-sm text-slate-500">
          Ninguna sección coincide con "{{ sectionSearch }}".
        </p>
      </template>
    </section>

    <!-- Listado -->
    <section class="mt-8">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-bold text-slate-800">Cuentas ({{ total }})</h2>
        <div class="flex gap-2">
          <input v-model.trim="search" type="search" class="input max-w-xs" placeholder="Buscar por nombre o correo..." />
          <select v-model="roleFilter" class="input max-w-[10rem]">
            <option value="">Todos los roles</option>
            <option v-for="role in ROLES" :key="role.id" :value="role.id">{{ role.label }}</option>
          </select>
        </div>
      </div>

      <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>

      <div v-else class="card overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <tr>
              <th class="px-3 py-2">Persona</th>
              <th class="px-3 py-2">Rol</th>
              <th class="px-3 py-2">Origen</th>
              <th class="px-3 py-2 text-center">Libros</th>
              <th class="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="user in users" :key="user.id" :class="!user.isActive && 'bg-slate-50 text-slate-400'">
              <td class="px-3 py-2">
                <p class="font-semibold text-slate-800" :class="!user.isActive && 'text-slate-400'">
                  {{ user.fullName }}
                  <span v-if="user.id === auth.user?.id" class="text-xs font-normal text-brand-600">(tu)</span>
                </p>
                <p class="truncate text-xs text-slate-500">{{ user.email }}</p>
              </td>
              <td class="px-3 py-2">
                <select
                  class="input py-1 text-xs"
                  :value="user.role"
                  :disabled="user.id === auth.user?.id"
                  @change="changeRole(user, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="role in ROLES" :key="role.id" :value="role.id">{{ role.label }}</option>
                </select>
              </td>
              <td class="px-3 py-2 text-xs">
                <span v-if="user.externalSource" class="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700">
                  {{ user.externalSource }}
                </span>
                <span v-else-if="!user.hasPassword" class="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">QR</span>
                <span v-else class="text-slate-400">manual</span>
              </td>
              <td class="px-3 py-2 text-center tabular-nums">{{ user.bookCount }}</td>
              <td class="px-3 py-2">
                <div class="flex flex-wrap gap-1">
                  <button type="button" class="btn-secondary px-2 py-1 text-xs" @click="resetPassword(user)">
                    Contraseña
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 text-xs"
                    :class="user.isActive ? 'btn-danger' : 'btn-secondary'"
                    :disabled="user.id === auth.user?.id"
                    @click="toggleActive(user)"
                  >{{ user.isActive ? 'Desactivar' : 'Reactivar' }}</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <p v-if="!users.length" class="p-8 text-center text-sm text-slate-500">
          Ninguna cuenta coincide con el filtro.
        </p>
      </div>

      <div v-if="totalPages > 1" class="mt-4 flex items-center justify-center gap-3">
        <button type="button" class="btn-secondary" :disabled="page <= 1" @click="page -= 1">Anterior</button>
        <span class="text-sm text-slate-600">Página {{ page }} de {{ totalPages }}</span>
        <button type="button" class="btn-secondary" :disabled="page >= totalPages" @click="page += 1">Siguiente</button>
      </div>
    </section>
  </div>
</template>
