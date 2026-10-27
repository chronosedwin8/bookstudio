-- Ajustes de toda la plataforma, que decide la administracion y valen para
-- todo el mundo. Una fila por ajuste; el valor, en JSON.
--
-- El primero es la barra de herramientas del editor (clave 'toolbar'): en que
-- categoria va cada herramienta y en que orden. Sin fila, el editor usa la de
-- fabrica.
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(60) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);
