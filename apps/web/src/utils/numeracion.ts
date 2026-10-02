import type { PageNumbering } from '@/types/api';

/**
 * Numeracion de paginas.
 *
 * Es un ajuste del libro: se define una vez y cada hoja pinta su numero encima de
 * su contenido. Todo lo que decide que numero y donde vive aqui, sin Vue, para
 * que el lector, el editor, la impresion y la pagina web exportada digan lo mismo.
 *
 * Las posiciones van en % de la hoja y los tamanos en px del lienzo logico de
 * 1000 de ancho, como el resto de elementos: asi escalan igual en una miniatura
 * que a pantalla completa.
 */

export const NUMERACION_POR_DEFECTO: PageNumbering = {
  format: 'numero',
  position: 'abajo-centro',
  margin: 4,
  fontFamily: 'Lato',
  fontSize: 22,
  color: '#334155',
  bold: false,
  decoration: 'ninguno',
  accentColor: '#E2E8F0',
  skipCover: true,
  startAt: 2,
};

export const FORMATOS: Array<{ id: PageNumbering['format']; ejemplo: string }> = [
  { id: 'numero', ejemplo: '7' },
  { id: 'pagina', ejemplo: 'Página 7' },
  { id: 'pag', ejemplo: 'Pág. 7' },
  { id: 'de-total', ejemplo: '7 de 20' },
  { id: 'guiones', ejemplo: '— 7 —' },
  { id: 'romano', ejemplo: 'vii' },
  { id: 'romano-mayus', ejemplo: 'VII' },
];

export const POSICIONES: Array<{ id: PageNumbering['position']; texto: string }> = [
  { id: 'arriba-izquierda', texto: 'Arriba a la izquierda' },
  { id: 'arriba-centro', texto: 'Arriba en el centro' },
  { id: 'arriba-derecha', texto: 'Arriba a la derecha' },
  { id: 'abajo-izquierda', texto: 'Abajo a la izquierda' },
  { id: 'abajo-centro', texto: 'Abajo en el centro' },
  { id: 'abajo-derecha', texto: 'Abajo a la derecha' },
  { id: 'exterior-arriba', texto: 'Arriba, en el borde exterior' },
  { id: 'exterior-abajo', texto: 'Abajo, en el borde exterior' },
];

export const DECORACIONES: Array<{ id: PageNumbering['decoration']; texto: string }> = [
  { id: 'ninguno', texto: 'Solo el número' },
  { id: 'circulo', texto: 'En un círculo' },
  { id: 'pastilla', texto: 'En una pastilla' },
  { id: 'linea', texto: 'Con una raya encima' },
];

/** Lo guardado puede venir de una version anterior: se completa con lo de serie. */
export function normalizarNumeracion(valor: Partial<PageNumbering> | null | undefined): PageNumbering | null {
  if (!valor) return null;
  return { ...NUMERACION_POR_DEFECTO, ...valor };
}

const ROMANOS: Array<[number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

/** En romanos no hay cero; se deja la cifra arabiga en ese caso, y por encima de 3999. */
export function aRomano(n: number): string {
  if (n <= 0 || n > 3999) return String(n);
  let resto = n;
  let texto = '';
  for (const [valor, letras] of ROMANOS) {
    while (resto >= valor) {
      texto += letras;
      resto -= valor;
    }
  }
  return texto;
}

/**
 * El numero que lleva una hoja, o null si no lleva ninguno.
 *
 * `pageNumber` es el numero real de la hoja (la portada es la 1) y `total` el de
 * hojas del libro. El ultimo numero de "7 de 20" es el ultimo que se imprime, no
 * el total de hojas: si la portada no se numera, un libro de 20 hojas acaba en 19
 * cuando se empieza en el 1.
 */
export function numeroDeHoja(cfg: PageNumbering, pageNumber: number, total: number): string | null {
  if (cfg.skipCover && pageNumber === 1) return null;
  const primera = cfg.skipCover ? 2 : 1;
  const n = pageNumber - primera + cfg.startAt;
  const ultimo = total - primera + cfg.startAt;
  switch (cfg.format) {
    case 'pagina':
      return `Página ${n}`;
    case 'pag':
      return `Pág. ${n}`;
    case 'de-total':
      return `${n} de ${ultimo}`;
    case 'guiones':
      return `— ${n} —`;
    case 'romano':
      return aRomano(n);
    case 'romano-mayus':
      return aRomano(n).toUpperCase();
    default:
      return String(n);
  }
}

/**
 * Lado en el que cae el numero. "Exterior" es el borde de fuera del libro
 * abierto: las pares van a la izquierda y las impares a la derecha, que es como
 * se ven en el lector a doble pagina (la portada sola, luego 2-3, 4-5...).
 */
export function ladoDeHoja(cfg: PageNumbering, pageNumber: number): 'izquierda' | 'centro' | 'derecha' {
  if (cfg.position.startsWith('exterior')) return pageNumber % 2 === 0 ? 'izquierda' : 'derecha';
  if (cfg.position.endsWith('izquierda')) return 'izquierda';
  if (cfg.position.endsWith('derecha')) return 'derecha';
  return 'centro';
}

/**
 * Estilo del numero, como pares propiedad-valor de CSS, para un elemento
 * posicionado en absoluto dentro de la hoja. Sirve a Vue (`:style`) y a la
 * pagina exportada (atributo style).
 */
export function estiloNumero(cfg: PageNumbering, pageNumber: number): Record<string, string> {
  const lado = ladoDeHoja(cfg, pageNumber);
  const arriba = cfg.position.includes('arriba');
  const m = `${cfg.margin}%`;
  const estilo: Record<string, string> = {
    position: 'absolute',
    [arriba ? 'top' : 'bottom']: m,
    'font-family': `'${cfg.fontFamily.replace(/'/g, '')}', sans-serif`,
    'font-size': `${cfg.fontSize}px`,
    'font-weight': cfg.bold ? '700' : '400',
    color: cfg.color,
    'line-height': '1.2',
    'white-space': 'nowrap',
    'pointer-events': 'none',
    'z-index': '100000',
  };
  if (lado === 'izquierda') estilo.left = m;
  else if (lado === 'derecha') estilo.right = m;
  else {
    estilo.left = '50%';
    estilo.transform = 'translateX(-50%)';
  }

  if (cfg.decoration === 'circulo') {
    const diametro = `${Math.round(cfg.fontSize * 2)}px`;
    Object.assign(estilo, {
      display: 'grid',
      'place-items': 'center',
      'min-width': diametro,
      height: diametro,
      padding: `0 ${Math.round(cfg.fontSize * 0.4)}px`,
      'border-radius': '9999px',
      'background-color': cfg.accentColor,
    });
  } else if (cfg.decoration === 'pastilla') {
    Object.assign(estilo, {
      padding: `${Math.round(cfg.fontSize * 0.25)}px ${Math.round(cfg.fontSize * 0.75)}px`,
      'border-radius': '9999px',
      'background-color': cfg.accentColor,
    });
  } else if (cfg.decoration === 'linea') {
    Object.assign(estilo, {
      'padding-top': `${Math.round(cfg.fontSize * 0.3)}px`,
      'border-top': `${Math.max(1, Math.round(cfg.fontSize / 10))}px solid ${cfg.accentColor}`,
      'min-width': `${Math.round(cfg.fontSize * 3)}px`,
      'text-align': 'center',
    });
  }
  return estilo;
}

/** El mismo estilo, en una cadena para el atributo style de la pagina exportada. */
export function estiloNumeroEnLinea(cfg: PageNumbering, pageNumber: number): string {
  return Object.entries(estiloNumero(cfg, pageNumber))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}
