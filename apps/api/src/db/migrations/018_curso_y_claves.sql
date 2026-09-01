-- Curso del alumno y control de la contrasena inicial.

-- 1. El curso, guardado en la propia cuenta.
--
--    Antes se deducia buscando una biblioteca del alumno que viniera del sistema
--    academico. Eso fallaba en cuanto se anadia a alguien suelto a una biblioteca
--    creada a mano: el alumno tiene cuenta de Phidias pero no pertenece a ninguna
--    biblioteca importada, y el curso salia vacio.
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_group VARCHAR(60);

-- Se rellena para quienes ya estan, a partir de la biblioteca importada a la que
-- pertenezcan. A los que no tengan ninguna les seguira faltando hasta que se les
-- vuelva a anadir desde una seccion.
UPDATE users u
SET external_group = (
  SELECT l.name FROM library_students ls
  JOIN libraries l ON l.id = ls.library_id
  WHERE ls.student_id = u.id AND l.external_source IS NOT NULL
  ORDER BY l.name LIMIT 1
)
WHERE u.role = 'student' AND u.external_group IS NULL;

-- 2. Si la cuenta sigue con la contrasena que le puso el sistema.
--
--    Sirve para dos cosas: decirle al docente que clave repartir cuando da de alta a
--    alguien nuevo, y callarse cuando el alumno ya se puso la suya.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_is_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Las cuentas traidas de Phidias nacieron todas con la contrasena por defecto y
-- ninguna ha podido cambiarla todavia, porque hasta ahora no habia forma de hacerlo.
UPDATE users SET password_is_default = TRUE
WHERE external_source = 'phidias' AND password_is_default = FALSE;

CREATE INDEX IF NOT EXISTS idx_users_grupo ON users(external_group) WHERE external_group IS NOT NULL;
