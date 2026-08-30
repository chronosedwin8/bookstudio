/**
 * Tipos de hoja y fondos de pagina.
 *
 * Todo se dibuja con degradados CSS sobre el lienzo logico de 1000px: no hay
 * imagenes que descargar, se ve nitido a cualquier zoom y no depende de terceros.
 * El identificador se guarda en pages.background_pattern.
 */

export interface PaperDefinition {
  label: string;
  /** Estilos aplicados a la capa de fondo de la pagina. */
  style: Record<string, string>;
}

const RULE = '#BFD4E8';
const SOFT = '#D9E2EC';

/** Cuadricula de dos tamanos: linea fina y linea gruesa cada n celdas. */
function grid(size: number, color = SOFT, thickness = 1): Record<string, string> {
  return {
    backgroundImage: `linear-gradient(to right, ${color} ${thickness}px, transparent ${thickness}px),
       linear-gradient(to bottom, ${color} ${thickness}px, transparent ${thickness}px)`,
    backgroundSize: `${size}px ${size}px`,
  };
}

/** Renglones horizontales, opcionalmente con margen vertical. */
function ruled(spacing: number, color = RULE, margin = false): Record<string, string> {
  const lines = `repeating-linear-gradient(to bottom, transparent, transparent ${spacing - 1}px, ${color} ${spacing - 1}px, ${color} ${spacing}px)`;
  return {
    backgroundImage: margin
      ? `linear-gradient(to right, transparent 78px, #F2B8C6 78px, #F2B8C6 80px, transparent 80px), ${lines}`
      : lines,
  };
}

function dots(spacing: number, radius: number, color: string): Record<string, string> {
  return {
    backgroundImage: `radial-gradient(circle, ${color} ${radius}px, transparent ${radius}px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
  };
}

export const PAPERS = {
  // --- Papel ---
  'grid-large': { label: 'Cuadricula grande', style: grid(80, SOFT, 2) },
  'grid-medium': { label: 'Cuadricula', style: grid(40) },
  'grid-small': { label: 'Milimetrado', style: grid(20, '#E3EAF2') },
  ruled: { label: 'Rayado', style: ruled(48) },
  'ruled-narrow': { label: 'Rayado estrecho', style: ruled(32) },
  'ruled-margin': { label: 'Rayado con margen', style: ruled(48, RULE, true) },
  dotted: { label: 'Punteado', style: dots(60, 3, '#B9C6D6') },
  'dotted-fine': { label: 'Punteado fino', style: dots(28, 2, '#CBD5E1') },

  /** Pentagrama: cinco lineas agrupadas y separadas del siguiente grupo. */
  staff: {
    label: 'Pentagrama',
    style: {
      backgroundImage: `repeating-linear-gradient(to bottom,
        transparent 0px, transparent 18px, #94A3B8 18px, #94A3B8 20px,
        transparent 20px, transparent 38px, #94A3B8 38px, #94A3B8 40px,
        transparent 40px, transparent 58px, #94A3B8 58px, #94A3B8 60px,
        transparent 60px, transparent 78px, #94A3B8 78px, #94A3B8 80px,
        transparent 80px, transparent 98px, #94A3B8 98px, #94A3B8 100px,
        transparent 100px, transparent 180px)`,
    },
  },

  /** Doble pauta de caligrafia: linea guia discontinua entre dos solidas. */
  handwriting: {
    label: 'Caligrafia',
    style: {
      backgroundImage: `repeating-linear-gradient(to bottom,
        transparent 0px, transparent 40px, #93C5FD 40px, #93C5FD 42px,
        transparent 42px, transparent 70px, #DBEAFE 70px, #DBEAFE 72px,
        transparent 72px, transparent 100px, #93C5FD 100px, #93C5FD 102px,
        transparent 102px, transparent 160px)`,
    },
  },

  // --- Comics ---
  'comic-halftone': {
    label: 'Tramado comic',
    style: {
      ...dots(16, 4, '#FCA5A5'),
      backgroundColor: '#FEF3C7',
    },
  },
  'comic-burst': {
    label: 'Estallido comic',
    style: {
      backgroundImage: `repeating-conic-gradient(from 0deg at 50% 50%,
        #FDE68A 0deg 9deg, #FBBF24 9deg 18deg)`,
    },
  },
  'comic-speed': {
    label: 'Lineas de velocidad',
    style: {
      backgroundImage: `repeating-conic-gradient(from 0deg at 50% 50%,
        transparent 0deg 6deg, #E0E7FF 6deg 7deg)`,
    },
  },

  // --- Patrones ---
  stripes: {
    label: 'Rayas diagonales',
    style: {
      backgroundImage: `repeating-linear-gradient(45deg, #EEF2FF 0px, #EEF2FF 20px, #E0E7FF 20px, #E0E7FF 40px)`,
    },
  },
  checks: {
    label: 'Cuadros vichy',
    style: {
      backgroundImage: `repeating-linear-gradient(0deg, #FCE7F3 0px, #FCE7F3 30px, transparent 30px, transparent 60px),
         repeating-linear-gradient(90deg, #FCE7F3 0px, #FCE7F3 30px, transparent 30px, transparent 60px)`,
      backgroundColor: '#FFF1F2',
    },
  },
  waves: {
    label: 'Ondas',
    style: {
      backgroundImage: `radial-gradient(circle at 50% 100%, transparent 22px, #DBEAFE 22px, #DBEAFE 24px, transparent 24px)`,
      backgroundSize: '60px 30px',
    },
  },

  // --- Bordes ---
  'border-simple': {
    label: 'Marco sencillo',
    style: {
      boxShadow: 'inset 0 0 0 3px #94A3B8, inset 0 0 0 12px transparent, inset 0 0 0 15px #94A3B8',
    },
  },
  'border-dashed': {
    label: 'Marco discontinuo',
    style: {
      backgroundImage: `repeating-linear-gradient(90deg, #64748B 0 18px, transparent 18px 34px),
         repeating-linear-gradient(90deg, #64748B 0 18px, transparent 18px 34px),
         repeating-linear-gradient(0deg, #64748B 0 18px, transparent 18px 34px),
         repeating-linear-gradient(0deg, #64748B 0 18px, transparent 18px 34px)`,
      backgroundSize: '100% 4px, 100% 4px, 4px 100%, 4px 100%',
      backgroundPosition: '0 0, 0 100%, 0 0, 100% 0',
      backgroundRepeat: 'no-repeat',
    },
  },

  // --- Texturas ---
  kraft: {
    label: 'Papel kraft',
    style: {
      backgroundColor: '#E7D3B3',
      backgroundImage: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.5) 0 2px, transparent 2px),
         radial-gradient(circle at 70% 60%, rgba(140,100,60,0.18) 0 3px, transparent 3px)`,
      backgroundSize: '40px 40px, 55px 55px',
    },
  },
  linen: {
    label: 'Lino',
    style: {
      backgroundColor: '#F5F5F0',
      backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 5px),
         repeating-linear-gradient(90deg, rgba(0,0,0,0.04) 0 1px, transparent 1px 5px)`,
    },
  },
} satisfies Record<string, PaperDefinition>;

export type PaperName = keyof typeof PAPERS;

/** El tipado explicito recupera la forma completa que `satisfies` estrecha. */
export const PAPER_CATALOGUE: Record<PaperName, PaperDefinition> = PAPERS;

export const PAPER_GROUPS: Array<{ label: string; papers: PaperName[] }> = [
  {
    label: 'Papel',
    papers: [
      'grid-large', 'grid-medium', 'grid-small',
      'ruled', 'ruled-narrow', 'ruled-margin',
      'dotted', 'dotted-fine', 'staff', 'handwriting',
    ],
  },
  { label: 'Comics', papers: ['comic-halftone', 'comic-burst', 'comic-speed'] },
  { label: 'Patrones', papers: ['stripes', 'checks', 'waves'] },
  { label: 'Bordes', papers: ['border-simple', 'border-dashed'] },
  { label: 'Texturas', papers: ['kraft', 'linen'] },
];

/** Estilos del fondo de una pagina; devuelve {} si no tiene patron o no se reconoce. */
export function paperStyle(pattern: string | null | undefined): Record<string, string> {
  if (!pattern) return {};
  return PAPER_CATALOGUE[pattern as PaperName]?.style ?? {};
}
