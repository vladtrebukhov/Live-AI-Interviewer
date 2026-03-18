import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    question: {
      findUnique: vi.fn(),
    },
    interviewSession: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('openai', () => ({
  AzureOpenAI: class {
    audio = { transcriptions: { create: vi.fn() }, speech: { create: vi.fn() } };
    chat = { completions: { create: vi.fn() } };
  },
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: prismaMock,
}));

vi.mock('@fastify/websocket', () => ({
  default: async () => {},
}));

import { buildApp } from '../../server.js';

describe('Speech token route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    prismaMock.question.findUnique.mockReset();
    prismaMock.interviewSession.findUnique.mockReset();
    globalThis.process.env.FRONTEND_URL = 'http://localhost:3000';
    globalThis.process.env.AZURE_SPEECH_KEY = 'test-speech-key';
    globalThis.process.env.AZURE_SPEECH_REGION = 'eastus';
    delete globalThis.process.env.AZURE_SPEECH_ENDPOINT;
  });

  it('rejects requests from unexpected origins', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/speech/token',
      headers: {
        origin: 'http://malicious.example',
      },
      payload: { questionId: 'question-1' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: 'Speech token requests must originate from the configured frontend',
    });
  });

  it('issues a token for a valid question scope', async () => {
    prismaMock.question.findUnique.mockResolvedValue({ id: 'question-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('speech-token'),
      }),
    );

    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/speech/token',
      headers: {
        origin: 'http://localhost:3000',
      },
      payload: { questionId: 'question-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      token: 'speech-token',
      region: 'eastus',
      endpoint: undefined,
      expiresInSeconds: 600,
    });
  });

  it('does not expose regional Cognitive endpoint for browser recognition mode', async () => {
    globalThis.process.env.AZURE_SPEECH_ENDPOINT = 'https://eastus2.api.cognitive.microsoft.com';
    prismaMock.question.findUnique.mockResolvedValue({ id: 'question-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('speech-token'),
      }),
    );

    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/speech/token',
      headers: {
        origin: 'http://localhost:3000',
      },
      payload: { questionId: 'question-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      token: 'speech-token',
      region: 'eastus',
      endpoint: undefined,
      expiresInSeconds: 600,
    });
  });
});
