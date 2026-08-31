import { closePool, query } from './pool.js';
import { createLibrary } from '../modules/libraries/libraries.service.js';
import { createStudentWithQr, register } from '../modules/auth/auth.service.js';

const DEMO_TEACHER = { email: 'profe@bookstudio.local', password: 'BookStudio123', fullName: 'Ana Docente' };
const DEMO_STUDENTS = ['Lucia Perez', 'Mateo Gomez', 'Sofia Ramirez'];

async function run(): Promise<void> {
  const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [DEMO_TEACHER.email]);
  if (existing.rowCount) {
    console.log('[seed] Los datos de demo ya existen. Nada que hacer.');
    return;
  }

  const { user: teacher } = await register({ ...DEMO_TEACHER, role: 'teacher' });
  const library = await createLibrary(teacher.id, {
    name: 'Lengua 4B',
    studentBookLimit: 40,
    studentsSeePeers: true,
    studentEditable: true,
    studentPublishable: false,
    commentsEnabled: true,
  });

  for (const fullName of DEMO_STUDENTS) {
    const { user } = await createStudentWithQr(teacher.id, { fullName, libraryId: library.id });
    const book = await query<{ id: string }>(
      `INSERT INTO books (title, library_id, creator_id, layout_format)
       VALUES ($1, $2, $3, 'square') RETURNING id`,
      [`Mi libro de ${fullName.split(' ')[0]}`, library.id, user.id],
    );
    await query('INSERT INTO pages (book_id, page_number) VALUES ($1, 1), ($1, 2)', [book.rows[0].id]);
  }

  console.log('[seed] Listo.');
  console.log(`  Docente: ${DEMO_TEACHER.email} / ${DEMO_TEACHER.password}`);
  console.log(`  Biblioteca "Lengua 4B" -> codigo ${library.codeInvite}`);
}

run()
  .catch((error: unknown) => {
    console.error('[seed] error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
