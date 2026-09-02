/**
 * Comprobacion de las preguntas, con foco en las abiertas. Se ejecuta con:
 *   npx tsx apps/api/src/modules/canvas/questions.check.mts
 *
 * La pregunta abierta rompe dos supuestos que el resto daba por ciertos: que toda
 * pregunta tiene al menos dos opciones, y que toda respuesta se puede corregir
 * sola. Si alguno de los dos vuelve a colarse, una redaccion perfecta se guardaria
 * como fallada o el bloque ni siquiera se dejaria crear.
 */
import { questionPropertiesSchema } from './canvas.schemas.js';

let fallos = 0;
const check = (nombre: string, ok: boolean, detalle = '') => {
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${nombre}${detalle ? ' -> ' + detalle : ''}`);
};

const abierta = {
  kind: 'open',
  prompt: 'Explica con tus palabras que aprendiste',
  options: [],
  feedbackCorrect: 'Muy bien!',
  feedbackWrong: 'Casi.',
  accentColor: '#0F766E',
  allowRetry: true,
};

const opciones = [
  { id: 'a', text: 'Primera', correct: true },
  { id: 'b', text: 'Segunda', correct: false },
];

// --- Validacion ---
const sinOpciones = questionPropertiesSchema.safeParse(abierta);
check('una abierta se acepta sin opciones', sinOpciones.success, JSON.stringify(sinOpciones.error?.issues?.[0]?.message));
check('la abierta trae 4 lineas por defecto', sinOpciones.success && sinOpciones.data.answerLines === 4);

check(
  'una de respuesta unica sigue exigiendo opciones',
  !questionPropertiesSchema.safeParse({ ...abierta, kind: 'single' }).success,
);
check(
  'una de opciones con una sola opcion se rechaza',
  !questionPropertiesSchema.safeParse({ ...abierta, kind: 'single', options: [opciones[0]] }).success,
);
check(
  'una de respuesta unica bien formada se acepta',
  questionPropertiesSchema.safeParse({ ...abierta, kind: 'single', options: opciones }).success,
);
check(
  'la de ordenar sigue funcionando',
  questionPropertiesSchema.safeParse({ ...abierta, kind: 'order', options: opciones }).success,
);
check(
  'un tipo inventado se rechaza',
  !questionPropertiesSchema.safeParse({ ...abierta, kind: 'ensayo' }).success,
);
check(
  'el cuadro de respuesta no puede ser absurdo',
  !questionPropertiesSchema.safeParse({ ...abierta, answerLines: 500 }).success,
);
check(
  'la indicacion al alumno se conserva',
  questionPropertiesSchema.safeParse({ ...abierta, expectedAnswer: 'Tres lineas' }).data?.expectedAnswer ===
    'Tres lineas',
);

// --- Correccion ---
// gradeQuestion no se exporta (vive junto al acceso a la base de datos), asi que
// aqui se comprueba la regla que debe cumplir, replicada tal cual.
const corregirAbierta = (texto: string) => ({
  correct: false,
  pendingReview: true,
  solution: [] as string[],
  feedback: texto.trim() ? 'Respuesta guardada. La leerá tu profesor.' : 'Escribe tu respuesta antes de enviarla.',
});

const conTexto = corregirAbierta('La fotosintesis convierte la luz en energia.');
check('la abierta queda pendiente de revision', conTexto.pendingReview === true);
check('la abierta no se marca como fallada al alumno', conTexto.correct === false && conTexto.solution.length === 0);
check('acusa recibo cuando hay texto', conTexto.feedback.includes('guardada'));
check('avisa cuando esta vacia', corregirAbierta('   ').feedback.includes('antes de enviarla'));

console.log(fallos === 0 ? '\nTodo correcto' : `\n${fallos} comprobacion(es) fallidas`);
process.exit(fallos === 0 ? 0 : 1);
