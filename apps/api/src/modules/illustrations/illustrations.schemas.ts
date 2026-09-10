import { z } from 'zod';

/**
 * El catalogo de la ilustracion educativa, del lado del servidor.
 *
 * Es la copia autorizada: lo que no este aqui no entra en la base de datos, ni
 * aunque lo pida la IA. La otra copia, la que dibuja, esta en
 * `apps/web/src/utils/ilustracion/catalogo.ts`; que las dos digan lo mismo lo
 * comprueba `apps/web/src/utils/ilustracion/ilustracion.check.mts` en cada
 * `npm run test:unit`. Se duplica porque los dos workspaces no comparten
 * paquete, igual que ya pasa con los tipos de elemento.
 */

export const VERSION_CATALOGO = 1;
export const VERSION_ESCENA = 1;

export const PAPELES = ['student', 'teacher'] as const;
export const POSES = ['standing', 'sitting', 'talking', 'pointing', 'reading', 'using_tablet'] as const;
export const EMOCIONES = ['engaged', 'focused', 'happy', 'thinking'] as const;
export const POSICIONES = ['left', 'center', 'right', 'foreground', 'upper-left', 'upper-right'] as const;
export const OBJETOS = ['tablet', 'laptop', 'book', 'notebook', 'document', 'pencil', 'chat'] as const;
export const FONDOS = ['classroom', 'library', 'technology', 'abstract'] as const;
export const DISTRIBUCIONES = ['single', 'pair', 'group', 'collaboration'] as const;
export const TEMAS = ['educational', 'technology', 'nature', 'warm'] as const;

export const MAXIMO_PERSONAJES = 4;
export const MAXIMO_OBJETOS = 5;

const personajeSchema = z.object({
  papel: z.enum(PAPELES).default('student'),
  pose: z.enum(POSES).default('standing'),
  emocion: z.enum(EMOCIONES).default('engaged'),
  posicion: z.enum(POSICIONES).default('center'),
  sostiene: z.enum(OBJETOS).optional(),
});

const objetoSchema = z.object({
  objeto: z.enum(OBJETOS),
  posicion: z.enum(POSICIONES).default('center'),
});

/**
 * La escena.
 *
 * Solo datos: ni una sola cadena que acabe siendo marcado. Lo unico libre es
 * `descripcion`, que va al texto alternativo y se escapa al dibujarla.
 */
export const escenaSchema = z.object({
  version: z.number().int().min(1).max(99).default(VERSION_ESCENA),
  versionCatalogo: z.number().int().min(1).max(99).default(VERSION_CATALOGO),
  fondo: z.enum(FONDOS).default('classroom'),
  distribucion: z.enum(DISTRIBUCIONES).default('single'),
  tema: z.enum(TEMAS).default('educational'),
  personajes: z.array(personajeSchema).min(1).max(MAXIMO_PERSONAJES),
  objetos: z.array(objetoSchema).max(MAXIMO_OBJETOS).default([]),
  descripcion: z.string().max(300).default(''),
});

export type Escena = z.infer<typeof escenaSchema>;
export type PersonajeEscena = z.infer<typeof personajeSchema>;

/** Lo que se guarda en el elemento del lienzo. El dibujo no: se recompone. */
export const illustrationPropertiesSchema = z.object({
  escena: escenaSchema,
  /** Lo que se escribio para pedirla, que se conserva para poder regenerarla. */
  prompt: z.string().max(500).default(''),
  /** Fila de `illustrations`, cuando viene de una guardada y reutilizable. */
  illustrationId: z.string().uuid().optional(),
});

/** Peticion de "conviérteme este texto en una escena". */
export const analizarSchema = z.object({
  texto: z.string().trim().min(3, 'Describe la ilustración que necesitas').max(500),
  /** Pistas opcionales de la interfaz; la IA puede no hacerles caso. */
  tema: z.enum(TEMAS).optional(),
  fondo: z.enum(FONDOS).optional(),
  personajes: z.number().int().min(1).max(MAXIMO_PERSONAJES).optional(),
});
export type AnalizarInput = z.infer<typeof analizarSchema>;

/** Guardar una escena para poder reutilizarla en varias paginas. */
export const guardarSchema = z.object({
  prompt: z.string().max(500).default(''),
  escena: escenaSchema,
});
