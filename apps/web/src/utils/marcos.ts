/**
 * Marcos: siluetas con una imagen dentro, como los "Frames" de Canva.
 *
 * Cada marco se compone de tres capas, todas en un lienzo de 0-100 que se estira
 * a la caja (como las formas):
 *   - `cuerpo`: lo que va debajo (la carcasa del movil, el papel de la polaroid).
 *   - `mascara`: la silueta de la zona de la foto, dentro de `area`.
 *   - `encima`: detalles que tapan la foto (las perforaciones de la pelicula).
 * La foto va con object-fit: cover dentro de la mascara, asi que nunca se
 * deforma aunque el marco se estire.
 *
 * Las capas son SVG escritos aqui; nada que venga del usuario entra en ellas
 * salvo el color, que se valida como hexadecimal.
 */

export interface Marco {
  id: string;
  label: string;
  grupo: string;
  /** Proporcion ancho/alto con la que se inserta. */
  ratio: number;
  /** Zona de la foto dentro de la caja, en %. */
  area: { x: number; y: number; w: number; h: number };
  /** Silueta de la foto: contenido SVG en 0-100 (blanco = se ve). Sin ella, rectangulo. */
  mascara?: string;
  cuerpo?: (color: string) => string;
  encima?: (color: string) => string;
}

const TODO = { x: 0, y: 0, w: 100, h: 100 };
const forma = (d: string) => `<path d="${d}" fill="#fff"/>`;

function estrella(puntas: number, ext: number, int: number): string {
  const p: string[] = [];
  for (let i = 0; i < puntas * 2; i++) {
    const r = i % 2 ? int : ext;
    const a = (Math.PI * i) / puntas - Math.PI / 2;
    p.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${p.join(' ')}" fill="#fff"/>`;
}

function poligono(lados: number, giro = -Math.PI / 2): string {
  const p = Array.from({ length: lados }, (_, i) => {
    const a = (2 * Math.PI * i) / lados + giro;
    return `${(50 + 50 * Math.cos(a)).toFixed(1)},${(50 + 50 * Math.sin(a)).toFixed(1)}`;
  });
  return `<polygon points="${p.join(' ')}" fill="#fff"/>`;
}

/** Borde ondulado (sello). */
function sello(ondas: number): string {
  let d = '';
  for (let i = 0; i <= ondas * 2; i++) {
    const a = (Math.PI * i) / ondas;
    const r = i % 2 ? 44 : 50;
    const x = 50 + r * Math.cos(a);
    const y = 50 + r * Math.sin(a);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return forma(`${d}Z`);
}

/** Papel rasgado: bordes en zigzag irregular. */
function rasgado(semilla: number): string {
  let n = semilla;
  const azar = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
  const borde = (fijo: number, desde: number, hasta: number, vertical: boolean, dentro: number) => {
    const pts: string[] = [];
    for (let t = desde; desde < hasta ? t <= hasta : t >= hasta; t += desde < hasta ? 4 : -4) {
      const v = fijo + dentro * azar() * 3;
      pts.push(vertical ? `${v.toFixed(1)},${t}` : `${t},${v.toFixed(1)}`);
    }
    return pts;
  };
  const pts = [
    ...borde(0, 0, 100, false, 1),
    ...borde(100, 0, 100, true, -1),
    ...borde(100, 100, 0, false, -1),
    ...borde(0, 100, 0, true, 1),
  ];
  return `<polygon points="${pts.join(' ')}" fill="#fff"/>`;
}

const letra = (c: string) =>
  `<text x="50" y="86" text-anchor="middle" textLength="94" lengthAdjust="spacingAndGlyphs" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="104" fill="#fff">${c}</text>`;

const MARCOS_BASE: Marco[] = [
  // --- Basicos ---
  { id: 'cuadrado', label: 'Cuadrado', grupo: 'Básicos', ratio: 1, area: TODO },
  { id: 'redondeado', label: 'Redondeado', grupo: 'Básicos', ratio: 1, area: TODO, mascara: '<rect x="0" y="0" width="100" height="100" rx="14" fill="#fff"/>' },
  { id: 'circulo', label: 'Círculo', grupo: 'Básicos', ratio: 1, area: TODO, mascara: '<ellipse cx="50" cy="50" rx="50" ry="50" fill="#fff"/>' },
  { id: 'triangulo', label: 'Triángulo', grupo: 'Básicos', ratio: 1.1, area: TODO, mascara: forma('M50,0 L100,100 L0,100 Z') },
  { id: 'rombo', label: 'Rombo', grupo: 'Básicos', ratio: 1, area: TODO, mascara: forma('M50,0 L100,50 L50,100 L0,50 Z') },
  { id: 'estrella', label: 'Estrella', grupo: 'Básicos', ratio: 1, area: TODO, mascara: estrella(5, 50, 22) },
  { id: 'hexagono', label: 'Hexágono', grupo: 'Básicos', ratio: 1.1, area: TODO, mascara: poligono(6, 0) },
  { id: 'corazon', label: 'Corazón', grupo: 'Básicos', ratio: 1.08, area: TODO, mascara: forma('M50,96 C14,70 0,46 0,28 C0,10 14,0 28,0 C40,0 47,8 50,16 C53,8 60,0 72,0 C86,0 100,10 100,28 C100,46 86,70 50,96 Z') },
  { id: 'arco', label: 'Arco', grupo: 'Básicos', ratio: 0.8, area: TODO, mascara: forma('M0,100 V50 A50,50 0 0 1 100,50 V100 Z') },
  { id: 'sello', label: 'Sello', grupo: 'Básicos', ratio: 1, area: TODO, mascara: sello(14) },
  { id: 'flecha', label: 'Flecha', grupo: 'Básicos', ratio: 1.4, area: TODO, mascara: forma('M0,25 H62 V0 L100,50 L62,100 V75 H0 Z') },
  { id: 'paralelogramo', label: 'Inclinado', grupo: 'Básicos', ratio: 1.4, area: TODO, mascara: forma('M20,0 H100 L80,100 H0 Z') },

  // --- Pelicula y foto ---
  {
    id: 'polaroid',
    label: 'Polaroid',
    grupo: 'Película y foto',
    ratio: 0.84,
    area: { x: 6, y: 5, w: 88, h: 74 },
    cuerpo: () => '<rect x="0" y="0" width="100" height="100" fill="#ffffff" stroke="#e2e8f0" stroke-width="0.6"/>',
  },
  {
    id: 'pelicula',
    label: 'Película',
    grupo: 'Película y foto',
    ratio: 1.5,
    area: { x: 0, y: 14, w: 100, h: 72 },
    cuerpo: () => '<rect x="0" y="0" width="100" height="100" fill="#111827"/>',
    encima: () =>
      Array.from({ length: 12 }, (_, i) => `<rect x="${2 + i * 8.3}" y="4" width="4.2" height="6" rx="1" fill="#f8fafc"/><rect x="${2 + i * 8.3}" y="90" width="4.2" height="6" rx="1" fill="#f8fafc"/>`).join(''),
  },
  {
    id: 'diapositiva',
    label: 'Diapositiva',
    grupo: 'Película y foto',
    ratio: 1,
    area: { x: 16, y: 20, w: 68, h: 60 },
    cuerpo: (c) => `<rect x="0" y="0" width="100" height="100" rx="6" fill="${c}"/><text x="50" y="93" text-anchor="middle" font-family="Arial, sans-serif" font-size="6" fill="#fff" opacity="0.7">BOOKSTUDIO</text>`,
  },

  // --- Dispositivos ---
  {
    id: 'movil',
    label: 'Móvil',
    grupo: 'Dispositivos',
    ratio: 0.5,
    area: { x: 6, y: 4, w: 88, h: 92 },
    mascara: '<rect x="0" y="0" width="100" height="100" rx="9" fill="#fff"/>',
    cuerpo: (c) => `<rect x="0" y="0" width="100" height="100" rx="14" fill="${c}"/>`,
    encima: (c) => `<rect x="38" y="5.2" width="24" height="2.6" rx="1.3" fill="${c}"/>`,
  },
  {
    id: 'tableta',
    label: 'Tableta',
    grupo: 'Dispositivos',
    ratio: 0.76,
    area: { x: 6, y: 5, w: 88, h: 90 },
    mascara: '<rect x="0" y="0" width="100" height="100" rx="3" fill="#fff"/>',
    cuerpo: (c) => `<rect x="0" y="0" width="100" height="100" rx="8" fill="${c}"/>`,
  },
  {
    id: 'monitor',
    label: 'Monitor',
    grupo: 'Dispositivos',
    ratio: 1.25,
    area: { x: 3.5, y: 4.5, w: 93, h: 66 },
    cuerpo: (c) =>
      `<rect x="0" y="0" width="100" height="76" rx="3" fill="${c}"/><path d="M42,76 H58 L61,90 H39 Z" fill="${c}"/><rect x="28" y="90" width="44" height="4" rx="2" fill="${c}"/>`,
  },
  {
    id: 'portatil',
    label: 'Portátil',
    grupo: 'Dispositivos',
    ratio: 1.55,
    area: { x: 13, y: 5, w: 74, h: 72 },
    cuerpo: (c) => `<rect x="10" y="0" width="80" height="82" rx="4" fill="${c}"/><path d="M0,84 H100 L96,94 H4 Z" fill="${c}"/><rect x="44" y="84" width="12" height="2" rx="1" fill="#94a3b8"/>`,
  },

  // --- Papel ---
  { id: 'papel-rasgado', label: 'Papel rasgado', grupo: 'Papel', ratio: 1.3, area: TODO, mascara: rasgado(7) },
  { id: 'papel-rasgado-2', label: 'Papel rasgado 2', grupo: 'Papel', ratio: 0.8, area: TODO, mascara: rasgado(23) },
  {
    id: 'papel-cinta',
    label: 'Foto con cinta',
    grupo: 'Papel',
    ratio: 1.1,
    area: { x: 4, y: 6, w: 92, h: 90 },
    cuerpo: () => '<rect x="1" y="3" width="98" height="96" fill="#ffffff" stroke="#e2e8f0" stroke-width="0.5"/>',
    encima: () => '<polygon points="36,0 64,1 63,10 37,9" fill="#fde68a" opacity="0.85"/>',
  },

  // --- Manchas ---
  { id: 'mancha-1', label: 'Mancha 1', grupo: 'Manchas', ratio: 1, area: TODO, mascara: forma('M52,2 C76,0 98,18 98,44 C98,72 82,98 52,98 C24,98 2,82 2,54 C2,26 26,4 52,2 Z') },
  { id: 'mancha-2', label: 'Mancha 2', grupo: 'Manchas', ratio: 0.85, area: TODO, mascara: forma('M48,0 C70,0 90,14 92,38 C94,58 100,72 88,88 C76,100 50,100 30,94 C10,88 0,70 4,50 C8,30 22,0 48,0 Z') },
  { id: 'mancha-3', label: 'Mancha 3', grupo: 'Manchas', ratio: 1.2, area: TODO, mascara: forma('M30,6 C46,-2 64,8 78,6 C94,4 102,26 96,44 C90,62 98,80 82,94 C66,104 44,92 28,94 C10,96 -2,78 4,58 C10,40 12,14 30,6 Z') },
];

const LETRAS: Marco[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({
  id: `letra-${c.toLowerCase()}`,
  label: `Letra ${c}`,
  grupo: 'Letras',
  ratio: c === 'I' ? 0.45 : c === 'M' || c === 'W' ? 1.05 : 0.82,
  area: TODO,
  mascara: letra(c),
}));

const NUMEROS: Marco[] = '0123456789'.split('').map((c) => ({
  id: `numero-${c}`,
  label: `Número ${c}`,
  grupo: 'Números',
  ratio: c === '1' ? 0.55 : 0.75,
  area: TODO,
  mascara: letra(c),
}));

export const MARCOS: Marco[] = [...MARCOS_BASE, ...LETRAS, ...NUMEROS];
export const MARCOS_POR_ID: Record<string, Marco> = Object.fromEntries(MARCOS.map((m) => [m.id, m]));
export const GRUPOS_MARCOS = [...new Set(MARCOS.map((m) => m.grupo))];

export const marcoDe = (id: unknown): Marco => MARCOS_POR_ID[String(id)] ?? MARCOS_POR_ID.cuadrado;

const colorValido = (c: unknown) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#1E293B');

/** Una capa como SVG completo (viewBox 0-100, estirado a la caja). */
export function svgCapa(contenido: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">${contenido}</svg>`;
}

export const cuerpoDe = (m: Marco, color: unknown) => (m.cuerpo ? svgCapa(m.cuerpo(colorValido(color))) : '');
export const encimaDe = (m: Marco, color: unknown) => (m.encima ? svgCapa(m.encima(colorValido(color))) : '');

/** La mascara como data URL para mask-image (vale tambien en la pagina exportada). */
export function mascaraUrl(m: Marco): string | null {
  if (!m.mascara) return null;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svgCapa(m.mascara))}")`;
}

/** Paisaje de muestra para un marco sin foto, como el de Canva. */
export const PAISAJE_MUESTRA = svgCapa(
  '<rect width="100" height="100" fill="#bfe3fb"/>' +
    '<ellipse cx="36" cy="30" rx="12" ry="5" fill="#fff"/><ellipse cx="44" cy="27" rx="9" ry="6" fill="#fff"/>' +
    '<path d="M0,72 C20,62 40,64 60,70 C78,75 90,70 100,66 V100 H0 Z" fill="#c4dd84"/>' +
    '<path d="M0,82 C26,74 52,78 74,84 C86,88 94,86 100,84 V100 H0 Z" fill="#87a815"/>',
);
