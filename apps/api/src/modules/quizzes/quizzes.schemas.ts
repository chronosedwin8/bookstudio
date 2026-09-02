import { z } from 'zod';

/**
 * Cuestionarios de examen.
 *
 * Las preguntas comparten tipos con los bloques del lienzo (single, multiple,
 * order, open) para que el docente no tenga que aprender dos cosas distintas,
 * pero viven en su propia tabla porque un examen necesita registrar quien lo
 * tiene asignado y que respondio cada alumno.
 */

export const quizKind = z.enum(['single', 'multiple', 'order', 'open']);
export const quizStatus = z.enum(['borrador', 'enviado', 'cerrado']);

export const quizOptionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().max(300).default(''),
  imageUrl: z.string().max(2048).optional(),
  correct: z.boolean().optional(),
});

export const createQuizSchema = z.object({
  libraryId: z.string().uuid(),
  title: z.string().min(1).max(160).trim(),
  description: z.string().max(2000).default(''),
  showSolutions: z.boolean().default(true),
  allowRetry: z.boolean().default(false),
  timeLimitMinutes: z.number().int().min(1).max(300).nullish(),
});

export const updateQuizSchema = z
  .object({
    title: z.string().min(1).max(160).trim().optional(),
    description: z.string().max(2000).optional(),
    status: quizStatus.optional(),
    showSolutions: z.boolean().optional(),
    allowRetry: z.boolean().optional(),
    timeLimitMinutes: z.number().int().min(1).max(300).nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay campos para actualizar');

export const questionSchema = z
  .object({
    kind: quizKind,
    prompt: z.string().min(1, 'La pregunta necesita un enunciado').max(2000),
    promptImageUrl: z.string().max(2048).nullish(),
    options: z.array(quizOptionSchema).max(8).default([]),
    expectedAnswer: z.string().max(2000).default(''),
    points: z.number().min(0.25).max(100).default(1),
  })
  .superRefine((value, ctx) => {
    // Las abiertas no llevan opciones; las demas no valen sin ellas.
    if (value.kind === 'open') return;

    if (value.options.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Esta pregunta necesita al menos 2 opciones',
      });
      return;
    }
    if (new Set(value.options.map((o) => o.id)).size !== value.options.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Hay ids de opcion repetidos' });
    }

    const correctas = value.options.filter((o) => o.correct).length;
    if (value.kind === 'single' && correctas !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Una pregunta de respuesta unica necesita exactamente una opcion correcta',
      });
    }
    if (value.kind === 'multiple' && correctas < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Marca al menos una opcion correcta' });
    }
  });

/** Las preguntas se guardan de una vez: es como se editan en la pantalla. */
export const replaceQuestionsSchema = z.object({
  questions: z.array(questionSchema).max(60),
});

export const assignSchema = z.object({
  /** Vacio significa "toda la clase". */
  studentIds: z.array(z.string().uuid()).max(300).default([]),
});

export const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        // Ids de opcion, o un unico texto en las abiertas.
        answer: z.array(z.string().max(4000)).max(8).default([]),
      }),
    )
    .max(60),
  /** Entrega definitiva; sin esto solo se guarda el avance. */
  submit: z.boolean().default(false),
});

export const reviewSchema = z.object({
  score: z.number().min(0).max(100),
  correct: z.boolean().nullish(),
  teacherNote: z.string().max(1000).default(''),
});

export const quizIdSchema = z.object({ id: z.string().uuid('Cuestionario no valido') });
export const answerParamsSchema = z.object({
  id: z.string().uuid('Cuestionario no valido'),
  questionId: z.string().uuid('Pregunta no valida'),
  studentId: z.string().uuid('Alumno no valido'),
});
export const listQuizzesSchema = z.object({ libraryId: z.string().uuid().optional() });

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type QuizKind = z.infer<typeof quizKind>;
export type QuizOption = z.infer<typeof quizOptionSchema>;
