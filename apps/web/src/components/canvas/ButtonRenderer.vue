<script setup lang="ts">
import { computed } from 'vue';
import IconRenderer from './IconRenderer.vue';
import type { ButtonProperties } from '@/types/api';

/**
 * Boton del lienzo.
 *
 * Se pinta como un <div> y no como un <button>: quien atiende la pulsacion es el
 * envoltorio de la pagina, que es el mismo que ya maneja los enlaces y los saltos
 * internos del resto de elementos. Un <button> de verdad aqui dentro se comeria
 * el clic y habria que reenviarlo, ademas de meter un segundo elemento
 * focalizable donde el teclado ya tiene uno.
 *
 * El tamano del texto va en unidades de contenedor: el lienzo escala segun el
 * ancho de la pantalla y un boton con el texto en px se veria diminuto en la
 * miniatura y desbordado a pantalla completa.
 */
const props = defineProps<{
  properties: ButtonProperties;
  /** En miniatura no se resalta al pasar el raton. */
  preview?: boolean;
}>();

const p = computed(() => props.properties);

const RADIO = { rounded: '0.75rem', pill: '999px', square: '0.125rem' } as const;

/** Proporciones del texto respecto al alto del boton, no del lienzo. */
const TAMANO = { sm: 26, md: 34, lg: 44 } as const;

const estilo = computed(() => {
  const v = p.value;
  const base: Record<string, string> = {
    borderRadius: RADIO[v.shape] ?? RADIO.rounded,
    fontFamily: `'${v.fontFamily}', sans-serif`,
    fontSize: `${TAMANO[v.size] ?? TAMANO.md}cqh`,
    color: v.textColor,
  };

  if (v.variant === 'solid') {
    base.backgroundColor = v.backgroundColor;
    base.border = `2px solid ${v.borderColor}`;
  } else if (v.variant === 'soft') {
    // El relleno suave se saca del propio color, con transparencia: asi combina
    // con cualquier color que elija quien lo monta, sin una segunda paleta.
    base.backgroundColor = `${v.backgroundColor}22`;
    base.border = `2px solid transparent`;
    base.color = v.backgroundColor;
  } else if (v.variant === 'outline') {
    base.backgroundColor = 'transparent';
    base.border = `2px solid ${v.borderColor}`;
    base.color = v.backgroundColor;
  } else if (v.variant === 'ghost') {
    base.backgroundColor = 'transparent';
    base.border = '2px solid transparent';
    base.color = v.backgroundColor;
  } else {
    base.backgroundColor = 'transparent';
    base.border = '2px solid transparent';
    base.color = v.backgroundColor;
    base.textDecoration = 'underline';
  }

  if (v.shadow && (v.variant === 'solid' || v.variant === 'soft')) {
    base.boxShadow = '0 2px 6px rgba(15, 23, 42, 0.18)';
  }

  return base;
});

const hayIcono = computed(() => p.value.iconSource !== 'none');
</script>

<template>
  <div class="caja-boton h-full w-full">
    <div
      class="boton flex h-full w-full select-none items-center justify-center gap-[0.4em]
             overflow-hidden px-[0.9em] text-center font-semibold leading-tight transition"
      :class="{ 'boton-vivo': !preview }"
      :style="estilo"
    >
      <span v-if="hayIcono && p.iconPosition === 'left'" class="icono shrink-0">
        <IconRenderer
          :source="p.iconSource === 'emoji' ? 'emoji' : 'library'"
          :char="p.iconChar"
          :paths="p.iconPaths"
          :view-box="p.iconViewBox"
          :color="estilo.color"
          :filled="p.iconFilled"
        />
      </span>

      <span class="min-w-0 truncate">{{ p.label }}</span>

      <span v-if="hayIcono && p.iconPosition === 'right'" class="icono shrink-0">
        <IconRenderer
          :source="p.iconSource === 'emoji' ? 'emoji' : 'library'"
          :char="p.iconChar"
          :paths="p.iconPaths"
          :view-box="p.iconViewBox"
          :color="estilo.color"
          :filled="p.iconFilled"
        />
      </span>
    </div>
  </div>
</template>

<style scoped>
/*
 * El contexto de consulta va en la caja de fuera: `cqh` dentro del propio
 * elemento que lo declara no se resuelve contra si mismo.
 */
.caja-boton {
  container-type: size;
}

/* El icono ocupa el alto de la linea, no un tamano fijo. */
.icono {
  display: block;
  width: 1.2em;
  height: 1.2em;
}

/* Solo en modo lectura: en el editor el boton no debe parecer pulsable. */
.boton-vivo:hover {
  filter: brightness(1.06);
}

.boton-vivo:active {
  transform: translateY(1px);
}

@media (prefers-reduced-motion: reduce) {
  .boton {
    transition: none;
  }
  .boton-vivo:active {
    transform: none;
  }
}
</style>
