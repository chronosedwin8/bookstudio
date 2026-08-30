-- Compartir un libro por enlace: publico o restringido a su biblioteca.
ALTER TABLE books ADD COLUMN IF NOT EXISTS share_token UUID UNIQUE;

ALTER TABLE books ADD COLUMN IF NOT EXISTS share_visibility VARCHAR(20) NOT NULL DEFAULT 'private';

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_share_visibility_check;
ALTER TABLE books ADD CONSTRAINT books_share_visibility_check
    CHECK (share_visibility IN ('private', 'library', 'public'));

-- El enlace se resuelve por token en cada visita anonima.
CREATE INDEX IF NOT EXISTS idx_books_share_token ON books (share_token)
    WHERE share_token IS NOT NULL;
