-- Nombres y apellidos por separado, y saber quien corrigio un nombre a mano.
--
-- Hasta ahora solo habia full_name, y cada via de alta lo escribia a su manera:
-- Phidias como "NOMBRES APELLIDOS", Microsoft como "APELLIDOS NOMBRES", a mano
-- como cada cual. En una lista de clase salian mezclados. Con las dos partes
-- guardadas aparte, el nombre completo se compone siempre igual.
--
-- Solo se AÑADEN columnas, todas opcionales: ninguna fila existente cambia al
-- aplicar esta migracion.

ALTER TABLE users ADD COLUMN IF NOT EXISTS given_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS family_name VARCHAR(100);

-- Cuando un docente o la administracion corrige el nombre, esa correccion manda:
-- ni Phidias ni Microsoft la vuelven a pisar al importar o al entrar. Es lo mismo
-- que ya se hace con el correo corregido.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_edited_at TIMESTAMP WITH TIME ZONE;
