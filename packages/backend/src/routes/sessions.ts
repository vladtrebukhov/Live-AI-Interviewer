import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/sessions - Create a new interview session
  app.post<{ Body: { questionId: string } }>('/', async (request, reply) => {
    const { questionId } = request.body;

    if (!questionId || typeof questionId !== 'string') {
      return reply.code(400).send({ error: 'questionId is required' });
    }

    // Validate question exists
    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return reply.code(404).send({ error: 'Question not found' });
    }

    const questionWithCode = await prisma.question.findUnique({
      where: { id: questionId },
      include: { starterCodes: true },
    });
    const defaultCode = questionWithCode?.starterCodes.find(sc => sc.language === 'typescript')?.code ?? '';

    const session = await prisma.interviewSession.create({
      data: {
        questionId,
        code: defaultCode,
      },
      include: { question: true },
    });

    return reply.code(201).send(session);
  });

  // GET /api/sessions - List sessions
  app.get<{ Querystring: { status?: string } }>('/', async (request, reply) => {
    const { status } = request.query;

    const where: { status?: 'active' | 'completed' | 'abandoned' } = {};
    if (status === 'active' || status === 'completed' || status === 'abandoned') {
      where.status = status;
    }

    const sessions = await prisma.interviewSession.findMany({
      where,
      include: { question: true },
      orderBy: { startedAt: 'desc' },
    });

    return reply.send(sessions);
  });

  // GET /api/sessions/:id - Get session by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    const session = await prisma.interviewSession.findUnique({
      where: { id },
      include: { question: true, messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    return reply.send(session);
  });

  // PATCH /api/sessions/:id - Update session
  app.patch<{
    Params: { id: string };
    Body: { code?: string; status?: 'completed' | 'abandoned' };
  }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const { code, status } = request.body;

    const session = await prisma.interviewSession.findUnique({ where: { id } });
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const data: { code?: string; status?: 'completed' | 'abandoned'; endedAt?: Date } = {};
    if (typeof code === 'string') {
      if (code.length > 100_000) {
        return reply.code(400).send({ error: 'Code exceeds maximum allowed size' });
      }
      data.code = code;
    }
    if (status === 'completed' || status === 'abandoned') {
      data.status = status;
      data.endedAt = new Date();
    }

    const updated = await prisma.interviewSession.update({
      where: { id },
      data,
      include: { question: true },
    });

    return reply.send(updated);
  });
}

