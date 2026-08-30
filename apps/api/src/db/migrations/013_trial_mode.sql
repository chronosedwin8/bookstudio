-- Modo de prueba sin registro: acceso completo al editor con cupos muy pequenos.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT FALSE;

-- Sirve para limpiar cuentas de prueba abandonadas.
CREATE INDEX IF NOT EXISTS idx_users_trial ON users (is_trial, created_at) WHERE is_trial;
