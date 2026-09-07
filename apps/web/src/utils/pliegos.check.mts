/**
 * Comprobacion del reparto de paginas. Se ejecuta con:
 *   npx tsx apps/web/src/utils/pliegos.check.mts
 *
 * Es aritmetica de indices con dos casos raros que se cuelan solos: la portada,
 * que va sola a la derecha, y el libro que acaba en impar, cuyo ultimo pliego
 * tiene la derecha vacia. Un error de uno en uno aqui no rompe nada visible: solo
 * hace que el libro salte una pagina o repita otra, que es peor que un fallo.
 */
import { construirVistas, paginaDe, vistaDe } from './pliegos.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const resumir = (total: number) =>
  construirVistas(total, true)
    .map((v) => `${v.izquierda ?? '_'}|${v.derecha ?? '_'}`)
    .join(' ');

// --- Reparto a doble pagina ---
check('un libro vacio no da vistas', construirVistas(0, true).length === 0);
check('una sola pagina es la portada sola', resumir(1) === '_|0', resumir(1));
check('dos paginas: portada y una suelta', resumir(2) === '_|0 1|_', resumir(2));
check('tres paginas: portada y un pliego', resumir(3) === '_|0 1|2', resumir(3));
check('cuatro: el ultimo pliego queda a medias', resumir(4) === '_|0 1|2 3|_', resumir(4));
check('cinco: dos pliegos completos', resumir(5) === '_|0 1|2 3|4', resumir(5));
check('seis paginas', resumir(6) === '_|0 1|2 3|4 5|_', resumir(6));

check(
  'ninguna pagina se pierde ni se repite',
  [1, 2, 3, 4, 5, 6, 7, 12, 41].every((total) => {
    const vistas = construirVistas(total, true);
    const vistas_planas = vistas.flatMap((v) => [v.izquierda, v.derecha]).filter((p) => p !== null);
    return (
      vistas_planas.length === total &&
      new Set(vistas_planas).size === total &&
      vistas_planas.every((p, i) => p === i)
    );
  }),
);

// --- Pagina unica ---
const sueltas = construirVistas(4, false);
check('sin doble pagina, una vista por pagina', sueltas.length === 4);
check('y siempre a la derecha', sueltas.every((v) => v.izquierda === null));
check('en orden', sueltas.every((v, i) => v.derecha === i));

// --- Localizar una pagina ---
const vistas = construirVistas(6, true); // _|0  1|2  3|4  5|_
check('la portada esta en la primera vista', vistaDe(vistas, 0) === 0);
check('la pagina 1 abre el segundo pliego', vistaDe(vistas, 1) === 1);
check('la pagina 2 comparte pliego con la 1', vistaDe(vistas, 2) === 1);
check('la pagina 5 esta en el ultimo', vistaDe(vistas, 5) === 3, String(vistaDe(vistas, 5)));
check('una pagina que no existe no rompe nada', vistaDe(vistas, 99) === 0);

// --- Que pagina queda abierta ---
check('en la portada, la 0', paginaDe(vistas[0]) === 0);
check('en un pliego manda la izquierda', paginaDe(vistas[1]) === 1);
check('en el ultimo pliego a medias, la izquierda', paginaDe(vistas[3]) === 5);
check('una vista inexistente cae en la 0', paginaDe(undefined) === 0);

// Ida y vuelta: abrir por la pagina que devuelve paginaDe debe volver a esa vista.
check(
  'localizar y abrir son consistentes',
  vistas.every((v, i) => vistaDe(vistas, paginaDe(v)) === i),
);

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
