-- Gestion de clientes: organizaciones, equipo y cuentas de cobro.
--
-- El problema que resuelve: en los planes Escuela e Institucional quien paga no da
-- clase. Hasta ahora "organization" era un texto libre en la suscripcion, asi que no
-- habia forma de saber que docentes pertenecen a ese cliente ni de cobrarle nada que
-- no fuera la contratacion inicial.
--
-- Sobre el nombre: esto es una CUENTA DE COBRO interna, no una factura electronica
-- de venta. No lleva CUFE, ni resolucion de la DIAN, ni numeracion fiscal, y el
-- documento lo dice en su cara. La factura fiscal se emite aparte.

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Nombre con el que se le conoce; el legal puede ser otro.
    name VARCHAR(160) NOT NULL,
    legal_name VARCHAR(200),
    tax_id VARCHAR(40),

    -- Quien paga y ve el portal. Si su cuenta desaparece la organizacion sigue
    -- existiendo con su historial: el dinero cobrado no se borra con una persona.
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

    contact_name VARCHAR(120),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(40),
    address VARCHAR(240),
    city VARCHAR(120),
    notes TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations (owner_id);

-- Dos clientes con el mismo NIT serian el mismo cliente por duplicado. Se comparan
-- en minusculas y solo cuando hay NIT: al crear una organizacion aun puede faltar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_nit
    ON organizations (lower(tax_id)) WHERE tax_id IS NOT NULL AND tax_id <> '';

-- A que cliente pertenece cada cuenta. NULL = cuenta suelta, como las de siempre.
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_organization
    ON users (organization_id) WHERE organization_id IS NOT NULL;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_organization
    ON subscriptions (organization_id);

CREATE TABLE IF NOT EXISTS charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Consecutivo propio y legible, para poder decir "la cuenta 42" por telefono.
    -- No es numeracion fiscal: ver la nota de arriba.
    number BIGSERIAL,

    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- La licencia que renueva o amplia, si viene de una.
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    issued_by UUID REFERENCES users(id) ON DELETE SET NULL,

    concept VARCHAR(200) NOT NULL,
    -- [{ description, quantity, unitCop }]. El total se recalcula en el servidor;
    -- las lineas se guardan juntas porque una cuenta emitida no vuelve a cambiar.
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    amount_cop BIGINT NOT NULL CHECK (amount_cop > 0),

    -- borrador: solo la ve quien la prepara. emitida: el cliente ya la tiene y puede
    -- pagarla. pagada: liquidada. anulada: se deja el rastro en lugar de borrarla.
    status VARCHAR(16) NOT NULL DEFAULT 'borrador'
        CHECK (status IN ('borrador', 'emitida', 'pagada', 'anulada')),

    due_date DATE,
    issued_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    notes TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_charges_organization ON charges (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charges_pendientes ON charges (status, due_date);

-- Que pago liquido que cuenta de cobro.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS charge_id UUID
    REFERENCES charges(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments (charge_id);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_charges_updated_at ON charges;
CREATE TRIGGER trg_charges_updated_at BEFORE UPDATE ON charges
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Traspaso de lo que ya existe ---
--
-- Cada persona que ya tiene suscripcion pasa a tener su organizacion, para que el
-- portal no le aparezca vacio. Se usa el texto que escribio al contratar y, si lo
-- dejo en blanco, su propio nombre. DISTINCT ON: quien contrato dos veces sigue
-- siendo un solo cliente.
INSERT INTO organizations (name, owner_id, contact_email, contact_name)
SELECT DISTINCT ON (s.owner_id)
       COALESCE(NULLIF(TRIM(s.organization), ''), u.full_name),
       s.owner_id,
       COALESCE(NULLIF(TRIM(s.payer_email), ''), u.email),
       u.full_name
FROM subscriptions s
JOIN users u ON u.id = s.owner_id
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.owner_id = s.owner_id)
ORDER BY s.owner_id, s.created_at DESC;

UPDATE subscriptions s
SET organization_id = o.id
FROM organizations o
WHERE o.owner_id = s.owner_id AND s.organization_id IS NULL;

UPDATE users u
SET organization_id = o.id
FROM organizations o
WHERE o.owner_id = u.id AND u.organization_id IS NULL;
