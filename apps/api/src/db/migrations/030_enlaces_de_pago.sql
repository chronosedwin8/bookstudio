-- Enlaces de pago de Mercado Pago, por importe.
--
-- Cambio de planes (30 de septiembre de 2026): se deja de cobrar dentro de
-- BookStudio (tarjeta como invitado, pagina de Mercado Pago con cuenta,
-- renovacion automatica). Pedian estar registrado en Mercado Pago o pasaban
-- controles que rechazaban pagos buenos. En su lugar, cada importe tiene su
-- enlace de pago de Mercado Pago y el cliente paga ahi.
--
-- Van por IMPORTE, no por plan: asi el mismo enlace sirve para un plan y para
-- una cuenta de cobro del mismo valor, y si se cambia el precio de un plan su
-- enlace viejo deja de ofrecerse solo, en vez de cobrar el importe equivocado.
--
-- Solo se CREA una tabla y se cargan los enlaces. Ninguna fila existente cambia.

CREATE TABLE IF NOT EXISTS payment_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    amount_cop BIGINT NOT NULL UNIQUE CHECK (amount_cop > 0),
    url TEXT NOT NULL,
    label VARCHAR(120) NOT NULL DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO payment_links (amount_cop, url, label) VALUES
    (500000,   'https://mpago.li/1PqweqL', 'Plan Individual'),
    (3600000,  'https://mpago.li/1hazNmq', 'Cuenta de cobro'),
    (8000000,  'https://mpago.li/2SjtL4m', 'Plan Escuela'),
    (20000000, 'https://mpago.li/2gNNSZj', 'Plan Institucional y empresas')
ON CONFLICT (amount_cop) DO NOTHING;
