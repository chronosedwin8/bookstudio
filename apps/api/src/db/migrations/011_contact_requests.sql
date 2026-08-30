-- Solicitudes desde la web comercial (demos, presupuestos, dudas).
CREATE TABLE IF NOT EXISTS contact_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    organization VARCHAR(160),
    plan VARCHAR(40),
    people INT,
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'atendido', 'descartado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_status
    ON contact_requests (status, created_at DESC);
