-- Criterios de valoracion: cada nota se pone dentro de uno ("Trabajos",
-- "Seguimientos", "Otros"...), y el alumnado ve sus notas agrupadas por ellos.
--
-- Tres alcances, segun quien lo crea y para que:
--   teacher_id NULL, library_id NULL  -> de la plataforma, para todo el mundo
--                                        (los tres de siempre; no se borran)
--   teacher_id X,    library_id NULL  -> del docente X, en todas sus bibliotecas
--   library_id L                      -> solo de la biblioteca L, para todos sus
--                                        docentes (teacher_id dice quien lo creo)
CREATE TABLE IF NOT EXISTS grade_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_grade_criteria_library ON grade_criteria(library_id);
CREATE INDEX IF NOT EXISTS idx_grade_criteria_teacher ON grade_criteria(teacher_id) WHERE library_id IS NULL;

-- Los tres de la plataforma, una sola vez aunque la migracion se repita.
INSERT INTO grade_criteria (name, sort_order)
SELECT v.name, v.sort_order
FROM (VALUES ('Trabajos', 1), ('Seguimientos', 2), ('Otros', 3)) AS v(name, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM grade_criteria c WHERE c.teacher_id IS NULL AND c.library_id IS NULL AND c.name = v.name
);

-- Cada nota apunta a su criterio y guarda ademas su nombre: si alguien borra el
-- criterio, la nota no se pierde ni se queda sin decir de que era.
ALTER TABLE book_grades ADD COLUMN IF NOT EXISTS criterion_id UUID REFERENCES grade_criteria(id) ON DELETE SET NULL;
ALTER TABLE book_grades ADD COLUMN IF NOT EXISTS criterion_name VARCHAR(60);

-- Las notas de antes no tenian criterio: pasan a "Otros".
UPDATE book_grades g
SET criterion_id = c.id, criterion_name = c.name
FROM grade_criteria c
WHERE g.criterion_name IS NULL
  AND c.teacher_id IS NULL AND c.library_id IS NULL AND c.name = 'Otros';
