-- Bloqueo de libros nuevos en una biblioteca.
--
-- Aparte de "editar sus libros": con esto apagado el alumnado sigue trabajando
-- en los que ya tiene, pero no puede empezar otros ni traer los de Mis libros.
-- TRUE = como hasta ahora, asi que ninguna biblioteca cambia al aplicarla.
ALTER TABLE libraries ADD COLUMN IF NOT EXISTS students_can_create BOOLEAN NOT NULL DEFAULT TRUE;
