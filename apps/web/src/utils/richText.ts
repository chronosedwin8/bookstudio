import type { RichBlock, RichSpan } from '@/types/api';

/**
 * Conversion entre lo que teclea una persona en un campo editable y el modelo de
 * bloques que se guarda.
 *
 * Va en las dos direcciones y ninguna pasa por una cadena de HTML:
 *
 *  - `domABloques` **lee** el DOM del campo editable y se queda solo con lo que
 *    reconoce. No es un saneador que quite lo malo, que es lo que se puede hacer
 *    mal: es un lector que solo copia lo bueno. Un `<script>`, un `onerror` o una
 *    etiqueta desconocida no se descartan, sencillamente no se leen.
 *  - `bloquesADom` **construye** nodos con `createElement` y `textContent`. No hay
 *    `innerHTML` en ninguna de las dos, asi que no hay punto donde una cadena se
 *    interprete como marcado.
 */

/**
 * Etiquetas cuyo texto NO es contenido y no debe leerse.
 *
 * Sin esto, pegar desde una web volcaba el codigo de un `<script>` o las reglas
 * de un `<style>` como si fueran parrafos. No era ejecutable (aqui nada se
 * convierte en marcado), pero salia a la vista del alumnado como un churro de
 * texto que nadie escribio.
 */
const NO_ES_CONTENIDO = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED']);

/** Etiquetas de linea que abren un bloque nuevo. */
const BLOQUES_DE_LINEA = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
const TITULOS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

interface Marcas {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  href?: string;
}

/** Solo se conservan las direcciones que un navegador puede abrir. */
export function enlaceValido(url: string): string | null {
  const limpia = url.trim();
  if (!limpia) return null;
  return /^https?:\/\//i.test(limpia) || limpia.startsWith('/') ? limpia : null;
}

function conMarca(nodo: Element, marcas: Marcas): Marcas {
  const siguiente: Marcas = { ...marcas };
  const etiqueta = nodo.tagName;
  const estilo = (nodo as HTMLElement).style;

  if (etiqueta === 'B' || etiqueta === 'STRONG') siguiente.bold = true;
  if (etiqueta === 'I' || etiqueta === 'EM') siguiente.italic = true;
  if (etiqueta === 'U') siguiente.underline = true;
  if (etiqueta === 'S' || etiqueta === 'STRIKE' || etiqueta === 'DEL') siguiente.strike = true;

  /*
   * El navegador no siempre usa etiquetas: segun el caso, `execCommand` deja el
   * formato como estilo en linea. Sin mirarlo, poner negrita a veces funcionaba
   * y a veces se perdia al guardar, que es de los fallos que mas desconciertan.
   */
  if (estilo) {
    const peso = estilo.fontWeight;
    if (peso === 'bold' || peso === 'bolder' || Number(peso) >= 600) siguiente.bold = true;
    if (estilo.fontStyle === 'italic') siguiente.italic = true;
    if (estilo.textDecorationLine?.includes('underline') || estilo.textDecoration?.includes('underline')) {
      siguiente.underline = true;
    }
    if (estilo.textDecorationLine?.includes('line-through') || estilo.textDecoration?.includes('line-through')) {
      siguiente.strike = true;
    }
  }

  if (etiqueta === 'A') {
    const url = enlaceValido((nodo as HTMLAnchorElement).getAttribute('href') ?? '');
    if (url) siguiente.href = url;
  }

  return siguiente;
}

function nuevoSpan(texto: string, marcas: Marcas): RichSpan {
  const span: RichSpan = { text: texto };
  if (marcas.bold) span.bold = true;
  if (marcas.italic) span.italic = true;
  if (marcas.underline) span.underline = true;
  if (marcas.strike) span.strike = true;
  if (marcas.href) span.href = marcas.href;
  return span;
}

/** Un bloque cuyo texto es solo espacios es una linea en blanco, no contenido. */
function soloEspacios(spans: RichSpan[]): boolean {
  return !spans.some((s) => s.text.trim());
}

/** Junta trozos seguidos con las mismas marcas: menos ruido en lo que se guarda. */
function compactar(spans: RichSpan[]): RichSpan[] {
  const salida: RichSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const previo = salida[salida.length - 1];
    const iguales =
      previo &&
      previo.bold === span.bold &&
      previo.italic === span.italic &&
      previo.underline === span.underline &&
      previo.strike === span.strike &&
      previo.href === span.href;
    if (iguales) previo.text += span.text;
    else salida.push({ ...span });
  }
  return salida;
}

/** Recoge el texto marcado de un nodo, sin bajar a las listas ni a otros bloques. */
function spansDe(nodo: Node, marcas: Marcas, salida: RichSpan[]): void {
  if (nodo.nodeType === Node.TEXT_NODE) {
    const texto = nodo.textContent ?? '';
    if (texto) salida.push(nuevoSpan(texto, marcas));
    return;
  }
  if (nodo.nodeType !== Node.ELEMENT_NODE) return;

  const el = nodo as Element;
  if (NO_ES_CONTENIDO.has(el.tagName)) return;
  // Un salto de linea suelto separa dentro del mismo parrafo.
  if (el.tagName === 'BR') {
    salida.push(nuevoSpan('\n', marcas));
    return;
  }
  const dentro = conMarca(el, marcas);
  for (const hijo of Array.from(el.childNodes)) spansDe(hijo, dentro, salida);
}

/** Etiquetas que agrupan otros bloques y no son contenido por si mismas. */
const CONTENEDORES = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'BLOCKQUOTE']);

/** Un elemento que lleva bloques dentro es un envoltorio, no un parrafo. */
function llevaBloquesDentro(el: Element): boolean {
  return el.querySelector('p, div, ul, ol, h1, h2, h3, h4, h5, h6') !== null;
}

/**
 * Lee el contenido de un campo editable y devuelve los bloques.
 *
 * Recorre en profundidad. Hace falta porque el navegador anida a su antojo: al
 * pulsar Enter, Chrome envuelve lo siguiente en un `<div>`, asi que una lista
 * recien creada queda en `<div><ul>...</ul></div>` y no colgando de la raiz.
 * Mirando solo los hijos directos, esa lista se aplastaba en un parrafo corrido
 * con todos los puntos pegados, que es justo lo que hacia antes de arreglarlo.
 *
 * Los nodos sueltos de texto (los que deja el navegador al empezar a escribir en
 * un campo vacio) se agrupan en un parrafo.
 */
export function domABloques(raiz: HTMLElement): RichBlock[] {
  const bloques: RichBlock[] = [];
  let sueltos: RichSpan[] = [];

  const cerrarSueltos = () => {
    const spans = compactar(sueltos);
    if (spans.length && !soloEspacios(spans)) bloques.push({ type: 'paragraph', spans });
    sueltos = [];
  };

  /** El tope de profundidad evita quedarse dando vueltas con un DOM absurdo. */
  const recorrer = (nodo: Node, hondura: number): void => {
    if (hondura > 12) return;

    for (const hijo of Array.from(nodo.childNodes)) {
      if (hijo.nodeType !== Node.ELEMENT_NODE) {
        spansDe(hijo, {}, sueltos);
        continue;
      }

      const el = hijo as Element;
      if (NO_ES_CONTENIDO.has(el.tagName)) continue;

      if (el.tagName === 'UL' || el.tagName === 'OL') {
        cerrarSueltos();
        const items: RichSpan[][] = [];
        for (const li of Array.from(el.children)) {
          if (li.tagName !== 'LI') continue;
          const spans: RichSpan[] = [];
          spansDe(li, {}, spans);
          const limpio = compactar(spans);
          if (limpio.length && !soloEspacios(limpio)) items.push(limpio);
        }
        if (items.length) bloques.push({ type: 'list', ordered: el.tagName === 'OL', items });
        continue;
      }

      // Un envoltorio no es un bloque: se entra en el.
      if (CONTENEDORES.has(el.tagName) && llevaBloquesDentro(el)) {
        cerrarSueltos();
        recorrer(el, hondura + 1);
        continue;
      }

      if (BLOQUES_DE_LINEA.has(el.tagName)) {
        cerrarSueltos();
        const spans: RichSpan[] = [];
        spansDe(el, {}, spans);
        const limpio = compactar(spans);
        // Un parrafo vacio, o con solo espacios, es una linea en blanco.
        if (limpio.length && !soloEspacios(limpio)) {
          bloques.push({ type: TITULOS.has(el.tagName) ? 'heading' : 'paragraph', spans: limpio });
        }
        continue;
      }

      spansDe(el, {}, sueltos);
    }
  };

  recorrer(raiz, 0);
  cerrarSueltos();
  return bloques;
}

/**
 * Construye los nodos del campo editable a partir de los bloques. Sin
 * `innerHTML`: cada texto entra por `textContent`, que nunca se interpreta.
 */
export function bloquesADom(bloques: RichBlock[], raiz: HTMLElement): void {
  raiz.replaceChildren();

  const pintarSpans = (spans: RichSpan[], destino: HTMLElement) => {
    for (const span of spans) {
      // El salto guardado vuelve a ser un salto, no la palabra "\n".
      const trozos = span.text.split('\n');
      trozos.forEach((trozo, i) => {
        if (i > 0) destino.appendChild(document.createElement('br'));
        if (!trozo) return;
        let nodo: HTMLElement = document.createElement('span');
        nodo.textContent = trozo;

        const envolver = (etiqueta: string) => {
          const fuera = document.createElement(etiqueta);
          fuera.appendChild(nodo);
          nodo = fuera;
        };
        if (span.bold) envolver('b');
        if (span.italic) envolver('i');
        if (span.underline) envolver('u');
        if (span.strike) envolver('s');
        if (span.href) {
          const a = document.createElement('a');
          a.href = span.href;
          a.appendChild(nodo);
          nodo = a;
        }
        destino.appendChild(nodo);
      });
    }
  };

  for (const bloque of bloques) {
    if (bloque.type === 'paragraph' || bloque.type === 'heading') {
      const el = document.createElement(bloque.type === 'heading' ? 'h3' : 'p');
      pintarSpans(bloque.spans, el);
      raiz.appendChild(el);
    } else if (bloque.type === 'list') {
      const lista = document.createElement(bloque.ordered ? 'ol' : 'ul');
      for (const item of bloque.items) {
        const li = document.createElement('li');
        pintarSpans(item, li);
        lista.appendChild(li);
      }
      raiz.appendChild(lista);
    }
    // Las imagenes no viven dentro del campo editable: son bloques aparte.
  }
}

/** Version en texto plano, para el resumen y para quien no sepa pintar bloques. */
export function bloquesATexto(bloques: RichBlock[]): string {
  const lineas: string[] = [];
  for (const bloque of bloques) {
    if (bloque.type === 'paragraph' || bloque.type === 'heading') {
      lineas.push(bloque.spans.map((s) => s.text).join(''));
    } else if (bloque.type === 'list') {
      for (const item of bloque.items) lineas.push('• ' + item.map((s) => s.text).join(''));
    } else if (bloque.caption) {
      lineas.push(bloque.caption);
    }
  }
  return lineas.join('\n').trim();
}

/** Caracteres visibles, para avisar del tope antes de que lo rechace el servidor. */
export function longitudVisible(bloques: RichBlock[]): number {
  let total = 0;
  for (const b of bloques) {
    if (b.type === 'paragraph' || b.type === 'heading') for (const s of b.spans) total += s.text.length;
    else if (b.type === 'list') for (const item of b.items) for (const s of item) total += s.text.length;
    else total += b.caption.length;
  }
  return total;
}

export function contarImagenes(bloques: RichBlock[]): number {
  return bloques.filter((b) => b.type === 'image').length;
}

export function contarIncrustados(bloques: RichBlock[]): number {
  return bloques.filter((b) => b.type === 'embed').length;
}
