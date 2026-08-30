-- Suscripciones, licencias y pagos.
--
-- Los importes se guardan en pesos colombianos enteros: el COP no usa decimales y
-- almacenarlo en coma flotante acabaria produciendo diferencias de centavos.

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization VARCHAR(160),

    plan VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (status IN ('pendiente', 'activa', 'vencida', 'cancelada')),

    amount_cop BIGINT NOT NULL,

    -- Limites de la licencia; NULL significa sin limite.
    max_teachers INT,
    max_students INT,

    -- Renovacion automatica anual mediante una suscripcion de Mercado Pago.
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    mp_preapproval_id VARCHAR(80),
    payer_email VARCHAR(255),

    starts_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_owner ON subscriptions (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_vigencia ON subscriptions (status, expires_at);

-- Un mismo preapproval no puede pertenecer a dos suscripciones.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_preapproval
    ON subscriptions (mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Identificador en Mercado Pago; unico para que un webhook repetido no duplique.
    mp_payment_id VARCHAR(80) UNIQUE,

    amount_cop BIGINT NOT NULL,
    status VARCHAR(30) NOT NULL,
    status_detail VARCHAR(120),
    payment_method VARCHAR(60),
    installments INT,
    payer_email VARCHAR(255),

    -- Numero de factura correlativo y legible.
    invoice_number BIGSERIAL,

    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments (subscription_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
