/**
 * Proveedores admitidos para incrustar contenido externo.
 *
 * Aviso deliberado: la mayoria son servicios privativos y rompen el criterio
 * "100% open source" del plan. Se incluyen porque el profesorado los necesita, pero
 * la lista es cerrada: nunca se incrusta una URL arbitraria, porque un iframe libre
 * permitiria meter cualquier pagina dentro del libro de un alumno.
 *
 * De cada enlace se extrae solo el identificador y la URL de incrustacion se
 * reconstruye aqui, de modo que los parametros del enlace original se descartan.
 */
export type EmbedProvider =
  | 'youtube'
  | 'vimeo'
  | 'peertube'
  | 'google-docs'
  | 'google-slides'
  | 'google-sheets'
  | 'google-forms'
  | 'microsoft-office'
  | 'archive'
  | 'wikipedia'
  | 'canva'
  | 'genially'
  | 'h5p'
  | 'padlet'
  | 'desmos'
  | 'geogebra'
  | 'thinglink';

interface ProviderRule {
  label: string;
  /** Devuelve la URL de incrustacion, o null si el enlace no es de este proveedor. */
  resolve: (url: URL) => string | null;
}

const YOUTUBE_ID = /^[\w-]{11}$/;
const GOOGLE_ID = /^[\w-]{10,120}$/;

/** Coincide con el dominio exacto o un subdominio suyo, nunca "youtube.com.malo.net". */
function hostIs(url: URL, ...domains: string[]): boolean {
  return domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}

type GoogleKind = 'document' | 'presentation' | 'spreadsheets' | 'forms';

function googleDoc(kind: GoogleKind) {
  return (url: URL): string | null => {
    if (!hostIs(url, 'google.com')) return null;

    // /document/d/<id>/edit -> se conserva el id y se reconstruye en modo lectura.
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.indexOf(kind);
    if (index < 0) return null;

    // Los formularios publicados usan /forms/d/e/<id>/viewform.
    const id = parts[index + 1] === 'd' ? (parts[index + 2] === 'e' ? parts[index + 3] : parts[index + 2]) : null;
    if (!id || !GOOGLE_ID.test(id)) return null;

    if (kind === 'forms') return `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true`;
    if (kind === 'presentation') return `https://docs.google.com/presentation/d/${id}/embed`;
    if (kind === 'spreadsheets') return `https://docs.google.com/spreadsheets/d/${id}/preview`;
    return `https://docs.google.com/document/d/${id}/preview`;
  };
}

export const EMBED_PROVIDERS: Record<EmbedProvider, ProviderRule> = {
  youtube: {
    label: 'YouTube',
    resolve: (url) => {
      if (!hostIs(url, 'youtube.com', 'youtu.be', 'youtube-nocookie.com')) return null;
      const id = hostIs(url, 'youtu.be')
        ? url.pathname.slice(1)
        : (url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean).pop() ?? '');
      if (!YOUTUBE_ID.test(id)) return null;
      // nocookie evita el seguimiento antes de que el alumno pulse reproducir.
      return `https://www.youtube-nocookie.com/embed/${id}`;
    },
  },
  vimeo: {
    label: 'Vimeo',
    resolve: (url) => {
      if (!hostIs(url, 'vimeo.com')) return null;
      const id = url.pathname.split('/').filter(Boolean).find((part) => /^\d{6,12}$/.test(part));
      return id ? `https://player.vimeo.com/video/${id}` : null;
    },
  },
  peertube: {
    label: 'PeerTube',
    resolve: (url) => {
      // PeerTube es federado: vale cualquier instancia, pero solo su ruta de video.
      const match =
        url.pathname.match(/^\/w\/([\w-]{6,40})$/) ?? url.pathname.match(/^\/videos\/watch\/([\w-]{6,40})$/);
      return match ? `${url.origin}/videos/embed/${match[1]}` : null;
    },
  },
  'google-docs': { label: 'Documento de Google', resolve: googleDoc('document') },
  'google-slides': { label: 'Presentacion de Google', resolve: googleDoc('presentation') },
  'google-sheets': { label: 'Hoja de calculo de Google', resolve: googleDoc('spreadsheets') },
  'google-forms': { label: 'Formulario de Google', resolve: googleDoc('forms') },
  'microsoft-office': {
    label: 'Documento de Microsoft',
    resolve: (url) => {
      if (!hostIs(url, 'sharepoint.com', 'officeapps.live.com', 'onedrive.live.com', 'office.com')) return null;
      // Los enlaces de incrustacion de Office ya vienen listos para el iframe.
      return url.toString();
    },
  },
  archive: {
    label: 'Internet Archive',
    resolve: (url) => {
      if (!hostIs(url, 'archive.org')) return null;
      const match = url.pathname.match(/^\/(?:details|embed)\/([\w.\-@]{2,120})/);
      return match ? `https://archive.org/embed/${match[1]}` : null;
    },
  },
  wikipedia: {
    label: 'Wikipedia',
    resolve: (url) =>
      hostIs(url, 'wikipedia.org', 'wikibooks.org', 'wikisource.org') ? url.toString() : null,
  },
  canva: {
    label: 'Canva',
    resolve: (url) => {
      if (!hostIs(url, 'canva.com')) return null;
      // /design/<id>/<token>/view -> se fuerza la vista incrustable.
      const match = url.pathname.match(/^\/design\/([\w-]{6,60})\/([\w-]{6,60})/);
      if (!match) return null;
      return `https://www.canva.com/design/${match[1]}/${match[2]}/view?embed`;
    },
  },
  genially: {
    label: 'Genially',
    resolve: (url) => {
      if (!hostIs(url, 'genial.ly', 'genially.com', 'view.genially.com')) return null;
      const id = url.pathname.split('/').filter(Boolean).pop();
      return id && /^[\w-]{6,60}$/.test(id) ? `https://view.genially.com/${id}` : null;
    },
  },
  h5p: {
    label: 'H5P',
    resolve: (url) => {
      // H5P es open source y se autoaloja: vale cualquier instancia con /h5p/embed.
      if (!/\/h5p\/(embed|\d+)/.test(url.pathname)) return null;
      return url.toString().replace(/\/h5p\/(\d+)$/, '/h5p/embed/$1');
    },
  },
  padlet: {
    label: 'Padlet',
    resolve: (url) => {
      if (!hostIs(url, 'padlet.com')) return null;
      return url.pathname.split('/').filter(Boolean).length >= 2
        ? `https://padlet.com/embed${url.pathname}`
        : null;
    },
  },
  desmos: {
    label: 'Desmos',
    resolve: (url) => {
      if (!hostIs(url, 'desmos.com')) return null;
      const match = url.pathname.match(/^\/calculator\/([\w]{6,20})/);
      return match ? `https://www.desmos.com/calculator/${match[1]}?embed` : null;
    },
  },
  geogebra: {
    label: 'GeoGebra',
    resolve: (url) => {
      if (!hostIs(url, 'geogebra.org')) return null;
      const match = url.pathname.match(/\/m\/([\w]{4,20})/);
      return match ? `https://www.geogebra.org/material/iframe/id/${match[1]}` : null;
    },
  },
  thinglink: {
    label: 'ThingLink',
    resolve: (url) => {
      if (!hostIs(url, 'thinglink.com')) return null;
      const match = url.pathname.match(/\/(?:scene|card)\/(\d{6,25})/);
      return match ? `https://www.thinglink.com/card/${match[1]}` : null;
    },
  },
};

export const EMBED_PROVIDER_NAMES = Object.keys(EMBED_PROVIDERS) as EmbedProvider[];

export interface ResolvedEmbed {
  provider: EmbedProvider;
  embedUrl: string;
}

/** Detecta el proveedor de una URL y devuelve su direccion de incrustacion. */
export function resolveEmbed(rawUrl: string): ResolvedEmbed | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  // Sin https no hay incrustacion: el navegador la bloquearia en una pagina segura.
  if (url.protocol !== 'https:') return null;

  for (const name of EMBED_PROVIDER_NAMES) {
    const embedUrl = EMBED_PROVIDERS[name].resolve(url);
    if (embedUrl) return { provider: name, embedUrl };
  }
  return null;
}
