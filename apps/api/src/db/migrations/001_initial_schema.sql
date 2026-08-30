-- BookStudio :: esquema inicial
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuarios (auth local y SSO)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('teacher', 'student', 'admin')),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bibliotecas (clase o asignatura)
CREATE TABLE IF NOT EXISTS libraries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code_invite VARCHAR(10) UNIQUE NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    student_book_limit INT DEFAULT 40,
    student_editable BOOLEAN DEFAULT TRUE,
    student_publishable BOOLEAN DEFAULT FALSE,
    comments_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Co-docentes
CREATE TABLE IF NOT EXISTS library_teachers (
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (library_id, teacher_id)
);

-- Estudiantes inscritos
CREATE TABLE IF NOT EXISTS library_students (
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (library_id, student_id)
);

-- Portafolios interanuales
CREATE TABLE IF NOT EXISTS student_portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    name VARCHAR(150) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Libros (maquetacion fija)
CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) DEFAULT 'Libro sin titulo',
    library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
    portfolio_id UUID REFERENCES student_portfolios(id) ON DELETE SET NULL,
    creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    layout_format VARCHAR(20) DEFAULT 'square' CHECK (layout_format IN ('portrait', 'square', 'landscape')),
    is_template BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT FALSE,
    publishing_settings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Paginas
CREATE TABLE IF NOT EXISTS pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    background_color VARCHAR(30) DEFAULT '#FFFFFF',
    background_pattern TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (book_id, page_number)
);

-- Elementos del lienzo
CREATE TABLE IF NOT EXISTS canvas_elements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('text', 'shape', 'drawing', 'image', 'audio', 'video')),
    z_index INT NOT NULL,
    transform_matrix JSONB NOT NULL,
    properties JSONB NOT NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    opacity NUMERIC(3,2) DEFAULT 1.0 CHECK (opacity >= 0.0 AND opacity <= 1.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comentarios y feedback
CREATE TABLE IF NOT EXISTS page_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'audio', 'video', 'sticker')),
    content TEXT,
    x_position INT DEFAULT 0,
    y_position INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices de consulta frecuente
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_libraries_owner ON libraries(owner_id);
CREATE INDEX IF NOT EXISTS idx_library_teachers_teacher ON library_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_library_students_student ON library_students(student_id);
CREATE INDEX IF NOT EXISTS idx_books_library ON books(library_id);
CREATE INDEX IF NOT EXISTS idx_books_creator ON books(creator_id);
CREATE INDEX IF NOT EXISTS idx_books_portfolio ON books(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_books_library_created ON books(library_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pages_book ON pages(book_id, page_number);
CREATE INDEX IF NOT EXISTS idx_canvas_elements_page ON canvas_elements(page_id, z_index);
CREATE INDEX IF NOT EXISTS idx_page_comments_page ON page_comments(page_id, created_at DESC);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_books_updated_at ON books;
CREATE TRIGGER trg_books_updated_at BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_canvas_elements_updated_at ON canvas_elements;
CREATE TRIGGER trg_canvas_elements_updated_at BEFORE UPDATE ON canvas_elements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
