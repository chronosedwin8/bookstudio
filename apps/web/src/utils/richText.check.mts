/**
 * Comprobacion de las funciones de contenido con formato que no necesitan un DOM.
 *   npx tsx apps/web/src/utils/richText.check.mts
 *
 * `domABloques` y `bloquesADom` no se prueban aqui: leen y construyen nodos de
 * verdad, y probarlos contra un DOM simulado seria comprobar el simulador. Se
 * prueban en Chrome, en el guion de verificacion, contra el modulo real.
 */
import { bloquesATexto, contarImagenes, contarIncrustados, enlaceValido, longitudVisible } from './richText.js';
import type { RichBlock } from '@/types/api';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

// --- Direcciones ---
check('https vale', enlaceValido('https://ejemplo.org') === 'https://ejemplo.org');
check('http vale', enlaceValido('http://ejemplo.org') === 'http://ejemplo.org');
check('una ruta del propio sitio vale', enlaceValido('/media/a.png') === '/media/a.png');
check('javascript: no vale', enlaceValido('javascript:alert(1)') === null);
check('data: no vale', enlaceValido('data:text/html,<script>') === null);
check('con espacios delante sigue valiendo', enlaceValido('  https://ejemplo.org  ') === 'https://ejemplo.org');
check('las mayusculas no lo cuelan', enlaceValido('JavaScript:alert(1)') === null);
check('vacio no vale', enlaceValido('   ') === null);

// --- Texto plano y medidas ---
const contenido: RichBlock[] = [
  { type: 'heading', spans: [{ text: 'El roble' }] },
  { type: 'paragraph', spans: [{ text: 'Arbol de ' }, { text: 'hoja caduca', bold: true }] },
  { type: 'list', ordered: false, items: [[{ text: 'Vive 500 anos' }], [{ text: 'Hasta 40 m' }]] },
  { type: 'image', url: 'https://x/a.png', alt: 'Un roble', caption: 'En otono' },
];

check(
  'el texto plano junta los trozos de cada linea',
  bloquesATexto(contenido).split('\n')[1] === 'Arbol de hoja caduca',
  JSON.stringify(bloquesATexto(contenido)),
);
check('las lineas de lista se marcan', bloquesATexto(contenido).includes('• Vive 500 anos'));
check('el pie de la imagen entra en el texto plano', bloquesATexto(contenido).includes('En otono'));
check('la descripcion alternativa NO entra', !bloquesATexto(contenido).includes('Un roble'));

check(
  'la longitud cuenta parrafos, titulos, listas y pies',
  longitudVisible(contenido) === 'El roble'.length + 'Arbol de hoja caduca'.length +
    'Vive 500 anos'.length + 'Hasta 40 m'.length + 'En otono'.length,
  String(longitudVisible(contenido)),
);
check('las imagenes se cuentan', contarImagenes(contenido) === 1);
check('los incrustados se cuentan aparte', contarIncrustados(contenido) === 0);
check(
  'y se cuentan cuando los hay',
  contarIncrustados([
    ...contenido,
    { type: 'embed', sourceUrl: 'https://youtu.be/dQw4w9WgXcQ', caption: '' },
  ]) === 1,
);
check(
  'el pie de un video cuenta como texto visible',
  longitudVisible([{ type: 'embed', sourceUrl: 'https://youtu.be/x', caption: 'Documental' }]) === 'Documental'.length,
);
check('sin bloques la longitud es cero', longitudVisible([]) === 0);
check('y el texto plano queda vacio', bloquesATexto([]) === '');

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
