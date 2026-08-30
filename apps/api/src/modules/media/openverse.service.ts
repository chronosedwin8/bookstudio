import { HttpError } from '../../lib/http-error.js';

const OPENVERSE_BASE = 'https://api.openverse.org/v1';
const REQUEST_TIMEOUT_MS = 12_000;

/** Solo licencias que permiten uso comercial y modificacion, mas dominio publico. */
const ALLOWED_LICENCES = 'cc0,pdm,by,by-sa';

/** Openverse responde 401 si un cliente anonimo pide mas de 20 resultados por pagina. */
export const MAX_ANONYMOUS_PAGE_SIZE = 20;

export interface MediaResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  creator: string;
  creatorUrl: string | null;
  licence: string;
  licenceUrl: string | null;
  sourceUrl: string | null;
  provider: string;
  width: number | null;
  height: number | null;
  /** Texto listo para insertar como caja de atribucion en el lienzo. */
  attributionText: string;
}

interface OpenverseItem {
  id: string;
  title?: string;
  url: string;
  thumbnail?: string;
  creator?: string;
  creator_url?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  provider?: string;
  width?: number;
  height?: number;
}

function buildAttribution(item: OpenverseItem): string {
  const title = item.title?.trim() || 'Sin titulo';
  const creator = item.creator?.trim() || 'Autor desconocido';
  const licence = [item.license?.toUpperCase(), item.license_version].filter(Boolean).join(' ');
  return `"${title}" de ${creator}, licencia ${licence || 'Creative Commons'}.`;
}

function toMediaResult(item: OpenverseItem): MediaResult {
  return {
    id: item.id,
    title: item.title?.trim() || 'Sin titulo',
    url: item.url,
    thumbnail: item.thumbnail || item.url,
    creator: item.creator?.trim() || 'Autor desconocido',
    creatorUrl: item.creator_url ?? null,
    licence: [item.license?.toUpperCase(), item.license_version].filter(Boolean).join(' '),
    licenceUrl: item.license_url ?? null,
    sourceUrl: item.foreign_landing_url ?? null,
    provider: item.provider ?? 'openverse',
    width: item.width ?? null,
    height: item.height ?? null,
    attributionText: buildAttribution(item),
  };
}

export interface SearchOptions {
  query: string;
  type: 'images' | 'audio';
  page: number;
  pageSize: number;
  /** Filtra por formato de archivo; 'gif' devuelve solo imagenes animadas. */
  extension?: string;
}

export interface SearchResponse {
  results: MediaResult[];
  page: number;
  pageCount: number;
  resultCount: number;
}

async function fetchOnce(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'BookStudio/0.1 (educational)' },
    signal,
  });
}

export async function search({ query, type, page, pageSize, extension }: SearchOptions): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    page_size: String(Math.min(pageSize, MAX_ANONYMOUS_PAGE_SIZE)),
    license: ALLOWED_LICENCES,
    mature: 'false',
  });
  // Las imagenes animadas son GIF con licencia Creative Commons del propio catalogo.
  if (extension) params.set('extension', extension);
  const url = `${OPENVERSE_BASE}/${type}/?${params}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response = await fetchOnce(url, controller.signal);

    // Openverse devuelve 401/429 esporadicos al trafico anonimo; un reintento suele bastar.
    if (response.status === 401 || response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      response = await fetchOnce(url, controller.signal);
    }

    if (response.status === 401 || response.status === 429) {
      throw new HttpError(
        503,
        'Openverse esta limitando las busquedas ahora mismo. Intenta de nuevo en unos segundos.',
        'UPSTREAM_THROTTLED',
      );
    }
    if (!response.ok) {
      throw new HttpError(502, `Openverse respondio ${response.status}`, 'UPSTREAM_ERROR');
    }

    const data = (await response.json()) as {
      result_count?: number;
      page_count?: number;
      results?: OpenverseItem[];
    };

    return {
      results: (data.results ?? []).filter((item) => item.url).map(toMediaResult),
      page,
      pageCount: data.page_count ?? 1,
      resultCount: data.result_count ?? 0,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, 'La busqueda en Openverse tardo demasiado', 'UPSTREAM_TIMEOUT');
    }
    throw new HttpError(502, 'No se pudo contactar con Openverse', 'UPSTREAM_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}
