import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock OpenAI SDK (used by stt, tts, llm at module scope)
vi.mock('openai', () => ({
  AzureOpenAI: class {
    audio = { transcriptions: { create: vi.fn() }, speech: { create: vi.fn() } };
    chat = { completions: { create: vi.fn() } };
  },
}));

// Mock Prisma client
vi.mock('../lib/prisma.js', () => ({
  prisma: {},
}));

// Mock websocket plugin
vi.mock('@fastify/websocket', () => ({
  default: async () => {},
}));

import { buildApp } from '../server.js';
import type { FastifyInstance } from 'fastify';

describe('Server /health endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('returns status ok with a timestamp', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO string
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
