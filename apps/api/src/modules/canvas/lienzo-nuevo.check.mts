/**
 * Comprobacion de lo nuevo del lienzo en el servidor. Se ejecuta con:
 *   npx tsx apps/api/src/modules/canvas/lienzo-nuevo.check.mts
 *
 * - El SVG que se admite al subir (vectorizar) no puede llevar nada ejecutable.
 * - Encuestas, recorte, marcos, texto en formas y efectos: el esquema acepta lo
 *   bueno, rechaza lo malo y no tira los campos nuevos.
 */
import { svgSeguro } from '../media/uploads.service.js';
import { parseProperties } from './canvas.schemas.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};
const svg = (t: string) => svgSeguro(Buffer.from(t, 'utf8'));
const acepta = (tipo: Parameters<typeof parseProperties>[0], p: unknown) => {
  try {
    return parseProperties(tipo, p) as Record<string, unknown>;
  } catch {
    return null;
  }
};

// --- SVG ---
check('el SVG de vectorizar pasa', svg('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="rgb(1,2,3)" d="M0 0 L10 10 Z"/></svg>'));
check('con cabecera xml tambien', svg('<?xml version="1.0"?><svg viewBox="0 0 1 1"></svg>'));
for (const [nombre, malo] of [
  ['script', '<svg><script>alert(1)</script></svg>'],
  ['manejador onload', '<svg onload="alert(1)"></svg>'],
  ['javascript:', '<svg><a href="javascript:alert(1)">x</a></svg>'],
  ['foreignObject', '<svg><foreignObject><div>x</div></foreignObject></svg>'],
  ['imagen de fuera', '<svg><image href="https://evil.example/x.png"/></svg>'],
  ['entidades', '<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'],
  ['url() externa', '<svg><rect style="fill:url(https://evil.example/a)"/></svg>'],
  ['no es SVG', '<html><body>hola</body></html>'],
]) {
  check(`SVG con ${nombre}: rechazado`, !svg(malo));
}
check('un enlace interno (#id) si vale', svg('<svg><use href="#a"/></svg>'));

// --- Encuestas y clave de pregunta ---
const encuesta = acepta('question', { kind: 'poll', prompt: '¿Qué prefieres?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], questionKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7' });
check('una encuesta vale sin respuesta correcta', encuesta !== null);
check('y conserva su clave', encuesta?.questionKey === '7c9e6679-7425-40de-944b-e07fc1f90ae7');
check('una encuesta con correcta: no', acepta('question', { kind: 'poll', options: [{ id: 'a', correct: true }, { id: 'b' }] }) === null);
check('una encuesta de una opción: no', acepta('question', { kind: 'poll', options: [{ id: 'a' }] }) === null);
check('la respuesta guardada del alumno ya no se pierde', acepta('question', { kind: 'open', studentAnswer: 'Mi texto' })?.studentAnswer === 'Mi texto');

// --- Recorte ---
check('recorte bueno', acepta('image', { fileUrl: '/storage/x.png', crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.5 } })?.crop !== undefined);
check('recorte que se sale: no', acepta('image', { fileUrl: '/storage/x.png', crop: { x: 0.8, y: 0, w: 0.5, h: 0.5 } }) === null);
check('sin recorte queda null', acepta('image', { fileUrl: '/storage/x.png' })?.crop === null);

// --- Marcos ---
check('marco vacío', acepta('frame', { frame: 'circulo' })?.fileUrl === '');
check('marco con foto y encuadre', acepta('frame', { frame: 'letra-a', fileUrl: 'https://a.example/x.jpg', zoom: 2, posX: 30 })?.zoom === 2);
check('marco con id raro: no', acepta('frame', { frame: '<script>' }) === null);

// --- Texto en formas y efectos ---
const forma = acepta('shape', { shape: 'nota-adhesiva', text: 'Hola', textSize: 11, textFont: 'Patrick Hand' });
check('nota adhesiva con texto', forma?.text === 'Hola' && forma?.textSize === 11);
check('efecto de texto', acepta('text', { text: 'x', effect: 'neon', effectColor: '#EC4899', fontFamily: 'Pacifico' })?.effect === 'neon');
check('efecto inventado: no', acepta('text', { text: 'x', effect: 'fuego' }) === null);

console.log(fallos ? `\n${fallos} fallo(s)` : '\nLienzo del servidor correcto.');
if (fallos) process.exit(1);
