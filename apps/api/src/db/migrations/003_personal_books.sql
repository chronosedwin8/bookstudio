-- Libros personales: viven fuera de toda biblioteca (library_id NULL) y pertenecen
-- unicamente a su autor. La columna ya admitia NULL; falta el indice de consulta.
CREATE INDEX IF NOT EXISTS idx_books_personal
    ON books (creator_id, updated_at DESC)
    WHERE library_id IS NULL;

-- El portafolio deja de ser exclusivo de los alumnos con QR: cualquier autor
-- (docente, admin o alumno) agrupa ahi sus libros personales.
INSERT INTO student_portfolios (student_id, name)
SELECT u.id, 'Portafolio de ' || u.full_name
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM student_portfolios sp WHERE sp.student_id = u.id);
