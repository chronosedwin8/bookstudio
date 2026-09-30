-- Pagar en la pagina de Mercado Pago (Checkout Pro), con la cuenta del cliente.
--
-- Hasta ahora solo se podia pagar con tarjeta como invitado, dentro de BookStudio:
-- el cobro se hacia en el momento y el resultado se sabia en la misma respuesta.
-- En la pagina de Mercado Pago el cliente paga alli (con sus tarjetas guardadas,
-- saldo, PSE o Efecty) y vuelve; el resultado llega despues, por el aviso de
-- Mercado Pago o al consultar al volver.
--
-- Cada intento se apunta aqui ANTES de mandar al cliente a pagar. La cuenta, la
-- licencia o la cuenta de cobro saldada se crean solo cuando el pago esta
-- aprobado: quien abandona a medias no deja cuentas ni licencias fantasma.
--
-- Solo se CREA una tabla nueva. Ninguna fila existente cambia.

CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Lo que viaja a Mercado Pago como external_reference y vuelve en el pago.
    reference VARCHAR(80) NOT NULL UNIQUE,

    -- plan = contratar o renovar una licencia; charge = saldar una cuenta de cobro.
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('plan', 'charge')),

    -- El importe que se espera, sacado del servidor. Al confirmar se comprueba que
    -- el pago de Mercado Pago cubre esto: nunca se da por bueno un pago menor.
    amount_cop BIGINT NOT NULL CHECK (amount_cop > 0),

    -- Quien paga, si ya tenia cuenta.
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Contratar un plan
    plan VARCHAR(40),
    organization VARCHAR(160),
    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
    payer_email VARCHAR(255),

    -- Alta nueva: la cuenta se crea al aprobarse el pago, con estos datos. La
    -- contrasena se guarda ya cifrada, igual que en users.
    signup_name VARCHAR(100),
    signup_password_hash VARCHAR(255),
    -- Huella (sha256) del secreto que guarda el navegador de quien paga. Con el,
    -- y solo con el, al volver se le entrega la sesion de su cuenta nueva.
    claim_hash VARCHAR(64),

    -- Saldar una cuenta de cobro
    charge_id UUID REFERENCES charges(id) ON DELETE SET NULL,

    mp_preference_id VARCHAR(120),
    -- La pagina de pago, para poder volver a ella si el primer intento se rechaza.
    init_point TEXT,

    -- abierta: esperando el pago; pagada: cumplida; revisar: pago recibido que no se
    -- pudo aplicar solo (por ejemplo, el correo ya tiene cuenta).
    status VARCHAR(12) NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'pagada', 'revisar')),
    -- Ultimo estado visto en Mercado Pago (approved, pending, rejected...).
    last_mp_status VARCHAR(30),
    last_mp_detail VARCHAR(120),
    mp_payment_id VARCHAR(80),

    -- Lo que se creo al cumplirse.
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    fulfilled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_owner ON payment_intents (owner_id, created_at DESC);
