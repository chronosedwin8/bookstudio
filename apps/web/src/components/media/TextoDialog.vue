<script setup lang="ts">
import { useCierreExterior } from '@/composables/useCierreExterior';
import { estiloEfecto } from '@/utils/efectosTexto';
import { ESTILOS_BASICOS, ESTILOS_TEXTO, type EstiloTexto, type PiezaEstilo } from '@/utils/estilosTexto';

/**
 * Insertar texto, como el panel de texto de Canva: arriba los tres de siempre
 * (titulo, subtitulo, texto) y debajo combinaciones con fuentes y efectos.
 */
const emit = defineEmits<{
  close: [];
  basico: [id: string];
  estilo: [estilo: EstiloTexto];
}>();
const cierre = useCierreExterior(() => emit('close'));

/** La muestra de la galeria: el mismo estilo, a un tercio de tamano. */
const ESCALA = 0.32;
function muestra(p: PiezaEstilo['props']): Record<string, string> {
  return {
    fontFamily: `"${p.fontFamily}", sans-serif`,
    fontSize: `${Math.round(p.fontSize * ESCALA)}px`,
    color: p.color ?? '#1E293B',
    backgroundColor: p.backgroundColor && p.backgroundColor !== 'transparent' ? p.backgroundColor : 'transparent',
    fontWeight: p.bold ? '700' : '400',
    fontStyle: p.italic ? 'italic' : 'normal',
    letterSpacing: `${(p.letterSpacing ?? 0) * ESCALA}px`,
    textTransform: p.uppercase ? 'uppercase' : 'none',
    lineHeight: '1.05',
    padding: p.backgroundColor && p.backgroundColor !== 'transparent' ? '0.15em 0.35em' : '0',
    ...estiloEfecto(p.effect, p.effectColor, p.color ?? '#1E293B'),
  };
}
</script>

<template>
  <div
    class="fixed inset-0 z-[9200] grid place-items-start overflow-y-auto bg-slate-900/60 p-4 sm:p-8"
    role="dialog"
    aria-modal="true"
    aria-labelledby="texto-titulo"
    @mousedown="cierre.onMousedown"
    @mouseup="cierre.onMouseup"
    @keydown.esc="emit('close')"
  >
    <div class="mx-auto w-full max-w-3xl rounded-xl bg-white shadow-2xl">
      <header class="flex items-center justify-between gap-4 border-b border-slate-200 p-4">
        <h2 id="texto-titulo" class="text-lg font-black text-slate-900">Texto</h2>
        <button type="button" class="btn-secondary" @click="emit('close')">Cerrar</button>
      </header>

      <div class="space-y-6 p-4">
        <section>
          <h3 class="mb-2 text-sm font-bold text-slate-800">Estilos de texto</h3>
          <div class="space-y-2">
            <button
              v-for="b in ESTILOS_BASICOS"
              :key="b.id"
              type="button"
              class="block w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-slate-900 transition hover:border-brand-400 hover:bg-brand-50"
              :style="{
                fontFamily: `'${b.props.fontFamily}', sans-serif`,
                fontWeight: b.props.bold ? 700 : 400,
                fontSize: b.id === 'titulo' ? '28px' : b.id === 'subtitulo' ? '19px' : '14px',
              }"
              @click="emit('basico', b.id)"
            >{{ b.label }}</button>
          </div>
        </section>

        <section>
          <h3 class="mb-2 text-sm font-bold text-slate-800">Combinaciones de fuentes</h3>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              v-for="e in ESTILOS_TEXTO"
              :key="e.id"
              type="button"
              class="grid h-28 place-items-center overflow-hidden rounded-xl bg-slate-100 px-2 text-center transition hover:ring-2 hover:ring-brand-400"
              :title="e.label"
              :aria-label="`Insertar «${e.label}»`"
              @click="emit('estilo', e)"
            >
              <span class="flex flex-col items-center">
                <span v-for="(p, i) in e.piezas" :key="i" class="block whitespace-nowrap" :style="muestra(p.props)">{{ p.props.text }}</span>
              </span>
            </button>
          </div>
          <p class="mt-2 text-xs text-slate-500">
            Cada texto se puede cambiar después: doble clic para escribir y, en el panel de la derecha, la fuente,
            el color y el efecto.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
