import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createElementSchema, reorderLayersSchema, updateElementSchema } from '../canvas/canvas.schemas.js';
import {
  answerSchema,
  changeFormatSchema,
  pastePagesSchema,
  bookIdSchema,
  createBookSchema,
  createPageSchema,
  elementParamsSchema,
  gradeParamsSchema,
  gradeSchema,
  listBooksQuerySchema,
  pageParamsSchema,
  questionParamsSchema,
  reorderPagesSchema,
  shareSchema,
  transferBookSchema,
  updateBookSchema,
  updatePageSchema,
} from './books.schemas.js';
import * as service from './books.service.js';
import * as mural from './mural.service.js';
import * as grades from './grades.service.js';
import * as activity from './activity.service.js';
import * as adminBooks from './admin-books.service.js';

export const booksRouter = Router();

booksRouter.use(requireAuth);

/* -------------------------------------------------------------------------
 * Administracion: todos los libros y borrado masivo.
 *
 * Van antes de '/:id' porque, si no, "admin" se tomaria por el id de un libro.
 * ---------------------------------------------------------------------- */
const librosAdminQuerySchema = z.object({
  search: z.string().max(120).trim().optional(),
  scope: z.enum(['all', 'personal', 'library', 'trial']).default('all'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

booksRouter.get(
  '/admin/all',
  requireRole('admin'),
  validate(librosAdminQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await adminBooks.listarLibros(req.query as never));
  }),
);

booksRouter.post(
  '/admin/bulk-delete',
  requireRole('admin'),
  validate(z.object({ bookIds: z.array(z.string().uuid()).min(1, 'Elige al menos un libro').max(500) })),
  asyncHandler(async (req, res) => {
    res.json(await adminBooks.borrarLibros(req.body.bookIds));
  }),
);

booksRouter.get(
  '/',
  validate(listBooksQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json({ books: await service.listBooks(req.auth!.userId, req.query as never) });
  }),
);

booksRouter.post(
  '/',
  validate(createBookSchema),
  asyncHandler(async (req, res) => {
    const book = await service.createBook(req.auth!.userId, req.auth!.role, req.body);
    res.status(201).json({ book });
  }),
);

booksRouter.get(
  '/:id',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ book: await service.getBookDetail(req.params.id, req.auth!.userId) });
  }),
);

booksRouter.patch(
  '/:id',
  validate(bookIdSchema, 'params'),
  validate(updateBookSchema),
  asyncHandler(async (req, res) => {
    res.json({ book: await service.updateBook(req.params.id, req.auth!.userId, req.body) });
  }),
);

booksRouter.put(
  '/:id/share',
  validate(bookIdSchema, 'params'),
  validate(shareSchema),
  asyncHandler(async (req, res) => {
    res.json({ share: await service.setSharing(req.params.id, req.auth!.userId, req.body.visibility) });
  }),
);

booksRouter.put(
  '/:id/collaborative',
  validate(bookIdSchema, 'params'),
  validate(z.object({ collaborative: z.boolean() })),
  asyncHandler(async (req, res) => {
    const book = await service.setCollaborative(req.params.id, req.auth!.userId, req.body.collaborative);
    res.json({ book });
  }),
);

/*
 * El mural. Publicar aqui es una decision aparte de compartir por enlace: un
 * enlace lo tiene solo quien lo recibe, y el mural lo ve cualquiera que entre.
 */
booksRouter.get(
  '/:id/mural',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ mural: await mural.estadoMural(req.params.id, req.auth!.userId) });
  }),
);

booksRouter.post(
  '/:id/mural',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ mural: await mural.publicarEnMural(req.params.id, req.auth!.userId) });
  }),
);

booksRouter.delete(
  '/:id/mural',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ mural: await mural.retirarDelMural(req.params.id, req.auth!.userId) });
  }),
);

booksRouter.post(
  '/:id/share/rotate',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ share: await service.rotateShareToken(req.params.id, req.auth!.userId) });
  }),
);

/** Corrige la respuesta en el servidor: el cliente nunca recibio la solucion. */
booksRouter.post(
  '/:id/questions/:elementId/answer',
  validate(questionParamsSchema, 'params'),
  validate(answerSchema),
  asyncHandler(async (req, res) => {
    const result = await service.answerQuestion(
      req.params.id,
      req.params.elementId,
      req.auth!.userId,
      req.body.answer,
    );
    res.json({ result });
  }),
);

/**
 * Valoraciones. El alumno puede leer las de sus libros; ponerlas, cambiarlas o
 * borrarlas es cosa del profesorado, y se comprueba en el servicio.
 */
booksRouter.get(
  '/:id/grades',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ grades: await grades.listGrades(req.params.id, req.auth!.userId) });
  }),
);

booksRouter.post(
  '/:id/grades',
  validate(bookIdSchema, 'params'),
  validate(gradeSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ grade: await grades.createGrade(req.params.id, req.auth!.userId, req.body) });
  }),
);

booksRouter.patch(
  '/:id/grades/:gradeId',
  validate(gradeParamsSchema, 'params'),
  validate(gradeSchema),
  asyncHandler(async (req, res) => {
    const grade = await grades.updateGrade(req.params.id, req.params.gradeId, req.auth!.userId, req.body);
    res.json({ grade });
  }),
);

booksRouter.delete(
  '/:id/grades/:gradeId',
  validate(gradeParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await grades.deleteGrade(req.params.id, req.params.gradeId, req.auth!.userId);
    res.status(204).end();
  }),
);

/**
 * Bitacora. El aviso lo manda el editor cada minuto; la lectura la hace el docente
 * (o el alumno sobre sus propios libros).
 */
booksRouter.post(
  '/:id/activity',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await activity.touch(req.params.id, req.auth!.userId));
  }),
);

booksRouter.get(
  '/:id/activity',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await activity.listActivity(req.params.id, req.auth!.userId));
  }),
);

booksRouter.delete(
  '/:id',
  validate(bookIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.deleteBook(req.params.id, req.auth!.userId);
    res.status(204).end();
  }),
);

/**
 * Cambia el formato de un libro ya hecho, recolocando su contenido para que no se
 * deforme. Lo puede hacer cualquiera que pueda editar el libro.
 */
booksRouter.put(
  '/:id/format',
  validate(bookIdSchema, 'params'),
  validate(changeFormatSchema),
  asyncHandler(async (req, res) => {
    res.json({ book: await service.changeFormat(req.params.id, req.auth!.userId, req.body.layoutFormat) });
  }),
);

/** Pasa un libro de "Mis libros" a una o varias bibliotecas, moviendolo o copiandolo. */
booksRouter.post(
  '/:id/transfer',
  validate(bookIdSchema, 'params'),
  validate(transferBookSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.transferBook(req.params.id, req.auth!.userId, req.body));
  }),
);

/** Pega paginas copiadas de otro libro, detras de la pagina indicada o al final. */
booksRouter.post(
  '/:id/pages/paste',
  validate(bookIdSchema, 'params'),
  validate(pastePagesSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.pastePages(req.params.id, req.auth!.userId, req.body));
  }),
);

booksRouter.post(
  '/:id/pages',
  validate(bookIdSchema, 'params'),
  validate(createPageSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ page: await service.addPage(req.params.id, req.auth!.userId, req.body) });
  }),
);

booksRouter.patch(
  '/:id/pages/reorder',
  validate(bookIdSchema, 'params'),
  validate(reorderPagesSchema),
  asyncHandler(async (req, res) => {
    await service.reorderPages(req.params.id, req.auth!.userId, req.body.pageIds);
    res.json({ book: await service.getBookDetail(req.params.id, req.auth!.userId) });
  }),
);

booksRouter.patch(
  '/:id/pages/:pageId',
  validate(pageParamsSchema, 'params'),
  validate(updatePageSchema),
  asyncHandler(async (req, res) => {
    const page = await service.updatePage(req.params.id, req.params.pageId, req.auth!.userId, req.body);
    res.json({ page });
  }),
);

booksRouter.post(
  '/:id/pages/:pageId/duplicate',
  validate(pageParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    const page = await service.duplicatePage(req.params.id, req.params.pageId, req.auth!.userId);
    res.status(201).json({ page });
  }),
);

booksRouter.delete(
  '/:id/pages/:pageId',
  validate(pageParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.deletePage(req.params.id, req.params.pageId, req.auth!.userId);
    res.status(204).end();
  }),
);

booksRouter.post(
  '/:id/pages/:pageId/elements',
  validate(pageParamsSchema, 'params'),
  validate(createElementSchema),
  asyncHandler(async (req, res) => {
    const element = await service.createElement(req.params.id, req.params.pageId, req.auth!.userId, req.body);
    res.status(201).json({ element });
  }),
);

booksRouter.patch(
  '/:id/pages/:pageId/elements/reorder',
  validate(pageParamsSchema, 'params'),
  validate(reorderLayersSchema),
  asyncHandler(async (req, res) => {
    const elements = await service.reorderLayers(
      req.params.id,
      req.params.pageId,
      req.auth!.userId,
      req.body.elementIds,
    );
    res.json({ elements });
  }),
);

booksRouter.patch(
  '/:id/pages/:pageId/elements/:elementId',
  validate(elementParamsSchema, 'params'),
  validate(updateElementSchema),
  asyncHandler(async (req, res) => {
    const element = await service.updateElement(
      req.params.id,
      req.params.pageId,
      req.params.elementId,
      req.auth!.userId,
      req.body,
    );
    res.json({ element });
  }),
);

booksRouter.delete(
  '/:id/pages/:pageId/elements/:elementId',
  validate(elementParamsSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.deleteElement(req.params.id, req.params.pageId, req.params.elementId, req.auth!.userId);
    res.status(204).end();
  }),
);
