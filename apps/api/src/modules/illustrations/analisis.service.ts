import { env } from '../../config/env.js';
import { analizarLocalmente } from './lectura.js';
import {
  escenaSchema,
  MAXIMO_PERSONAJES,
  VERSION_CATALOGO,
  VERSION_ESCENA,
  type AnalizarInput,
  type Escena,
} from './illustrations.schemas.js';

/**
 * De una frase a una escena.
 *
 * La IA aqui no dibuja nada: solo decide QUE aparece, y lo dice eligiendo de un
 * catalogo cerrado. Lo que devuelve pasa por el mismo validador que cualquier
 * peticion, asi que en el peor caso se queda en una escena mas sosa, nunca en un
 * SVG raro ni en una pagina rota.
 *
 * El modo por omision no llama a nadie: interpreta el texto aqui mismo. Se hizo
 * asi a proposito y no como parche de desarrollo, porque un colegio no deberia
 * pagar por cada ilustracion ni quedarse sin la funcion cuando falle una API
 * ajena. La IA se enciende con ILLUSTRATION_AI_MODE=ia y aporta matices que las
 * palabras sueltas no dan.
 */

export { analizarLocalmente };

export type ModoAnalisis = 'mock' | 'ia';

export interface ResultadoAnalisis {
  escena: Escena;
  /** Como se resolvio de verdad, que puede no ser lo pedido si la IA fallo. */
  modo: ModoAnalisis;
  /** Se avisa cuando hubo que caer al modo local, para no fingir que fue la IA. */
  aviso?: string;
}

// ---------------------------------------------------------------- con IA

const INSTRUCCIONES = `Eres el director de escena de un motor de ilustraciones educativas.

Recibes la descripcion de una escena escolar y devuelves SOLO los datos de que
debe aparecer. No dibujas: otro programa dibuja a partir de tu respuesta.

Reglas:
- Elige unicamente valores de las listas permitidas. No inventes ninguno.
- Como maximo ${MAXIMO_PERSONAJES} personajes.
- "sostiene" solo con poses que dejan las manos libres: standing, sitting, reading, using_tablet.
- Si la descripcion menciona a quien ensena, ese personaje lleva papel "teacher".
- Reparte posiciones distintas para que no se solapen.
- Elige el fondo y el tema que mejor acompanen al contenido educativo descrito.`;

/** Esquema que se le impone a la respuesta, para que no haya nada que interpretar. */
const FORMATO = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['fondo', 'distribucion', 'tema', 'personajes', 'objetos'],
    properties: {
      fondo: { type: 'string', enum: ['classroom', 'library', 'technology', 'abstract'] },
      distribucion: { type: 'string', enum: ['single', 'pair', 'group', 'collaboration'] },
      tema: { type: 'string', enum: ['educational', 'technology', 'nature', 'warm'] },
      personajes: {
        type: 'array',
        minItems: 1,
        maxItems: MAXIMO_PERSONAJES,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['papel', 'pose', 'emocion', 'posicion'],
          properties: {
            papel: { type: 'string', enum: ['student', 'teacher'] },
            pose: { type: 'string', enum: ['standing', 'sitting', 'talking', 'pointing', 'reading', 'using_tablet'] },
            emocion: { type: 'string', enum: ['engaged', 'focused', 'happy', 'thinking'] },
            posicion: { type: 'string', enum: ['left', 'center', 'right', 'foreground', 'upper-left', 'upper-right'] },
            sostiene: { type: 'string', enum: ['tablet', 'laptop', 'book', 'notebook', 'document', 'pencil'] },
          },
        },
      },
      objetos: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['objeto', 'posicion'],
          properties: {
            objeto: { type: 'string', enum: ['tablet', 'laptop', 'book', 'notebook', 'document', 'pencil', 'chat'] },
            posicion: { type: 'string', enum: ['left', 'center', 'right', 'foreground', 'upper-left', 'upper-right'] },
          },
        },
      },
    },
  },
};

const TIEMPO_LIMITE_MS = 20_000;

async function analizarConIA(entrada: AnalizarInput): Promise<Escena> {
  // Carga perezosa: sin clave configurada, el SDK no se toca siquiera
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const cliente = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: TIEMPO_LIMITE_MS });

  const pistas = [
    entrada.tema ? `Tema sugerido: ${entrada.tema}.` : '',
    entrada.fondo ? `Fondo sugerido: ${entrada.fondo}.` : '',
    entrada.personajes ? `Numero de personajes pedido: ${entrada.personajes}.` : '',
  ].filter(Boolean).join(' ');

  const respuesta = await cliente.messages.create({
    model: env.ILLUSTRATION_AI_MODEL,
    max_tokens: 2000,
    system: INSTRUCCIONES,
    // Es una clasificacion corta contra un catalogo cerrado: pensar mas no
    // acierta mas, y el colegio paga cada llamada.
    output_config: { effort: 'low', format: FORMATO },
    messages: [{ role: 'user', content: entrada.texto }],
  });

  if (respuesta.stop_reason === 'refusal') {
    throw new Error('El modelo declino describir la escena');
  }

  const texto = respuesta.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const bruto = JSON.parse(texto) as Record<string, unknown>;

  return escenaSchema.parse({
    ...bruto,
    version: VERSION_ESCENA,
    versionCatalogo: VERSION_CATALOGO,
    descripcion: entrada.texto.slice(0, 300),
  });
}

/** Esta configurada la IA de verdad, o solo declarada. */
export function iaDisponible(): boolean {
  return env.ILLUSTRATION_AI_MODE === 'ia' && env.ANTHROPIC_API_KEY.length > 0;
}

export async function analizar(entrada: AnalizarInput): Promise<ResultadoAnalisis> {
  if (!iaDisponible()) {
    return { escena: analizarLocalmente(entrada), modo: 'mock' };
  }

  try {
    return { escena: await analizarConIA(entrada), modo: 'ia' };
  } catch (error) {
    /*
     * Que se caiga la IA no puede dejar sin ilustracion a quien la esta
     * haciendo: se sigue con la lectura local y se dice que ha pasado, en vez
     * de devolver un error a media clase.
     */
    const motivo = error instanceof Error ? error.message : 'error desconocido';
    return {
      escena: analizarLocalmente(entrada),
      modo: 'mock',
      aviso: `No se pudo usar la IA (${motivo.slice(0, 120)}); la escena se compuso aqui.`,
    };
  }
}
