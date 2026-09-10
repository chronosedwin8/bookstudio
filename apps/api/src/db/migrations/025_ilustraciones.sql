-- Ilustraciones educativas: un tipo de elemento mas, y su almacen para reutilizarlas.

-- 1. El lienzo admite el tipo nuevo.
--
-- Se anade a la lista cerrada, como los anteriores: es lo que impide que una
-- fila con un tipo inventado llegue a la base y reviente al leerla.
ALTER TABLE canvas_elements DROP CONSTRAINT IF EXISTS canvas_elements_type_check;
ALTER TABLE canvas_elements ADD CONSTRAINT canvas_elements_type_check
  CHECK (type IN ('text', 'shape', 'drawing', 'image', 'audio', 'video',
                  'map', 'icon', 'embed', 'question', 'chart', 'math', 'button',
                  'illustration'));

-- 2. Las ilustraciones guardadas.
--
-- Aqui NO se guarda ningun SVG. Se guarda la escena, que son cuatro datos, y el
-- dibujo se vuelve a componer cada vez: es deterministico, ocupa mucho menos y
-- hace que las ilustraciones ya insertadas mejoren solas cuando mejore el dibujo.
CREATE TABLE IF NOT EXISTS illustrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Quien la creo. Si se borra la cuenta, la ilustracion sigue viva dentro de
    -- los libros donde se uso: el elemento del lienzo lleva su propia copia de
    -- la escena y no depende de esta fila para dibujarse.
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Lo que se escribio, ya normalizado, y su huella. La huella es lo que evita
    -- volver a preguntarle a la IA por algo que ya se pregunto.
    prompt TEXT NOT NULL DEFAULT '',
    huella VARCHAR(64) NOT NULL,

    escena JSONB NOT NULL,

    -- Con que se hizo. Sirve para saber que hay que rehacer cuando cambie el
    -- catalogo, sin tener que adivinarlo mirando el contenido.
    version_escena SMALLINT NOT NULL DEFAULT 1,
    version_catalogo SMALLINT NOT NULL DEFAULT 1,
    -- 'mock' o el modelo que la compuso, para saber que salio de donde.
    origen VARCHAR(60) NOT NULL DEFAULT 'mock',

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- La cache: misma peticion y mismas versiones, misma escena. Va por persona
-- porque dos docentes que piden lo mismo esperan cada uno lo suyo, y porque asi
-- nadie ve el texto que escribio otro.
CREATE UNIQUE INDEX IF NOT EXISTS illustrations_cache_idx
    ON illustrations (created_by, huella, version_escena, version_catalogo);

CREATE INDEX IF NOT EXISTS illustrations_created_by_idx
    ON illustrations (created_by, created_at DESC);
