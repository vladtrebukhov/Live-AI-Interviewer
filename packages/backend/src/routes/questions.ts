import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function questionRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/questions - List all questions with visible test cases
  app.get('/', async (_request, reply) => {
    const questions = await prisma.question.findMany({
      include: {
        testCases: {
          where: { isHidden: false },
        },
        starterCodes: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(questions);
  });

  // GET /api/questions/:id - Get single question with visible test cases
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const question = await prisma.question.findUnique({
      where: { id },
      include: {
        testCases: {
          where: { isHidden: false },
        },
        starterCodes: true,
      },
    });
    if (!question) {
      return reply.code(404).send({ error: 'Question not found' });
    }
    return reply.send(question);
  });
}
