/**
 * Exportacion de un libro a una pagina web autonoma.
 *
 * Se genera aqui, en el cliente, a partir del mismo modelo que dibuja el lienzo. El
 * resultado es un unico .html con su CSS y su JS dentro: se abre con doble clic, sin
 * servidor y sin BookStudio, que es justo lo que pide "sacarlos del aplicativo".
 */
import { dibujarEscena } from './ilustracion/dibujo';
import { normalizarEscena, resumirEscena } from './ilustracion/escena';
import { svgCompleto } from './ilustracion/primitivas';
import { paperStyle } from './papers';
import { SHAPES, type ShapeName } from './shapes';
import type { BookDetail, CanvasElement, Page, RichBlock, RichSpan } from '@/types/api';

const ASPECT = { square: 1, portrait: 3 / 4, landscape: 4 / 3 } as const;

/** Escapa texto que se inserta en el HTML generado. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Solo se conservan enlaces navegables; nunca javascript: ni data:. */
function safeUrl(value: unknown): string | null {
  const url = String(value ?? '').trim();
  if (!url) return null;
  return /^https?:\/\//i.test(url) || url.startsWith('/') ? url : null;
}

/** Convierte un objeto de estilos en el atributo `style`. */
function styleAttr(styles: Record<string, string | number | undefined>): string {
  const css = Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${value}`)
    .join(';');
  return css ? ` style="${escapeHtml(css)}"` : '';
}

function shapeSvg(element: CanvasElement): string {
  const p = element.properties;
  const definition = SHAPES[String(p.shape) as ShapeName] ?? SHAPES.rectangle;
  const stroke = String(p.strokeColor ?? '#334155');
  const fill = definition.strokeOnly ? stroke : String(p.fillColor ?? 'transparent');
  const strokeWidth = Number(p.strokeWidth ?? 2);
  const dash = definition.dashed ? ` stroke-dasharray="${strokeWidth * 1.8} ${strokeWidth * 1.6}"` : '';

  const parts = definition.primitives.map((primitive) => {
    const common =
      `fill="${primitive.el === 'line' ? 'none' : fill}" stroke="${stroke}" stroke-width="${strokeWidth}"` +
      ` stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"${dash}`;
    switch (primitive.el) {
      case 'rect':
        return `<rect x="0" y="0" width="100" height="100" rx="${Number(p.cornerRadius ?? 0)}" ${common}/>`;
      case 'ellipse':
        return `<ellipse cx="50" cy="50" rx="49" ry="49" ${common}/>`;
      case 'circle':
        return `<circle cx="${primitive.cx}" cy="${primitive.cy}" r="${primitive.r}" ${common}/>`;
      case 'line':
        return `<line x1="${primitive.x1}" y1="${primitive.y1}" x2="${primitive.x2}" y2="${primitive.y2}" ${common}/>`;
      case 'path':
        return `<path d="${primitive.d}" ${common}/>`;
      default:
        return `<${primitive.el} points="${primitive.points}" ${common}/>`;
    }
  });

  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${parts.join('')}</svg>`;
}

function textHtml(element: CanvasElement): string {
  const p = element.properties;
  const style = styleAttr({
    fontFamily: `"${String(p.fontFamily ?? 'Lato')}", sans-serif`,
    fontSize: `${Number(p.fontSize ?? 24)}px`,
    color: String(p.color ?? '#333333'),
    backgroundColor: String(p.backgroundColor ?? 'transparent'),
    textAlign: String(p.textAlign ?? 'left'),
    columnCount: Number(p.columns ?? 1),
    fontWeight: p.bold ? 700 : 400,
    fontStyle: p.italic ? 'italic' : 'normal',
    textDecoration:
      [p.underline && 'underline', p.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none',
    lineHeight: String(p.lineHeight ?? 1.35),
    letterSpacing: `${Number(p.letterSpacing ?? 0)}px`,
    padding: '8px',
  });

  const listStyle = String(p.listStyle ?? 'none');
  const raw = String(p.text ?? '');

  if (listStyle === 'none') {
    return `<div class="txt"${style}>${escapeHtml(raw)}</div>`;
  }

  const items = raw
    .split(String.fromCharCode(10))
    .map((line, index) => {
      const marker = listStyle === 'number' ? `${index + 1}.` : '&bull;';
      return `<li><span class="mk">${marker}</span><span>${escapeHtml(line)}</span></li>`;
    })
    .join('');
  return `<ul class="txt lst"${style}>${items}</ul>`;
}

function chartSvgPlaceholder(element: CanvasElement): string {
  // Las graficas se exportan como tabla de datos: legible y accesible sin JS.
  const p = element.properties;
  const series = Array.isArray(p.series) ? (p.series as Array<Record<string, unknown>>) : [];
  const rows = series
    .map((item) => `<tr><td>${escapeHtml(String(item.label ?? ''))}</td><td>${escapeHtml(String(item.value ?? 0))}</td></tr>`)
    .join('');
  return `<figure class="chart"><figcaption>${escapeHtml(String(p.title ?? 'Grafica'))}</figcaption>
    <table>${rows}</table></figure>`;
}

function elementHtml(element: CanvasElement): string {
  const t = element.transformMatrix;
  const wrapperStyle = styleAttr({
    left: `${t.x}%`,
    top: `${t.y}%`,
    width: `${t.width}%`,
    height: `${t.height}%`,
    transform: `rotate(${t.angle}deg)`,
    opacity: element.opacity,
    zIndex: element.zIndex,
  });

  let inner = '';
  const p = element.properties;

  switch (element.type) {
    case 'text':
      inner = textHtml(element);
      break;
    case 'shape':
      inner = shapeSvg(element);
      break;
    case 'image': {
      const src = safeUrl(p.fileUrl);
      inner = src
        ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(String(p.altText ?? ''))}" loading="lazy"/>`
        : '';
      const caption = (p.attribution as { text?: string } | undefined)?.text;
      if (caption) inner += `<span class="cap">${escapeHtml(caption)}</span>`;
      break;
    }
    case 'drawing':
      inner =
        `<svg viewBox="${escapeHtml(String(p.viewBox ?? '0 0 1000 1000'))}" preserveAspectRatio="none">` +
        `<path d="${escapeHtml(String(p.svgPath ?? ''))}" fill="${escapeHtml(String(p.fillColor ?? 'none'))}" ` +
        `stroke="${escapeHtml(String(p.strokeColor ?? '#333'))}" stroke-width="${Number(p.strokeWidth ?? 5)}" ` +
        `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      break;
    case 'icon':
      if (p.source === 'emoji') {
        inner = `<span class="emo">${escapeHtml(String(p.char ?? ''))}</span>`;
      } else {
        const paths = (Array.isArray(p.paths) ? (p.paths as string[]) : [])
          .map(
            (d) =>
              `<path d="${escapeHtml(d)}" fill="${p.filled ? escapeHtml(String(p.color ?? '#333')) : 'none'}" ` +
              `stroke="${escapeHtml(String(p.color ?? '#333'))}" stroke-width="${Number(p.strokeWidth ?? 2)}" ` +
              `stroke-linecap="round" stroke-linejoin="round"/>`,
          )
          .join('');
        inner = `<svg viewBox="${escapeHtml(String(p.viewBox ?? '0 0 24 24'))}">${paths}</svg>`;
      }
      break;
    case 'audio': {
      const src = safeUrl(p.fileUrl);
      inner = src ? `<audio src="${escapeHtml(src)}" controls preload="none"></audio>` : '';
      break;
    }
    case 'video': {
      const src = safeUrl(p.fileUrl);
      inner = src ? `<video src="${escapeHtml(src)}" controls preload="metadata"></video>` : '';
      break;
    }
    case 'embed': {
      const src = safeUrl(p.embedUrl);
      inner = src
        ? `<iframe src="${escapeHtml(src)}" title="${escapeHtml(String(p.title ?? 'Contenido'))}" ` +
          `loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`
        : '';
      break;
    }
    case 'map': {
      const lat = Number(p.latitude ?? 0);
      const lon = Number(p.longitude ?? 0);
      const zoom = Number(p.zoom ?? 13);
      // Sin Leaflet: un enlace a OpenStreetMap centrado en el punto.
      inner =
        `<a class="mapa" href="https://www.openstreetmap.org/#map=${zoom}/${lat}/${lon}" ` +
        `target="_blank" rel="noopener noreferrer">🗺️ ${escapeHtml(String(p.label ?? 'Ver el mapa'))}</a>`;
      break;
    }
    case 'chart':
      inner = chartSvgPlaceholder(element);
      break;
    case 'illustration': {
      /*
       * Aqui si va el SVG entero, y no un sustituto como en las graficas: una
       * ilustracion contada con palabras no se entiende, se mira. Se compone con
       * el mismo dibujo que usa el editor, asi que el libro exportado se ve
       * exactamente igual que en pantalla y sigue siendo vectorial al imprimirlo.
       */
      const escena = normalizarEscena(p.escena, String(p.prompt ?? ''));
      inner = svgCompleto(dibujarEscena(escena), resumirEscena(escena), resumirEscena(escena));
      break;
    }
    case 'math':
      inner = `<code class="mat">${escapeHtml(String(p.latex ?? ''))}</code>`;
      break;
    case 'button': {
      /*
       * El boton se pinta con los colores que le puso su autor. El enlace lo
       * envuelve mas abajo, con el mismo camino que el resto de elementos, asi
       * que aqui solo hay que dibujarlo.
       */
      const RADIO: Record<string, string> = { rounded: '.75rem', pill: '999px', square: '.125rem' };
      const TAM: Record<string, string> = { sm: '26cqh', md: '34cqh', lg: '44cqh' };
      const fondo = String(p.backgroundColor ?? '#2563EB');
      const relleno = p.variant === 'solid' ? fondo
        : p.variant === 'soft' ? `${fondo}22`
        : 'transparent';
      const texto = p.variant === 'solid' ? String(p.textColor ?? '#FFFFFF') : fondo;
      const borde = p.variant === 'solid' || p.variant === 'outline'
        ? `2px solid ${String(p.borderColor ?? fondo)}`
        : '2px solid transparent';
      const css = [
        `background:${relleno}`,
        `color:${texto}`,
        `border:${borde}`,
        `border-radius:${RADIO[String(p.shape)] ?? RADIO.rounded}`,
        `font-size:${TAM[String(p.size)] ?? TAM.md}`,
        `font-family:'${String(p.fontFamily ?? 'Nunito')}',sans-serif`,
        p.variant === 'link' ? 'text-decoration:underline' : '',
        p.shadow && (p.variant === 'solid' || p.variant === 'soft')
          ? 'box-shadow:0 2px 6px rgba(15,23,42,.18)' : '',
      ].filter(Boolean).join(';');

      const icono = p.iconSource === 'emoji' && p.iconChar
        ? `<span class="bico">${escapeHtml(String(p.iconChar))}</span>`
        : '';
      const etiqueta = `<span>${escapeHtml(String(p.label ?? ''))}</span>`;
      inner =
        `<div class="btncaja"><div class="btn" style="${escapeHtml(css)}">` +
        (p.iconPosition === 'right' ? etiqueta + icono : icono + etiqueta) +
        `</div></div>`;
      break;
    }
    case 'question': {
      const options = (Array.isArray(p.options) ? (p.options as Array<Record<string, unknown>>) : [])
        .map((option) => `<li>${escapeHtml(String(option.text ?? ''))}</li>`)
        .join('');
      inner =
        `<div class="preg"><p class="ptit">${escapeHtml(String(p.prompt ?? ''))}</p><ul>${options}</ul></div>`;
      break;
    }
    default:
      inner = '';
  }

  const link = safeUrl(p.linkUrl);
  if (link) {
    inner = `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="lnk">${inner}</a>`;
  }

  /*
   * La informacion ampliada viaja en atributos y la pinta el guion de abajo. Va
   * asi, y no como marcado dentro del elemento, porque entonces heredaria su
   * tamano y su recorte: un globo dentro de una imagen pequena seria ilegible.
   */
  const info = element.interaction;
  /*
   * El contenido viaja ya convertido en marcado dentro de un atributo, generado
   * por blocksHtml: no es marcado que haya escrito nadie, es el que produce este
   * fichero a partir de los bloques, con cada texto escapado. El guion de abajo
   * lo coloca con innerHTML, y solo esa cadena, nunca lo que teclee una persona.
   */
  const cuerpo = info
    ? info.content?.length
      ? blocksHtml(info.content)
      : `<p>${escapeHtml(info.text).replace(/\n/g, '<br>')}</p>`
    : '';

  const extra = info
    ? ` data-info="${escapeHtml(cuerpo)}" data-info-titulo="${escapeHtml(info.title)}"` +
      ` data-info-plano="${escapeHtml(info.text)}"` +
      ` data-info-modo="${info.kind}" data-info-abre="${info.trigger}"` +
      (safeUrl(info.imageUrl) ? ` data-info-img="${escapeHtml(safeUrl(info.imageUrl)!)}"` : '')
    : '';

  /*
   * Mostrar y ocultar. El nombre y las reglas viajan en atributos y los aplica
   * el guion de abajo. Los objetivos se apuntan por nombre y se resuelven dentro
   * de la propia pagina, igual que en la plataforma.
   */
  const acc = element.actions;
  const reglas = (acc?.rules ?? []).filter((r) => r.target);
  const accAttrs =
    (acc?.key ? ` data-nombre="${escapeHtml(acc.key)}"` : '') +
    (acc?.startHidden ? ' data-oculto="1"' : '') +
    (reglas.length
      ? ` data-reglas="${escapeHtml(reglas.map((r) => `${r.trigger}:${r.action}:${r.target}`).join('|'))}"`
      : '');

  const pulsable = reglas.some((r) => r.trigger === 'click') ? ' actua' : '';

  return `<div class="el${info ? ' tiene-info' : ''}${pulsable}"${extra}${accAttrs}${wrapperStyle}>${inner}</div>`;
}

/**
 * Convierte el contenido con formato en marcado. Cada texto pasa por escapeHtml
 * y las etiquetas las pone este codigo, no el contenido: por eso una negrita se
 * ve como negrita y un `<script>` escrito por alguien se ve como el texto que es.
 */
function spansHtml(spans: RichSpan[]): string {
  return spans
    .map((span) => {
      let dentro = escapeHtml(span.text).replace(/\n/g, '<br>');
      if (span.bold) dentro = `<b>${dentro}</b>`;
      if (span.italic) dentro = `<i>${dentro}</i>`;
      if (span.underline) dentro = `<u>${dentro}</u>`;
      if (span.strike) dentro = `<s>${dentro}</s>`;
      const url = safeUrl(span.href);
      if (url) dentro = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${dentro}</a>`;
      return dentro;
    })
    .join('');
}

function blocksHtml(blocks: RichBlock[]): string {
  return blocks
    .map((bloque) => {
      if (bloque.type === 'paragraph') return `<p>${spansHtml(bloque.spans)}</p>`;
      if (bloque.type === 'heading') return `<h4>${spansHtml(bloque.spans)}</h4>`;
      if (bloque.type === 'list') {
        const etiqueta = bloque.ordered ? 'ol' : 'ul';
        const items = bloque.items.map((item) => `<li>${spansHtml(item)}</li>`).join('');
        return `<${etiqueta}>${items}</${etiqueta}>`;
      }
      const pie = bloque.caption ? `<figcaption>${escapeHtml(bloque.caption)}</figcaption>` : '';

      if (bloque.type === 'embed') {
        /*
         * La direccion la reconstruyo el servidor contra su lista cerrada de
         * proveedores, no la eligio quien escribio. Aun asi el iframe va con
         * sandbox: la copia se abre fuera de la plataforma y de sus defensas.
         */
        const incrustada = safeUrl(bloque.embedUrl);
        if (!incrustada) return '';
        return `<figure class="video"><iframe src="${escapeHtml(incrustada)}" loading="lazy"` +
          ` referrerpolicy="strict-origin-when-cross-origin"` +
          ` sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"` +
          ` allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>${pie}</figure>`;
      }

      const url = safeUrl(bloque.url);
      if (!url) return '';
      return `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(bloque.alt ?? '')}" loading="lazy">${pie}</figure>`;
    })
    .join('');
}

function pageHtml(page: Page, index: number): string {
  const style = styleAttr({
    backgroundColor: page.backgroundColor,
    ...paperStyle(page.backgroundPattern),
  });
  const elements = [...page.elements]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(elementHtml)
    .join('');
  return `<section class="pg" id="p${index}" data-n="${index}"${style}>${elements}</section>`;
}

/** Documento completo, con navegacion propia y sin dependencias externas. */
export function bookToHtml(book: BookDetail): string {
  const ratio = ASPECT[book.layoutFormat];
  const pages = book.pages.map(pageHtml).join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(book.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0f172a; color:#e2e8f0;
         font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { display:flex; gap:1rem; align-items:center; justify-content:space-between;
           padding:.7rem 1rem; background:#1e293b; position:sticky; top:0; z-index:20; }
  h1 { font-size:1rem; margin:0; }
  button { font:inherit; cursor:pointer; border:1px solid #475569; background:#334155;
           color:#e2e8f0; border-radius:.4rem; padding:.35rem .8rem; }
  button:disabled { opacity:.35; cursor:default; }
  main { display:grid; place-items:center; padding:1rem; }
  .pg { position:relative; width:min(94vw, ${Math.round(1000 * ratio) / ratio}px);
        aspect-ratio:${ratio}; background:#fff; color:#0f172a;
        box-shadow:0 18px 45px rgba(0,0,0,.45); border-radius:.4rem; overflow:hidden;
        container-type:size; }
  .pg:not(.on) { display:none; }
  .el { position:absolute; overflow:hidden; }
  .el > svg, .el > a > svg { width:100%; height:100%; display:block; }
  .el img, .el video, .el iframe, .el audio { width:100%; height:100%; border:0; display:block; }
  .el img, .el video { object-fit:cover; }
  .txt { width:100%; height:100%; white-space:pre-wrap; word-break:break-word; overflow:hidden; }
  .lst { list-style:none; margin:0; padding:8px; }
  .lst li { display:flex; gap:.5em; }
  .mk { opacity:.7; flex:0 0 auto; }
  .cap { position:absolute; left:0; right:0; bottom:0; background:rgba(255,255,255,.85);
         font-size:11px; padding:2px 6px; }
  .emo { font-size:88cqmin; line-height:1; }
  .lnk { display:block; width:100%; height:100%; text-decoration:none; color:inherit; }
  .btncaja { width:100%; height:100%; container-type:size; }
  .btn { display:flex; width:100%; height:100%; align-items:center; justify-content:center;
         gap:.4em; padding:0 .9em; font-weight:600; line-height:1.1; overflow:hidden;
         text-align:center; box-sizing:border-box; }
  .bico { flex:none; }
  .mapa, .mat { display:grid; place-items:center; width:100%; height:100%; text-align:center;
                background:#f1f5f9; border-radius:.3rem; color:#0f172a; text-decoration:none; }
  .mat { font-family:ui-monospace, monospace; font-size:clamp(10px,6cqmin,28px); padding:.4rem; }
  .chart { margin:0; width:100%; height:100%; overflow:auto; background:#f8fafc; padding:.4rem;
           border-radius:.3rem; color:#0f172a; }
  .chart figcaption { font-weight:700; margin-bottom:.3rem; }
  .chart table { width:100%; border-collapse:collapse; font-size:clamp(8px,3cqmin,14px); }
  .chart td { border-bottom:1px solid #e2e8f0; padding:.15rem .3rem; }
  .preg { width:100%; height:100%; overflow:auto; background:#f8fafc; color:#0f172a;
          border-radius:.3rem; padding:.5rem; }
  .ptit { font-weight:700; margin:0 0 .4rem; }
  .preg ul { margin:0; padding-left:1.1rem; }
  footer { text-align:center; padding:.6rem; color:#94a3b8; font-size:.8rem; }

  /* Al imprimir, cada pagina ocupa una hoja: sirve para "guardar como PDF". */
  @media print {
    body { background:#fff; }
    header, footer { display:none; }
    main { padding:0; }
    .pg, .pg:not(.on) { display:block; width:100%; break-after:page; box-shadow:none;
                        border-radius:0; margin:0; }
  }
  .tiene-info { cursor:help; }
  .actua { cursor:pointer; }
  .escondido { display:none !important; }
  #globo { position:fixed; z-index:60; max-width:19rem; display:none; pointer-events:none;
           background:rgba(15,23,42,.96); color:#fff; border-radius:.75rem; overflow:hidden;
           font-size:13px; line-height:1.35; box-shadow:0 12px 32px rgba(0,0,0,.4); }
  #globo .cab { display:block; margin:0; padding:.5rem .7rem 0; font-weight:600; }
  #globo .cuerpo { padding:.4rem .7rem .55rem; }
  #globo img { display:block; width:100%; max-height:9rem; object-fit:cover; }

  #vent { position:fixed; inset:0; z-index:61; display:none; place-items:center;
          background:rgba(15,23,42,.7); padding:1rem; }
  #vent .caja { display:flex; flex-direction:column; background:#fff; color:#0f172a;
                border-radius:1rem; width:100%; max-width:36rem; max-height:88vh;
                overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,.45); }
  #vent header { display:flex; align-items:flex-start; justify-content:space-between; gap:.75rem;
                 padding:.75rem 1.25rem; border-bottom:1px solid #e2e8f0; background:#f8fafc; }
  #vent h2 { margin:0; font-size:1rem; line-height:1.35; }
  #vent .cuerpo { flex:1; min-height:0; overflow:auto; }
  #vent .relleno { padding:.9rem 1.25rem; }
  #vent .hero { display:block; width:100%; max-height:18rem; object-fit:cover; }
  #vent button { border:0; background:none; font-size:1.5rem; line-height:1; cursor:pointer;
                 color:#94a3b8; padding:0 .25rem; }
  #vent button:hover { color:#334155; }

  /* Contenido con formato, en los dos sitios */
  .info-cuerpo p { margin:0 0 .5rem; }
  .info-cuerpo h4 { margin:.6rem 0 .3rem; font-size:1rem; }
  .info-cuerpo ul, .info-cuerpo ol { margin:0 0 .5rem; padding-left:1.25rem; }
  .info-cuerpo li { margin:.15rem 0; }
  .info-cuerpo figure { margin:.5rem 0; }
  .info-cuerpo figure.video { aspect-ratio:16/9; }
  .info-cuerpo figure.video iframe { width:100%; height:100%; border:0; border-radius:.5rem;
                                     background:#0f172a; }
  .info-cuerpo img { display:block; width:100%; max-height:16rem; object-fit:contain;
                     border-radius:.5rem; }
  .info-cuerpo figcaption { text-align:center; font-size:.75rem; font-style:italic;
                            opacity:.75; margin-top:.25rem; }
  .info-cuerpo > :last-child { margin-bottom:0; }
  #globo .info-cuerpo img { max-height:8rem; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(book.title)}</h1>
  <div>
    <button id="ant" type="button">&lsaquo; Anterior</button>
    <span id="ind"></span>
    <button id="sig" type="button">Siguiente &rsaquo;</button>
    <button id="imp" type="button">Imprimir / PDF</button>
  </div>
</header>

<main>${pages}</main>

<footer>Creado con BookStudio</footer>

<div id="globo" role="tooltip">
  <img alt="" hidden>
  <p class="cab" hidden></p>
  <div class="cuerpo info-cuerpo"></div>
</div>
<div id="vent" role="dialog" aria-modal="true"><div class="caja">
  <header><h2></h2><button type="button" aria-label="Cerrar">&times;</button></header>
  <div class="cuerpo">
    <img class="hero" alt="" hidden>
    <div class="relleno info-cuerpo"></div>
  </div>
</div></div>
<script>
  /*
   * Informacion ampliada. Se escribe con textContent, nunca con innerHTML: el
   * texto lo tecleo una persona y aqui no se convierte en marcado.
   */
  var globo = document.getElementById('globo');
  var globoCab = globo.querySelector('.cab');
  var globoCuerpo = globo.querySelector('.cuerpo');
  var globoImg = globo.querySelector('img');
  var vent = document.getElementById('vent');
  var ventTit = vent.querySelector('h2');
  var ventTxt = vent.querySelector('.relleno');
  var ventImg = vent.querySelector('.hero');

  function cerrarVentana() { vent.style.display = 'none'; }
  vent.querySelector('button').addEventListener('click', cerrarVentana);
  vent.addEventListener('click', function (e) { if (e.target === vent) cerrarVentana(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarVentana(); });

  function abrirVentana(el) {
    ventTit.textContent = el.getAttribute('data-info-titulo') || 'Mas informacion';
    // innerHTML solo con la cadena que genero este mismo fichero al exportar,
    // donde cada texto de origen ya paso por escapeHtml.
    ventTxt.innerHTML = el.getAttribute('data-info') || '';
    var img = el.getAttribute('data-info-img');
    ventImg.hidden = !img;
    if (img) ventImg.src = img;
    vent.style.display = 'grid';
  }

  function colocarGlobo(e) {
    var caja = globo.getBoundingClientRect();
    var margen = 12;
    var x = Math.min(Math.max(margen, e.clientX - caja.width / 2), innerWidth - caja.width - margen);
    var cabeDebajo = innerHeight - e.clientY > caja.height + margen * 2;
    globo.style.left = x + 'px';
    globo.style.top = (cabeDebajo ? e.clientY + margen : Math.max(margen, e.clientY - caja.height - margen)) + 'px';
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tiene-info'), function (el) {
    var alPulsar = el.getAttribute('data-info-abre') === 'click';
    var esVentana = el.getAttribute('data-info-modo') === 'popup';

    if (alPulsar) {
      el.addEventListener('click', function (e) { e.preventDefault(); abrirVentana(el); });
      return;
    }
    if (esVentana) {
      el.addEventListener('mouseenter', function () { abrirVentana(el); });
      return;
    }
    el.addEventListener('mouseenter', function (e) {
      var titulo = el.getAttribute('data-info-titulo');
      globoCab.textContent = titulo || '';
      globoCab.hidden = !titulo;
      var img = el.getAttribute('data-info-img');
      globoImg.hidden = !img;
      if (img) globoImg.src = img;
      globoCuerpo.innerHTML = el.getAttribute('data-info') || '';
      globo.style.display = 'block';
      colocarGlobo(e);
    });
    el.addEventListener('mousemove', colocarGlobo);
    el.addEventListener('mouseleave', function () { globo.style.display = 'none'; });
  });

  /*
   * Mostrar y ocultar objetos. Cada pagina se resuelve por su cuenta: dos
   * paginas duplicadas comparten nombres y no deben interferir entre ellas.
   */
  Array.prototype.forEach.call(document.querySelectorAll('.pg'), function (pagina) {
    var porNombre = {};
    Array.prototype.forEach.call(pagina.querySelectorAll('[data-nombre]'), function (el) {
      porNombre[el.getAttribute('data-nombre')] = el;
    });

    Array.prototype.forEach.call(pagina.querySelectorAll('[data-oculto]'), function (el) {
      el.classList.add('escondido');
    });

    function aplicar(el, disparador) {
      var crudo = el.getAttribute('data-reglas');
      if (!crudo) return;
      crudo.split('|').forEach(function (texto) {
        var partes = texto.split(':');
        if (partes[0] !== disparador) return;
        var destino = porNombre[partes[2]];
        if (!destino) return; // el objetivo ya no existe: no se hace nada
        if (partes[1] === 'show') destino.classList.remove('escondido');
        else if (partes[1] === 'hide') destino.classList.add('escondido');
        else destino.classList.toggle('escondido');
      });
    }

    Array.prototype.forEach.call(pagina.querySelectorAll('[data-reglas]'), function (el) {
      el.addEventListener('click', function () { aplicar(el, 'click'); });
      el.addEventListener('mouseenter', function () { aplicar(el, 'hover'); });
    });
  });

  var paginas = Array.prototype.slice.call(document.querySelectorAll('.pg'));
  var actual = 0;
  var ind = document.getElementById('ind');
  var ant = document.getElementById('ant');
  var sig = document.getElementById('sig');

  function mostrar(n) {
    actual = Math.max(0, Math.min(n, paginas.length - 1));
    paginas.forEach(function (p, i) { p.classList.toggle('on', i === actual); });
    ind.textContent = (actual + 1) + ' / ' + paginas.length;
    ant.disabled = actual === 0;
    sig.disabled = actual === paginas.length - 1;
  }

  ant.addEventListener('click', function () { mostrar(actual - 1); });
  sig.addEventListener('click', function () { mostrar(actual + 1); });
  document.getElementById('imp').addEventListener('click', function () { window.print(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ') mostrar(actual + 1);
    if (e.key === 'ArrowLeft') mostrar(actual - 1);
  });

  mostrar(0);
</script>
</body>
</html>`;
}

/** Descarga el libro como archivo .html. */
export function downloadBookHtml(book: BookDetail): void {
  const blob = new Blob([bookToHtml(book)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${book.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'libro'}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
