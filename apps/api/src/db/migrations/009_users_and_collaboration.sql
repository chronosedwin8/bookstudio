-- Edicion colaborativa: cualquier miembro de la biblioteca puede editar el libro.
ALTER TABLE books ADD COLUMN IF NOT EXISTS collaborative BOOLEAN NOT NULL DEFAULT FALSE;

-- Gestion de usuarios: desactivar sin borrar, para no perder su obra.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Origen del usuario, para saber cual vino de Phidias y no duplicarlo.
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_source VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(60);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_external
    ON users (external_source, external_id)
    WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

-- Igual para las bibliotecas importadas de una seccion de Phidias.
ALTER TABLE libraries ADD COLUMN IF NOT EXISTS external_source VARCHAR(30);
ALTER TABLE libraries ADD COLUMN IF NOT EXISTS external_id VARCHAR(60);

CREATE UNIQUE INDEX IF NOT EXISTS idx_libraries_external
    ON libraries (external_source, external_id)
    WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
