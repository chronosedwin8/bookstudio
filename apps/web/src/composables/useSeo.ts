import { onBeforeUnmount, watchEffect } from 'vue';

/**
 * Etiquetas de SEO por vista.
 *
 * BookStudio es una SPA, asi que el HTML inicial es el mismo para todas las rutas y
 * estas etiquetas se aplican al montar. Google ejecuta JavaScript y lo indexa bien,
 * pero los rastreadores de redes sociales no siempre: por eso los valores por
 * defecto de la portada estan ademas escritos a mano en index.html.
 */
export interface SeoOptions {
  title: string;
  description: string;
  /** Ruta canonica, sin dominio. */
  path?: string;
  image?: string;
  /** JSON-LD; se inyecta y se retira con la vista. */
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
}

const MANAGED = 'data-seo';

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    tag.setAttribute(MANAGED, '');
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    link.setAttribute(MANAGED, '');
    document.head.appendChild(link);
  }
  link.href = href;
}

export function useSeo(options: SeoOptions): void {
  let scriptTag: HTMLScriptElement | null = null;

  watchEffect(() => {
    const url = `${window.location.origin}${options.path ?? window.location.pathname}`;
    const image = options.image ?? `${window.location.origin}/og-image.svg`;

    document.title = options.title;
    setMeta('meta[name="description"]', 'name', 'description', options.description);
    setCanonical(url);

    setMeta('meta[property="og:title"]', 'property', 'og:title', options.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', options.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[property="og:image"]', 'property', 'og:image', image);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');

    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', options.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', options.description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);

    if (!options.structuredData) return;
    scriptTag?.remove();
    scriptTag = document.createElement('script');
    scriptTag.type = 'application/ld+json';
    scriptTag.setAttribute(MANAGED, '');
    scriptTag.textContent = JSON.stringify(options.structuredData);
    document.head.appendChild(scriptTag);
  });

  // El JSON-LD describe esta vista: no debe sobrevivir a la navegacion.
  onBeforeUnmount(() => scriptTag?.remove());
}
