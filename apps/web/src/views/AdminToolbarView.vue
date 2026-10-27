<script setup lang="ts">
/**
 * Ubicacion de las herramientas del editor, para toda la plataforma.
 *
 * La administracion decide que categorias tiene la barra de la izquierda, en
 * que orden, como se llaman y que herramientas lleva cada una; lo ve todo el
 * mundo al abrir el editor. Lo que puede usar cada alumno lo sigue decidiendo
 * su biblioteca: aqui solo se cambia el sitio, nunca se quita una herramienta.
 *
 * Se trabaja sobre un borrador y nada cambia hasta "Guardar".
 */
import { computed, onMounted, ref } from 'vue';
import { useSeo } from '@/composables/useSeo';
import { settingsApi } from '@/services/api';
import { errorMessage } from '@/services/http';
import {
  HERRAMIENTAS,
  barraPorDefecto,
  idCategoriaNueva,
  normalizarBarra,
  type ConfigBarra,
  type HerramientaId,
} from '@/utils/barraHerramientas';

useSeo({ title: 'Herramientas del editor · BookStudio', description: 'Ubicación de las herramientas del editor.' });

const guardada = ref<ConfigBarra>(barraPorDefecto());
const borrador = ref<ConfigBarra>(barraPorDefecto());
/** Si hay configuracion propia o se usa la de fabrica. */
const personalizada = ref(false);
const actualizada = ref<string | null>(null);

const cargando = ref(true);
const guardando = ref(false);
const error = ref<string | null>(null);
const aviso = ref<string | null>(null);

const copia = (c: ConfigBarra): ConfigBarra => JSON.parse(JSON.stringify(c));
const hayCambios = computed(() => JSON.stringify(borrador.value) !== JSON.stringify(guardada.value));

async function cargar(): Promise<void> {
  cargando.value = true;
  error.value = null;
  try {
    const { value, updatedAt } = await settingsApi.toolbar();
    guardada.value = normalizarBarra(value);
    borrador.value = copia(guardada.value);
    personalizada.value = Boolean(value);
    actualizada.value = updatedAt;
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

async function guardar(): Promise<void> {
  guardando.value = true;
  error.value = null;
  aviso.value = null;
  try {
    const { value, updatedAt } = await settingsApi.saveToolbar(borrador.value);
    guardada.value = normalizarBarra(value);
    borrador.value = copia(guardada.value);
    personalizada.value = true;
    actualizada.value = updatedAt;
    aviso.value = 'Guardado. Todo el mundo verá la barra así la próxima vez que abra el editor.';
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}

async function restablecer(): Promise<void> {
  if (!window.confirm('¿Volver a la barra de fábrica? Se pierde la ubicación que hayáis configurado.')) return;
  guardando.value = true;
  error.value = null;
  aviso.value = null;
  try {
    await settingsApi.resetToolbar();
    guardada.value = barraPorDefecto();
    borrador.value = copia(guardada.value);
    personalizada.value = false;
    actualizada.value = null;
    aviso.value = 'Restablecida la barra de fábrica.';
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    guardando.value = false;
  }
}

function descartar(): void {
  borrador.value = copia(guardada.value);
  aviso.value = null;
}

/* --- Categorias --- */
function moverCategoria(i: number, paso: -1 | 1): void {
  const lista = borrador.value.categories;
  const j = i + paso;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
}

function nuevaCategoria(): void {
  const id = idCategoriaNueva(borrador.value.categories.map((c) => c.id));
  borrador.value.categories.push({ id, label: 'Nueva categoría', icon: '⭐', tools: [] });
}

/** Al borrar una categoria sus herramientas no se pierden: pasan a otra. */
function borrarCategoria(i: number): void {
  const lista = borrador.value.categories;
  if (lista.length <= 1) return;
  const categoria = lista[i];
  const destino = lista[i === 0 ? 1 : 0];
  if (
    categoria.tools.length &&
    !window.confirm(`¿Quitar «${categoria.label}»? Sus ${categoria.tools.length} herramientas pasarán a «${destino.label}».`)
  ) {
    return;
  }
  destino.tools.push(...categoria.tools);
  lista.splice(i, 1);
  if (borrador.value.openByDefault === categoria.id) borrador.value.openByDefault = null;
}

/* --- Herramientas --- */
function moverHerramienta(ci: number, ti: number, paso: -1 | 1): void {
  const tools = borrador.value.categories[ci].tools;
  const j = ti + paso;
  if (j < 0 || j >= tools.length) return;
  [tools[ti], tools[j]] = [tools[j], tools[ti]];
}

/** Lleva una herramienta a otra categoria (al final) o a una posicion concreta. */
function llevar(herramienta: HerramientaId, categoriaId: string, posicion?: number): void {
  const lista = borrador.value.categories;
  const destino = lista.find((c) => c.id === categoriaId);
  if (!destino) return;
  for (const c of lista) {
    const k = c.tools.indexOf(herramienta);
    if (k < 0) continue;
    c.tools.splice(k, 1);
    // Si se mueve dentro de la misma lista hacia abajo, el hueco corre la posicion.
    if (c === destino && posicion !== undefined && k < posicion) posicion--;
  }
  if (posicion === undefined || posicion > destino.tools.length) destino.tools.push(herramienta);
  else destino.tools.splice(posicion, 0, herramienta);
}

/* --- Arrastrar y soltar, ademas de las flechas --- */
const arrastrando = ref<HerramientaId | null>(null);
const sobre = ref<string | null>(null);

function alSoltar(categoriaId: string, posicion?: number): void {
  if (arrastrando.value) llevar(arrastrando.value, categoriaId, posicion);
  arrastrando.value = null;
  sobre.value = null;
}

/* --- Vista previa: como lo vera quien edita --- */
const previaAbierta = ref<string | null>(null);
const fecha = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<template>
  <main class="mx-auto max-w-6xl px-4 py-8">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-black text-slate-900">Herramientas del editor</h1>
        <p class="mt-1 max-w-2xl text-sm text-slate-600">
          Ordena la barra de la izquierda del editor: qué categorías tiene, cómo se llaman y qué herramientas
          lleva cada una. Vale para todo el colegio. Lo que puede usar cada alumno lo sigue decidiendo su
          biblioteca.
        </p>
        <p class="mt-1 text-xs text-slate-500">
          {{ personalizada && actualizada ? `Configuración propia, guardada el ${fecha(actualizada)}.` : 'Ahora se usa la barra de fábrica.' }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" :disabled="guardando" @click="nuevaCategoria">+ Nueva categoría</button>
        <button
          v-if="personalizada"
          type="button"
          class="btn-secondary"
          :disabled="guardando"
          @click="restablecer"
        >Restablecer la de fábrica</button>
      </div>
    </header>

    <p v-if="aviso" class="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{{ aviso }}</p>
    <p v-if="error" class="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{{ error }}</p>

    <p v-if="cargando" class="mt-8 text-sm text-slate-500">Cargando...</p>

    <div v-else class="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_15rem]">
      <!-- Edicion -->
      <ol class="space-y-3">
        <li
          v-for="(categoria, ci) in borrador.categories"
          :key="categoria.id"
          :data-admin-categoria="categoria.id"
          class="card p-4 transition"
          :class="sobre === categoria.id && 'ring-2 ring-brand-400'"
          @dragover.prevent="sobre = categoria.id"
          @dragleave.self="sobre === categoria.id && (sobre = null)"
          @drop.prevent="alSoltar(categoria.id)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <input
              v-model="categoria.icon"
              type="text"
              maxlength="4"
              class="input w-14 text-center"
              aria-label="Icono de la categoría"
              title="Icono (un emoji o un símbolo)"
            />
            <input
              v-model="categoria.label"
              type="text"
              maxlength="40"
              class="input min-w-0 flex-1 font-semibold"
              aria-label="Nombre de la categoría"
              data-nombre-categoria
            />
            <label class="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600" title="La que se ve abierta la primera vez que alguien entra al editor">
              <input
                type="radio"
                name="abierta"
                class="h-3.5 w-3.5"
                :checked="borrador.openByDefault === categoria.id"
                @change="borrador.openByDefault = categoria.id"
              />
              Abierta al entrar
            </label>
            <span class="flex gap-1">
              <button
                type="button"
                class="btn-secondary px-2 py-1"
                :disabled="ci === 0"
                title="Subir la categoría"
                aria-label="Subir la categoría"
                data-subir-categoria
                @click="moverCategoria(ci, -1)"
              >↑</button>
              <button
                type="button"
                class="btn-secondary px-2 py-1"
                :disabled="ci === borrador.categories.length - 1"
                title="Bajar la categoría"
                aria-label="Bajar la categoría"
                @click="moverCategoria(ci, 1)"
              >↓</button>
              <button
                type="button"
                class="btn-secondary px-2 py-1 text-rose-600"
                :disabled="borrador.categories.length <= 1"
                title="Quitar la categoría"
                aria-label="Quitar la categoría"
                @click="borrarCategoria(ci)"
              >✕</button>
            </span>
          </div>

          <p v-if="!categoria.tools.length" class="mt-3 rounded-lg border-2 border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
            Sin herramientas: arrastra aquí alguna o usa «Mover a». Vacía, no se muestra en el editor.
          </p>

          <ul v-else class="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            <li
              v-for="(h, ti) in categoria.tools"
              :key="h"
              :data-admin-herramienta="h"
              draggable="true"
              class="flex cursor-grab items-center gap-2 bg-white px-2.5 py-1.5 text-sm active:cursor-grabbing"
              :class="arrastrando === h && 'opacity-40'"
              @dragstart="arrastrando = h"
              @dragend="arrastrando = null; sobre = null"
              @dragover.prevent.stop="sobre = categoria.id"
              @drop.prevent.stop="alSoltar(categoria.id, ti)"
            >
              <span class="select-none text-slate-300" aria-hidden="true">⋮⋮</span>
              <span class="w-5 shrink-0 text-center" aria-hidden="true">{{ HERRAMIENTAS[h].icono }}</span>
              <span class="min-w-0 flex-1 truncate text-slate-800">{{ HERRAMIENTAS[h].label }}</span>
              <select
                class="input w-36 py-1 text-xs"
                :value="categoria.id"
                aria-label="Mover a otra categoría"
                data-mover-a
                @change="llevar(h, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="otra in borrador.categories" :key="otra.id" :value="otra.id">
                  {{ otra.id === categoria.id ? 'Mover a…' : otra.label }}
                </option>
              </select>
              <button
                type="button"
                class="btn-secondary px-1.5 py-0.5 text-xs"
                :disabled="ti === 0"
                aria-label="Subir"
                @click="moverHerramienta(ci, ti, -1)"
              >↑</button>
              <button
                type="button"
                class="btn-secondary px-1.5 py-0.5 text-xs"
                :disabled="ti === categoria.tools.length - 1"
                aria-label="Bajar"
                @click="moverHerramienta(ci, ti, 1)"
              >↓</button>
            </li>
          </ul>
        </li>
      </ol>

      <!-- Vista previa -->
      <aside class="lg:sticky lg:top-4">
        <p class="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Así se verá</p>
        <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-previa>
          <div
            v-for="categoria in borrador.categories.filter((c) => c.tools.length)"
            :key="categoria.id"
            class="rounded-lg border"
            :class="(previaAbierta ?? borrador.openByDefault) === categoria.id ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200'"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm font-semibold text-slate-700"
              @click="previaAbierta = (previaAbierta ?? borrador.openByDefault) === categoria.id ? '' : categoria.id"
            >
              <span class="w-5 text-center">{{ categoria.icon }}</span>
              <span class="min-w-0 flex-1 truncate">{{ categoria.label || 'Sin nombre' }}</span>
              <span class="text-[10px] text-slate-400">{{ categoria.tools.length }}</span>
            </button>
            <ul
              v-if="(previaAbierta ?? borrador.openByDefault) === categoria.id"
              class="space-y-1 border-t border-slate-100 p-2 text-xs text-slate-600"
            >
              <li v-for="h in categoria.tools" :key="h" class="truncate rounded bg-white px-2 py-1 ring-1 ring-slate-200">
                {{ HERRAMIENTAS[h].icono }} {{ HERRAMIENTAS[h].label }}
              </li>
            </ul>
          </div>
        </div>
      </aside>
    </div>

    <!-- Guardar: siempre a mano mientras haya cambios -->
    <div
      v-if="hayCambios"
      class="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur"
    >
      <p class="mr-auto text-sm text-amber-700">Hay cambios sin guardar.</p>
      <button type="button" class="btn-secondary" :disabled="guardando" @click="descartar">Descartar</button>
      <button type="button" class="btn-primary" data-guardar-barra :disabled="guardando" @click="guardar">
        {{ guardando ? 'Guardando...' : 'Guardar para todos' }}
      </button>
    </div>
  </main>
</template>
