import { query, withTransaction } from '../../db/pool.js';
import { HttpError } from '../../lib/http-error.js';
import { getAccess, requireManager } from '../libraries/libraries.service.js';
import type {
  CreateQuizInput,
  QuestionInput,
  QuizKind,
  QuizOption,
  ReviewInput,
  SubmitInput,
  UpdateQuizInput,
} from './quizzes.schemas.js';

/**
 * Cuestionarios de examen.
 *
 * El docente redacta las preguntas, envia el examen a quien elija y despues ve
 * los resultados. Las de opciones se corrigen solas; las abiertas quedan a la
 * espera de que alguien las lea, que es justo la diferencia entre "mal" y "sin
 * corregir" y por eso `correct` puede ser nulo.
 *
 * Las notas del examen NO son las notas del curso: aqui se acumulan puntos, y la
 * escala de 1.0 a 6.0 de las valoraciones se decide aparte, mirando el resultado.
 */

export interface QuizQuestion {
  id: string;
  position: number;
  kind: QuizKind;
  prompt: string;
  promptImageUrl: string | null;
  options: QuizOption[];
  /** Solo llega al profesorado. */
  expectedAnswer?: string;
  points: number;
}

export interface Quiz {
  id: string;
  libraryId: string;
  title: string;
  description: string;
  status: 'borrador' | 'enviado' | 'cerrado';
  showSolutions: boolean;
  allowRetry: boolean;
  timeLimitMinutes: number | null;
  authorId: string | null;
  authorName?: string | null;
  createdAt: string;
  updatedAt: string;
  questionCount?: number;
  totalPoints?: number;
  /** Solo al listar para el docente: cuantos lo tienen y cuantos lo entregaron. */
  assignedCount?: number;
  submittedCount?: number;
  /** Solo al listar para el alumnado: en que punto esta su entrega. */
  submittedAt?: string | null;
  myScore?: number | null;
}

interface QuizRow {
  id: string;
  library_id: string;
  title: string;
  description: string;
  status: Quiz['status'];
  show_solutions: boolean;
  allow_retry: boolean;
  time_limit_minutes: number | null;
  author_id: string | null;
  author_name?: string | null;
  created_at: Date;
  updated_at: Date;
  question_count?: string;
  total_points?: string | null;
  assigned_count?: string;
  submitted_count?: string;
  submitted_at?: Date | null;
  my_score?: string | null;
}

function toQuiz(row: QuizRow): Quiz {
  return {
    id: row.id,
    libraryId: row.library_id,
    title: row.title,
    description: row.description,
    status: row.status,
    showSolutions: row.show_solutions,
    allowRetry: row.allow_retry,
    timeLimitMinutes: row.time_limit_minutes,
    authorId: row.author_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.author_name !== undefined ? { authorName: row.author_name } : {}),
    ...(row.question_count !== undefined ? { questionCount: Number(row.question_count) } : {}),
    ...(row.total_points !== undefined ? { totalPoints: Number(row.total_points ?? 0) } : {}),
    ...(row.assigned_count !== undefined ? { assignedCount: Number(row.assigned_count) } : {}),
    ...(row.submitted_count !== undefined ? { submittedCount: Number(row.submitted_count) } : {}),
    ...(row.submitted_at !== undefined ? { submittedAt: row.submitted_at?.toISOString() ?? null } : {}),
    ...(row.my_score !== undefined ? { myScore: row.my_score === null ? null : Number(row.my_score) } : {}),
  };
}

const CAMPOS = `id, library_id, title, description, status, show_solutions,
  allow_retry, time_limit_minutes, author_id, created_at, updated_at`;

/** Los mismos campos con alias, para las consultas que unen varias tablas. */
const QUIZ_COLUMNS = CAMPOS.split(',')
  .map((campo) => `q.${campo.trim()}`)
  .join(', ');

// --- Acceso ---

interface Contexto {
  quiz: QuizRow;
  esDocente: boolean;
}

async function cargar(quizId: string, userId: string): Promise<Contexto> {
  const { rows } = await query<QuizRow>(`SELECT ${QUIZ_COLUMNS} FROM quizzes q WHERE q.id = $1`, [quizId]);
  const quiz = rows[0];
  if (!quiz) throw HttpError.notFound('Cuestionario no encontrado');

  const acceso = await getAccess(quiz.library_id, userId);
  const esDocente = acceso !== 'student';

  // Un borrador no existe para el alumnado: ni siquiera debe saber que se prepara.
  if (!esDocente && quiz.status === 'borrador') throw HttpError.notFound('Cuestionario no encontrado');

  return { quiz, esDocente };
}

async function cargarComoDocente(quizId: string, userId: string): Promise<QuizRow> {
  const { quiz, esDocente } = await cargar(quizId, userId);
  if (!esDocente) throw HttpError.forbidden('Solo el profesorado gestiona los cuestionarios');
  return quiz;
}

// --- Correccion automatica ---

/**
 * Corrige una pregunta de opciones.
 *
 * Es todo o nada: acertar tres de cuatro en una de respuesta multiple no da tres
 * cuartos de punto. Se decidio asi porque el reparto parcial exige explicar al
 * alumnado como se calcula, y en un examen corto confunde mas de lo que aporta.
 * Las abiertas devuelven null: no se pueden corregir solas.
 */
export function corregir(kind: QuizKind, options: QuizOption[], answer: string[]): boolean | null {
  if (kind === 'open') return null;

  if (kind === 'order') {
    const solucion = options.map((o) => o.id);
    return answer.length === solucion.length && answer.every((id, i) => id === solucion[i]);
  }

  const solucion = options.filter((o) => o.correct).map((o) => o.id);
  const elegidas = new Set(answer);
  return solucion.length === elegidas.size && solucion.every((id) => elegidas.has(id));
}

/** Quita la solucion antes de enviar el examen a quien lo va a responder. */
function sinSolucion(pregunta: QuizQuestion): QuizQuestion {
  const { expectedAnswer: _oculto, ...resto } = pregunta;
  return {
    ...resto,
    // En las de ordenar el propio orden guardado es la respuesta, asi que se baraja.
    options: (pregunta.kind === 'order' ? barajar(pregunta.options) : pregunta.options).map(
      ({ correct: _c, ...opcion }) => opcion,
    ),
  };
}

function barajar<T>(items: T[]): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

interface QuestionRow {
  id: string;
  position: number;
  kind: QuizKind;
  prompt: string;
  prompt_image_url: string | null;
  options: QuizOption[];
  expected_answer: string;
  points: string;
}

function toQuestion(row: QuestionRow): QuizQuestion {
  return {
    id: row.id,
    position: row.position,
    kind: row.kind,
    prompt: row.prompt,
    promptImageUrl: row.prompt_image_url,
    options: Array.isArray(row.options) ? row.options : [],
    expectedAnswer: row.expected_answer,
    points: Number(row.points),
  };
}

async function preguntasDe(quizId: string): Promise<QuizQuestion[]> {
  const { rows } = await query<QuestionRow>(
    `SELECT id, position, kind, prompt, prompt_image_url, options, expected_answer, points
     FROM quiz_questions WHERE quiz_id = $1 ORDER BY position`,
    [quizId],
  );
  return rows.map(toQuestion);
}

// --- Gestion ---

export async function createQuiz(userId: string, input: CreateQuizInput): Promise<Quiz> {
  await requireManager(input.libraryId, userId);
  const { rows } = await query<QuizRow>(
    `INSERT INTO quizzes (library_id, author_id, title, description, show_solutions, allow_retry, time_limit_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${CAMPOS}`,
    [
      input.libraryId,
      userId,
      input.title,
      input.description,
      input.showSolutions,
      input.allowRetry,
      input.timeLimitMinutes ?? null,
    ],
  );
  return toQuiz(rows[0]);
}

export async function updateQuiz(quizId: string, userId: string, input: UpdateQuizInput): Promise<Quiz> {
  const quiz = await cargarComoDocente(quizId, userId);

  // Enviar un examen sin preguntas dejaria al alumnado mirando una pagina vacia.
  if (input.status === 'enviado' && quiz.status === 'borrador') {
    const { rows } = await query<{ total: string }>('SELECT COUNT(*) AS total FROM quiz_questions WHERE quiz_id = $1', [
      quizId,
    ]);
    if (Number(rows[0].total) === 0) throw HttpError.badRequest('Anade al menos una pregunta antes de enviarlo');
  }

  const campos: Record<string, unknown> = {
    title: input.title,
    description: input.description,
    status: input.status,
    show_solutions: input.showSolutions,
    allow_retry: input.allowRetry,
    time_limit_minutes: input.timeLimitMinutes,
  };
  const entradas = Object.entries(campos).filter(([, valor]) => valor !== undefined);
  if (!entradas.length) throw HttpError.badRequest('No hay campos para actualizar');

  const asignaciones = entradas.map(([col], i) => `${col} = $${i + 2}`).join(', ');
  const { rows } = await query<QuizRow>(
    `UPDATE quizzes SET ${asignaciones}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING ${CAMPOS}`,
    [quizId, ...entradas.map(([, valor]) => valor)],
  );
  return toQuiz(rows[0]);
}

export async function deleteQuiz(quizId: string, userId: string): Promise<void> {
  await cargarComoDocente(quizId, userId);
  await query('DELETE FROM quizzes WHERE id = $1', [quizId]);
}

/**
 * Reemplaza el examen entero.
 *
 * Se borran y reescriben todas las preguntas porque asi se editan en pantalla. Se
 * bloquea cuando ya hay entregas: cambiar las preguntas bajo unas respuestas ya
 * dadas dejaria resultados que no corresponden a ningun examen real.
 */
export async function replaceQuestions(
  quizId: string,
  userId: string,
  questions: QuestionInput[],
): Promise<QuizQuestion[]> {
  await cargarComoDocente(quizId, userId);

  const { rows: entregas } = await query<{ total: string }>(
    'SELECT COUNT(*) AS total FROM quiz_assignments WHERE quiz_id = $1 AND submitted_at IS NOT NULL',
    [quizId],
  );
  if (Number(entregas[0].total) > 0) {
    throw HttpError.badRequest('Ya hay entregas: crea un cuestionario nuevo en lugar de cambiar este');
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [quizId]);

    for (const [indice, pregunta] of questions.entries()) {
      await client.query(
        `INSERT INTO quiz_questions
           (quiz_id, position, kind, prompt, prompt_image_url, options, expected_answer, points)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          quizId,
          indice + 1,
          pregunta.kind,
          pregunta.prompt,
          pregunta.promptImageUrl ?? null,
          JSON.stringify(pregunta.kind === 'open' ? [] : pregunta.options),
          pregunta.expectedAnswer,
          pregunta.points,
        ],
      );
    }

    await client.query('UPDATE quizzes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [quizId]);
  });

  // Fuera de la transaccion: preguntasDe usa el pool y dentro no veria todavia
  // lo que acaba de escribirse en otra conexion.
  return preguntasDe(quizId);
}

// --- Envio a la clase ---

export interface AssignResult {
  assigned: number;
  total: number;
}

/**
 * Envia el examen. Sin lista concreta va a toda la clase.
 *
 * La asignacion se guarda alumno a alumno, y no como "toda la biblioteca", para
 * que quien entre en el grupo despues no se encuentre examenes ya pasados.
 */
export async function assign(quizId: string, userId: string, studentIds: string[]): Promise<AssignResult> {
  const quiz = await cargarComoDocente(quizId, userId);

  const { rows: preguntas } = await query<{ total: string }>(
    'SELECT COUNT(*) AS total FROM quiz_questions WHERE quiz_id = $1',
    [quizId],
  );
  if (Number(preguntas[0].total) === 0) throw HttpError.badRequest('Anade al menos una pregunta antes de enviarlo');

  const { rows: alumnos } = await query<{ student_id: string }>(
    studentIds.length
      ? `SELECT student_id FROM library_students WHERE library_id = $1 AND student_id = ANY($2::uuid[])`
      : 'SELECT student_id FROM library_students WHERE library_id = $1',
    studentIds.length ? [quiz.library_id, studentIds] : [quiz.library_id],
  );
  if (!alumnos.length) throw HttpError.badRequest('No hay alumnado al que enviarlo');

  await withTransaction(async (client) => {
    for (const { student_id } of alumnos) {
      await client.query(
        `INSERT INTO quiz_assignments (quiz_id, student_id) VALUES ($1, $2)
         ON CONFLICT (quiz_id, student_id) DO NOTHING`,
        [quizId, student_id],
      );
    }
    await client.query(
      `UPDATE quizzes SET status = 'enviado', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'borrador'`,
      [quizId],
    );
  });

  const { rows: total } = await query<{ total: string }>(
    'SELECT COUNT(*) AS total FROM quiz_assignments WHERE quiz_id = $1',
    [quizId],
  );
  return { assigned: alumnos.length, total: Number(total[0].total) };
}

// --- Listados ---

export async function listQuizzes(userId: string, libraryId?: string): Promise<Quiz[]> {
  if (libraryId) {
    const acceso = await getAccess(libraryId, userId);
    if (acceso !== 'student') {
      const { rows } = await query<QuizRow>(
        `SELECT ${QUIZ_COLUMNS}, u.full_name AS author_name,
                (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
                (SELECT COALESCE(SUM(points), 0) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS total_points,
                (SELECT COUNT(*) FROM quiz_assignments qa WHERE qa.quiz_id = q.id) AS assigned_count,
                (SELECT COUNT(*) FROM quiz_assignments qa
                  WHERE qa.quiz_id = q.id AND qa.submitted_at IS NOT NULL) AS submitted_count
         FROM quizzes q LEFT JOIN users u ON u.id = q.author_id
         WHERE q.library_id = $1
         ORDER BY q.created_at DESC`,
        [libraryId],
      );
      return rows.map(toQuiz);
    }
  }

  // Alumnado: solo lo que le han enviado, con el estado de su propia entrega.
  const { rows } = await query<QuizRow>(
    `SELECT ${QUIZ_COLUMNS}, u.full_name AS author_name,
            (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
            (SELECT COALESCE(SUM(points), 0) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS total_points,
            qa.submitted_at,
            (SELECT SUM(score) FROM quiz_answers ans
              WHERE ans.quiz_id = q.id AND ans.student_id = $1) AS my_score
     FROM quiz_assignments qa
     JOIN quizzes q ON q.id = qa.quiz_id
     LEFT JOIN users u ON u.id = q.author_id
     WHERE qa.student_id = $1 AND q.status <> 'borrador'
       ${libraryId ? 'AND q.library_id = $2' : ''}
     ORDER BY qa.assigned_at DESC`,
    libraryId ? [userId, libraryId] : [userId],
  );
  return rows.map(toQuiz);
}

export interface QuizDetail extends Quiz {
  questions: QuizQuestion[];
  canManage: boolean;
  /** Solo para el alumnado: su avance y lo que ya respondio. */
  myAnswers?: Array<{ questionId: string; answer: string[]; correct: boolean | null; score: number | null }>;
  mySubmittedAt?: string | null;
}

export async function getQuiz(quizId: string, userId: string): Promise<QuizDetail> {
  const { quiz, esDocente } = await cargar(quizId, userId);
  const preguntas = await preguntasDe(quizId);

  if (esDocente) {
    return { ...toQuiz(quiz), questions: preguntas, canManage: true };
  }

  const { rows: asignacion } = await query<{ submitted_at: Date | null }>(
    'SELECT submitted_at FROM quiz_assignments WHERE quiz_id = $1 AND student_id = $2',
    [quizId, userId],
  );
  if (!asignacion[0]) throw HttpError.notFound('Cuestionario no encontrado');

  const { rows: respuestas } = await query<{
    question_id: string;
    answer: string[];
    correct: boolean | null;
    score: string | null;
  }>('SELECT question_id, answer, correct, score FROM quiz_answers WHERE quiz_id = $1 AND student_id = $2', [
    quizId,
    userId,
  ]);

  const entregado = asignacion[0].submitted_at !== null;
  // La correccion solo se revela cuando ya se entrego y el docente lo permite.
  const revelar = entregado && quiz.show_solutions;

  return {
    ...toQuiz(quiz),
    canManage: false,
    questions: preguntas.map(sinSolucion),
    mySubmittedAt: asignacion[0].submitted_at?.toISOString() ?? null,
    myAnswers: respuestas.map((r) => ({
      questionId: r.question_id,
      answer: Array.isArray(r.answer) ? r.answer : [],
      correct: revelar ? r.correct : null,
      score: revelar && r.score !== null ? Number(r.score) : null,
    })),
  };
}

// --- Entrega del alumnado ---

export interface SubmitResult {
  submitted: boolean;
  /** Puntos ya obtenidos en lo corregible automaticamente. */
  autoScore: number;
  /** Cuantas quedan a la espera de que el docente las lea. */
  pendingReview: number;
  totalPoints: number;
}

export async function submitAnswers(quizId: string, userId: string, input: SubmitInput): Promise<SubmitResult> {
  const { quiz, esDocente } = await cargar(quizId, userId);
  if (esDocente) throw HttpError.badRequest('El profesorado no responde sus propios cuestionarios');
  if (quiz.status === 'cerrado') throw HttpError.badRequest('Este cuestionario ya esta cerrado');

  const { rows: asignacion } = await query<{ submitted_at: Date | null }>(
    'SELECT submitted_at FROM quiz_assignments WHERE quiz_id = $1 AND student_id = $2',
    [quizId, userId],
  );
  if (!asignacion[0]) throw HttpError.notFound('Cuestionario no encontrado');
  if (asignacion[0].submitted_at && !quiz.allow_retry) {
    throw HttpError.badRequest('Ya entregaste este cuestionario');
  }

  const preguntas = await preguntasDe(quizId);
  const porId = new Map(preguntas.map((p) => [p.id, p]));

  let autoScore = 0;
  let pendingReview = 0;

  await withTransaction(async (client) => {
    for (const respuesta of input.answers) {
      const pregunta = porId.get(respuesta.questionId);
      if (!pregunta) continue; // Pregunta ajena a este examen: se ignora.

      const limpia = respuesta.answer.map((v) => v.trim()).filter(Boolean);
      const correcta = corregir(pregunta.kind, pregunta.options, limpia);
      const puntos = correcta === null ? null : correcta ? pregunta.points : 0;

      if (correcta === null) pendingReview += 1;
      else if (correcta) autoScore += pregunta.points;

      await client.query(
        `INSERT INTO quiz_answers (quiz_id, question_id, student_id, answer, correct, score, answered_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (quiz_id, question_id, student_id) DO UPDATE
           SET answer = EXCLUDED.answer,
               correct = EXCLUDED.correct,
               score = EXCLUDED.score,
               answered_at = CURRENT_TIMESTAMP,
               -- Una respuesta rehecha vuelve a estar sin revisar.
               reviewed_at = NULL`,
        [quizId, respuesta.questionId, userId, JSON.stringify(limpia), correcta, puntos],
      );
    }

    await client.query(
      `UPDATE quiz_assignments
       SET started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
           submitted_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE submitted_at END
       WHERE quiz_id = $1 AND student_id = $2`,
      [quizId, userId, input.submit],
    );
  });

  return {
    submitted: input.submit,
    autoScore,
    pendingReview,
    totalPoints: preguntas.reduce((suma, p) => suma + p.points, 0),
  };
}

// --- Panel de resultados ---

export interface ResultAnswer {
  questionId: string;
  answer: string[];
  correct: boolean | null;
  score: number | null;
  teacherNote: string;
  reviewedAt: string | null;
}

export interface ResultRow {
  studentId: string;
  studentName: string;
  course: string | null;
  submittedAt: string | null;
  score: number;
  pendingReview: number;
  answers: ResultAnswer[];
}

export interface QuizResults {
  quiz: Quiz;
  questions: QuizQuestion[];
  totalPoints: number;
  rows: ResultRow[];
  /** Acierto por pregunta, para ver de un vistazo cual costo mas. */
  perQuestion: Array<{ questionId: string; answered: number; correct: number }>;
}

export async function getResults(quizId: string, userId: string): Promise<QuizResults> {
  const quiz = await cargarComoDocente(quizId, userId);
  const preguntas = await preguntasDe(quizId);
  const totalPoints = preguntas.reduce((suma, p) => suma + p.points, 0);

  const { rows } = await query<{
    student_id: string;
    student_name: string;
    course: string | null;
    submitted_at: Date | null;
    answers:
      | Array<{
          question_id: string;
          answer: string[];
          correct: boolean | null;
          score: string | null;
          teacher_note: string;
          reviewed_at: string | null;
        }>
      | null;
  }>(
    `SELECT u.id AS student_id, u.full_name AS student_name, u.external_group AS course,
            qa.submitted_at,
            (SELECT json_agg(json_build_object(
                'question_id', ans.question_id, 'answer', ans.answer, 'correct', ans.correct,
                'score', ans.score, 'teacher_note', ans.teacher_note, 'reviewed_at', ans.reviewed_at))
             FROM quiz_answers ans
             WHERE ans.quiz_id = qa.quiz_id AND ans.student_id = qa.student_id) AS answers
     FROM quiz_assignments qa
     JOIN users u ON u.id = qa.student_id
     WHERE qa.quiz_id = $1
     ORDER BY u.external_group NULLS LAST, u.full_name`,
    [quizId],
  );

  const filas: ResultRow[] = rows.map((row) => {
    const answers = (row.answers ?? []).map((a) => ({
      questionId: a.question_id,
      answer: Array.isArray(a.answer) ? a.answer : [],
      correct: a.correct,
      score: a.score === null ? null : Number(a.score),
      teacherNote: a.teacher_note,
      reviewedAt: a.reviewed_at ? new Date(a.reviewed_at).toISOString() : null,
    }));
    return {
      studentId: row.student_id,
      studentName: row.student_name,
      course: row.course,
      submittedAt: row.submitted_at?.toISOString() ?? null,
      score: answers.reduce((suma, a) => suma + (a.score ?? 0), 0),
      pendingReview: answers.filter((a) => a.score === null).length,
      answers,
    };
  });

  const perQuestion = preguntas.map((pregunta) => {
    const dadas = filas.flatMap((f) => f.answers).filter((a) => a.questionId === pregunta.id);
    return {
      questionId: pregunta.id,
      answered: dadas.length,
      correct: dadas.filter((a) => a.correct === true).length,
    };
  });

  return { quiz: toQuiz(quiz), questions: preguntas, totalPoints, rows: filas, perQuestion };
}

/** Puntua a mano una respuesta; es como se cierran las preguntas abiertas. */
export async function reviewAnswer(
  quizId: string,
  questionId: string,
  studentId: string,
  userId: string,
  input: ReviewInput,
): Promise<ResultAnswer> {
  await cargarComoDocente(quizId, userId);

  const { rows: pregunta } = await query<{ points: string }>(
    'SELECT points FROM quiz_questions WHERE id = $1 AND quiz_id = $2',
    [questionId, quizId],
  );
  if (!pregunta[0]) throw HttpError.notFound('Pregunta no encontrada');
  if (input.score > Number(pregunta[0].points)) {
    throw HttpError.badRequest(`Esta pregunta vale como maximo ${Number(pregunta[0].points)} puntos`);
  }

  const { rows } = await query<{
    question_id: string;
    answer: string[];
    correct: boolean | null;
    score: string | null;
    teacher_note: string;
    reviewed_at: Date | null;
  }>(
    `UPDATE quiz_answers
     SET score = $4, correct = $5, teacher_note = $6, reviewed_at = CURRENT_TIMESTAMP
     WHERE quiz_id = $1 AND question_id = $2 AND student_id = $3
     RETURNING question_id, answer, correct, score, teacher_note, reviewed_at`,
    [
      quizId,
      questionId,
      studentId,
      input.score,
      // Sin veredicto explicito, se deduce del reparto: los puntos completos son un acierto.
      input.correct ?? input.score >= Number(pregunta[0].points),
      input.teacherNote,
    ],
  );
  if (!rows[0]) throw HttpError.notFound('Esa respuesta no existe');

  const fila = rows[0];
  return {
    questionId: fila.question_id,
    answer: Array.isArray(fila.answer) ? fila.answer : [],
    correct: fila.correct,
    score: fila.score === null ? null : Number(fila.score),
    teacherNote: fila.teacher_note,
    reviewedAt: fila.reviewed_at?.toISOString() ?? null,
  };
}
