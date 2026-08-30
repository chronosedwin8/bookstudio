/**
 * Limitador de peticiones por clave (normalmente la IP), en memoria.
 *
 * Se usa en formularios publicos. La ventana es generosa a proposito: en un colegio
 * todo el personal sale por la misma IP publica, asi que un tope estrecho bloquearia
 * a gente legitima antes que a un robot.
 *
 * Al vivir en memoria no sobrevive a un reinicio ni se comparte entre procesos; para
 * un despliegue con varias instancias haria falta Redis o similar.
 */
export interface RateLimiter {
  /** Registra un intento y dice si se ha pasado del tope. */
  hit: (key: string) => boolean;
  /** Intentos restantes en la ventana actual. */
  remaining: (key: string) => number;
  reset: (key?: string) => void;
}

export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const seen = new Map<string, number[]>();

  /** Descarta los intentos que ya salieron de la ventana. */
  function current(key: string, now: number): number[] {
    const times = (seen.get(key) ?? []).filter((at) => now - at < windowMs);
    if (times.length) seen.set(key, times);
    else seen.delete(key);
    return times;
  }

  return {
    hit(key) {
      const now = Date.now();
      const times = current(key, now);
      times.push(now);
      seen.set(key, times);

      // Limpieza perezosa: sin esto el mapa crece con cada IP que pase por aqui.
      if (seen.size > 5000) {
        for (const [other] of seen) current(other, now);
      }

      return times.length > max;
    },

    remaining(key) {
      return Math.max(0, max - current(key, Date.now()).length);
    },

    reset(key) {
      if (key) seen.delete(key);
      else seen.clear();
    },
  };
}
