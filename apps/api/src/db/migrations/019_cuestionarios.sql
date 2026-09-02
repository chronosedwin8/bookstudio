-- Cuestionarios de examen: el docente redacta las preguntas, las envia a los
-- alumnos y despues mira los resultados en una cuadricula.
--
-- Por que una tabla propia y no un libro con bloques de pregunta: un examen
-- necesita saber quien lo tiene asignado, quien lo ha entregado y que respondio
-- cada uno. Un libro solo guarda contenido, no respuestas por alumno.

CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    library_id UUID NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    -- Quien lo creo. Si la cuenta desaparece el examen y sus respuestas siguen
    -- siendo del grupo, asi que no se borra en cascada.
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    -- borrador: solo lo ve el docente. enviado: los alumnos ya pueden responder.
    -- cerrado: no admite mas entregas.
    status VARCHAR(16) NOT NULL DEFAULT 'borrador'
        CHECK (status IN ('borrador', 'enviado', 'cerrado')),
    -- Con las respuestas a la vista el alumno sabe al momento si acerto.
    show_solutions BOOLEAN NOT NULL DEFAULT TRUE,
    -- Un solo intento por alumno salvo que el docente permita repetir.
    allow_retry BOOLEAN NOT NULL DEFAULT FALSE,
    time_limit_minutes INTEGER CHECK (time_limit_minutes IS NULL OR time_limit_minutes BETWEEN 1 AND 300),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quizzes_library ON quizzes(library_id, created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('single', 'multiple', 'order', 'open')),
    prompt TEXT NOT NULL DEFAULT '',
    prompt_image_url VARCHAR(2048),
    -- [{ id, text, imageUrl?, correct? }]. Vacio en las preguntas abiertas.
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Solo en las abiertas: que se espera leer. No se le muestra al alumno.
    expected_answer TEXT NOT NULL DEFAULT '',
    -- Cuanto vale la pregunta. Permite que una abierta pese mas que un test.
    points NUMERIC(5, 2) NOT NULL DEFAULT 1 CHECK (points > 0 AND points <= 100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- La posicion ordena el examen y no puede repetirse dentro del mismo.
    UNIQUE (quiz_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id, position);

-- A quien se le envio. Se guarda explicito, y no "todos los de la biblioteca",
-- para que anadir un alumno en noviembre no le cuelgue el examen de septiembre.
CREATE TABLE IF NOT EXISTS quiz_assignments (
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (quiz_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_assignments_student ON quiz_assignments(student_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS quiz_answers (
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Ids de opcion elegidos, o un unico texto en las abiertas.
    answer JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- NULL mientras nadie la ha corregido: es el estado normal de una abierta
    -- recien entregada, y distinto de "corregida y mal".
    correct BOOLEAN,
    -- Puntos otorgados. En las de opciones lo pone la correccion automatica; en
    -- las abiertas lo escribe el docente.
    score NUMERIC(5, 2),
    teacher_note TEXT NOT NULL DEFAULT '',
    answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (quiz_id, question_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_answers_student ON quiz_answers(quiz_id, student_id);
