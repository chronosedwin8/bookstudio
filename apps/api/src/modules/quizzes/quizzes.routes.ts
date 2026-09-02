import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  answerParamsSchema,
  assignSchema,
  createQuizSchema,
  listQuizzesSchema,
  quizIdSchema,
  replaceQuestionsSchema,
  reviewSchema,
  submitSchema,
  updateQuizSchema,
} from './quizzes.schemas.js';
import * as service from './quizzes.service.js';

export const quizzesRouter = Router();

quizzesRouter.use(requireAuth);

quizzesRouter.get(
  '/',
  validate(listQuizzesSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { libraryId } = req.query as { libraryId?: string };
    res.json({ quizzes: await service.listQuizzes(req.auth!.userId, libraryId) });
  }),
);

quizzesRouter.post(
  '/',
  validate(createQuizSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ quiz: await service.createQuiz(req.auth!.userId, req.body) });
  }),
);

quizzesRouter.get(
  '/:id',
  validate(quizIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json({ quiz: await service.getQuiz(req.params.id, req.auth!.userId) });
  }),
);

quizzesRouter.patch(
  '/:id',
  validate(quizIdSchema, 'params'),
  validate(updateQuizSchema),
  asyncHandler(async (req, res) => {
    res.json({ quiz: await service.updateQuiz(req.params.id, req.auth!.userId, req.body) });
  }),
);

quizzesRouter.delete(
  '/:id',
  validate(quizIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    await service.deleteQuiz(req.params.id, req.auth!.userId);
    res.status(204).send();
  }),
);

quizzesRouter.put(
  '/:id/questions',
  validate(quizIdSchema, 'params'),
  validate(replaceQuestionsSchema),
  asyncHandler(async (req, res) => {
    res.json({ questions: await service.replaceQuestions(req.params.id, req.auth!.userId, req.body.questions) });
  }),
);

quizzesRouter.post(
  '/:id/assign',
  validate(quizIdSchema, 'params'),
  validate(assignSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.assign(req.params.id, req.auth!.userId, req.body.studentIds));
  }),
);

quizzesRouter.post(
  '/:id/answers',
  validate(quizIdSchema, 'params'),
  validate(submitSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.submitAnswers(req.params.id, req.auth!.userId, req.body));
  }),
);

quizzesRouter.get(
  '/:id/results',
  validate(quizIdSchema, 'params'),
  asyncHandler(async (req, res) => {
    res.json(await service.getResults(req.params.id, req.auth!.userId));
  }),
);

/** Puntuar a mano una respuesta: es como se cierran las preguntas abiertas. */
quizzesRouter.patch(
  '/:id/answers/:questionId/:studentId',
  validate(answerParamsSchema, 'params'),
  validate(reviewSchema),
  asyncHandler(async (req, res) => {
    const { id, questionId, studentId } = req.params;
    res.json({ answer: await service.reviewAnswer(id, questionId, studentId, req.auth!.userId, req.body) });
  }),
);
