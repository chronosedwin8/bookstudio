/**
 * Exportacion de un libro a una pagina web autonoma.
 *
 * Se genera aqui, en el cliente, a partir del mismo modelo que dibuja el lienzo. El
 * resultado es un unico .html con su CSS y su JS dentro: se abre con doble clic, sin
 * servidor y sin BookStudio, que es justo lo que pide "sacarlos del aplicativo".
 */
import { paperStyle } from './papers';
import { SHAPES, type ShapeName } from './shapes';
import type { BookDetail, CanvasElement, Page } from '@/types/api';

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
    case 'math':
      inner = `<code class="mat">${escapeHtml(String(p.latex ?? ''))}</code>`;
      break;
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

  return `<div class="el"${wrapperStyle}>${inner}</div>`;
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

<script>
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
