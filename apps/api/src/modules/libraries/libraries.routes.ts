import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  addStudentsSchema,
  addTeacherSchema,
  classViewQuerySchema,
  createLibrarySchema,
  distributeSchema,
  joinLibrarySchema,
  libraryIdSchema,
  studentSearchSchema,
  updateLibrarySchema,
} from './libraries.schemas.js';
import * as service from './libraries.service.js';
import { distribute } from './distribute.service.js';

export const librariesRouter = Router();

librariesRouter.use(requireAuth);

librariesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ libraries: await service.listLibrariesForUser(req.auth!.userId) });
  }),
);

librariesRouter.post(
  '/',
  requireRole('teacher', 'admin'),
  validate(createLibrarySchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ library: await service.createLibrary(req.auth!.userId, req.body) });
  }),
);

librariesRouter.post(
  '/join',
  validate(joinLibrarySchema),
  asyncHandler(async (req, res) => {
    const library = await service.joinByCode(req.body.codeInvite, req.auth!.userId, req.auth!.role);
    res.json({ library });
  }),
);

librariesRouter.get(
  '/:id',
  validate(libraryIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ library: await service.getLibrary(req.params.id, req.auth!.userId) });
  }),
);

librariesRouter.patch(
  '/:id',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema, 'params'),
  validate(updateLibrarySchema),
  asyncHandler(async (req, res) => {
    res.json({ library: await service.updateLibrary(req.params.id, req.auth!.userId, req.body) });
  }),
);

librariesRouter.delete(
  '/:id',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.deleteLibrary(req.params.id, req.auth!.userId);
    res.status(204).end();
  }),
);

librariesRouter.get(
  '/:id/members',
  validate(libraryIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await service.getMembers(req.params.id, req.auth!.userId));
  }),
);

librariesRouter.get(
  '/:id/class-view',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema, 'params'),
  validate(classViewQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    res.json(await service.getClassView(req.params.id, req.auth!.userId, req.query as never));
  }),
);

librariesRouter.post(
  '/:id/teachers',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema, 'params'),
  validate(addTeacherSchema),
  asyncHandler(async (req, res) => {
    await service.addCoTeacher(req.params.id, req.auth!.userId, req.body.email);
    res.status(204).end();
  }),
);

/** Busca alumnado de cualquier curso para sumarlo a esta biblioteca. */
librariesRouter.get(
  '/:id/students/search',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema, 'params'),
  validate(studentSearchSchema, 'query'),
  asyncHandler(async (req, res) => {
    const students = await service.searchStudents(req.params.id, req.auth!.userId, req.query as never);
    res.json({ students });
  }),
);

librariesRouter.post(
  '/:id/students',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema, 'params'),
  validate(addStudentsSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.addStudents(req.params.id, req.auth!.userId, req.body.studentIds));
  }),
);

librariesRouter.delete(
  '/:id/students/:studentId',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema.extend({ studentId: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    await service.removeStudent(req.params.id, req.auth!.userId, req.params.studentId);
    res.status(204).end();
  }),
);

/** Entrega una pagina o un libro entero a cada alumno, como copia propia. */
librariesRouter.post(
  '/:id/distribute',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema, 'params'),
  validate(distributeSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await distribute(req.params.id, req.auth!.userId, req.body));
  }),
);

librariesRouter.delete(
  '/:id/teachers/:teacherId',
  requireRole('teacher', 'admin'),
  validate(libraryIdSchema.extend({ teacherId: z.string().uuid() }), 'params'),
  asyncHandler(async (req, res) => {
    await service.removeCoTeacher(req.params.id, req.auth!.userId, req.params.teacherId);
    res.status(204).end();
  }),
);
