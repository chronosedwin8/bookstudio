-- Bitacora de trabajo: cuando y cuanto tiempo ha estado cada alumno en un libro.
--
-- No se guarda un evento por clic, sino sesiones: el editor avisa cada minuto que
-- sigue abierto y el servidor alarga la sesion en curso. Si pasa mas de un rato sin
-- aviso (se cerro el portatil, se fue a otra clase), la siguiente visita abre una
-- sesion nueva. Asi la duracion refleja tiempo de trabajo y no pestanas olvidadas.

CREATE TABLE IF NOT EXISTS book_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ultimo aviso recibido. La duracion es la diferencia con started_at.
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Las dos consultas: alargar la sesion en curso de alguien, y listar la bitacora.
CREATE INDEX IF NOT EXISTS idx_book_sessions_reciente
    ON book_sessions(book_id, user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_book_sessions_libro
    ON book_sessions(book_id, started_at DESC);
