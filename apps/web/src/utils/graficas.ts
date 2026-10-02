import { compilar, NOMBRES_RESERVADOS, type Evaluador } from './expresiones';

/**
 * Graficas de funciones, al estilo de GeoGebra.
 *
 * Todo lo que calcula y dibuja vive aqui, sin Vue: el lienzo, el lector y la
 * pagina web exportada generan el mismo SVG con las mismas funciones. El
 * componente solo pone la interaccion (mover, acercar, deslizadores, girar).
 *
 * El SVG se arma como texto. Todo lo que entra en el son numeros calculados o
 * textos pasados por `esc`, asi que lo que teclee el autor no puede convertirse
 * en marcado.
 */

/* ------------------------------------------------------------------ tipos -- */

export interface FuncionGrafica {
  /** y: y = f(x) · param: (x(t), y(t)) · z: superficie z = f(x, y) */
  kind: 'y' | 'param' | 'z';
  /** f(x), x(t) o f(x, y). */
  expr: string;
  /** y(t), solo en las parametricas. */
  exprY: string;
  tMin: number;
  tMax: number;
  /** Dominio opcional de y = f(x): vacio es todo lo que se ve. */
  domainMin: number | null;
  domainMax: number | null;
  color: string;
  width: number;
  dashed: boolean;
  visible: boolean;
  label: string;
}

export interface PuntoGrafica {
  /** Expresiones: pueden depender de los deslizadores, p. ej. (a, a^2). */
  x: string;
  y: string;
  label: string;
  color: string;
}

export interface Deslizador {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface PropiedadesGrafica {
  mode: '2d' | '3d';
  title: string;
  functions: FuncionGrafica[];
  points: PuntoGrafica[];
  params: Deslizador[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  showGrid: boolean;
  showAxes: boolean;
  xLabel: string;
  yLabel: string;
  /** Raices de cada funcion y = f(x). */
  markRoots: boolean;
  /** Cortes entre cada par de funciones y = f(x). */
  markIntersections: boolean;
  /** Area bajo una funcion entre a y b, con el valor de la integral. */
  area: { enabled: boolean; fn: number; a: string; b: string; color: string };
  /** Recta tangente a una funcion en x0, con su pendiente. */
  tangent: { enabled: boolean; fn: number; x0: string; color: string };
  /** Al leer: mover, acercar y ver coordenadas. */
  interactive: boolean;
  backgroundColor: string;
  /** 3D: angulos de la vista, en grados. */
  rotZ: number;
  rotX: number;
  /** 3D: coloreado de las superficies. */
  colorMap: 'arcoiris' | 'frio' | 'calor' | 'uniforme';
}

export const COLORES_GRAFICA = ['#2563EB', '#DC2626', '#16A34A', '#9333EA', '#EA580C', '#0891B2', '#DB2777', '#4B5563'];

export function funcionNueva(kind: FuncionGrafica['kind'], expr: string, color: string): FuncionGrafica {
  return {
    kind,
    expr,
    exprY: kind === 'param' ? 'sin(t)' : '',
    tMin: 0,
    tMax: 2 * Math.PI,
    domainMin: null,
    domainMax: null,
    color,
    width: 3,
    dashed: false,
    visible: true,
    label: '',
  };
}

export const GRAFICA_POR_DEFECTO: PropiedadesGrafica = {
  mode: '2d',
  title: '',
  functions: [funcionNueva('y', 'x^2 - 2', COLORES_GRAFICA[0])],
  points: [],
  params: [],
  xMin: -5,
  xMax: 5,
  yMin: -4,
  yMax: 6,
  showGrid: true,
  showAxes: true,
  xLabel: 'x',
  yLabel: 'y',
  markRoots: false,
  markIntersections: false,
  area: { enabled: false, fn: 0, a: '-1', b: '1', color: '#2563EB' },
  tangent: { enabled: false, fn: 0, x0: '1', color: '#DC2626' },
  interactive: true,
  backgroundColor: '#FFFFFF',
  rotZ: 35,
  rotX: 60,
  colorMap: 'arcoiris',
};

/** Completa lo guardado con lo de serie: lo de versiones anteriores sigue sirviendo. */
export function normalizarGrafica(p: Record<string, unknown> | null | undefined): PropiedadesGrafica {
  const base = { ...GRAFICA_POR_DEFECTO, ...(p ?? {}) } as PropiedadesGrafica;
  return {
    ...base,
    functions: (Array.isArray(base.functions) ? base.functions : []).map((f, i) => ({
      ...funcionNueva(f.kind ?? 'y', '', COLORES_GRAFICA[i % COLORES_GRAFICA.length]),
      ...f,
    })),
    points: Array.isArray(base.points) ? base.points : [],
    params: Array.isArray(base.params) ? base.params : [],
    area: { ...GRAFICA_POR_DEFECTO.area, ...(base.area ?? {}) },
    tangent: { ...GRAFICA_POR_DEFECTO.tangent, ...(base.tangent ?? {}) },
  };
}

/* ------------------------------------------------------------- utilidades -- */

export function esc(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Un color de la paleta o de serie: el SVG no debe recibir otra cosa. */
const color = (c: string, defecto = '#2563EB') => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : defecto);

/** Numero bonito para las etiquetas: sin colas de decimales. */
export function redondear(v: number, decimales = 2): string {
  if (!Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(decimales));
  return (Object.is(r, -0) ? 0 : r).toLocaleString('es-CO', { maximumFractionDigits: decimales });
}

/**
 * Un punto como se escribe en clase en Colombia: con coma decimal, las
 * coordenadas se separan con punto y coma, o (-0,5, 0) no se sabria leer.
 */
export const punto = (x: number, y: number) => `(${redondear(x)}; ${redondear(y)})`;

/** Paso de la rejilla: 1, 2 o 5 por una potencia de 10, con unas 8-12 divisiones. */
export function pasoRejilla(rango: number, divisiones = 10): number {
  if (!(rango > 0)) return 1;
  const bruto = rango / divisiones;
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
  const n = bruto / potencia;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * potencia;
}

/** Valores de los deslizadores, con los que el lector haya movido encima. */
export function ambitoDeParametros(p: PropiedadesGrafica, valores: Record<string, number> = {}): Record<string, number> {
  const ambito: Record<string, number> = {};
  for (const d of p.params) ambito[d.name] = valores[d.name] ?? d.value;
  return ambito;
}

/** Un nombre de deslizador valido: una letra que no sea x, y, z, t ni una constante. */
export function nombreDeslizadorValido(nombre: string): boolean {
  // En minuscula: el interprete lee los nombres sin distinguir mayusculas.
  return /^[a-w]$/.test(nombre) && !['t', 'e'].includes(nombre) && !NOMBRES_RESERVADOS.has(nombre);
}

export interface FuncionCompilada {
  indice: number;
  f: FuncionGrafica;
  /** f(x) o x(t) o f(x, y). */
  a: Evaluador | null;
  /** y(t) en las parametricas. */
  b: Evaluador | null;
  error: string | null;
}

/** Compila cada funcion con las variables que le tocan y los deslizadores. */
export function compilarFunciones(p: PropiedadesGrafica): FuncionCompilada[] {
  const params = p.params.map((d) => d.name);
  return p.functions.map((f, indice) => {
    const vars = f.kind === 'y' ? ['x', ...params] : f.kind === 'param' ? ['t', ...params] : ['x', 'y', ...params];
    const a = compilar(f.expr, vars);
    const b = f.kind === 'param' ? compilar(f.exprY, vars) : null;
    const error = !a.ok ? a.error : b && !b.ok ? `y(t): ${b.error}` : null;
    return {
      indice,
      f,
      a: a.ok ? a.evaluar : null,
      b: b && b.ok ? b.evaluar : null,
      error,
    };
  });
}

/* --------------------------------------------------------- calculo en 2D -- */

export interface Vista {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Raices de f en [a, b]: cambios de signo afinados por biseccion. */
export function raices(f: (x: number) => number, a: number, b: number, muestras = 600): number[] {
  const encontradas: number[] = [];
  const paso = (b - a) / muestras;
  let x0 = a;
  let y0 = f(x0);
  for (let i = 1; i <= muestras; i++) {
    const x1 = a + i * paso;
    const y1 = f(x1);
    if (Number.isFinite(y0) && Number.isFinite(y1)) {
      if (y0 === 0) encontradas.push(x0);
      else if (y0 * y1 < 0) {
        let lo = x0;
        let hi = x1;
        let ylo = y0;
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2;
          const ym = f(mid);
          if (!Number.isFinite(ym)) break;
          if (ylo * ym <= 0) hi = mid;
          else {
            lo = mid;
            ylo = ym;
          }
        }
        const r = (lo + hi) / 2;
        // Un salto de signo con valores enormes es una asintota (1/x en 0), no una raiz.
        const yr = f(r);
        if (Number.isFinite(yr) && Math.abs(yr) < 1e-6 * Math.max(1, Math.abs(y0), Math.abs(y1))) encontradas.push(r);
      }
    }
    x0 = x1;
    y0 = y1;
  }
  // Sin repetidas (una raiz que cae justo en una muestra sale dos veces).
  return encontradas.filter((r, i) => i === 0 || Math.abs(r - encontradas[i - 1]) > paso / 2);
}

/** Integral definida por Simpson. NaN si la funcion no esta definida en el tramo. */
export function integral(f: (x: number) => number, a: number, b: number, n = 400): number {
  if (a === b) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** Derivada en x0 por diferencia centrada. */
export function derivada(f: (x: number) => number, x0: number): number {
  const h = 1e-5 * Math.max(1, Math.abs(x0));
  return (f(x0 + h) - f(x0 - h)) / (2 * h);
}

/**
 * Trazos de y = f(x) en pantalla. Se corta donde la funcion no existe o salta
 * (asintotas de 1/x o tan x): unir esos puntos pintaria una raya vertical falsa.
 */
export function trazos(
  f: (x: number) => number,
  vista: Vista,
  w: number,
  h: number,
  desde = vista.xMin,
  hasta = vista.xMax,
): Array<Array<[number, number]>> {
  const aX = (x: number) => ((x - vista.xMin) / (vista.xMax - vista.xMin)) * w;
  const aY = (y: number) => h - ((y - vista.yMin) / (vista.yMax - vista.yMin)) * h;
  const rangoY = vista.yMax - vista.yMin;
  const n = Math.max(200, Math.min(1600, Math.round(w * 1.5)));
  const a = Math.max(desde, vista.xMin);
  const b = Math.min(hasta, vista.xMax);
  const lista: Array<Array<[number, number]>> = [];
  if (!(b > a)) return lista;
  let actual: Array<[number, number]> = [];
  let yPrev = NaN;
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    const y = f(x);
    const salto = Number.isFinite(yPrev) && Math.abs(y - yPrev) > rangoY * 3;
    if (!Number.isFinite(y) || salto) {
      if (actual.length > 1) lista.push(actual);
      actual = [];
      if (!Number.isFinite(y)) {
        yPrev = NaN;
        continue;
      }
    }
    // Recorta lo muy alejado para que el SVG no reciba coordenadas absurdas.
    const yy = Math.max(vista.yMin - rangoY * 2, Math.min(vista.yMax + rangoY * 2, y));
    actual.push([aX(x), aY(yy)]);
    yPrev = y;
  }
  if (actual.length > 1) lista.push(actual);
  return lista;
}

const camino = (puntos: Array<[number, number]>) =>
  puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

/* ------------------------------------------------------------ SVG del 2D -- */

export interface OpcionesDibujo {
  w: number;
  h: number;
  /** La vista actual (puede estar movida o acercada por el lector). */
  vista?: Vista;
  /** Valores de los deslizadores. */
  valores?: Record<string, number>;
  /** Abscisa bajo el cursor: se marca el punto de cada curva. */
  rastreo?: number | null;
}

export interface Notable {
  x: number;
  y: number;
  texto: string;
  color: string;
}

export interface Resultado2D {
  svg: string;
  errores: Array<{ indice: number; error: string }>;
  notables: Notable[];
  /** Valor de la integral, si se pidio el area. */
  integral: number | null;
  /** Pendiente de la tangente, si se pidio. */
  pendiente: number | null;
}

export function dibujar2D(p: PropiedadesGrafica, o: OpcionesDibujo): Resultado2D {
  const { w, h } = o;
  const vista = o.vista ?? { xMin: p.xMin, xMax: p.xMax, yMin: p.yMin, yMax: p.yMax };
  const ambito = ambitoDeParametros(p, o.valores);
  const aX = (x: number) => ((x - vista.xMin) / (vista.xMax - vista.xMin)) * w;
  const aY = (y: number) => h - ((y - vista.yMin) / (vista.yMax - vista.yMin)) * h;
  const letra = Math.max(11, Math.min(18, Math.min(w, h) / 22));
  const partes: string[] = [];

  partes.push(`<rect width="${w}" height="${h}" fill="${color(p.backgroundColor, '#FFFFFF')}"/>`);

  // Rejilla y ejes, con su numeracion.
  const px = pasoRejilla(vista.xMax - vista.xMin, Math.max(4, Math.round(w / 70)));
  const py = pasoRejilla(vista.yMax - vista.yMin, Math.max(4, Math.round(h / 60)));
  const ejeX = Math.min(h - 1, Math.max(0, aY(0)));
  const ejeY = Math.min(w - 1, Math.max(0, aX(0)));
  if (p.showGrid) {
    const lineas: string[] = [];
    for (let x = Math.ceil(vista.xMin / px) * px; x <= vista.xMax; x += px) lineas.push(`M${aX(x).toFixed(1)},0V${h}`);
    for (let y = Math.ceil(vista.yMin / py) * py; y <= vista.yMax; y += py) lineas.push(`M0,${aY(y).toFixed(1)}H${w}`);
    partes.push(`<path d="${lineas.join('')}" stroke="#E2E8F0" stroke-width="1" fill="none"/>`);
  }
  if (p.showAxes) {
    const marcas: string[] = [];
    const textos: string[] = [];
    for (let x = Math.ceil(vista.xMin / px) * px; x <= vista.xMax; x += px) {
      if (Math.abs(x) < px / 2) continue;
      const sx = aX(x);
      marcas.push(`M${sx.toFixed(1)},${(ejeX - 4).toFixed(1)}v8`);
      const ty = ejeX + letra + 4 > h ? ejeX - 6 : ejeX + letra + 2;
      textos.push(`<text x="${sx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle">${esc(redondear(x, 4))}</text>`);
    }
    for (let y = Math.ceil(vista.yMin / py) * py; y <= vista.yMax; y += py) {
      if (Math.abs(y) < py / 2) continue;
      const sy = aY(y);
      marcas.push(`M${(ejeY - 4).toFixed(1)},${sy.toFixed(1)}h8`);
      const izquierda = ejeY - 6 - letra * 2 < 0;
      textos.push(
        `<text x="${(izquierda ? ejeY + 7 : ejeY - 7).toFixed(1)}" y="${(sy + letra / 3).toFixed(1)}" text-anchor="${izquierda ? 'start' : 'end'}">${esc(redondear(y, 4))}</text>`,
      );
    }
    partes.push(
      `<path d="M0,${ejeX.toFixed(1)}H${w}M${ejeY.toFixed(1)},0V${h}${marcas.join('')}" stroke="#334155" stroke-width="1.5" fill="none"/>`,
      `<path d="M${w},${ejeX.toFixed(1)}l-9,-4.5v9zM${ejeY.toFixed(1)},0l-4.5,9h9z" fill="#334155"/>`,
      `<g font-size="${letra.toFixed(1)}" fill="#475569" font-family="Lato, sans-serif">${textos.join('')}</g>`,
      `<g font-size="${(letra * 1.15).toFixed(1)}" fill="#1E293B" font-style="italic" font-family="Lato, sans-serif">` +
        `<text x="${w - 6}" y="${(ejeX - 10).toFixed(1)}" text-anchor="end">${esc(p.xLabel)}</text>` +
        `<text x="${(ejeY + 10).toFixed(1)}" y="${(letra * 1.2).toFixed(1)}">${esc(p.yLabel)}</text></g>`,
    );
  }

  const compiladas = compilarFunciones(p);
  const errores = compiladas.filter((c) => c.error).map((c) => ({ indice: c.indice, error: c.error! }));
  const fx = (c: FuncionCompilada) => (x: number) => c.a!({ ...ambito, x });
  const explicitas = compiladas.filter((c) => c.f.kind === 'y' && c.a && c.f.visible);

  let valorIntegral: number | null = null;
  let pendiente: number | null = null;

  // Area bajo la curva: va debajo de las curvas.
  const conArea = compiladas[p.area.fn];
  if (p.area.enabled && conArea?.a && conArea.f.kind === 'y') {
    const a = valorEn(p.area.a, ambito);
    const b = valorEn(p.area.b, ambito);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const f = fx(conArea);
      valorIntegral = integral(f, a, b);
      for (const tramo of trazos(f, vista, w, h, lo, hi)) {
        const primero = tramo[0];
        const ultimo = tramo[tramo.length - 1];
        partes.push(
          `<path d="M${primero[0].toFixed(1)},${ejeX.toFixed(1)}${camino(tramo).replace(/^M/, 'L')}L${ultimo[0].toFixed(1)},${ejeX.toFixed(1)}Z" fill="${color(p.area.color)}" fill-opacity="0.25" stroke="none"/>`,
        );
      }
    }
  }

  // Las curvas.
  for (const c of compiladas) {
    if (!c.a || !c.f.visible) continue;
    const trazo = `stroke="${color(c.f.color)}" stroke-width="${Math.max(1, Math.min(10, c.f.width))}" fill="none" stroke-linejoin="round" stroke-linecap="round"${c.f.dashed ? ' stroke-dasharray="8 6"' : ''}`;
    if (c.f.kind === 'y') {
      const desde = c.f.domainMin ?? -Infinity;
      const hasta = c.f.domainMax ?? Infinity;
      const d = trazos(fx(c), vista, w, h, desde, hasta).map(camino).join('');
      if (d) partes.push(`<path d="${d}" ${trazo}/>`);
    } else if (c.f.kind === 'param' && c.b) {
      const puntos: Array<[number, number]> = [];
      const n = 800;
      const d: string[] = [];
      for (let i = 0; i <= n; i++) {
        const t = c.f.tMin + ((c.f.tMax - c.f.tMin) * i) / n;
        const x = c.a({ ...ambito, t });
        const y = c.b({ ...ambito, t });
        if (Number.isFinite(x) && Number.isFinite(y)) puntos.push([aX(x), aY(y)]);
        else if (puntos.length) {
          if (puntos.length > 1) d.push(camino(puntos));
          puntos.length = 0;
        }
      }
      if (puntos.length > 1) d.push(camino(puntos));
      if (d.length) partes.push(`<path d="${d.join('')}" ${trazo}/>`);
    }
  }

  // Tangente.
  const conTangente = compiladas[p.tangent.fn];
  if (p.tangent.enabled && conTangente?.a && conTangente.f.kind === 'y') {
    const f = fx(conTangente);
    const x0 = valorEn(p.tangent.x0, ambito);
    const y0 = f(x0);
    const m = derivada(f, x0);
    if (Number.isFinite(y0) && Number.isFinite(m)) {
      pendiente = m;
      const recta = (x: number) => y0 + m * (x - x0);
      partes.push(
        `<path d="M0,${aY(recta(vista.xMin)).toFixed(1)}L${w},${aY(recta(vista.xMax)).toFixed(1)}" stroke="${color(p.tangent.color, '#DC2626')}" stroke-width="2" stroke-dasharray="6 4" fill="none"/>`,
        `<circle cx="${aX(x0).toFixed(1)}" cy="${aY(y0).toFixed(1)}" r="5" fill="${color(p.tangent.color, '#DC2626')}"/>`,
        `<text x="${(aX(x0) + 8).toFixed(1)}" y="${(aY(y0) - 8).toFixed(1)}" font-size="${letra.toFixed(1)}" fill="${color(p.tangent.color, '#DC2626')}" font-family="Lato, sans-serif" font-weight="700">m = ${esc(redondear(m))}</text>`,
      );
    }
  }

  // Puntos notables: raices y cortes.
  const notables: Notable[] = [];
  if (p.markRoots) {
    for (const c of explicitas) {
      for (const r of raices(fx(c), vista.xMin, vista.xMax)) {
        notables.push({ x: r, y: 0, texto: punto(r, 0), color: color(c.f.color) });
      }
    }
  }
  if (p.markIntersections) {
    for (let i = 0; i < explicitas.length; i++) {
      for (let j = i + 1; j < explicitas.length; j++) {
        const f = fx(explicitas[i]);
        const g = fx(explicitas[j]);
        for (const r of raices((x) => f(x) - g(x), vista.xMin, vista.xMax)) {
          const y = f(r);
          if (Number.isFinite(y)) notables.push({ x: r, y, texto: punto(r, y), color: '#0F172A' });
        }
      }
    }
  }
  // Los puntos que pone el autor.
  for (const p2 of p.points) {
    const x = valorEn(p2.x, ambito);
    const y = valorEn(p2.y, ambito);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      notables.push({ x, y, texto: p2.label || punto(x, y), color: color(p2.color, '#0F172A') });
    }
  }
  for (const n of notables.slice(0, 60)) {
    const sx = aX(n.x);
    const sy = aY(n.y);
    if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
    partes.push(
      `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="5" fill="${n.color}" stroke="#fff" stroke-width="1.5"/>`,
      `<text x="${(sx + 7).toFixed(1)}" y="${(sy - 7).toFixed(1)}" font-size="${(letra * 0.95).toFixed(1)}" fill="${n.color}" font-family="Lato, sans-serif" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(n.texto)}</text>`,
    );
  }

  // Leyenda: las funciones con su color, y el valor de la integral.
  const leyenda: string[] = [];
  let ly = letra * 1.4;
  if (p.title) {
    leyenda.push(`<text x="${w / 2}" y="${ly.toFixed(1)}" text-anchor="middle" font-weight="700" font-size="${(letra * 1.2).toFixed(1)}" fill="#0F172A">${esc(p.title)}</text>`);
    ly += letra * 1.5;
  }
  for (const c of compiladas) {
    if (!c.f.visible || c.f.kind === 'z') continue;
    const texto = c.f.label || (c.f.kind === 'y' ? `y = ${c.f.expr.replace(/^\s*[a-zA-Z](\([a-z]\))?\s*=\s*/, '')}` : `(${c.f.expr}, ${c.f.exprY})`);
    leyenda.push(
      `<rect x="10" y="${(ly - letra * 0.8).toFixed(1)}" width="${(letra * 1.2).toFixed(1)}" height="${(letra * 0.35).toFixed(1)}" fill="${color(c.f.color)}" rx="2"/>`,
      `<text x="${(14 + letra * 1.4).toFixed(1)}" y="${ly.toFixed(1)}" fill="#0F172A" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(texto.slice(0, 60))}</text>`,
    );
    ly += letra * 1.35;
  }
  if (valorIntegral !== null) {
    leyenda.push(
      `<text x="10" y="${ly.toFixed(1)}" fill="${color(p.area.color)}" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="3">∫ = ${esc(redondear(valorIntegral, 3))}</text>`,
    );
  }
  if (leyenda.length) partes.push(`<g font-size="${letra.toFixed(1)}" font-family="Lato, sans-serif">${leyenda.join('')}</g>`);

  // Rastreo: el valor de cada curva bajo el cursor.
  if (o.rastreo !== null && o.rastreo !== undefined && Number.isFinite(o.rastreo)) {
    const x = o.rastreo;
    const sx = aX(x);
    partes.push(`<path d="M${sx.toFixed(1)},0V${h}" stroke="#94A3B8" stroke-dasharray="3 3"/>`);
    for (const c of explicitas) {
      const y = fx(c)(x);
      if (!Number.isFinite(y) || y < vista.yMin || y > vista.yMax) continue;
      const sy = aY(y);
      const derecha = sx > w - 140;
      partes.push(
        `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="5" fill="${color(c.f.color)}"/>`,
        `<text x="${(derecha ? sx - 8 : sx + 8).toFixed(1)}" y="${(sy - 8).toFixed(1)}" text-anchor="${derecha ? 'end' : 'start'}" font-size="${letra.toFixed(1)}" font-weight="700" fill="${color(c.f.color)}" font-family="Lato, sans-serif" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(punto(x, y))}</text>`,
      );
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block">${partes.join('')}</svg>`;
  return { svg, errores, notables, integral: valorIntegral, pendiente };
}

function valorEn(texto: string, ambito: Record<string, number>): number {
  const c = compilar(String(texto ?? ''), Object.keys(ambito));
  return c.ok ? c.evaluar(ambito) : NaN;
}

/* ------------------------------------------------------------ SVG del 3D -- */

const MAPAS: Record<PropiedadesGrafica['colorMap'], (t: number) => [number, number, number]> = {
  // t en [0, 1]: de abajo a arriba de la superficie.
  arcoiris: (t) => hsl(240 - 240 * t, 0.75, 0.55),
  frio: (t) => hsl(200 - 40 * t, 0.7, 0.35 + 0.35 * t),
  calor: (t) => hsl(50 * t, 0.85, 0.4 + 0.2 * t),
  uniforme: () => [37, 99, 235],
};

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function hexARgb(c: string): [number, number, number] {
  const v = color(c);
  return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
}

export interface Opciones3D {
  w: number;
  h: number;
  valores?: Record<string, number>;
  /** Angulos de la vista; si faltan, los guardados. */
  rotZ?: number;
  rotX?: number;
  /** Lado de la malla. */
  malla?: number;
}

/**
 * Superficies z = f(x, y) en una caja, con proyeccion ortografica y el algoritmo
 * del pintor: cada cuadrito se pinta de atras adelante, con una luz fija para que
 * se lea el relieve.
 */
export function dibujar3D(p: PropiedadesGrafica, o: Opciones3D): { svg: string; errores: Array<{ indice: number; error: string }> } {
  const { w, h } = o;
  const n = Math.max(8, Math.min(60, o.malla ?? 34));
  const ambito = ambitoDeParametros(p, o.valores);
  const compiladas = compilarFunciones(p);
  const errores = compiladas.filter((c) => c.error).map((c) => ({ indice: c.indice, error: c.error! }));
  const superficies = compiladas.filter((c) => c.f.kind === 'z' && c.a && c.f.visible);

  // Valores en la malla y su rango, para escalar la altura y colorear.
  const mallas = superficies.map((c) => {
    const z: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const fila: number[] = [];
      const x = p.xMin + ((p.xMax - p.xMin) * i) / n;
      for (let j = 0; j <= n; j++) {
        const y = p.yMin + ((p.yMax - p.yMin) * j) / n;
        fila.push(c.a!({ ...ambito, x, y }));
      }
      z.push(fila);
    }
    return { c, z };
  });
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const { z } of mallas) for (const fila of z) for (const v of fila) if (Number.isFinite(v)) { zMin = Math.min(zMin, v); zMax = Math.max(zMax, v); }
  if (!Number.isFinite(zMin)) {
    zMin = -1;
    zMax = 1;
  }
  if (zMax - zMin < 1e-9) {
    zMin -= 1;
    zMax += 1;
  }

  // Todo a una caja de [-1, 1]^3 para que la rotacion no dependa de las escalas.
  const nx = (x: number) => ((x - p.xMin) / (p.xMax - p.xMin)) * 2 - 1;
  const ny = (y: number) => ((y - p.yMin) / (p.yMax - p.yMin)) * 2 - 1;
  const nz = (z: number) => ((z - zMin) / (zMax - zMin)) * 1.4 - 0.7;
  const az = ((o.rotZ ?? p.rotZ) * Math.PI) / 180;
  const el = ((o.rotX ?? p.rotX) * Math.PI) / 180;
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const ce = Math.cos(el);
  const se = Math.sin(el);
  const escala = Math.min(w, h) * 0.34;
  const proyectar = (X: number, Y: number, Z: number) => {
    const x1 = X * ca - Y * sa;
    const y1 = X * sa + Y * ca;
    const y2 = y1 * ce - Z * se;
    const profundidad = y1 * se + Z * ce;
    return { sx: w / 2 + x1 * escala, sy: h / 2 + y2 * escala * 0.9 + h * 0.04, d: profundidad };
  };

  const partes: string[] = [`<rect width="${w}" height="${h}" fill="${color(p.backgroundColor, '#FFFFFF')}"/>`];

  // Caja: las aristas del fondo, debajo de la superficie.
  const esquinas = [-1, 1].flatMap((X) => [-1, 1].flatMap((Y) => [-0.7, 0.7].map((Z) => ({ X, Y, Z }))));
  const aristas: string[] = [];
  for (let a = 0; a < esquinas.length; a++) {
    for (let b = a + 1; b < esquinas.length; b++) {
      const A = esquinas[a];
      const B = esquinas[b];
      const distintas = Number(A.X !== B.X) + Number(A.Y !== B.Y) + Number(A.Z !== B.Z);
      if (distintas !== 1) continue;
      const pa = proyectar(A.X, A.Y, A.Z);
      const pb = proyectar(B.X, B.Y, B.Z);
      aristas.push(`M${pa.sx.toFixed(1)},${pa.sy.toFixed(1)}L${pb.sx.toFixed(1)},${pb.sy.toFixed(1)}`);
    }
  }
  if (p.showAxes) partes.push(`<path d="${aristas.join('')}" stroke="#CBD5E1" stroke-width="1" fill="none"/>`);

  // Los cuadritos de todas las superficies, de atras adelante.
  const quads: Array<{ d: number; path: string; fill: string }> = [];
  const luz = [0.3, -0.4, 0.85];
  const nl = Math.hypot(...luz);
  for (const { c, z } of mallas) {
    const base = hexARgb(c.f.color);
    const varias = mallas.length > 1;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const zs = [z[i][j], z[i + 1][j], z[i + 1][j + 1], z[i][j + 1]];
        if (zs.some((v) => !Number.isFinite(v))) continue;
        const xs = [i, i + 1, i + 1, i].map((k) => nx(p.xMin + ((p.xMax - p.xMin) * k) / n));
        const ys = [j, j, j + 1, j + 1].map((k) => ny(p.yMin + ((p.yMax - p.yMin) * k) / n));
        const Zs = zs.map(nz);
        const pts = xs.map((X, k) => proyectar(X, ys[k], Zs[k]));
        // Normal para la luz.
        const ux = xs[1] - xs[0];
        const uz = Zs[1] - Zs[0];
        const vy = ys[3] - ys[0];
        const vz = Zs[3] - Zs[0];
        const normal = [-uz * vy, -ux * vz, ux * vy];
        const nn = Math.hypot(...normal) || 1;
        const brillo = 0.55 + 0.45 * Math.abs((normal[0] * luz[0] + normal[1] * luz[1] + normal[2] * luz[2]) / (nn * nl));
        const t = ((zs[0] + zs[1] + zs[2] + zs[3]) / 4 - zMin) / (zMax - zMin);
        const rgb = varias || p.colorMap === 'uniforme' ? base : MAPAS[p.colorMap](t);
        const fill = `rgb(${rgb.map((v) => Math.round(Math.min(255, v * brillo))).join(',')})`;
        quads.push({
          d: pts.reduce((s, q) => s + q.d, 0) / 4,
          path: `M${pts.map((q) => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join('L')}Z`,
          fill,
        });
      }
    }
  }
  quads.sort((a, b) => a.d - b.d);
  const trazoMalla = n > 40 ? 'none' : 'rgba(15,23,42,0.18)';
  for (const q of quads) partes.push(`<path d="${q.path}" fill="${q.fill}" stroke="${trazoMalla}" stroke-width="0.5"/>`);

  // Ejes con sus nombres y extremos.
  if (p.showAxes) {
    const letra = Math.max(11, Math.min(16, Math.min(w, h) / 26));
    const rotulo = (X: number, Y: number, Z: number, texto: string, negrita = false) => {
      const q = proyectar(X, Y, Z);
      return `<text x="${q.sx.toFixed(1)}" y="${q.sy.toFixed(1)}" text-anchor="middle"${negrita ? ' font-weight="700" font-style="italic"' : ''}>${esc(texto)}</text>`;
    };
    partes.push(
      `<g font-size="${letra.toFixed(1)}" fill="#334155" font-family="Lato, sans-serif" paint-order="stroke" stroke="#fff" stroke-width="3">` +
        // Cada eje en una arista distinta de la caja, para que sus numeros no se monten.
        rotulo(0, -1.4, -0.7, 'x', true) +
        rotulo(-1, -1.2, -0.7, redondear(p.xMin)) +
        rotulo(1, -1.2, -0.7, redondear(p.xMax)) +
        rotulo(1.4, 0, -0.7, 'y', true) +
        rotulo(1.2, -1, -0.7, redondear(p.yMin)) +
        rotulo(1.2, 1, -0.7, redondear(p.yMax)) +
        rotulo(-1.15, 1.15, 0, 'z', true) +
        rotulo(-1.15, 1.15, 0.7, redondear(zMax)) +
        rotulo(-1.15, 1.15, -0.7, redondear(zMin)) +
        `</g>`,
    );
  }

  const leyenda: string[] = [];
  const letra = Math.max(11, Math.min(17, Math.min(w, h) / 24));
  let ly = letra * 1.4;
  if (p.title) {
    leyenda.push(`<text x="${w / 2}" y="${ly.toFixed(1)}" text-anchor="middle" font-weight="700" font-size="${(letra * 1.2).toFixed(1)}">${esc(p.title)}</text>`);
    ly += letra * 1.5;
  }
  for (const { c } of mallas) {
    leyenda.push(
      `<rect x="10" y="${(ly - letra * 0.8).toFixed(1)}" width="${letra.toFixed(1)}" height="${letra.toFixed(1)}" rx="2" fill="${color(c.f.color)}"/>`,
      `<text x="${(16 + letra).toFixed(1)}" y="${ly.toFixed(1)}">${esc(c.f.label || `z = ${c.f.expr.replace(/^\s*[a-zA-Z](\([a-z, ]+\))?\s*=\s*/, '')}`)}</text>`,
    );
    ly += letra * 1.4;
  }
  partes.push(`<g font-size="${letra.toFixed(1)}" fill="#0F172A" font-family="Lato, sans-serif" paint-order="stroke" stroke="#fff" stroke-width="3">${leyenda.join('')}</g>`);

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block">${partes.join('')}</svg>`,
    errores,
  };
}

/** Plantillas para empezar, como las de GeoGebra. */
export const EJEMPLOS_GRAFICA: Array<{ label: string; props: Partial<PropiedadesGrafica> }> = [
  {
    label: 'Parábola con deslizadores',
    props: {
      mode: '2d',
      functions: [funcionNueva('y', 'a(x - h)^2 + k', COLORES_GRAFICA[0])],
      params: [
        { name: 'a', value: 1, min: -3, max: 3, step: 0.1 },
        { name: 'h', value: 0, min: -4, max: 4, step: 0.5 },
        { name: 'k', value: -2, min: -4, max: 4, step: 0.5 },
      ],
      markRoots: true,
      xMin: -6, xMax: 6, yMin: -5, yMax: 7,
    },
  },
  {
    label: 'Seno y coseno',
    props: {
      mode: '2d',
      functions: [funcionNueva('y', 'sin(x)', COLORES_GRAFICA[0]), funcionNueva('y', 'cos(x)', COLORES_GRAFICA[1])],
      markIntersections: true,
      xMin: -7, xMax: 7, yMin: -2, yMax: 2,
    },
  },
  {
    label: 'Recta y parábola: cortes',
    props: {
      mode: '2d',
      functions: [funcionNueva('y', 'x^2 - 3', COLORES_GRAFICA[0]), funcionNueva('y', '2x', COLORES_GRAFICA[1])],
      markIntersections: true,
      markRoots: true,
      xMin: -5, xMax: 6, yMin: -5, yMax: 12,
    },
  },
  {
    label: 'Área bajo la curva',
    props: {
      mode: '2d',
      functions: [funcionNueva('y', '0.5x^2 + 1', COLORES_GRAFICA[0])],
      area: { enabled: true, fn: 0, a: '0', b: '2', color: '#2563EB' },
      xMin: -2, xMax: 4, yMin: -1, yMax: 6,
    },
  },
  {
    label: 'Recta tangente',
    props: {
      mode: '2d',
      functions: [funcionNueva('y', 'x^3 - 3x', COLORES_GRAFICA[0])],
      params: [{ name: 'p', value: 1.5, min: -2.5, max: 2.5, step: 0.1 }],
      tangent: { enabled: true, fn: 0, x0: 'p', color: '#DC2626' },
      xMin: -3, xMax: 3, yMin: -4, yMax: 4,
    },
  },
  {
    label: 'Circunferencia (paramétrica)',
    props: {
      mode: '2d',
      functions: [{ ...funcionNueva('param', 'r cos(t)', COLORES_GRAFICA[3]), exprY: 'r sin(t)' }],
      params: [{ name: 'r', value: 2, min: 0.5, max: 4, step: 0.1 }],
      xMin: -5, xMax: 5, yMin: -5, yMax: 5,
    },
  },
  {
    label: 'Exponencial y logaritmo',
    props: {
      mode: '2d',
      functions: [
        funcionNueva('y', 'e^x', COLORES_GRAFICA[0]),
        funcionNueva('y', 'ln(x)', COLORES_GRAFICA[1]),
        { ...funcionNueva('y', 'x', COLORES_GRAFICA[7]), dashed: true, width: 2 },
      ],
      xMin: -4, xMax: 6, yMin: -4, yMax: 6,
    },
  },
  {
    label: 'Paraboloide 3D',
    props: { mode: '3d', functions: [funcionNueva('z', 'x^2 + y^2', COLORES_GRAFICA[0])], xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
  },
  {
    label: 'Silla de montar 3D',
    props: { mode: '3d', functions: [funcionNueva('z', 'x^2 - y^2', COLORES_GRAFICA[0])], xMin: -2, xMax: 2, yMin: -2, yMax: 2, colorMap: 'calor' },
  },
  {
    label: 'Onda 3D',
    props: {
      mode: '3d',
      functions: [funcionNueva('z', 'sin(sqrt(x^2 + y^2) - a)', COLORES_GRAFICA[0])],
      params: [{ name: 'a', value: 0, min: 0, max: 6.28, step: 0.1 }],
      xMin: -8, xMax: 8, yMin: -8, yMax: 8,
      colorMap: 'frio',
    },
  },
];
