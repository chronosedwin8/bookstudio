/**
 * Comprobacion de los estilos de texto, sus efectos y los marcos. Se ejecuta con:
 *   npx tsx apps/web/src/utils/lienzo.check.mts
 *
 * El servidor rechaza un texto con una fuente o un tamano que no admite: una
 * combinacion mal escrita aqui fallaria al insertarla, con el docente delante.
 */
import { FONT_FAMILIES } from '../types/api.js';
import { EFECTOS, estiloEfecto, estiloEfectoEnLinea } from './efectosTexto.js';
import { ESTILOS_BASICOS, ESTILOS_TEXTO } from './estilosTexto.js';
import { GRUPOS_MARCOS, MARCOS, cuerpoDe, marcoDe, mascaraUrl } from './marcos.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

// --- Estilos de texto ---
const fuentes = new Set<string>(FONT_FAMILIES);
const efectos = new Set(EFECTOS.map((e) => e.id));
const piezas = [...ESTILOS_BASICOS.map((b) => b.props), ...ESTILOS_TEXTO.flatMap((e) => e.piezas.map((p) => p.props))];
const malas = piezas.filter(
  (p) =>
    !fuentes.has(p.fontFamily) ||
    p.fontSize < 24 ||
    p.fontSize > 200 ||
    !Number.isInteger(p.fontSize) ||
    (p.effect && !efectos.has(p.effect)) ||
    (p.color && !/^#[0-9A-Fa-f]{6}$/.test(p.color)) ||
    (p.effectColor && !/^#[0-9A-Fa-f]{6}$/.test(p.effectColor)),
);
check(`los ${piezas.length} textos de los estilos los acepta el servidor`, malas.length === 0, JSON.stringify(malas.map((m) => m.text)));
check('ids de combinaciones sin repetir', new Set(ESTILOS_TEXTO.map((e) => e.id)).size === ESTILOS_TEXTO.length);
check('hay al menos 25 combinaciones', ESTILOS_TEXTO.length >= 25, String(ESTILOS_TEXTO.length));
check('título, subtítulo y texto', ESTILOS_BASICOS.map((b) => b.id).join() === 'titulo,subtitulo,texto');

// --- Efectos ---
check('sin efecto no hay estilo', Object.keys(estiloEfecto('ninguno', '#000000', '#111111')).length === 0);
check('el neón brilla en su color', (estiloEfecto('neon', '#EC4899', '#fff').textShadow ?? '').includes('#EC4899'));
check('el hueco vacía la letra y le pone contorno', estiloEfecto('hueco', undefined, '#1D4ED8').color === 'transparent' && (estiloEfecto('hueco', undefined, '#1D4ED8').WebkitTextStroke ?? '').includes('#1D4ED8'));
check('el efecto va en em (escala con la letra)', Object.values(estiloEfecto('elevado', '#000000', '#fff')).every((v) => !/\dpx/.test(v)));
check('en línea, con prefijo de navegador', estiloEfectoEnLinea('contorno', '#000000', '#fff').includes('-webkit-text-stroke'));
check('un color raro no entra', !JSON.stringify(estiloEfecto('sombra', 'red;background:url(x)', '#fff')).includes('url('));

// --- Marcos ---
check('ids de marcos sin repetir', new Set(MARCOS.map((m) => m.id)).size === MARCOS.length);
check('ids válidos para el servidor', MARCOS.every((m) => /^[a-z0-9-]{1,40}$/.test(m.id)));
check('grupos como los de Canva', ['Básicos', 'Película y foto', 'Dispositivos', 'Papel', 'Manchas', 'Letras', 'Números'].every((g) => GRUPOS_MARCOS.includes(g)));
check('26 letras y 10 números', MARCOS.filter((m) => m.grupo === 'Letras').length === 26 && MARCOS.filter((m) => m.grupo === 'Números').length === 10);
check('las áreas caben en la caja', MARCOS.every((m) => m.area.x >= 0 && m.area.y >= 0 && m.area.x + m.area.w <= 100 && m.area.y + m.area.h <= 100));
check('un marco desconocido no rompe', marcoDe('no-existe').id === 'cuadrado');
const m = mascaraUrl(marcoDe('estrella'))!;
check('la máscara es un data URL de SVG', m.startsWith('url("data:image/svg+xml;utf8,') && !m.includes('"', 6 + m.indexOf('url("') + 5) === false);
check('el color del cuerpo se valida', !cuerpoDe(marcoDe('movil'), '"><script>').includes('<script>'));

console.log(fallos ? `\n${fallos} fallo(s)` : '\nLienzo correcto.');
if (fallos) process.exit(1);
