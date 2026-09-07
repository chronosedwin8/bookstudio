/**
 * Comprobacion de la interactividad y la animacion. Se ejecuta con:
 *   npx tsx apps/api/src/modules/canvas/interactividad.check.mts
 *
 * Se prueban aqui las reglas que un formulario no puede garantizar: que un globo
 * de ayuda no admita una parrafada ni una imagen, y que un elemento no lleve a la
 * vez un enlace y una ventana al pulsar, porque el clic es uno solo. Sin esto,
 * ninguna de las tres se rompe de forma visible: simplemente el libro hace algo
 * distinto de lo que su autor creia haber montado.
 */
import { createElementSchema, interactionSchema, animationSchema } from './canvas.schemas.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const marco = { x: 10, y: 10, width: 30, height: 20, angle: 0 };
const texto = { text: 'Hola' };

const elemento = (extra: Record<string, unknown>) =>
  createElementSchema.safeParse({ type: 'text', transformMatrix: marco, properties: texto, ...extra });

// --- El globo de ayuda ---
check('un globo con texto corto vale', interactionSchema.safeParse({ kind: 'tooltip', text: 'Es un roble' }).success);
check(
  'el globo no admite una parrafada',
  !interactionSchema.safeParse({ kind: 'tooltip', text: 'a'.repeat(301) }).success,
);
check(
  'pero la ventana si',
  interactionSchema.safeParse({ kind: 'popup', text: 'a'.repeat(3000) }).success,
);
check(
  'el globo no admite imagen',
  !interactionSchema.safeParse({ kind: 'tooltip', text: 'Corto', imageUrl: 'https://x/y.png' }).success,
);
check(
  'la ventana si admite imagen',
  interactionSchema.safeParse({ kind: 'popup', text: 'Largo', imageUrl: 'https://x/y.png' }).success,
);
check('sin texto no hay nada que mostrar', !interactionSchema.safeParse({ kind: 'popup', text: '' }).success);
check(
  'por omision se muestra al pasar el raton',
  interactionSchema.safeParse({ kind: 'tooltip', text: 'Hola' }).data?.trigger === 'hover',
);
check('un tipo inventado se rechaza', !interactionSchema.safeParse({ kind: 'globo', text: 'Hola' }).success);

// --- El enlace y el clic no caben juntos ---
const conEnlace = { text: 'Hola', linkUrl: 'https://ejemplo.org' };
check(
  'enlace mas ventana al pulsar se rechaza',
  !createElementSchema.safeParse({
    type: 'text',
    transformMatrix: marco,
    properties: conEnlace,
    interaction: { kind: 'popup', trigger: 'click', text: 'Detalle' },
  }).success,
);
check(
  'enlace mas globo al pasar el raton si vale',
  createElementSchema.safeParse({
    type: 'text',
    transformMatrix: marco,
    properties: conEnlace,
    interaction: { kind: 'tooltip', trigger: 'hover', text: 'Detalle' },
  }).success,
);
check(
  'sin enlace, la ventana al pulsar vale',
  elemento({ interaction: { kind: 'popup', trigger: 'click', text: 'Detalle' } }).success,
);

// --- La animacion ---
check('una animacion basica vale', animationSchema.safeParse({ effect: 'fade' }).success);
check(
  'por omision entra al aparecer la pagina',
  animationSchema.safeParse({ effect: 'zoom' }).data?.trigger === 'entrance',
);
check('un efecto inventado se rechaza', !animationSchema.safeParse({ effect: 'explotar' }).success);
check(
  'una duracion absurda se rechaza',
  !animationSchema.safeParse({ effect: 'fade', duration: 90 }).success,
);
check(
  'una espera negativa se rechaza',
  !animationSchema.safeParse({ effect: 'fade', delay: -1 }).success,
);
check(
  'no hay animacion de salida',
  !animationSchema.safeParse({ effect: 'fade', trigger: 'exit' }).success,
);

// --- Convivencia con el elemento ---
check('un elemento puede llevar las dos cosas', elemento({
  interaction: { kind: 'tooltip', text: 'Aclaracion' },
  animation: { effect: 'bounce', trigger: 'hover' },
}).success);
check('y puede no llevar ninguna', elemento({}).success);
check('null las quita sin protestar', elemento({ interaction: null, animation: null }).success);

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
