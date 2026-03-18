import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {},
}));

vi.mock('../../services/llm.js', () => ({
  generateFeedback: vi.fn(),
}));

vi.mock('../../services/tts.js', () => ({
  synthesizeSpeech: vi.fn(),
}));

import type { WsConnectionState } from '../ws.js';
import { handleWsIncomingMessage, hydrateWsConnection } from '../ws.js';

const prismaMock = {
  interviewSession: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  sessionMessage: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
};

const logger = {
  error: vi.fn(),
  debug: vi.fn(),
};

const question = {
  title: 'Two Sum',
  description: 'Find indices that add up to the target.',
  starterCodes: [{ language: 'typescript', code: 'function twoSum() {}' }],
};

function createState(overrides: Partial<WsConnectionState> = {}): WsConnectionState {
  return {
    boundSessionId: 'session-1',
    currentCode: 'const answer = 1;',
    conversationHistory: [],
    ...overrides,
  };
}

describe('websocket session helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    prismaMock.interviewSession.findUnique.mockReset();
    prismaMock.interviewSession.update.mockReset();
    prismaMock.sessionMessage.create.mockReset();
    prismaMock.$transaction.mockReset();
    logger.error.mockReset();
    logger.debug.mockReset();
  });

  it('hydrates persisted code and conversation history for reconnects', async () => {
    prismaMock.interviewSession.findUnique.mockResolvedValue({
      id: 'session-1',
      questionId: 'question-1',
      code: 'persisted();',
      messages: [
        { role: 'user', content: 'I will start with a map.' },
        { role: 'assistant', content: 'Explain the trade-off.' },
      ],
    });

    const result = await hydrateWsConnection({
      questionId: 'question-1',
      sessionId: 'session-1',
      question,
      dependencies: { prismaClient: prismaMock },
    });

    expect(result).toEqual({
      ok: true,
      state: {
        boundSessionId: 'session-1',
        currentCode: 'persisted();',
        conversationHistory: [
          { role: 'user', content: 'I will start with a map.' },
          { role: 'assistant', content: 'Explain the trade-off.' },
        ],
      },
    });
  });

  it('rejects a session that belongs to another question', async () => {
    prismaMock.interviewSession.findUnique.mockResolvedValue({
      id: 'session-1',
      questionId: 'question-2',
      code: 'persisted();',
      messages: [],
    });

    const result = await hydrateWsConnection({
      questionId: 'question-1',
      sessionId: 'session-1',
      question,
      dependencies: { prismaClient: prismaMock },
    });

    expect(result).toEqual({
      ok: false,
      error: 'Session does not belong to the provided question',
    });
  });

  it('persists finalized transcripts and echoes them back to the client', async () => {
    const updateOperation = Symbol('update');
    const createOperation = Symbol('create');
    prismaMock.interviewSession.update.mockReturnValue(updateOperation);
    prismaMock.sessionMessage.create.mockReturnValue(createOperation);
    prismaMock.$transaction.mockResolvedValue([]);
    const sendMessage = vi.fn();
    const state = createState();

    await handleWsIncomingMessage({
      questionId: 'question-1',
      question,
      state,
      msg: {
        type: 'transcript_final',
        text: '  I am using a hashmap.  ',
        code: 'const seen = new Map();',
        sessionId: 'session-1',
        timing: { offsetMs: 10, durationMs: 25 },
      },
      dependencies: {
        prismaClient: prismaMock,
        logger,
        sendMessage,
      },
    });

    expect(prismaMock.interviewSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { code: 'const seen = new Map();' },
    });
    expect(prismaMock.sessionMessage.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        role: 'user',
        content: 'I am using a hashmap.',
        messageType: 'speech',
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith([updateOperation, createOperation]);
    expect(state.currentCode).toBe('const seen = new Map();');
    expect(state.conversationHistory).toContainEqual({
      role: 'user',
      content: 'I am using a hashmap.',
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'transcript',
      text: 'I am using a hashmap.',
      sessionId: 'session-1',
      timing: { offsetMs: 10, durationMs: 25 },
    });
  });

  it('persists generated feedback for the bound session', async () => {
    const feedbackGenerator = vi.fn().mockResolvedValue({
      content: 'Consider how duplicate values should be handled.',
      type: 'follow-up',
    });
    prismaMock.sessionMessage.create.mockResolvedValue({ id: 'message-1' });
    const sendMessage = vi.fn();
    const state = createState({
      currentCode: 'const seen = new Map();',
      conversationHistory: [{ role: 'user', content: 'I am using a hashmap.' }],
    });

    await handleWsIncomingMessage({
      questionId: 'question-1',
      question,
      state,
      msg: { type: 'request_feedback', includeTts: false, sessionId: 'session-1' },
      dependencies: {
        prismaClient: prismaMock,
        feedbackGenerator,
        logger,
        sendMessage,
      },
    });

    expect(feedbackGenerator).toHaveBeenCalledWith({
      questionTitle: 'Two Sum',
      questionDescription: 'Find indices that add up to the target.',
      currentCode: 'const seen = new Map();',
      recentTranscript: 'I am using a hashmap.',
      conversationHistory: [{ role: 'user', content: 'I am using a hashmap.' }],
    });
    expect(prismaMock.sessionMessage.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Consider how duplicate values should be handled.',
        messageType: 'feedback',
      },
    });
    expect(state.conversationHistory).toContainEqual({
      role: 'assistant',
      content: 'Consider how duplicate values should be handled.',
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'feedback',
      content: 'Consider how duplicate values should be handled.',
      feedbackType: 'follow-up',
      sessionId: 'session-1',
    });
  });

  it('rejects finalized transcripts when the client session does not match the bound session', async () => {
    const sendMessage = vi.fn();
    const state = createState();

    await handleWsIncomingMessage({
      questionId: 'question-1',
      question,
      state,
      msg: {
        type: 'transcript_final',
        text: 'I am using a hashmap.',
        sessionId: 'session-2',
      },
      dependencies: {
        prismaClient: prismaMock,
        logger,
        sendMessage,
      },
    });

    expect(prismaMock.interviewSession.update).not.toHaveBeenCalled();
    expect(prismaMock.sessionMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(state.conversationHistory).toEqual([]);
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'sessionId mismatch for transcript_final',
    });
  });
});
