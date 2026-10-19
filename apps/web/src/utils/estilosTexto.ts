import type { FontFamily, TextEffect, TextProperties } from '@/types/api';

/**
 * Estilos de texto listos para insertar, como el panel de texto de Canva:
 * los tres basicos (titulo, subtitulo, texto) y combinaciones decorativas.
 *
 * Una combinacion son uno o dos textos con su caja dentro de un recuadro de
 * 0-100. Al insertarla se coloca ese recuadro en la hoja y cada texto en su
 * sitio; quedan seleccionados juntos para moverlos a la vez, y cada uno se puede
 * editar despues por separado (como en Canva).
 */

type TextoDeEstilo = Partial<TextProperties> & { text: string; fontFamily: FontFamily; fontSize: number };

export interface PiezaEstilo {
  props: TextoDeEstilo;
  /** Caja dentro del recuadro de la combinacion, en 0-100. */
  caja: { x: number; y: number; w: number; h: number };
}

export interface EstiloTexto {
  id: string;
  label: string;
  /** Ancho y alto del recuadro en la hoja, en % de la pagina. */
  ancho: number;
  alto: number;
  piezas: PiezaEstilo[];
}

const base = (p: TextoDeEstilo): TextoDeEstilo => ({
  color: '#1E293B',
  backgroundColor: 'transparent',
  textAlign: 'center',
  bold: false,
  italic: false,
  lineHeight: 1.1,
  effect: 'ninguno' as TextEffect,
  effectColor: '#000000',
  uppercase: false,
  ...p,
});

const una = (
  id: string,
  label: string,
  p: TextoDeEstilo,
  ancho = 58,
  alto = 16,
): EstiloTexto => ({ id, label, ancho, alto, piezas: [{ props: base(p), caja: { x: 0, y: 0, w: 100, h: 100 } }] });

/** Dos lineas: la de arriba ocupa `corte`% del alto. */
const dos = (
  id: string,
  label: string,
  arriba: TextoDeEstilo,
  abajo: TextoDeEstilo,
  { ancho = 58, alto = 26, corte = 58 } = {},
): EstiloTexto => ({
  id,
  label,
  ancho,
  alto,
  piezas: [
    { props: base(arriba), caja: { x: 0, y: 0, w: 100, h: corte } },
    { props: base(abajo), caja: { x: 0, y: corte - 6, w: 100, h: 106 - corte } },
  ],
});

/** Los tres de siempre, como "Add a heading / subheading / body text". */
export const ESTILOS_BASICOS: Array<{ id: string; label: string; props: TextoDeEstilo; ancho: number; alto: number }> = [
  { id: 'titulo', label: 'Añadir un título', ancho: 62, alto: 14, props: base({ text: 'Título', fontFamily: 'Poppins', fontSize: 72, bold: true, textAlign: 'left' }) },
  { id: 'subtitulo', label: 'Añadir un subtítulo', ancho: 54, alto: 10, props: base({ text: 'Subtítulo', fontFamily: 'Poppins', fontSize: 44, bold: true, textAlign: 'left' }) },
  { id: 'texto', label: 'Añadir un poco de texto', ancho: 46, alto: 14, props: base({ text: 'Escribe aquí tu texto', fontFamily: 'Lato', fontSize: 28, textAlign: 'left', lineHeight: 1.35 }) },
];

export const ESTILOS_TEXTO: EstiloTexto[] = [
  una('bravo', '¡Bravo! neón', { text: '¡BRAVO!', fontFamily: 'Luckiest Guy', fontSize: 96, color: '#ECFCCB', effect: 'neon', effectColor: '#84CC16' }),
  dos('buen-dia', 'Buen día', { text: 'Buen día', fontFamily: 'Pacifico', fontSize: 80, color: '#FCE7F3', effect: 'neon', effectColor: '#EC4899' }, { text: '¡a aprender!', fontFamily: 'Pacifico', fontSize: 52, color: '#FEF9C3', effect: 'neon', effectColor: '#EAB308' }),
  una('boo', '¡Boo!', { text: '¡BOO!', fontFamily: 'Bangers', fontSize: 120, color: '#F97316', effect: 'elevado', effectColor: '#7C3AED' }, 38, 20),
  dos('expresion', 'Expresión creativa', { text: 'EXPRESIÓN', fontFamily: 'Bebas Neue', fontSize: 64, color: '#6B7280' }, { text: 'Creativa', fontFamily: 'Permanent Marker', fontSize: 84, color: '#F97316' }),
  dos('grandes-ideas', 'Grandes ideas', { text: 'GRANDES', fontFamily: 'Luckiest Guy', fontSize: 80, color: '#F97316', effect: 'elevado', effectColor: '#1D4ED8' }, { text: 'ideas', fontFamily: 'Luckiest Guy', fontSize: 72, color: '#2563EB', effect: 'elevado', effectColor: '#F97316' }),
  una('estatico', 'Estático', { text: 'estático', fontFamily: 'Righteous', fontSize: 72, color: '#D9F99D', backgroundColor: '#111827' }, 40, 16),
  dos('historia-miedo', 'Historia de miedo', { text: 'HISTORIA', fontFamily: 'Bebas Neue', fontSize: 96, color: '#9CA3AF', effect: 'sombra', effectColor: '#111827' }, { text: 'de miedo', fontFamily: 'Pacifico', fontSize: 64, color: '#F43F5E' }),
  una('ciencias', 'Ciencias', { text: 'Ciencias', fontFamily: 'Fredoka', fontSize: 88, bold: true, color: '#FDE047', effect: 'contorno', effectColor: '#65A30D' }),
  una('rock', 'Rock', { text: 'ROCK', fontFamily: 'Luckiest Guy', fontSize: 120, color: '#22D3EE', effect: 'contorno', effectColor: '#0E7490' }, 40, 20),
  dos('recreo', 'Recreo', { text: 'RECREO', fontFamily: 'Permanent Marker', fontSize: 88, color: '#F97316' }, { text: '¡ya era hora!', fontFamily: 'Caveat', fontSize: 52, color: '#6B7280' }),
  una('cafe', 'Hora del café', { text: 'Hora del café', fontFamily: 'Playfair Display', fontSize: 64, bold: true, color: '#166534' }),
  dos('super-genial', 'Súper genial', { text: 'SÚPER', fontFamily: 'Fredoka', fontSize: 84, bold: true, color: '#F9A8D4', effect: 'contorno', effectColor: '#A21CAF' }, { text: 'genial', fontFamily: 'Fredoka', fontSize: 84, bold: true, color: '#F0ABFC', effect: 'contorno', effectColor: '#A21CAF' }),
  dos('diario', 'Diario de clase', { text: 'DIARIO', fontFamily: 'Bebas Neue', fontSize: 52, color: '#111827', letterSpacing: 8 }, { text: 'de clase', fontFamily: 'Playfair Display', fontSize: 72, color: '#111827' }, { corte: 45 }),
  dos('magia', 'Creando magia', { text: 'creando', fontFamily: 'Great Vibes', fontSize: 56, color: '#C4B5FD' }, { text: 'MAGIA', fontFamily: 'Righteous', fontSize: 84, color: '#F5F3FF', effect: 'neon', effectColor: '#8B5CF6' }, { corte: 45 }),
  dos('nuevo', '¡Nuevo!', { text: '¡NUEVO', fontFamily: 'Luckiest Guy', fontSize: 84, color: '#422006', effect: 'elevado', effectColor: '#86EFAC' }, { text: 'TEMA!', fontFamily: 'Luckiest Guy', fontSize: 84, color: '#422006', effect: 'elevado', effectColor: '#86EFAC' }, { corte: 52 }),
  una('brillo', 'Brillo', { text: 'BRILLO', fontFamily: 'Bebas Neue', fontSize: 110, color: '#FBCFE8', effect: 'neon', effectColor: '#EC4899' }, 40, 18),
  una('hora-dorada', 'Hora dorada', { text: 'HORA DORADA', fontFamily: 'Playfair Display', fontSize: 64, bold: true, color: '#CA8A04' }),
  dos('taller-arte', 'Taller de arte', { text: 'TALLER', fontFamily: 'Abril Fatface', fontSize: 80, color: '#111827', letterSpacing: 3 }, { text: 'de arte', fontFamily: 'Great Vibes', fontSize: 64, color: '#374151' }),
  dos('estrategia', 'Gran estrategia', { text: 'GRAN', fontFamily: 'Abril Fatface', fontSize: 100, color: '#1D4ED8', effect: 'hueco' }, { text: 'estrategia', fontFamily: 'Playfair Display', fontSize: 64, italic: true, bold: true, color: '#1D4ED8' }),
  dos('celebrar', '¡A celebrar!', { text: '¡Vamos a', fontFamily: 'Pacifico', fontSize: 64, color: '#EF4444', effect: 'elevado', effectColor: '#FBCFE8' }, { text: 'celebrar!', fontFamily: 'Pacifico', fontSize: 72, color: '#EF4444', effect: 'elevado', effectColor: '#FBCFE8' }),
  dos('elegante', 'Elegante cursiva', { text: 'Elegante', fontFamily: 'Playfair Display', fontSize: 64, color: '#B08D57' }, { text: 'Cursiva', fontFamily: 'Great Vibes', fontSize: 72, color: '#F9A8D4' }),
  dos('titulo-clasico', 'Título y encabezado', { text: 'Título', fontFamily: 'Poppins', fontSize: 96, bold: true, color: '#000000' }, { text: 'ENCABEZADO', fontFamily: 'Poppins', fontSize: 44, bold: true, italic: true, color: '#000000', letterSpacing: 3 }),
  dos('cumple', 'Feliz cumpleaños', { text: '¡Feliz', fontFamily: 'Pacifico', fontSize: 64, color: '#111827' }, { text: 'CUMPLEAÑOS!', fontFamily: 'Bebas Neue', fontSize: 84, color: '#111827', letterSpacing: 2 }),
  una('abierto', '¡Abierto!', { text: '¡Abierto!', fontFamily: 'Lobster', fontSize: 96, color: '#EFF6FF', effect: 'neon', effectColor: '#3B82F6' }),
  dos('vintage', 'Vintage', { text: 'No es viejo,', fontFamily: 'Lobster', fontSize: 48, color: '#9CA3AF' }, { text: 'VINTAGE.', fontFamily: 'Abril Fatface', fontSize: 84, color: '#6366F1' }, { corte: 42 }),
  una('brilla', 'Brilla', { text: 'Brilla', fontFamily: 'Fredoka', fontSize: 104, bold: true, color: '#F9A8D4', effect: 'resplandor', effectColor: '#60A5FA' }, 40, 18),
  dos('proximamente', 'Próximamente', { text: 'PRÓXIMAMENTE', fontFamily: 'Playfair Display', fontSize: 64, bold: true, color: '#9F1239' }, { text: 'no te lo pierdas', fontFamily: 'Great Vibes', fontSize: 52, color: '#9F1239' }),
  dos('gran-oferta', 'Gran oferta', { text: 'GRAN', fontFamily: 'Bebas Neue', fontSize: 110, color: '#FACC15' }, { text: 'OFERTA', fontFamily: 'Bebas Neue', fontSize: 110, color: '#FACC15', effect: 'hueco' }, { corte: 52 }),
  dos('comic', 'Cómic', { text: 'CÓMIC', fontFamily: 'Luckiest Guy', fontSize: 96, color: '#5EEAD4', effect: 'contorno', effectColor: '#134E4A' }, { text: 'caricatura', fontFamily: 'Fredoka', fontSize: 52, bold: true, color: '#EC4899' }),
  una('recortar', 'Recortar y pegar', { text: 'recortar y pegar', fontFamily: 'Permanent Marker', fontSize: 64, color: '#F97316', effect: 'elevado', effectColor: '#FDE68A' }),
  una('ano-3000', 'Año 3000', { text: 'AÑO 3000', fontFamily: 'Righteous', fontSize: 84, color: '#ECFCCB', effect: 'neon', effectColor: '#65A30D', letterSpacing: 6 }),
  dos('primavera', 'Primavera', { text: 'Primavera', fontFamily: 'Pacifico', fontSize: 72, color: '#16A34A' }, { text: 'EN FLOR', fontFamily: 'Luckiest Guy', fontSize: 84, color: '#F9A8D4', effect: 'elevado', effectColor: '#BE185D' }),
];
