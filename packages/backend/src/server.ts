import Fastify from 'fastify';
import cors from '@fastify/cors';
import { questionRoutes } from './routes/questions.js';
import { sessionRoutes } from './routes/sessions.js';
import { speechRoutes } from './routes/speech.js';
import { wsRoutes } from './routes/ws.js';
import { loadBackendEnv } from './lib/env.js';

loadBackendEnv();

const PORT = parseInt(globalThis.process.env.PORT ?? '3001', 10);
const HOST = globalThis.process.env.HOST ?? '0.0.0.0';

async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: globalThis.process.env.FRONTEND_URL ?? 'http://localhost:3000',
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API routes
  await app.register(questionRoutes, { prefix: '/api/questions' });
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(speechRoutes, { prefix: '/api/speech' });

  // WebSocket (registers its own /api/ws path)
  await app.register(wsRoutes);

  return app;
}

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    globalThis.process.exit(1);
  }
}

if (globalThis.process.env.NODE_ENV !== 'test') {
  start();
}

export { buildApp };