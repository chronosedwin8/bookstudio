<script setup lang="ts">
import { computed, reactive } from 'vue';
import { compilar } from '@/utils/expresiones';
import {
  COLORES_GRAFICA,
  EJEMPLOS_GRAFICA,
  GRAFICA_POR_DEFECTO,
  funcionNueva,
  nombreDeslizadorValido,
  normalizarGrafica,
  type Deslizador,
  type FuncionGrafica,
  type PropiedadesGrafica,
  type PuntoGrafica,
} from '@/utils/graficas';

/**
 * Panel de la grafica de funciones.
 *
 * Las expresiones se guardan al salir del campo (o con Intro), no a cada tecla:
 * a mitad de escribir "x^2 +" la expresion no es valida y no tiene sentido
 * mandarla. Mientras se escribe, eso si, se avisa del error debajo del campo.
 */
const props = defineProps<{ properties: Record<string, unknown> }>();
const emit = defineEmits<{ patch: [properties: Record<string, unknown>] }>();

const g = computed(() => normalizarGrafica(props.properties));
const es3d = computed(() => g.value.mode === '3d');

function update(cambios: Partial<PropiedadesGrafica>): void {
  emit('patch', { ...g.value, ...cambios } as unknown as Record<string, unknown>);
}

/*
 * --- Errores mientras se escribe ---
 *
 * El campo muestra el borrador, no lo guardado: Vue reescribe `value` en cada
 * repintado, y avisar del error repinta a cada tecla, asi que enlazado a lo
 * guardado el campo volvia solo a la expresion de antes y no se guardaba nada.
 */
const borradores = reactive<Record<string, string>>({});
const variablesDe = (kind: FuncionGrafica['kind']) =>
  [kind === 'y' ? 'x' : kind === 'param' ? 't' : 'x', ...(kind === 'z' ? ['y'] : []), ...g.value.params.map((d) => d.name)];

function errorDe(clave: string, texto: string, variables: string[]): string | null {
  const valor = borradores[clave] ?? texto;
  if (!valor.trim()) return null;
  const c = compilar(valor, variables);
  return c.ok ? null : c.error;
}

/* --- Funciones --- */
function actualizarFuncion(i: number, cambios: Partial<FuncionGrafica>): void {
  update({ functions: g.value.functions.map((f, k) => (k === i ? { ...f, ...cambios } : f)) });
}

function anadirFuncion(): void {
  if (g.value.functions.length >= 8) return;
  const color = COLORES_GRAFICA[g.value.functions.length % COLORES_GRAFICA.length];
  const kind: FuncionGrafica['kind'] = es3d.value ? 'z' : 'y';
  update({ functions: [...g.value.functions, funcionNueva(kind, es3d.value ? 'sin(x) cos(y)' : 'x', color)] });
}

function quitarFuncion(i: number): void {
  const resto = g.value.functions.filter((_, k) => k !== i);
  // El area y la tangente apuntan por posicion: si se quita una anterior, se corren.
  const corregir = (fn: number) => (fn > i ? fn - 1 : fn === i ? 0 : fn);
  update({
    functions: resto,
    area: { ...g.value.area, fn: corregir(g.value.area.fn), enabled: g.value.area.enabled && g.value.area.fn !== i },
    tangent: { ...g.value.tangent, fn: corregir(g.value.tangent.fn), enabled: g.value.tangent.enabled && g.value.tangent.fn !== i },
  });
}

function cambiarModo(mode: '2d' | '3d'): void {
  if (mode === g.value.mode) return;
  // Las funciones de un modo no sirven en el otro: se empieza con un ejemplo.
  const ejemplo = mode === '3d' ? EJEMPLOS_GRAFICA.find((e) => e.props.mode === '3d')! : EJEMPLOS_GRAFICA[0];
  update({ ...GRAFICA_POR_DEFECTO, ...ejemplo.props, mode, title: g.value.title });
}

function aplicarEjemplo(indice: number): void {
  const ejemplo = EJEMPLOS_GRAFICA[indice];
  if (ejemplo) update({ ...GRAFICA_POR_DEFECTO, ...ejemplo.props });
}

/* --- Deslizadores --- */
const nombresLibres = computed(() =>
  'abcdfghkmnpqrsuvw'.split('').filter((n) => !g.value.params.some((d) => d.name === n)),
);

function anadirDeslizador(): void {
  if (g.value.params.length >= 8 || !nombresLibres.value.length) return;
  update({ params: [...g.value.params, { name: nombresLibres.value[0], value: 1, min: -5, max: 5, step: 0.1 }] });
}

function actualizarDeslizador(i: number, cambios: Partial<Deslizador>): void {
  const d = { ...g.value.params[i], ...cambios };
  if (cambios.name !== undefined && (!nombreDeslizadorValido(d.name) || g.value.params.some((o, k) => k !== i && o.name === d.name))) {
    return;
  }
  // El valor se queda dentro del recorrido, o el deslizador nacería fuera de su carril.
  if (d.min >= d.max) return;
  d.value = Math.min(d.max, Math.max(d.min, d.value));
  update({ params: g.value.params.map((o, k) => (k === i ? d : o)) });
}

/* --- Puntos --- */
function anadirPunto(): void {
  if (g.value.points.length >= 20) return;
  update({ points: [...g.value.points, { x: '1', y: '1', label: '', color: '#0F172A' }] });
}
function actualizarPunto(i: number, cambios: Partial<PuntoGrafica>): void {
  update({ points: g.value.points.map((p, k) => (k === i ? { ...p, ...cambios } : p)) });
}

/* --- Ejes --- */
function rango(campo: 'xMin' | 'xMax' | 'yMin' | 'yMax', valor: string): void {
  const n = Number(valor.replace(',', '.'));
  if (!Number.isFinite(n)) return;
  const nuevo = { ...g.value, [campo]: n };
  // El servidor rechaza un rango al reves; aqui simplemente no se aplica.
  if (nuevo.xMax <= nuevo.xMin || nuevo.yMax <= nuevo.yMin) return;
  update({ [campo]: n });
}

const numero = (e: Event) => Number((e.target as HTMLInputElement).value.replace(',', '.'));
const texto = (e: Event) => (e.target as HTMLInputElement).value;
const marcado = (e: Event) => (e.target as HTMLInputElement).checked;
const explicitas = computed(() => g.value.functions.map((f, i) => ({ f, i })).filter(({ f }) => f.kind === 'y'));
</script>

<template>
  <div class="space-y-4 text-sm">
    <!-- Modo y ejemplos -->
    <div class="grid grid-cols-2 gap-1">
      <button
        v-for="m in (['2d', '3d'] as const)"
        :key="m"
        type="button"
        class="rounded-lg border px-2 py-1.5 text-xs font-semibold transition"
        :class="g.mode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'"
        @click="cambiarModo(m)"
      >{{ m === '2d' ? 'Plano 2D' : 'Superficie 3D' }}</button>
    </div>

    <div>
      <label class="label" for="plot-ejemplo">Empezar desde un ejemplo</label>
      <select id="plot-ejemplo" class="input" value="" @change="aplicarEjemplo(Number(texto($event))); ($event.target as HTMLSelectElement).value = ''">
        <option value="" disabled>Elige uno…</option>
        <option v-for="(e, i) in EJEMPLOS_GRAFICA" :key="e.label" :value="i">{{ e.label }}</option>
      </select>
    </div>

    <div>
      <label class="label" for="plot-titulo">Título</label>
      <input id="plot-titulo" class="input" maxlength="200" :value="g.title" @change="update({ title: texto($event) })" />
    </div>

    <!-- Funciones -->
    <section>
      <h4 class="label">{{ es3d ? 'Superficies z = f(x, y)' : 'Funciones' }}</h4>
      <ul class="space-y-2">
        <li v-for="(f, i) in g.functions" :key="i" class="rounded-lg border border-slate-200 p-2">
          <div class="flex items-center gap-1.5">
            <input
              type="color"
              class="h-7 w-8 shrink-0 cursor-pointer rounded border border-slate-300"
              :value="f.color"
              :aria-label="`Color de la función ${i + 1}`"
              @change="actualizarFuncion(i, { color: texto($event) })"
            />
            <select
              v-if="!es3d"
              class="input w-auto py-1 text-xs"
              :value="f.kind"
              :aria-label="`Tipo de la función ${i + 1}`"
              @change="actualizarFuncion(i, { kind: texto($event) as FuncionGrafica['kind'], expr: texto($event) === 'param' ? 'cos(t)' : 'x', exprY: 'sin(t)' })"
            >
              <option value="y">y = f(x)</option>
              <option value="param">Paramétrica</option>
            </select>
            <span class="flex-1"></span>
            <label class="flex items-center gap-1 text-[11px] text-slate-500" title="Mostrar u ocultar">
              <input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="f.visible" @change="actualizarFuncion(i, { visible: marcado($event) })" />
              Ver
            </label>
            <button
              type="button"
              class="px-1 text-red-500 hover:text-red-700 disabled:opacity-30"
              :disabled="g.functions.length <= 1"
              :aria-label="`Quitar la función ${i + 1}`"
              @click="quitarFuncion(i)"
            >×</button>
          </div>

          <div class="mt-1.5 flex items-center gap-1">
            <span class="shrink-0 font-mono text-xs italic text-slate-500">{{ f.kind === 'y' ? 'y =' : f.kind === 'z' ? 'z =' : 'x(t) =' }}</span>
            <input
              class="input py-1 font-mono text-xs"
              :class="errorDe(`f${i}`, f.expr, variablesDe(f.kind)) ? 'border-red-400' : ''"
              maxlength="300"
              :value="borradores[`f${i}`] ?? f.expr"
              spellcheck="false"
              :aria-label="`Expresión de la función ${i + 1}`"
              @input="borradores[`f${i}`] = texto($event)"
              @change="actualizarFuncion(i, { expr: texto($event) }); delete borradores[`f${i}`]"
            />
          </div>
          <p v-if="errorDe(`f${i}`, f.expr, variablesDe(f.kind))" class="mt-0.5 text-[11px] text-red-600">
            {{ errorDe(`f${i}`, f.expr, variablesDe(f.kind)) }}
          </p>

          <template v-if="f.kind === 'param'">
            <div class="mt-1 flex items-center gap-1">
              <span class="shrink-0 font-mono text-xs italic text-slate-500">y(t) =</span>
              <input
                class="input py-1 font-mono text-xs"
                maxlength="300"
                :value="borradores[`fy${i}`] ?? f.exprY"
                spellcheck="false"
                :aria-label="`y(t) de la función ${i + 1}`"
                @input="borradores[`fy${i}`] = texto($event)"
                @change="actualizarFuncion(i, { exprY: texto($event) }); delete borradores[`fy${i}`]"
              />
            </div>
            <p v-if="errorDe(`fy${i}`, f.exprY, variablesDe('param'))" class="mt-0.5 text-[11px] text-red-600">
              {{ errorDe(`fy${i}`, f.exprY, variablesDe('param')) }}
            </p>
            <div class="mt-1 flex items-center gap-1 text-xs text-slate-600">
              t de
              <input class="input w-16 py-0.5 text-xs" type="number" step="0.1" :value="f.tMin" @change="actualizarFuncion(i, { tMin: numero($event) })" />
              a
              <input class="input w-16 py-0.5 text-xs" type="number" step="0.1" :value="f.tMax" @change="actualizarFuncion(i, { tMax: numero($event) })" />
            </div>
          </template>

          <details v-if="!es3d" class="mt-1">
            <summary class="cursor-pointer text-[11px] text-slate-500">Más opciones</summary>
            <div class="mt-1 space-y-1">
              <input
                class="input py-1 text-xs"
                maxlength="80"
                placeholder="Nombre en la leyenda (opcional)"
                :value="f.label"
                @change="actualizarFuncion(i, { label: texto($event) })"
              />
              <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <label class="flex items-center gap-1">
                  Grosor
                  <input class="w-16" type="range" min="1" max="8" :value="f.width" @change="actualizarFuncion(i, { width: numero($event) })" />
                </label>
                <label class="flex items-center gap-1">
                  <input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="f.dashed" @change="actualizarFuncion(i, { dashed: marcado($event) })" />
                  Discontinua
                </label>
              </div>
              <div v-if="f.kind === 'y'" class="flex items-center gap-1 text-xs text-slate-600">
                Solo entre
                <input
                  class="input w-16 py-0.5 text-xs"
                  type="number"
                  :value="f.domainMin ?? ''"
                  placeholder="−∞"
                  @change="actualizarFuncion(i, { domainMin: texto($event) === '' ? null : numero($event) })"
                />
                y
                <input
                  class="input w-16 py-0.5 text-xs"
                  type="number"
                  :value="f.domainMax ?? ''"
                  placeholder="∞"
                  @change="actualizarFuncion(i, { domainMax: texto($event) === '' ? null : numero($event) })"
                />
              </div>
            </div>
          </details>
        </li>
      </ul>
      <button
        type="button"
        class="mt-1.5 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40"
        :disabled="g.functions.length >= 8"
        @click="anadirFuncion"
      >+ {{ es3d ? 'Añadir superficie' : 'Añadir función' }}</button>
      <p class="mt-1 text-[11px] leading-snug text-slate-500">
        Escribe como en clase: <code>2x+1</code>, <code>x^2</code>, <code>sen(x)</code>, <code>raiz(x)</code>,
        <code>|x|</code>, <code>e^x</code>, <code>ln(x)</code>, <code>pi</code>. Usa punto para los decimales.
      </p>
    </section>

    <!-- Deslizadores -->
    <section>
      <h4 class="label">Deslizadores</h4>
      <p v-if="!g.params.length" class="text-[11px] text-slate-500">
        Un deslizador es un número que se mueve con el ratón: úsalo en las funciones (por ejemplo <code>a x^2</code>)
        y quien lea el libro verá cómo cambia la gráfica.
      </p>
      <ul class="space-y-1.5">
        <li v-for="(d, i) in g.params" :key="d.name" class="flex flex-wrap items-center gap-1 text-xs text-slate-600">
          <select
            class="input w-14 py-0.5 text-xs font-bold italic"
            :value="d.name"
            :aria-label="`Nombre del deslizador ${i + 1}`"
            @change="actualizarDeslizador(i, { name: texto($event) })"
          >
            <option :value="d.name">{{ d.name }}</option>
            <option v-for="n in nombresLibres" :key="n" :value="n">{{ n }}</option>
          </select>
          =
          <input class="input w-14 py-0.5 text-xs" type="number" :step="d.step" :value="d.value" aria-label="Valor inicial" @change="actualizarDeslizador(i, { value: numero($event) })" />
          de
          <input class="input w-14 py-0.5 text-xs" type="number" :value="d.min" aria-label="Mínimo" @change="actualizarDeslizador(i, { min: numero($event) })" />
          a
          <input class="input w-14 py-0.5 text-xs" type="number" :value="d.max" aria-label="Máximo" @change="actualizarDeslizador(i, { max: numero($event) })" />
          <button type="button" class="px-1 text-red-500 hover:text-red-700" :aria-label="`Quitar el deslizador ${d.name}`" @click="update({ params: g.params.filter((_, k) => k !== i) })">×</button>
        </li>
      </ul>
      <button
        type="button"
        class="mt-1 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40"
        :disabled="g.params.length >= 8"
        @click="anadirDeslizador"
      >+ Añadir deslizador</button>
    </section>

    <!-- Ejes -->
    <section>
      <h4 class="label">Ejes</h4>
      <div class="grid grid-cols-2 gap-1 text-xs text-slate-600">
        <label class="flex items-center gap-1">x de <input class="input py-0.5 text-xs" type="number" :value="g.xMin" @change="rango('xMin', texto($event))" /></label>
        <label class="flex items-center gap-1">a <input class="input py-0.5 text-xs" type="number" :value="g.xMax" @change="rango('xMax', texto($event))" /></label>
        <label class="flex items-center gap-1">y de <input class="input py-0.5 text-xs" type="number" :value="g.yMin" @change="rango('yMin', texto($event))" /></label>
        <label class="flex items-center gap-1">a <input class="input py-0.5 text-xs" type="number" :value="g.yMax" @change="rango('yMax', texto($event))" /></label>
      </div>
      <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
        <label class="flex items-center gap-1"><input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="g.showAxes" @change="update({ showAxes: marcado($event) })" /> Ejes</label>
        <label v-if="!es3d" class="flex items-center gap-1"><input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="g.showGrid" @change="update({ showGrid: marcado($event) })" /> Cuadrícula</label>
        <label class="flex items-center gap-1" title="Al leer: mover, acercar y ver coordenadas">
          <input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="g.interactive" @change="update({ interactive: marcado($event) })" /> Interactiva al leer
        </label>
      </div>
      <div v-if="!es3d" class="mt-1.5 grid grid-cols-2 gap-1">
        <input class="input py-0.5 text-xs" maxlength="40" :value="g.xLabel" aria-label="Nombre del eje x" @change="update({ xLabel: texto($event) })" />
        <input class="input py-0.5 text-xs" maxlength="40" :value="g.yLabel" aria-label="Nombre del eje y" @change="update({ yLabel: texto($event) })" />
      </div>
    </section>

    <!-- Herramientas de análisis (2D) -->
    <section v-if="!es3d">
      <h4 class="label">Análisis</h4>
      <div class="space-y-1.5 text-xs text-slate-700">
        <label class="flex items-center gap-1.5"><input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="g.markRoots" @change="update({ markRoots: marcado($event) })" /> Marcar raíces (cortes con el eje x)</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="g.markIntersections" @change="update({ markIntersections: marcado($event) })" /> Marcar cortes entre funciones</label>

        <div class="rounded border border-slate-200 p-1.5">
          <label class="flex items-center gap-1.5 font-semibold">
            <input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="g.area.enabled" :disabled="!explicitas.length" @change="update({ area: { ...g.area, enabled: marcado($event), fn: explicitas.some((e) => e.i === g.area.fn) ? g.area.fn : (explicitas[0]?.i ?? 0) } })" />
            Área bajo la curva (integral)
          </label>
          <div v-if="g.area.enabled" class="mt-1 flex flex-wrap items-center gap-1">
            <select class="input w-auto py-0.5 text-xs" :value="g.area.fn" @change="update({ area: { ...g.area, fn: numero($event) } })">
              <option v-for="e in explicitas" :key="e.i" :value="e.i">Función {{ e.i + 1 }}</option>
            </select>
            de <input class="input w-14 py-0.5 text-xs" :value="g.area.a" @change="update({ area: { ...g.area, a: texto($event) } })" />
            a <input class="input w-14 py-0.5 text-xs" :value="g.area.b" @change="update({ area: { ...g.area, b: texto($event) } })" />
            <input type="color" class="h-6 w-7 rounded border border-slate-300" :value="g.area.color" @change="update({ area: { ...g.area, color: texto($event) } })" />
          </div>
        </div>

        <div class="rounded border border-slate-200 p-1.5">
          <label class="flex items-center gap-1.5 font-semibold">
            <input type="checkbox" class="h-3.5 w-3.5 rounded" :checked="g.tangent.enabled" :disabled="!explicitas.length" @change="update({ tangent: { ...g.tangent, enabled: marcado($event), fn: explicitas.some((e) => e.i === g.tangent.fn) ? g.tangent.fn : (explicitas[0]?.i ?? 0) } })" />
            Recta tangente (derivada)
          </label>
          <div v-if="g.tangent.enabled" class="mt-1 flex flex-wrap items-center gap-1">
            <select class="input w-auto py-0.5 text-xs" :value="g.tangent.fn" @change="update({ tangent: { ...g.tangent, fn: numero($event) } })">
              <option v-for="e in explicitas" :key="e.i" :value="e.i">Función {{ e.i + 1 }}</option>
            </select>
            en x = <input class="input w-14 py-0.5 text-xs" :value="g.tangent.x0" @change="update({ tangent: { ...g.tangent, x0: texto($event) } })" />
            <input type="color" class="h-6 w-7 rounded border border-slate-300" :value="g.tangent.color" @change="update({ tangent: { ...g.tangent, color: texto($event) } })" />
          </div>
          <p class="mt-0.5 text-[11px] text-slate-500">Los extremos y el punto admiten un deslizador, p. ej. <code>a</code>.</p>
        </div>
      </div>
    </section>

    <!-- Puntos (2D) -->
    <section v-if="!es3d">
      <h4 class="label">Puntos</h4>
      <ul class="space-y-1">
        <li v-for="(p, i) in g.points" :key="i" class="flex items-center gap-1 text-xs">
          (<input class="input w-12 py-0.5 text-xs" :value="p.x" aria-label="x del punto" @change="actualizarPunto(i, { x: texto($event) })" />,
          <input class="input w-12 py-0.5 text-xs" :value="p.y" aria-label="y del punto" @change="actualizarPunto(i, { y: texto($event) })" />)
          <input class="input min-w-0 flex-1 py-0.5 text-xs" maxlength="60" placeholder="Nombre" :value="p.label" @change="actualizarPunto(i, { label: texto($event) })" />
          <input type="color" class="h-6 w-7 shrink-0 rounded border border-slate-300" :value="p.color" @change="actualizarPunto(i, { color: texto($event) })" />
          <button type="button" class="px-1 text-red-500 hover:text-red-700" aria-label="Quitar el punto" @click="update({ points: g.points.filter((_, k) => k !== i) })">×</button>
        </li>
      </ul>
      <button type="button" class="mt-1 text-xs font-semibold text-brand-600 hover:underline" @click="anadirPunto">+ Añadir punto</button>
    </section>

    <!-- Vista 3D -->
    <section v-if="es3d">
      <h4 class="label">Vista</h4>
      <label class="block text-xs text-slate-600">
        Giro ({{ Math.round(g.rotZ) }}°)
        <input class="w-full" type="range" min="-180" max="180" :value="g.rotZ" @change="update({ rotZ: numero($event) })" />
      </label>
      <label class="block text-xs text-slate-600">
        Inclinación ({{ Math.round(g.rotX) }}°)
        <input class="w-full" type="range" min="0" max="90" :value="g.rotX" @change="update({ rotX: numero($event) })" />
      </label>
      <label class="mt-1 block text-xs text-slate-600">
        Colores
        <select class="input py-1 text-xs" :value="g.colorMap" @change="update({ colorMap: texto($event) as PropiedadesGrafica['colorMap'] })">
          <option value="arcoiris">Arcoíris por altura</option>
          <option value="frio">Fríos por altura</option>
          <option value="calor">Cálidos por altura</option>
          <option value="uniforme">El color de cada superficie</option>
        </select>
      </label>
      <p class="mt-1 text-[11px] text-slate-500">Al leer, se gira arrastrando con el ratón o el dedo.</p>
    </section>
  </div>
</template>
