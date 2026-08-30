import { z } from 'zod';
import { EMBED_PROVIDER_NAMES, resolveEmbed } from './embeds.js';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color hexadecimal invalido');

/** Coordenadas normalizadas 0-100 respecto a la pagina, para que el lienzo escale sin perder posiciones. */
export const transformMatrixSchema = z.object({
  x: z.number().min(-50).max(150),
  y: z.number().min(-50).max(150),
  width: z.number().min(0.5).max(200),
  height: z.number().min(0.5).max(200),
  angle: z.number().min(-360).max(360).default(0),
});

/**
 * Enlace navegable. Solo http(s) y rutas internas: cualquier otro esquema
 * (javascript:, data:, file:) seria ejecutable al pulsarlo en el modo lectura.
 */
const linkUrl = z
  .string()
  .max(2048)
  .trim()
  .refine(
    (v) => v === '' || /^https?:\/\//i.test(v) || v.startsWith('/'),
    'El enlace debe empezar por http:// o https://',
  );

export const textPropertiesSchema = z.object({
  text: z.string().max(20_000).default(''),
  // Catalogo de Google Fonts autoalojado en el cliente (ver assets/main.css).
  fontFamily: z
    .enum([
      'Lato', 'Cabin', 'Noto Sans', 'Nunito', 'Poppins', 'Quicksand',
      'Merriweather', 'Lora',
      'Fredoka', 'Baloo 2', 'Bangers', 'Luckiest Guy',
      'Caveat', 'Patrick Hand', 'Indie Flower',
      'OpenDyslexic', 'Atkinson Hyperlegible',
    ])
    .default('Lato'),
  fontSize: z.number().int().min(24, 'El tamaño mínimo accesible es 24px').max(200).default(24),
  color: hexColor.default('#333333'),
  backgroundColor: z.union([hexColor, z.literal('transparent')]).default('transparent'),
  textAlign: z.enum(['left', 'center', 'right']).default('left'),
  columns: z.number().int().min(1).max(3).default(1),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  strikethrough: z.boolean().default(false),
  superscript: z.boolean().default(false),
  subscript: z.boolean().default(false),
  indent: z.number().int().min(0).max(8).default(0),
  /** Vineta o numeracion aplicada a cada linea del texto. */
  listStyle: z.enum(['none', 'bullet', 'number']).default('none'),
  lineHeight: z.number().min(0.8).max(3).default(1.35),
  letterSpacing: z.number().min(-2).max(20).default(0),
  /** Al pulsar el texto en modo lectura se abre este enlace. */
  linkUrl: linkUrl.default(''),
});

/** Debe coincidir con el catalogo de apps/web/src/utils/shapes.ts. */
export const shapeName = z.enum([
  'rectangle', 'square', 'ellipse', 'oval', 'triangle', 'right-triangle',
  'diamond', 'pentagon', 'hexagon', 'octagon',
  'line', 'dashed-line', 'arrow', 'arrow-line', 'dashed-arrow', 'double-arrow', 'chevron',
  'speech-bubble', 'thought-bubble',
  'star', 'burst', 'heart', 'cloud', 'moon', 'lightning', 'cross', 'banner', 'bookmark',
]);

export const shapePropertiesSchema = z.object({
  shape: shapeName.default('rectangle'),
  fillColor: z.union([hexColor, z.literal('transparent')]).default('#59A1FF'),
  strokeColor: z.union([hexColor, z.literal('transparent')]).default('#1549E1'),
  strokeWidth: z.number().min(0).max(40).default(2),
  cornerRadius: z.number().min(0).max(50).default(0),
  label: z.string().max(500).default(''),
  linkUrl: linkUrl.default(''),
});

export const drawingPropertiesSchema = z.object({
  svgPath: z.string().max(500_000),
  /** Pasadas desplazadas que dan textura de cerdas o crayon. */
  extraPaths: z.array(z.string().max(500_000)).max(6).default([]),
  brushStyle: z.enum(['pen', 'paintbrush', 'crayon', 'highlighter']).default('pen'),
  strokeWidth: z.number().min(0.1).max(80).default(5),
  strokeColor: z.string().max(60).default('#333333'),
  fillColor: z.union([hexColor, z.literal('transparent')]).default('transparent'),
  viewBox: z.string().max(120).default('0 0 1000 1000'),
});

/** Acepta URLs absolutas o rutas servidas desde /storage. */
const mediaUrl = z
  .string()
  .max(2048)
  .refine((v) => /^https?:\/\//.test(v) || v.startsWith('/storage/'), 'Debe ser una URL http(s) o una ruta /storage');

export const imagePropertiesSchema = z.object({
  fileUrl: mediaUrl,
  altText: z.string().max(500).default(''),
  attribution: z
    .object({
      author: z.string().max(200).default(''),
      licence: z.string().max(80).default(''),
      sourceUrl: z.string().max(2048).optional(),
      text: z.string().max(600).default(''),
    })
    .optional(),
  cropRadius: z.number().min(0).max(50).default(0),
  linkUrl: linkUrl.default(''),
});

export const mapPropertiesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  zoom: z.number().int().min(1).max(19).default(13),
  label: z.string().max(300).default(''),
  showMarker: z.boolean().default(true),
  /** Bloquea la navegacion para que el mapa quede fijo como ilustracion. */
  interactive: z.boolean().default(true),
});

export const audioPropertiesSchema = z.object({
  fileUrl: mediaUrl,
  durationSeconds: z.number().min(0).max(7200).default(0),
  hotspotColor: hexColor.default('#FF5733'),
  hasAutoTranscript: z.boolean().default(false),
  transcriptText: z.string().max(20_000).default(''),
});

export const videoPropertiesSchema = z.object({
  fileUrl: mediaUrl,
  durationSeconds: z.number().min(0).max(7200).default(0),
  posterUrl: z.string().max(2048).optional(),
  captionsText: z.string().max(20_000).default(''),
});

/**
 * Icono o emoji. Los trazos SVG se guardan con el elemento para que el libro siga
 * dibujandose aunque el catalogo del cliente cambie mas adelante.
 */
export const iconPropertiesSchema = z
  .object({
    source: z.enum(['emoji', 'library']).default('library'),
    /** Caracter Unicode cuando source = emoji. */
    char: z.string().max(16).default(''),
    name: z.string().max(80).default(''),
    paths: z.array(z.string().max(8000)).max(24).default([]),
    viewBox: z.string().max(60).default('0 0 24 24'),
    color: hexColor.default('#333333'),
    /** Los iconos de contorno necesitan grosor; los macizos usan 0. */
    strokeWidth: z.number().min(0).max(8).default(2),
    filled: z.boolean().default(false),
    label: z.string().max(200).default(''),
    linkUrl: linkUrl.default(''),
  })
  .refine(
    (v) => (v.source === 'emoji' ? v.char.length > 0 : v.paths.length > 0),
    'Un emoji necesita `char` y un icono necesita `paths`',
  );

/**
 * Contenido externo incrustado. `embedUrl` no lo elige el cliente: se deriva del
 * enlace original contra la lista blanca de proveedores, asi que no se puede meter
 * un iframe hacia una pagina cualquiera.
 */
export const embedPropertiesSchema = z
  .object({
    sourceUrl: z.string().min(8).max(2048).trim(),
    provider: z.enum(EMBED_PROVIDER_NAMES as [string, ...string[]]).optional(),
    embedUrl: z.string().max(2048).optional(),
    title: z.string().max(300).default(''),
    /** Muestra un aviso antes de cargar el iframe (contenido de terceros). */
    askBeforeLoading: z.boolean().default(false),
  })
  .transform((value, ctx) => {
    const resolved = resolveEmbed(value.sourceUrl);
    if (!resolved) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceUrl'],
        message: 'Enlace no admitido. Usa YouTube, Vimeo, PeerTube, Google, Microsoft, Internet Archive o Wikipedia.',
      });
      return z.NEVER;
    }
    return { ...value, provider: resolved.provider, embedUrl: resolved.embedUrl };
  });

/**
 * Bloque de pregunta interactiva.
 *
 * `single`   una sola respuesta correcta.
 * `multiple` varias respuestas correctas.
 * `order`    hay que ordenar las opciones; el orden guardado ES la solucion.
 *
 * Las marcas de correccion nunca salen hacia un lector que no pueda editar el libro
 * (ver sanitizeQuestion en books.service): se comprueban en el servidor.
 */
export const questionOptionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().max(600).default(''),
  imageUrl: z.string().max(2048).optional(),
  correct: z.boolean().default(false),
});

export const questionKind = z.enum(['single', 'multiple', 'order']);

export const questionPropertiesSchema = z
  .object({
    kind: questionKind.default('single'),
    prompt: z.string().max(2000).default(''),
    promptImageUrl: z.string().max(2048).optional(),
    options: z.array(questionOptionSchema).min(2, 'Una pregunta necesita al menos 2 opciones').max(8),
    feedbackCorrect: z.string().max(300).default('Muy bien!'),
    feedbackWrong: z.string().max(300).default('Casi. Vuelve a intentarlo.'),
    accentColor: hexColor.default('#7C3AED'),
    /** Permite reintentar tras un fallo. */
    allowRetry: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    const ids = value.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Hay opciones con el mismo id' });
    }

    const correct = value.options.filter((option) => option.correct).length;

    if (value.kind === 'single' && correct !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Una pregunta de respuesta única necesita exactamente una opción correcta',
      });
    }
    if (value.kind === 'multiple' && correct < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Marca al menos una opción correcta',
      });
    }
  });

/**
 * Grafica estadistica. Los datos los escribe el docente en el inspector; el dibujo
 * se genera en SVG en el cliente, sin librerias de terceros.
 */
export const chartPropertiesSchema = z.object({
  chartType: z.enum(['bar', 'column', 'line', 'area', 'pie', 'doughnut']).default('column'),
  title: z.string().max(200).default(''),
  series: z
    .array(
      z.object({
        label: z.string().max(80).default(''),
        value: z.number().finite().min(-1e9).max(1e9).default(0),
        color: hexColor.optional(),
      }),
    )
    .min(1, 'La gráfica necesita al menos un dato')
    .max(24),
  showValues: z.boolean().default(true),
  showLegend: z.boolean().default(true),
  accentColor: hexColor.default('#2563EB'),
});

/**
 * Formula matematica en LaTeX. Se guarda el codigo fuente, no el HTML: el cliente
 * lo compone con KaTeX en modo no confiable, asi que no puede inyectar marcado.
 */
export const mathPropertiesSchema = z.object({
  latex: z.string().max(4000).default('x^2 + y^2 = z^2'),
  displayMode: z.boolean().default(true),
  color: hexColor.default('#1E293B'),
  backgroundColor: z.union([hexColor, z.literal('transparent')]).default('transparent'),
});

export const elementType = z.enum([
  'text', 'shape', 'drawing', 'image', 'audio', 'video',
  'map', 'icon', 'embed', 'question', 'chart', 'math',
]);
export type ElementType = z.infer<typeof elementType>;

const PROPERTY_SCHEMAS = {
  text: textPropertiesSchema,
  shape: shapePropertiesSchema,
  drawing: drawingPropertiesSchema,
  image: imagePropertiesSchema,
  audio: audioPropertiesSchema,
  video: videoPropertiesSchema,
  map: mapPropertiesSchema,
  icon: iconPropertiesSchema,
  embed: embedPropertiesSchema,
  question: questionPropertiesSchema,
  chart: chartPropertiesSchema,
  math: mathPropertiesSchema,
} as const;

/** Valida `properties` contra el esquema del `type` declarado; rechaza mezclas invalidas. */
export function parseProperties(type: ElementType, properties: unknown) {
  return PROPERTY_SCHEMAS[type].parse(properties);
}

export const createElementSchema = z
  .object({
    type: elementType,
    transformMatrix: transformMatrixSchema,
    properties: z.unknown(),
    zIndex: z.number().int().min(0).max(10_000).optional(),
    isLocked: z.boolean().default(false),
    opacity: z.number().min(0).max(1).default(1),
  })
  .superRefine((value, ctx) => {
    const result = PROPERTY_SCHEMAS[value.type].safeParse(value.properties);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['properties', ...issue.path], message: issue.message });
      }
    }
  });

export const updateElementSchema = z
  .object({
    transformMatrix: transformMatrixSchema.optional(),
    properties: z.unknown().optional(),
    zIndex: z.number().int().min(0).max(10_000).optional(),
    isLocked: z.boolean().optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay campos para actualizar');

export const reorderLayersSchema = z.object({
  elementIds: z.array(z.string().uuid()).min(1).max(500),
});

export type QuestionKind = z.infer<typeof questionKind>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type CreateElementInput = z.infer<typeof createElementSchema>;
export type UpdateElementInput = z.infer<typeof updateElementSchema>;
export type TransformMatrix = z.infer<typeof transformMatrixSchema>;
