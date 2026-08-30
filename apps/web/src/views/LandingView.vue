<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSeo } from '@/composables/useSeo';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { errorMessage } from '@/services/http';
import { FAQS, FEATURES, PLANS, SITE, STEPS, USE_CASES } from '@/utils/site';

const auth = useAuthStore();
const router = useRouter();

// --- Prueba sin registro ---
const startingTrial = ref(false);
const trialError = ref<string | null>(null);

/** Crea una cuenta temporal y entra directamente al editor. */
async function startTrial(): Promise<void> {
  startingTrial.value = true;
  trialError.value = null;
  try {
    await auth.startTrial();
    await router.push({ name: 'dashboard' });
  } catch (err) {
    trialError.value = errorMessage(err);
  } finally {
    startingTrial.value = false;
  }
}

/** Solo una pregunta abierta a la vez; el indice -1 significa todas cerradas. */
const openFaq = ref(-1);
const toggleFaq = (index: number) => (openFaq.value = openFaq.value === index ? -1 : index);

const title = `${SITE.name} · ${SITE.tagline}`;

/**
 * Datos estructurados: la ficha del producto y las preguntas frecuentes. El bloque
 * FAQPage es el que permite que las respuestas salgan desplegadas en el buscador.
 */
const structuredData = computed(() => [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Navegador web',
    description: SITE.description,
    inLanguage: 'es',
    // Los importes van sin separadores: schema.org espera un numero, no texto.
    offers: PLANS.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      description: plan.summary,
      price: plan.price.replace(/[^\d]/g, ''),
      priceCurrency: 'COP',
      availability: 'https://schema.org/InStock',
    })),
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  },
]);

useSeo({
  title,
  description: SITE.description,
  path: '/',
  structuredData: structuredData.value,
});

const NAV = [
  { label: 'Funciones', href: '#funciones' },
  { label: 'Casos de uso', href: '#casos' },
  { label: 'Como funciona', href: '#como' },
  { label: 'Precios', href: '#precios' },
  { label: 'Preguntas', href: '#faq' },
];
</script>

<template>
  <div class="landing bg-white text-slate-800">
    <!-- Navegacion -->
    <header class="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <a href="#inicio" class="flex items-center gap-2 font-black text-brand-700">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">B</span>
          <span class="text-lg">{{ SITE.name }}</span>
        </a>

        <nav aria-label="Secciones" class="hidden items-center gap-5 text-sm text-slate-600 lg:flex">
          <a v-for="item in NAV" :key="item.href" :href="item.href" class="hover:text-brand-700">{{ item.label }}</a>
        </nav>

        <div class="flex items-center gap-2">
          <RouterLink
            v-if="auth.isAuthenticated"
            :to="{ name: 'billing' }"
            class="hidden text-sm text-slate-600 hover:text-brand-700 sm:block"
          >Mi licencia</RouterLink>
          <RouterLink
            v-if="auth.isAuthenticated"
            :to="{ name: 'dashboard' }"
            class="btn-primary"
          >Ir a mis libros</RouterLink>
          <template v-else>
            <RouterLink :to="{ name: 'login' }" class="btn-secondary">Entrar</RouterLink>
            <RouterLink :to="{ name: 'checkout' }" class="btn-primary">Contratar</RouterLink>
          </template>
        </div>
      </div>
    </header>

    <main id="inicio">
      <!-- Portada -->
      <section class="relative overflow-hidden bg-gradient-to-b from-brand-50 to-white">
        <div class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p class="mb-3 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              Para colegios y equipos profesionales · Se usa desde el navegador
            </p>
            <h1 class="text-4xl font-black leading-tight text-slate-900 sm:text-5xl">
              Libros interactivos que el alumnado
              <span class="text-brand-600">crea, escucha y comparte</span>
            </h1>
            <p class="mt-4 max-w-xl text-lg text-slate-600">
              Un lienzo libre donde caben texto, voz, video, mapas, graficas y preguntas que se
              corrigen solas. Sin instalar nada: se abre en el navegador y se empieza a trabajar.
            </p>

            <div class="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                class="btn-primary px-6 py-3 text-base"
                :disabled="startingTrial"
                @click="startTrial"
              >{{ startingTrial ? 'Preparando...' : 'Probar sin registrarse' }}</button>
              <RouterLink :to="{ name: 'checkout' }" class="btn-secondary px-6 py-3 text-base">
                Ver planes y contratar
              </RouterLink>
            </div>

            <p v-if="trialError" class="mt-3 text-sm text-red-600">{{ trialError }}</p>

            <ul class="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              <li>✓ Sin cuenta ni tarjeta: 1 libro de 2 paginas</li>
              <li>✓ Tus datos donde tu decidas</li>
              <li>✓ Exportacion a PDF y web</li>
            </ul>
          </div>

          <!-- Ilustracion: una pagina de ejemplo, dibujada con CSS -->
          <div class="relative mx-auto w-full max-w-md" aria-hidden="true">
            <div class="rotate-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div class="mb-3 h-3 w-24 rounded bg-brand-200"></div>
              <div class="grid grid-cols-3 gap-2">
                <div class="col-span-2 h-24 rounded-lg bg-gradient-to-br from-amber-200 to-orange-300"></div>
                <div class="h-24 rounded-lg bg-emerald-200"></div>
                <div class="h-16 rounded-lg bg-sky-200"></div>
                <div class="col-span-2 space-y-1.5 py-1">
                  <div class="h-2.5 w-full rounded bg-slate-200"></div>
                  <div class="h-2.5 w-5/6 rounded bg-slate-200"></div>
                  <div class="h-2.5 w-4/6 rounded bg-slate-200"></div>
                </div>
              </div>
              <div class="mt-3 flex items-center gap-2">
                <span class="grid h-9 w-9 place-items-center rounded-full bg-purple-500 text-white">▶</span>
                <div class="h-2.5 w-20 rounded bg-slate-200"></div>
                <span class="ml-auto rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  ¡Muy bien!
                </span>
              </div>
            </div>
            <div class="absolute -bottom-4 -left-4 -z-10 h-full w-full rotate-[-4deg] rounded-2xl bg-brand-100"></div>
          </div>
        </div>
      </section>

      <!-- Funciones -->
      <section id="funciones" class="mx-auto max-w-6xl px-4 py-16">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-black text-slate-900">Todo lo que cabe en una pagina</h2>
          <p class="mt-3 text-slate-600">
            No es un procesador de textos con adornos: es un lienzo donde cada elemento se coloca
            donde tiene sentido.
          </p>
        </div>

        <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <article v-for="feature in FEATURES" :key="feature.title" class="card p-6">
            <span class="text-3xl" aria-hidden="true">{{ feature.icon }}</span>
            <h3 class="mt-3 font-bold text-slate-900">{{ feature.title }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ feature.description }}</p>
          </article>
        </div>
      </section>

      <!-- Casos de uso -->
      <section id="casos" class="bg-slate-50 py-16">
        <div class="mx-auto max-w-6xl px-4">
          <div class="mx-auto max-w-2xl text-center">
            <h2 class="text-3xl font-black text-slate-900">En el aula y en la oficina</h2>
            <p class="mt-3 text-slate-600">
              La misma herramienta resuelve dos problemas parecidos: explicar algo para que se
              entienda y se recuerde.
            </p>
          </div>

          <div class="mt-10 grid gap-6 lg:grid-cols-2">
            <article v-for="useCase in USE_CASES" :key="useCase.audience" class="card p-7">
              <p class="text-xs font-bold uppercase tracking-wide text-brand-600">
                <span aria-hidden="true">{{ useCase.icon }}</span> {{ useCase.audience }}
              </p>
              <h3 class="mt-2 text-xl font-black text-slate-900">{{ useCase.title }}</h3>
              <ul class="mt-4 space-y-2">
                <li v-for="bullet in useCase.bullets" :key="bullet" class="flex gap-2 text-sm text-slate-600">
                  <span class="text-brand-600" aria-hidden="true">→</span>
                  <span>{{ bullet }}</span>
                </li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <!-- Como funciona -->
      <section id="como" class="mx-auto max-w-6xl px-4 py-16">
        <div class="mx-auto max-w-2xl text-center">
          <h2 class="text-3xl font-black text-slate-900">Cuatro pasos y ya hay libro</h2>
          <p class="mt-3 text-slate-600">Sin cursillo previo. La primera sesion de clase ya produce algo.</p>
        </div>

        <ol class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <li v-for="step in STEPS" :key="step.number" class="card p-6">
            <span class="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-lg font-black text-white">
              {{ step.number }}
            </span>
            <h3 class="mt-3 font-bold text-slate-900">{{ step.title }}</h3>
            <p class="mt-1 text-sm text-slate-600">{{ step.text }}</p>
          </li>
        </ol>
      </section>

      <!-- Precios -->
      <section id="precios" class="bg-slate-900 py-16 text-white">
        <div class="mx-auto max-w-6xl px-4">
          <div class="mx-auto max-w-2xl text-center">
            <h2 class="text-3xl font-black">Precios sin letra pequena</h2>
            <p class="mt-3 text-slate-300">
              Tres planes, pago anual y factura a nombre de tu centro o empresa.
            </p>
          </div>

          <div class="mt-10 grid items-start gap-6 lg:grid-cols-3">
            <article
              v-for="plan in PLANS"
              :key="plan.id"
              class="rounded-2xl p-7"
              :class="plan.highlight
                ? 'bg-white text-slate-800 shadow-2xl ring-4 ring-brand-500'
                : 'bg-slate-800 text-slate-200'"
            >
              <p
                v-if="plan.highlight"
                class="mb-3 inline-block rounded-full bg-brand-600 px-3 py-0.5 text-xs font-bold text-white"
              >El mas elegido</p>

              <h3 class="text-lg font-black" :class="plan.highlight ? 'text-slate-900' : 'text-white'">
                {{ plan.name }}
              </h3>
              <p class="mt-1 text-sm" :class="plan.highlight ? 'text-slate-600' : 'text-slate-400'">
                {{ plan.summary }}
              </p>

              <p class="mt-5">
                <span class="text-4xl font-black" :class="plan.highlight ? 'text-slate-900' : 'text-white'">
                  {{ plan.price }}
                </span>
                <span class="ml-1 text-sm" :class="plan.highlight ? 'text-slate-500' : 'text-slate-400'">
                  {{ plan.period }}
                </span>
              </p>

              <ul class="mt-5 space-y-2 text-sm">
                <li v-for="item in plan.features" :key="item" class="flex gap-2">
                  <span class="text-emerald-500" aria-hidden="true">✓</span>
                  <span :class="plan.highlight ? 'text-slate-700' : 'text-slate-300'">{{ item }}</span>
                </li>
              </ul>

              <p v-if="plan.note" class="mt-4 text-xs" :class="plan.highlight ? 'text-slate-500' : 'text-slate-400'">
                {{ plan.note }}
              </p>

              <RouterLink
                :to="{ name: 'checkout', query: { plan: plan.id } }"
                class="mt-6 block w-full rounded-lg px-4 py-2.5 text-center text-sm font-bold transition"
                :class="plan.highlight
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'border border-slate-600 text-white hover:bg-slate-700'"
              >{{ plan.cta }}</RouterLink>
            </article>
          </div>

          <p class="mx-auto mt-8 max-w-2xl text-center text-xs text-slate-400">
            Importes en pesos colombianos, sin IVA. Los centros publicos y las entidades sin animo de
            lucro tienen condiciones especiales: escribenos y lo vemos.
          </p>
        </div>
      </section>

      <!-- Preguntas frecuentes -->
      <section id="faq" class="mx-auto max-w-3xl px-4 py-16">
        <h2 class="text-center text-3xl font-black text-slate-900">Preguntas frecuentes</h2>

        <dl class="mt-10 divide-y divide-slate-200">
          <div v-for="(faq, index) in FAQS" :key="faq.question" class="py-4">
            <dt>
              <button
                type="button"
                class="flex w-full items-center justify-between gap-4 text-left"
                :aria-expanded="openFaq === index"
                :aria-controls="`faq-${index}`"
                @click="toggleFaq(index)"
              >
                <span class="font-bold text-slate-900">{{ faq.question }}</span>
                <span class="shrink-0 text-xl text-brand-600" aria-hidden="true">
                  {{ openFaq === index ? '−' : '+' }}
                </span>
              </button>
            </dt>
            <!-- Siempre en el DOM: los rastreadores leen la respuesta aunque este plegada. -->
            <dd :id="`faq-${index}`" class="mt-2 text-sm leading-relaxed text-slate-600" :hidden="openFaq !== index">
              {{ faq.answer }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- Llamada final -->
      <section class="bg-brand-600 py-16 text-center text-white">
        <div class="mx-auto max-w-2xl px-4">
          <h2 class="text-3xl font-black">Empieza esta misma tarde</h2>
          <p class="mt-3 text-brand-100">
            Pruebalo sin dar ningun dato, y cuando te convenza contrata en dos minutos: pagas, se
            crea tu cuenta y entras directo al editor.
          </p>
          <div class="mt-7 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              class="rounded-lg bg-white px-6 py-3 font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
              :disabled="startingTrial"
              @click="startTrial"
            >Probarlo ahora mismo</button>
            <RouterLink :to="{ name: 'checkout' }" class="rounded-lg border border-white/60 px-6 py-3 font-bold hover:bg-white/10">
              Contratar ahora
            </RouterLink>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-slate-200 bg-slate-50 py-10">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-3">
        <div>
          <p class="flex items-center gap-2 font-black text-brand-700">
            <span class="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">B</span>
            {{ SITE.name }}
          </p>
          <p class="mt-2 text-sm text-slate-600">{{ SITE.tagline }}.</p>
        </div>

        <nav aria-label="Producto">
          <h2 class="text-sm font-bold text-slate-800">Producto</h2>
          <ul class="mt-2 space-y-1 text-sm text-slate-600">
            <li v-for="item in NAV" :key="item.href"><a :href="item.href" class="hover:text-brand-700">{{ item.label }}</a></li>
          </ul>
        </nav>

        <nav aria-label="Acceso">
          <h2 class="text-sm font-bold text-slate-800">Acceso</h2>
          <ul class="mt-2 space-y-1 text-sm text-slate-600">
            <li><RouterLink :to="{ name: 'login' }" class="hover:text-brand-700">Entrar a la plataforma</RouterLink></li>
            <li><RouterLink :to="{ name: 'login-qr' }" class="hover:text-brand-700">Acceso del alumnado con QR</RouterLink></li>
            <li><RouterLink :to="{ name: 'checkout' }" class="hover:text-brand-700">Contratar</RouterLink></li>
            <li><RouterLink :to="{ name: 'billing' }" class="hover:text-brand-700">Mi licencia y facturas</RouterLink></li>
          </ul>
        </nav>
      </div>

      <p class="mt-8 text-center text-xs text-slate-500">
        {{ SITE.name }} · Libros interactivos para el aula y el trabajo.
      </p>
    </footer>
  </div>
</template>

<style scoped>
/* El desplazamiento por anclas no debe quedar oculto tras la barra fija. */
.landing :where(section[id]) {
  scroll-margin-top: 4.5rem;
}
</style>
