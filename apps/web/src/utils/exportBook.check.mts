/**
 * Comprobacion de la copia en HTML. Se ejecuta con:
 *   npx tsx apps/web/src/utils/exportBook.check.mts [ruta-donde-dejarla.html]
 *
 * Lo que se vigila aqui es el escapado. La copia se abre en un navegador fuera
 * de la plataforma, sin sus defensas, y el texto de un globo lo teclea cualquiera
 * con permiso de edicion: si una comilla se colara sin escapar, ese texto dejaria
 * de ser texto y pasaria a ser marcado.
 */
import { writeFileSync } from 'node:fs';
import { bookToHtml } from './exportBook.js';
import type { BookDetail, CanvasElement } from '@/types/api';

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

// --- El globo viaja ---
const conGlobo = bookToHtml(
  libro([
    elemento({
      interaction: { kind: 'tooltip', trigger: 'hover', title: 'Quercus', text: 'Arbol de hoja caduca' },
    }),
  ]),
);
check('el elemento se marca como portador de informacion', conGlobo.includes('class="el tiene-info"'));
check('el texto del globo viaja en el atributo', conGlobo.includes('data-info="Arbol de hoja caduca"'));
check('el titulo tambien', conGlobo.includes('data-info-titulo="Quercus"'));
check('y como se abre', conGlobo.includes('data-info-abre="hover"'));
check('la copia lleva su propio globo', conGlobo.includes('id="globo"'));

// --- Un elemento sin nada no arrastra atributos vacios ---
const pelado = bookToHtml(libro([elemento({})]));
check('sin interaccion no se marca', !pelado.includes('class="el tiene-info"'));
check('ni se inventa el atributo', !pelado.includes(' data-info="'));

// --- Escapado: aqui es donde duele equivocarse ---
const travieso = bookToHtml(
  libro([
    elemento({
      interaction: {
        kind: 'popup',
        trigger: 'click',
        title: 'Comillas "dobles"',
        text: '<img src=x onerror=alert(1)> & "comillas"',
      },
    }),
  ]),
);
check('la etiqueta del texto queda escapada', !travieso.includes('<img src=x'));
check('y se ve como texto', travieso.includes('&lt;img src=x'));
check('las comillas no cierran el atributo', !travieso.includes('title="Comillas "dobles""'));
check('el ampersand se escapa', travieso.includes('&amp;'));

// --- La imagen de la ventana pasa por el filtro de direcciones ---
const conImagen = bookToHtml(
  libro([
    elemento({
      interaction: { kind: 'popup', trigger: 'hover', title: '', text: 'Ficha', imageUrl: 'https://ejemplo.org/a.png' },
    }),
  ]),
);
check('una imagen normal viaja', conImagen.includes('data-info-img="https://ejemplo.org/a.png"'));

const conVeneno = bookToHtml(
  libro([
    elemento({
      // eslint-disable-next-line no-script-url
      interaction: { kind: 'popup', trigger: 'hover', title: '', text: 'Ficha', imageUrl: 'javascript:alert(1)' },
    }),
  ]),
);
check('una direccion no navegable se descarta', !conVeneno.includes(' data-info-img="'));

// --- El guion escribe con textContent, nunca con innerHTML ---
check(
  'la copia no monta el texto como marcado',
  !/globo\.innerHTML|ventTxt\.innerHTML|ventTit\.innerHTML/.test(conGlobo),
);

// Se deja el documento a mano para poder abrirlo en un navegador de verdad.
const destino = process.argv[2];
if (destino) {
  writeFileSync(
    destino,
    bookToHtml(
      libro([
        elemento({
          interaction: { kind: 'tooltip', trigger: 'hover', title: 'El roble', text: 'Arbol de hoja caduca' },
        }),
        elemento({
          id: 'e2',
          transformMatrix: { x: 10, y: 40, width: 40, height: 15, angle: 0 },
          properties: { text: 'Pulsa para la ficha' },
          interaction: { kind: 'popup', trigger: 'click', title: 'Ficha completa', text: 'Vive mas de 500 anos' },
        }),
      ]),
    ),
    'utf8',
  );
  console.log(`\nDocumento de muestra en ${destino}`);
}

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
