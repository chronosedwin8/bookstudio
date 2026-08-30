import { HttpError } from '../../lib/http-error.js';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const REQUEST_TIMEOUT_MS = 10_000;

export interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
  type: string;
}

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
}

/**
 * Proxy de Nominatim. Centralizarlo en el backend permite cumplir su politica de uso
 * (User-Agent identificable) y evita exponer la IP de cada alumno al servicio.
 */
export async function geocode(query: string, limit: number): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(limit),
    addressdetails: '0',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BookStudio/0.1 (educational; open source book creator)',
      },
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw new HttpError(429, 'Nominatim limito las peticiones, intenta en unos segundos', 'RATE_LIMITED');
    }
    if (!response.ok) {
      throw new HttpError(502, `Nominatim respondio ${response.status}`, 'UPSTREAM_ERROR');
    }

    const data = (await response.json()) as NominatimItem[];

    return data
      .filter((item) => Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
      .map((item) => ({
        displayName: item.display_name,
        latitude: Number(item.lat),
        longitude: Number(item.lon),
        type: item.type ?? item.class ?? 'place',
      }));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(504, 'La busqueda de lugares tardo demasiado', 'UPSTREAM_TIMEOUT');
    }
    throw new HttpError(502, 'No se pudo contactar con el servicio de mapas', 'UPSTREAM_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}
