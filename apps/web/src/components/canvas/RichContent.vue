<script setup lang="ts">
import type { RichBlock, RichSpan } from '@/types/api';

/**
 * Pinta el contenido con formato de la informacion ampliada.
 *
 * Aqui vive la garantia de todo el asunto: **no hay `v-html` en este fichero ni
 * en ningun sitio que pinte esto**. Cada tipo de bloque conocido se convierte en
 * su etiqueta, y el texto sale por interpolacion normal, que Vue escapa. Lo que
 * no encaje en un tipo conocido no se pinta.
 *
 * Es lo que hace segura la funcion sin depender de un saneador: no existe el
 * camino por el que una cadena escrita por alguien se convierta en marcado. Si
 * algun dia alguien anade aqui un `v-html` "para que se vea mejor", habra
 * abierto justo el agujero que esto evita.
 */
const props = defineProps<{
  blocks?: RichBlock[];
  /** Se pinta como un parrafo si no hay bloques; es lo que tienen los libros viejos. */
  fallback?: string;
  /** El globo va apretado: tipografia menor y margenes cortos. */
  compact?: boolean;
}>();

/** Un enlace solo se pinta como tal si de verdad se puede navegar. */
function enlaceDe(span: RichSpan): string | null {
  const url = (span.href ?? '').trim();
  if (!url) return null;
  return /^https?:\/\//i.test(url) || url.startsWith('/') ? url : null;
}

const NOMBRES: Record<string, string> = {
  youtube: 'YouTube', vimeo: 'Vimeo', peertube: 'PeerTube',
  'google-docs': 'Documento de Google', 'google-slides': 'Presentación de Google',
  'google-sheets': 'Hoja de Google', 'google-forms': 'Formulario de Google',
  'microsoft-office': 'Microsoft Office', archive: 'Internet Archive',
  wikipedia: 'Wikipedia', canva: 'Canva', genially: 'Genially', h5p: 'H5P',
  padlet: 'Padlet', desmos: 'Desmos', geogebra: 'GeoGebra', thinglink: 'ThingLink',
};

function nombreDe(proveedor?: string): string {
  return NOMBRES[proveedor ?? ''] ?? 'contenido externo';
}

function clasesDe(span: RichSpan): string[] {
  const c: string[] = [];
  if (span.bold) c.push('font-semibold');
  if (span.italic) c.push('italic');
  if (span.underline) c.push('underline');
  if (span.strike) c.push('line-through');
  return c;
}
</script>

<template>
  <div :class="compact ? 'space-y-1' : 'space-y-2.5'">
    <template v-if="blocks && blocks.length">
      <template v-for="(bloque, i) in blocks" :key="i">
        <p
          v-if="bloque.type === 'paragraph'"
          :class="compact ? 'text-[13px] leading-snug' : 'text-sm leading-relaxed'"
        >
          <template v-for="(span, j) in bloque.spans" :key="j">
            <a
              v-if="enlaceDe(span)"
              :href="enlaceDe(span)!"
              target="_blank"
              rel="noopener noreferrer"
              class="underline decoration-dotted underline-offset-2"
              :class="clasesDe(span)"
            >{{ span.text }}</a>
            <span v-else :class="clasesDe(span)">{{ span.text }}</span>
          </template>
        </p>

        <h3
          v-else-if="bloque.type === 'heading'"
          :class="compact ? 'text-[13px] font-semibold' : 'text-base font-semibold'"
        >
          <span v-for="(span, j) in bloque.spans" :key="j" :class="clasesDe(span)">{{ span.text }}</span>
        </h3>

        <component
          :is="bloque.ordered ? 'ol' : 'ul'"
          v-else-if="bloque.type === 'list'"
          class="pl-5"
          :class="[
            bloque.ordered ? 'list-decimal' : 'list-disc',
            compact ? 'space-y-0.5 text-[13px] leading-snug' : 'space-y-1 text-sm leading-relaxed',
          ]"
        >
          <li v-for="(item, k) in bloque.items" :key="k">
            <template v-for="(span, j) in item" :key="j">
              <a
                v-if="enlaceDe(span)"
                :href="enlaceDe(span)!"
                target="_blank"
                rel="noopener noreferrer"
                class="underline decoration-dotted underline-offset-2"
                :class="clasesDe(span)"
              >{{ span.text }}</a>
              <span v-else :class="clasesDe(span)">{{ span.text }}</span>
            </template>
          </li>
        </component>

        <!--
          Video o contenido externo. El iframe va con sandbox y con la direccion
          que reconstruyo el servidor: aqui nunca llega un enlace cualquiera.

          referrerpolicy es strict-origin-when-cross-origin y no no-referrer
          porque YouTube exige conocer el origen para autorizar la incrustacion;
          sin el devuelve "Error 153". Se manda el origen, nunca la ruta del libro.
        -->
        <figure v-else-if="bloque.type === 'embed'" class="overflow-hidden rounded-lg">
          <div v-if="bloque.embedUrl" class="aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
            <iframe
              :src="bloque.embedUrl"
              :title="bloque.caption || nombreDe(bloque.provider)"
              class="h-full w-full border-0"
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowfullscreen
            ></iframe>
          </div>
          <p
            v-else
            class="rounded-lg bg-slate-100 px-3 py-6 text-center text-xs text-slate-500"
          >Contenido de {{ nombreDe(bloque.provider) }} no disponible</p>
          <figcaption
            v-if="bloque.caption"
            class="mt-1 text-center text-[11px] italic opacity-75"
          >{{ bloque.caption }}</figcaption>
        </figure>

        <figure v-else-if="bloque.type === 'image'" class="overflow-hidden rounded-lg">
          <img
            :src="bloque.url"
            :alt="bloque.alt"
            loading="lazy"
            class="w-full object-contain"
            :class="compact ? 'max-h-32' : 'max-h-72'"
          />
          <figcaption
            v-if="bloque.caption"
            class="mt-1 text-center text-[11px] italic opacity-75"
          >{{ bloque.caption }}</figcaption>
        </figure>
      </template>
    </template>

    <!-- Sin bloques: los libros anteriores guardaban solo texto plano. Se respetan
         los saltos de linea que escribio quien lo redacto, sin interpretar nada. -->
    <p
      v-else-if="fallback"
      class="whitespace-pre-line"
      :class="compact ? 'text-[13px] leading-snug' : 'text-sm leading-relaxed'"
    >{{ fallback }}</p>
  </div>
</template>
