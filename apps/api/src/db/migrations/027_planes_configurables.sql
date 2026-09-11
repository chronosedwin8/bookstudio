-- Los precios de los planes dejan de estar escritos en el codigo.
--
-- Hasta ahora cambiar un precio era editar un fichero y volver a desplegar, y
-- ademas habia DOS copias: la del servidor (la que cobra) y la de la portada
-- (la que se anuncia), que podian decir cosas distintas sin que nadie lo notara.
--
-- El precio sigue sin venir nunca del navegador: ahora sale de esta tabla en vez
-- de una constante, que para el caso es lo mismo de seguro.

CREATE TABLE IF NOT EXISTS plans (
    -- El mismo identificador que ya se guarda en subscriptions.plan
    id VARCHAR(40) PRIMARY KEY,

    name VARCHAR(80) NOT NULL,
    summary TEXT NOT NULL DEFAULT '',

    -- En pesos colombianos ENTEROS: el COP no usa decimales, y guardarlos como
    -- decimal invitaria a que aparecieran centavos que no existen.
    amount_cop BIGINT NOT NULL CHECK (amount_cop > 0),

    -- Lo que se muestra como "al mes" cuando el cobro es anual. Solo informativo:
    -- lo que se cobra siempre es amount_cop.
    monthly_cop BIGINT CHECK (monthly_cop IS NULL OR monthly_cop > 0),

    -- Cuanto dura la licencia. 12 en los planes anuales, 1 en el mensual.
    period_months SMALLINT NOT NULL DEFAULT 12 CHECK (period_months BETWEEN 1 AND 60),

    -- NULL = sin limite
    max_teachers INTEGER CHECK (max_teachers IS NULL OR max_teachers > 0),
    max_students INTEGER CHECK (max_students IS NULL OR max_students > 0),

    -- Un plan que se retira deja de ofrecerse, pero NO se borra: las licencias ya
    -- vendidas siguen apuntando a el y su nombre tiene que poder leerse.
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order SMALLINT NOT NULL DEFAULT 0,

    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Los tres de siempre, con los importes que ya estaban en el codigo.
INSERT INTO plans (id, name, summary, amount_cop, monthly_cop, period_months, max_teachers, max_students, sort_order)
VALUES
    ('individual', 'Individual',
     'Para un docente o un profesional que trabaja por su cuenta.',
     1800000, 150000, 12, 1, NULL, 20),
    ('escuela', 'Escuela',
     'Hasta 5 profesores y 500 estudiantes.',
     5000000, NULL, 12, 5, 500, 30),
    ('institucional', 'Institucional y empresas',
     'Usuarios ilimitados.',
     20000000, NULL, 12, NULL, NULL, 40)
ON CONFLICT (id) DO NOTHING;

-- Y el mensual, que es el que permite probar un cobro de verdad sin gastar un
-- millon de pesos en comprobarlo.
INSERT INTO plans (id, name, summary, amount_cop, monthly_cop, period_months, max_teachers, max_students, sort_order)
VALUES
    ('mensual', 'Mensual',
     'Un mes de acceso completo para un docente. Sin permanencia.',
     10000, 10000, 1, 1, NULL, 10)
ON CONFLICT (id) DO NOTHING;
