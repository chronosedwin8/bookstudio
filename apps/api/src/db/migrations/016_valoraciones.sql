-- Valoraciones de los libros: el docente pone nota varias veces a lo largo del curso.
--
-- La escala es la alemana, de 1.0 a 6.0, donde 1.0 es lo mejor y 6.0 lo peor. Se
-- guarda con un decimal (NUMERIC 2,1) para que 2.5 sea exactamente 2.5 y no un
-- flotante aproximado: son notas, no medidas.

CREATE TABLE IF NOT EXISTS book_grades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    -- Quien la puso. Si la cuenta desaparece la nota se conserva: es del alumno.
    teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(120) NOT NULL,
    score NUMERIC(2, 1) NOT NULL CHECK (score >= 1.0 AND score <= 6.0),
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Las dos consultas que existen: las notas de un libro, y la cuadricula de la clase.
CREATE INDEX IF NOT EXISTS idx_book_grades_book ON book_grades(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_book_grades_title ON book_grades(title);
