-- Marcos en el lienzo y respuestas guardadas de preguntas y encuestas.
--
-- 1) Un tipo de elemento mas, 'frame' (una silueta con una imagen dentro). Como
--    siempre, se amplia la lista cerrada en vez de quitarla.
ALTER TABLE canvas_elements DROP CONSTRAINT IF EXISTS canvas_elements_type_check;
ALTER TABLE canvas_elements ADD CONSTRAINT canvas_elements_type_check
  CHECK (type IN ('text', 'shape', 'drawing', 'image', 'audio', 'video',
                  'map', 'icon', 'embed', 'question', 'chart', 'math', 'button',
                  'illustration', 'table', 'plot', 'frame'));

-- 2) Respuestas a las preguntas y encuestas del lienzo.
--
-- Hasta ahora solo se guardaba el texto de las abiertas, dentro de la copia del
-- propio alumno; las demas se corregian y se perdian. Ahora cada respuesta de
-- alguien con sesion queda aqui, sea en su libro, en uno de la biblioteca o en
-- uno abierto con enlace.
--
-- La clave es question_key, que va DENTRO de las propiedades de la pregunta y
-- viaja con todas sus copias (repartir, pegar paginas, pasar a biblioteca): asi
-- el docente ve en una sola lista lo que contesto cada alumno en su copia.
-- Una fila por persona y pregunta: responder otra vez la sustituye.
CREATE TABLE IF NOT EXISTS question_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_key UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Donde se contesto: el libro y el elemento concretos (la copia del alumno).
    book_id UUID REFERENCES books(id) ON DELETE SET NULL,
    element_id UUID REFERENCES canvas_elements(id) ON DELETE SET NULL,
    kind VARCHAR(10) NOT NULL,
    -- Ids de opciones, o [texto] en las abiertas.
    answer JSONB NOT NULL,
    -- NULL: abierta sin revisar o encuesta (no hay correcta).
    correct BOOLEAN,
    attempts INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (question_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_question_responses_key ON question_responses (question_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_responses_book ON question_responses (book_id);
