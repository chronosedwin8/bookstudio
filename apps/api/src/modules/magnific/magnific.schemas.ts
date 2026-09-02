import { z } from 'zod';

/**
 * Generacion de imagenes con Magnific.
 *
 * Los valores permitidos son los del modelo Mystic. Se validan aqui y no se
 * confia en que el navegador mande algo sensato: la llamada cuesta dinero, y una
 * peticion mal formada se paga igual en tiempo de espera.
 */

export const magnificAspect = z.enum([
  'square_1_1',
  'classic_4_3',
  'traditional_3_4',
  'widescreen_16_9',
  'social_story_9_16',
  'standard_3_2',
  'portrait_2_3',
  'social_post_4_5',
]);

export const magnificModel = z.enum(['realism', 'fluid', 'zen', 'flexible', 'super_real']);

/**
 * Solo 1k y 2k. La de 4k existe en la API pero pasa de los 8 MB que admite el
 * almacenamiento, asi que se rechazaria despues de haberla pagado.
 */
export const magnificResolution = z.enum(['1k', '2k']);

export const generateImageSchema = z.object({
  prompt: z.string().trim().min(3, 'Describe la imagen que quieres').max(1000),
  aspectRatio: magnificAspect.default('square_1_1'),
  model: magnificModel.default('fluid'),
  resolution: magnificResolution.default('1k'),
  /** Cuanto se ajusta a lo pedido; a mas alto, menos libertad creativa. */
  adherence: z.number().int().min(0).max(100).default(50),
});

export const taskParamsSchema = z.object({
  taskId: z.string().uuid('Tarea no valida'),
});

export type GenerateImageInput = z.infer<typeof generateImageSchema>;
