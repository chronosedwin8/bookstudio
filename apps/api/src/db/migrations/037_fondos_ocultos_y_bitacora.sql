-- Tres ampliaciones, todas aditivas: ninguna fila existente cambia al aplicarla.

-- 1. Imagen de fondo de la pagina, debajo de todo (color y pauta incluidos).
--    NULL = sin imagen, como hasta ahora.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS background_image TEXT;

-- 2. Libros que el alumnado "borra" de una biblioteca. No se borran: se ocultan.
--    El alumno deja de verlos; el profesorado y la administracion los siguen
--    viendo, marcados, y pueden reactivarlos.
ALTER TABLE books ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE books ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 3. Bitacora: ademas del tiempo, lo que se hizo en cada sesion.
ALTER TABLE book_sessions ADD COLUMN IF NOT EXISTS elements_created INTEGER NOT NULL DEFAULT 0;
ALTER TABLE book_sessions ADD COLUMN IF NOT EXISTS elements_edited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE book_sessions ADD COLUMN IF NOT EXISTS elements_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE book_sessions ADD COLUMN IF NOT EXISTS pages_added INTEGER NOT NULL DEFAULT 0;
ALTER TABLE book_sessions ADD COLUMN IF NOT EXISTS pages_deleted INTEGER NOT NULL DEFAULT 0;

-- La bitacora de un alumno recorre todos sus libros: se busca por persona.
CREATE INDEX IF NOT EXISTS idx_book_sessions_persona
    ON book_sessions(user_id, started_at DESC);
