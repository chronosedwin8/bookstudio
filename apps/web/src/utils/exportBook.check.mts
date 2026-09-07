/**
 * Comprobacion de la copia en HTML. Se ejecuta con:
 *   npx tsx apps/web/src/utils/exportBook.check.mts [ruta-donde-dejarla.html]
 *
 * Lo que se vigila aqui es el escapado. La copia se abre en un navegador fuera
 * de la plataforma, sin sus defensas, y el contenido de un globo lo teclea
 * cualquiera con permiso de edicion: si una comilla o un signo de menor se
 * colara sin escapar, ese texto dejaria de ser texto y pasaria a ser marcado.
 *
 * El contenido va doblemente escapado a proposito: primero al convertir los
 * bloques en marcado (cada texto pasa por escapeHtml) y otra vez al meter ese
 * marcado en un atributo. El navegador deshace una capa al leer el atributo y la
 * otra se queda, que es la que mantiene el texto como texto.
 */
import { writeFileSync } from 'node:fs';
import { bookToHtml } from './exportBook.js';
import type { BookDetail, CanvasElement, RichBlock } from '@/types/api';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const elemento = (extra: Partial<CanvasElement>): CanvasElement => ({
  id: 'e1',
  pageId: 'p1',
  type: 'text',
  zIndex: 0,
  transformMatrix: { x: 10, y: 10, width: 40, height: 15, angle: 0 },
  properties: { text: 'El roble' },
  isLocked: false,
  opacity: 1,
  interaction: null,
  animation: null,
  ...extra,
});

const libro = (elements: CanvasElement[]): BookDetail =>
  ({
    id: 'b1',
    title: 'Libro de prueba',
    layoutFormat: 'portrait',
    pages: [{ id: 'p1', bookId: 'b1', pageNumber: 1, backgroundColor: '#FFFFFF', backgroundPattern: null, elements }],
  }) as unknown as BookDetail;

const conInteraccion = (content: RichBlock[], extra: Record<string, unknown> = {}) =>
  bookToHtml(
    libro([
      elemento({
        interaction: {
          kind: 'popup', trigger: 'click', title: 'Quercus', text: 'Arbol de hoja caduca', content, ...extra,
        },
      }),
    ]),
  );

const parrafo = (texto: string, marcas: Partial<{ bold: boolean; href: string }> = {}): RichBlock =>
  ({ type: 'paragraph', spans: [{ text: texto, ...marcas }] });

// --- Lo basico viaja ---
const basico = conInteraccion([parrafo('Arbol de hoja caduca')]);
check('el elemento se marca como portador de informacion', basico.includes('class="el tiene-info"'));
check('el titulo viaja', basico.includes('data-info-titulo="Quercus"'));
check('y como se abre', basico.includes('data-info-abre="click"'));
check('el texto plano se conserva aparte', basico.includes('data-info-plano="Arbol de hoja caduca"'));
check('la copia lleva su propio globo y su ventana', basico.includes('id="globo"') && basico.includes('id="vent"'));

// --- El formato llega como formato ---
const conNegrita = conInteraccion([{ type: 'paragraph', spans: [{ text: 'Muy', bold: true }, { text: ' alto' }] }]);
check('la negrita se convierte en etiqueta', conNegrita.includes('&lt;b&gt;Muy&lt;/b&gt;'));

const conLista = conInteraccion([
  { type: 'heading', spans: [{ text: 'Caracteristicas' }] },
  { type: 'list', ordered: true, items: [[{ text: 'Hoja caduca' }]] },
]);
check('los titulos viajan', conLista.includes('&lt;h4&gt;Caracteristicas&lt;/h4&gt;'));
check('las listas numeradas tambien', conLista.includes('&lt;ol&gt;&lt;li&gt;Hoja caduca&lt;/li&gt;&lt;/ol&gt;'));

const conImagen = conInteraccion([{ type: 'image', url: 'https://ejemplo.org/a.png', alt: 'Un roble', caption: 'En otono' }]);
check('las imagenes del contenido viajan', conImagen.includes('src=&quot;https://ejemplo.org/a.png&quot;'));
check('con su pie', conImagen.includes('&lt;figcaption&gt;En otono&lt;/figcaption&gt;'));

// --- Un elemento sin nada no arrastra atributos vacios ---
const pelado = bookToHtml(libro([elemento({})]));
check('sin interaccion no se marca', !pelado.includes('class="el tiene-info"'));
check('ni se inventa el atributo', !pelado.includes(' data-info="'));

// --- Escapado: aqui es donde duele equivocarse ---
const travieso = conInteraccion([parrafo('<img src=x onerror=alert(1)> & "comillas"')]);
check('la etiqueta escrita por alguien no llega como etiqueta', !travieso.includes('<img src=x'));
check('llega escapada dos veces, que es lo correcto', travieso.includes('&amp;lt;img src=x'));
check('las comillas no cierran el atributo', !/data-info="[^"]*"[^ >]/.test(travieso));

const conScript = conInteraccion([parrafo('</div><script>alert(1)</script>')]);
check('un script escrito por alguien no se cuela', !conScript.includes('<script>alert(1)'));

const tituloTravieso = bookToHtml(
  libro([elemento({ interaction: { kind: 'popup', trigger: 'click', title: 'Comillas "dobles"', text: 'x' } })]),
);
check('un titulo con comillas no rompe su atributo', tituloTravieso.includes('data-info-titulo="Comillas &quot;dobles&quot;"'));

// --- Las direcciones pasan por el filtro ---
const enlaceMalo = conInteraccion([parrafo('Pulsa', { href: 'javascript:alert(1)' })]);
check('un enlace no navegable se descarta', !enlaceMalo.includes('javascript:alert'));
check('pero el texto se conserva', enlaceMalo.includes('Pulsa'));

const enlaceBueno = conInteraccion([parrafo('Ver mas', { href: 'https://ejemplo.org' })]);
check('un enlace normal viaja', enlaceBueno.includes('href=&quot;https://ejemplo.org&quot;'));
check('y se abre fuera', enlaceBueno.includes('rel=&quot;noopener noreferrer&quot;'));

const imagenMala = conInteraccion([{ type: 'image', url: 'javascript:alert(1)', alt: '', caption: '' }]);
check('una imagen con direccion rara no se pinta', !imagenMala.includes('javascript:alert'));

const cabeceraMala = conInteraccion([parrafo('Ficha')], { imageUrl: 'javascript:alert(1)' });
check('ni como imagen de cabecera', !cabeceraMala.includes(' data-info-img="'));

// --- El guion solo mete marcado propio ---
check(
  'el titulo del globo y de la ventana se ponen como texto',
  basico.includes('globoCab.textContent') && basico.includes('ventTit.textContent'),
);

// Se deja el documento a mano para poder abrirlo en un navegador de verdad.
const destino = process.argv[2];
if (destino) {
  writeFileSync(
    destino,
    bookToHtml(
      libro([
        elemento({
          interaction: {
            kind: 'tooltip', trigger: 'hover', title: 'El roble', text: 'Arbol de hoja caduca',
            content: [{ type: 'paragraph', spans: [{ text: 'Arbol de ' }, { text: 'hoja caduca', bold: true }] }],
          },
        }),
        elemento({
          id: 'e2',
          transformMatrix: { x: 10, y: 40, width: 40, height: 15, angle: 0 },
          properties: { text: 'Pulsa para la ficha' },
          interaction: {
            kind: 'popup', trigger: 'click', title: 'Ficha completa', text: 'Vive mas de 500 anos',
            content: [
              { type: 'heading', spans: [{ text: 'Caracteristicas' }] },
              { type: 'list', ordered: false, items: [[{ text: 'Vive ' }, { text: '500 anos', bold: true }]] },
              { type: 'paragraph', spans: [{ text: 'Con etiqueta escrita: <b>no</b> debe verse en negrita' }] },
            ],
          },
        }),
      ]),
    ),
    'utf8',
  );
  console.log(`\nDocumento de muestra en ${destino}`);
}

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
