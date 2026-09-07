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

// --- El globo y la ventana ---
const parrafo = (texto: string) => ({ type: 'paragraph' as const, spans: [{ text: texto }] });

check('un globo con texto corto vale', interactionSchema.safeParse({ kind: 'tooltip', text: 'Es un roble' }).success);
check(
  'el globo no admite una parrafada',
  !interactionSchema.safeParse({ kind: 'tooltip', text: 'a'.repeat(601) }).success,
);
check(
  'pero la ventana si',
  interactionSchema.safeParse({ kind: 'popup', text: 'a'.repeat(3000) }).success,
);
check(
  'el globo ya SI admite una imagen',
  interactionSchema.safeParse({ kind: 'tooltip', text: 'Corto', imageUrl: 'https://x/y.png' }).success,
);
check(
  'pero solo una',
  !interactionSchema.safeParse({
    kind: 'tooltip',
    text: 'Corto',
    imageUrl: 'https://x/y.png',
    content: [{ type: 'image', url: 'https://x/z.png' }],
  }).success,
);
check(
  'la ventana admite varias',
  interactionSchema.safeParse({
    kind: 'popup',
    text: 'Ficha',
    content: [
      { type: 'image', url: 'https://x/a.png' },
      { type: 'image', url: 'https://x/b.png' },
      { type: 'image', url: 'https://x/c.png' },
    ],
  }).success,
);
check(
  'una imagen sola, sin texto, ya es contenido',
  interactionSchema.safeParse({ kind: 'tooltip', content: [{ type: 'image', url: 'https://x/y.png' }] }).success,
);
check('sin nada no hay interaccion', !interactionSchema.safeParse({ kind: 'popup', text: '' }).success);
check(
  'por omision se muestra al pasar el raton',
  interactionSchema.safeParse({ kind: 'tooltip', text: 'Hola' }).data?.trigger === 'hover',
);
check('un tipo inventado se rechaza', !interactionSchema.safeParse({ kind: 'globo', text: 'Hola' }).success);

// --- El contenido con formato ---
check(
  'un parrafo con negrita y cursiva vale',
  interactionSchema.safeParse({
    kind: 'popup',
    text: 'Hola mundo',
    content: [{ type: 'paragraph', spans: [{ text: 'Hola ', bold: true }, { text: 'mundo', italic: true }] }],
  }).success,
);
check(
  'los titulos y las listas valen',
  interactionSchema.safeParse({
    kind: 'popup',
    text: 'Ficha',
    content: [
      { type: 'heading', spans: [{ text: 'Caracteristicas' }] },
      { type: 'list', ordered: true, items: [[{ text: 'Hoja caduca' }], [{ text: 'Vive 500 anos' }]] },
    ],
  }).success,
);
check(
  'un bloque inventado se rechaza',
  !interactionSchema.safeParse({
    kind: 'popup', text: 'x', content: [{ type: 'video', url: 'https://x/y.mp4' }],
  }).success,
);
check(
  'un enlace normal vale',
  interactionSchema.safeParse({
    kind: 'popup', text: 'x',
    content: [{ type: 'paragraph', spans: [{ text: 'Ver mas', href: 'https://ejemplo.org' }] }],
  }).success,
);
check(
  'un enlace que no se navega se rechaza',
  !interactionSchema.safeParse({
    kind: 'popup', text: 'x',
    content: [{ type: 'paragraph', spans: [{ text: 'Pulsa', href: 'javascript:alert(1)' }] }],
  }).success,
);
check(
  'una imagen con direccion rara se rechaza',
  !interactionSchema.safeParse({
    kind: 'popup', text: 'x', content: [{ type: 'image', url: 'javascript:alert(1)' }],
  }).success,
);
check(
  'el tope del globo cuenta el contenido, no solo el texto plano',
  !interactionSchema.safeParse({
    kind: 'tooltip', text: 'corto', content: [parrafo('a'.repeat(601))],
  }).success,
);
check(
  'y la ventana deja pasar lo que al globo no',
  interactionSchema.safeParse({
    kind: 'popup', text: 'corto', content: [parrafo('a'.repeat(601))],
  }).success,
);
check(
  'demasiados bloques en un globo se rechazan',
  !interactionSchema.safeParse({
    kind: 'tooltip', text: 'x', content: Array.from({ length: 9 }, () => parrafo('hola')),
  }).success,
);

// --- Videos y contenido incrustado ---
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const conVideo = interactionSchema.safeParse({
  kind: 'popup', text: 'Ficha',
  content: [{ type: 'embed', sourceUrl: VIDEO, caption: 'El ciclo del agua' }],
});
check('una ventana admite un video', conVideo.success, JSON.stringify(conVideo.error?.issues?.[0]));
check(
  'la direccion de incrustacion la pone el servidor, no quien escribe',
  (conVideo.data?.content?.[0] as { embedUrl?: string })?.embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  JSON.stringify(conVideo.data?.content?.[0]),
);
check(
  'y tambien el proveedor',
  (conVideo.data?.content?.[0] as { provider?: string })?.provider === 'youtube',
);
check(
  'una direccion de incrustacion enviada a mano se ignora',
  (interactionSchema.safeParse({
    kind: 'popup', text: 'x',
    content: [{ type: 'embed', sourceUrl: VIDEO, provider: 'inventado', embedUrl: 'https://malo.example/incrustar' }],
  }).data?.content?.[0] as { embedUrl?: string })?.embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
);
check(
  'un proveedor que no esta en la lista se rechaza',
  !interactionSchema.safeParse({
    kind: 'popup', text: 'x', content: [{ type: 'embed', sourceUrl: 'https://malo.example/video/1' }],
  }).success,
);
check(
  'sin https no hay incrustacion',
  !interactionSchema.safeParse({
    kind: 'popup', text: 'x', content: [{ type: 'embed', sourceUrl: 'http://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
  }).success,
);
check(
  'un dominio que solo se le parece no cuela',
  !interactionSchema.safeParse({
    kind: 'popup', text: 'x', content: [{ type: 'embed', sourceUrl: 'https://youtube.com.malo.net/watch?v=dQw4w9WgXcQ' }],
  }).success,
);
check(
  'el globo NO admite videos',
  !interactionSchema.safeParse({
    kind: 'tooltip', text: 'x', content: [{ type: 'embed', sourceUrl: VIDEO }],
  }).success,
);
check(
  'una ventana con cinco videos se rechaza',
  !interactionSchema.safeParse({
    kind: 'popup', text: 'x',
    content: Array.from({ length: 5 }, () => ({ type: 'embed' as const, sourceUrl: VIDEO })),
  }).success,
);
check(
  'con cuatro si vale',
  interactionSchema.safeParse({
    kind: 'popup', text: 'x',
    content: Array.from({ length: 4 }, () => ({ type: 'embed' as const, sourceUrl: VIDEO })),
  }).success,
);
check(
  'un video mezclado con texto e imagenes vale',
  interactionSchema.safeParse({
    kind: 'popup', text: 'Ficha',
    content: [
      { type: 'heading', spans: [{ text: 'El agua' }] },
      { type: 'embed', sourceUrl: 'https://vimeo.com/123456789', caption: 'Documental' },
      { type: 'image', url: 'https://x/a.png' },
    ],
  }).success,
);
check(
  'un video solo, sin texto, ya es contenido',
  interactionSchema.safeParse({ kind: 'popup', content: [{ type: 'embed', sourceUrl: VIDEO }] }).success,
);

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
