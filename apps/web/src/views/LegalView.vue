<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSeo } from '@/composables/useSeo';
import { DOCUMENTOS_LEGALES, TITULAR, VIGENCIA } from '@/utils/legal';

/**
 * Terminos del servicio, aviso de privacidad y politica de reembolsos.
 *
 * Una sola vista para los tres: la ruta dice cual (`meta.documento`). Son
 * paginas publicas, sin sesion, y se enlazan desde el pie de la portada y desde
 * la pagina de contratar, que es lo que pide la revision de dominio de Paddle.
 */
const route = useRoute();

const documento = computed(
  () => DOCUMENTOS_LEGALES.find((d) => d.slug === route.meta.documento) ?? DOCUMENTOS_LEGALES[0],
);
const otros = computed(() => DOCUMENTOS_LEGALES.filter((d) => d.slug !== documento.value.slug));

useSeo({
  get title() {
    return `${documento.value.titulo} · ${TITULAR.servicio}`;
  },
  get description() {
    return documento.value.resumen;
  },
});
</script>

<template>
  <div class="min-h-screen bg-white">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
        <RouterLink :to="{ name: 'landing' }" class="flex items-center gap-2 font-black text-brand-700">
          <span class="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">B</span>
          {{ TITULAR.servicio }}
        </RouterLink>
        <nav aria-label="Textos legales" class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <RouterLink
            v-for="d in DOCUMENTOS_LEGALES"
            :key="d.slug"
            :to="{ name: d.ruta }"
            class="text-slate-600 hover:text-brand-700"
            active-class="font-semibold text-brand-700"
          >{{ d.titulo }}</RouterLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-10">
      <p class="text-xs font-bold uppercase tracking-wide text-brand-600">Legal</p>
      <h1 class="mt-1 text-3xl font-black text-slate-900">{{ documento.titulo }}</h1>
      <p class="mt-2 text-slate-600">{{ documento.resumen }}</p>
      <p class="mt-1 text-sm text-slate-500">
        Vigente desde el {{ VIGENCIA }} · {{ TITULAR.nombre }}
      </p>

      <article class="mt-8 space-y-8">
        <section v-for="s in documento.secciones" :key="s.titulo">
          <h2 class="text-lg font-bold text-slate-900">{{ s.titulo }}</h2>
          <p v-for="(p, i) in s.parrafos ?? []" :key="i" class="mt-2 leading-relaxed text-slate-700">{{ p }}</p>
          <ul v-if="s.lista" class="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-slate-700">
            <li v-for="(item, i) in s.lista" :key="i">{{ item }}</li>
          </ul>
        </section>
      </article>

      <section class="mt-10 rounded-xl bg-slate-50 p-5">
        <h2 class="font-bold text-slate-900">Contacto</h2>
        <p class="mt-1 text-slate-700">
          {{ TITULAR.nombre }} ·
          <a :href="`mailto:${TITULAR.correo}`" class="font-semibold text-brand-700 underline">{{ TITULAR.correo }}</a>
        </p>
        <p class="mt-3 text-sm text-slate-600">
          Consulta también:
          <template v-for="(d, i) in otros" :key="d.slug">
            <RouterLink :to="{ name: d.ruta }" class="font-semibold text-brand-700 underline">{{ d.titulo }}</RouterLink>
            <span v-if="i < otros.length - 1"> · </span>
          </template>
        </p>
      </section>
    </main>
  </div>
</template>
