-- Bibliotecas con alumnado de varios cursos, entregas y visibilidad entre companeros.

-- 1. Que el alumnado vea o no las creaciones del resto.
--    Por defecto TRUE: es como se ha comportado hasta ahora y cambiarlo en silencio
--    escondería trabajo que hoy se ve.
ALTER TABLE libraries ADD COLUMN IF NOT EXISTS students_see_peers BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. De donde salio un libro entregado por el docente.
--    Permite que entregar una segunda pagina del mismo material caiga en el libro que
--    el alumno ya tiene, en vez de crearle uno nuevo cada vez.
ALTER TABLE books ADD COLUMN IF NOT EXISTS origin_book_id UUID REFERENCES books(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_books_origin ON books(origin_book_id, creator_id)
  WHERE origin_book_id IS NOT NULL;

-- 3. Un alumno pertenece a varias bibliotecas a la vez y conviene saber cuando entro
--    y quien lo metio, para poder deshacerlo con criterio.
ALTER TABLE library_students ADD COLUMN IF NOT EXISTS added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE library_students ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Buscar alumnado por nombre entre cursos distintos: sin esto la busqueda recorre
-- la tabla entera en cada pulsacion de tecla.
CREATE INDEX IF NOT EXISTS idx_users_students_name ON users(role, full_name)
  WHERE role = 'student';
