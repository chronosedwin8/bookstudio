/**
 * Comprobacion de la numeracion de paginas. Se ejecuta con:
 *   npx tsx apps/web/src/utils/numeracion.check.mts
 *
 * Lo delicado es el desfase: saltarse la portada, empezar en otro numero y el
 * "de N" del final tienen que cuadrar, o el libro dice "Página 3" en la cuarta.
 */
import { aRomano, estiloNumero, ladoDeHoja, NUMERACION_POR_DEFECTO, numeroDeHoja } from './numeracion.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const cfg = (extra: Partial<typeof NUMERACION_POR_DEFECTO> = {}) => ({ ...NUMERACION_POR_DEFECTO, ...extra });

// --- Que numero lleva cada hoja ---
check('la portada no se numera por defecto', numeroDeHoja(cfg(), 1, 10) === null);
check('por defecto la hoja 2 dice 2', numeroDeHoja(cfg(), 2, 10) === '2');
check('por defecto la hoja 7 dice 7', numeroDeHoja(cfg(), 7, 10) === '7');
check('empezar en 1 tras la portada', numeroDeHoja(cfg({ startAt: 1 }), 2, 10) === '1');
check('numerar tambien la portada', numeroDeHoja(cfg({ skipCover: false, startAt: 1 }), 1, 10) === '1');

const deTotal = numeroDeHoja(cfg({ format: 'de-total', startAt: 1 }), 3, 20);
check('"de N" cuenta solo las numeradas', deTotal === '2 de 19', String(deTotal));
check('"de N" con la numeracion de serie', numeroDeHoja(cfg({ format: 'de-total' }), 20, 20) === '20 de 20');
check('formato Página', numeroDeHoja(cfg({ format: 'pagina' }), 4, 9) === 'Página 4');
check('formato Pág.', numeroDeHoja(cfg({ format: 'pag' }), 4, 9) === 'Pág. 4');
check('formato con guiones', numeroDeHoja(cfg({ format: 'guiones' }), 4, 9) === '— 4 —');
check('romanos en minuscula', numeroDeHoja(cfg({ format: 'romano' }), 4, 9) === 'iv');
check('romanos en mayuscula', numeroDeHoja(cfg({ format: 'romano-mayus' }), 9, 9) === 'IX');

// --- Romanos ---
const casos: Array<[number, string]> = [[1, 'i'], [4, 'iv'], [9, 'ix'], [14, 'xiv'], [40, 'xl'], [90, 'xc'], [1994, 'mcmxciv']];
for (const [n, esperado] of casos) check(`${n} en romanos`, aRomano(n) === esperado, aRomano(n));
check('el cero no tiene romano: se deja la cifra', aRomano(0) === '0');

// --- Donde cae ---
check('exterior: las pares a la izquierda', ladoDeHoja(cfg({ position: 'exterior-abajo' }), 2) === 'izquierda');
check('exterior: las impares a la derecha', ladoDeHoja(cfg({ position: 'exterior-abajo' }), 3) === 'derecha');
check('centro', ladoDeHoja(cfg(), 3) === 'centro');

const abajoCentro = estiloNumero(cfg(), 3);
check('abajo en el centro se centra con transform', abajoCentro.bottom === '4%' && abajoCentro.left === '50%' && Boolean(abajoCentro.transform));
const arribaDer = estiloNumero(cfg({ position: 'arriba-derecha', margin: 6 }), 3);
check('arriba a la derecha', arribaDer.top === '6%' && arribaDer.right === '6%' && !arribaDer.bottom);
check('no captura el puntero', abajoCentro['pointer-events'] === 'none');
check('el circulo lleva fondo', Boolean(estiloNumero(cfg({ decoration: 'circulo' }), 3)['background-color']));
check('la raya va encima', Boolean(estiloNumero(cfg({ decoration: 'linea' }), 3)['border-top']));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nNumeracion correcta.');
if (fallos) process.exit(1);
