import type { FastifyInstance } from 'fastify';
import websocket, { type WebSocket } from '@fastify/websocket';
import type { RawData } from 'ws';
import type { WsIncoming, WsOutgoing } from '@live-interviewer/shared';
import { prisma } from '../lib/prisma.js';
import { synthesizeSpeech } from '../services/tts.js';
import { generateFeedback } from '../services/llm.js';

const MAX_CODE_SIZE = 100_000;

type ConversationMessage = { role: 'user' | 'assistant' | 'system'; content: string };

interface StarterCodeLike {
  language: string;
  code: string;
}

interface QuestionLike {
  title: string;
  description: string;
  starterCodes: StarterCodeLike[];
}

interface SessionMessageLike {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface InterviewSessionLike {
  id: string;
  questionId: string;
  code: string;
  messages: SessionMessageLike[];
}

export interface WsConnectionState {
  boundSessionId: string | null;
  currentCode: string;
  conversationHistory: ConversationMessage[];
}

interface InterviewSessionHydrationClient {
  findUnique(args: {
    where: { id: string };
    include: { messages: { orderBy: { createdAt: 'asc' } } };
  }): Promise<InterviewSessionLike | null>;
}

interface WsHydrationPrismaClient {
  interviewSession: InterviewSessionHydrationClient;
}

interface InterviewSessionMutationClient {
  update(args: { where: { id: string }; data: { code: string } }): Promise<unknown> | unknown;
}

interface SessionMessageMutationClient {
  create(args: {
    data: {
      sessionId: string;
      role: 'user' | 'assistant';
      content: string;
      messageType: 'speech' | 'feedback';
    };
  }): Promise<unknown> | unknown;
}

interface WsMessagePrismaClient {
  interviewSession: InterviewSessionMutationClient;
  sessionMessage: SessionMessageMutationClient;
  $transaction(operations: Array<Promise<unknown> | unknown>): Promise<unknown>;
}

interface WsHydrationDependencies {
  prismaClient?: WsHydrationPrismaClient;
}

interface WsHydrationInput {
  questionId: string;
  sessionId?: string | null;
  question: QuestionLike;
  dependencies?: WsHydrationDependencies;
}

type WsHydrationResult = { ok: true; state: WsConnectionState } | { ok: false; error: string };

interface WsMessageHandlerDependencies {
  prismaClient?: WsMessagePrismaClient;
  feedbackGenerator?: typeof generateFeedback;
  speechSynthesizer?: typeof synthesizeSpeech;
  logger?: Pick<FastifyInstance['log'], 'error' | 'debug'>;
  sendMessage?: (msg: WsOutgoing) => void;
}

interface WsMessageHandlerInput {
  questionId: string;
  question: QuestionLike;
  state: WsConnectionState;
  msg: WsIncoming;
  dependencies?: WsMessageHandlerDependencies;
}

function send(socket: WebSocket, msg: WsOutgoing): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export async function hydrateWsConnection({
  questionId,
  sessionId,
  question,
  dependencies,
}: WsHydrationInput): Promise<WsHydrationResult> {
  const prismaClient: WsHydrationPrismaClient = dependencies?.prismaClient ?? prisma;
  let currentCode = question.starterCodes.find((sc) => sc.language === 'typescript')?.code ?? '';
  const conversationHistory: ConversationMessage[] = [];

  if (!sessionId) {
    return {
      ok: true,
      state: {
        boundSessionId: null,
        currentCode,
        conversationHistory,
      },
    };
  }

  const session = (await prismaClient.interviewSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })) as InterviewSessionLike | null;

  if (!session) {
    return { ok: false, error: 'Session not found' };
  }

  if (session.questionId !== questionId) {
    return { ok: false, error: 'Session does not belong to the provided question' };
  }

  currentCode = session.code || currentCode;
  conversationHistory.push(
    ...session.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  );

  return {
    ok: true,
    state: {
      boundSessionId: sessionId,
      currentCode,
      conversationHistory,
    },
  };
}

export async function handleWsIncomingMessage({
  questionId,
  question,
  state,
  msg,
  dependencies,
}: WsMessageHandlerInput): Promise<void> {
  const prismaClient: WsMessagePrismaClient = dependencies?.prismaClient ?? prisma;
  const feedbackGenerator = dependencies?.feedbackGenerator ?? generateFeedback;
  const speechSynthesizer = dependencies?.speechSynthesizer ?? synthesizeSpeech;
  const logger = dependencies?.logger;
  const sendMessage = dependencies?.sendMessage ?? (() => undefined);

  switch (msg.type) {
    case 'code_update': {
      const nextCode = msg.code;

      if (typeof nextCode !== 'string') {
        sendMessage({ type: 'error', message: 'code field required for code_update' });
        return;
      }
      if (nextCode.length > MAX_CODE_SIZE) {
        sendMessage({ type: 'error', message: 'Code exceeds maximum allowed size' });
        return;
      }

      if (msg.sessionId && state.boundSessionId && msg.sessionId !== state.boundSessionId) {
        sendMessage({ type: 'error', message: 'sessionId mismatch for code_update' });
        return;
      }

      state.currentCode = nextCode;

      if (state.boundSessionId) {
        try {
          await prismaClient.interviewSession.update({
            where: { id: state.boundSessionId },
            data: { code: nextCode },
          });
        } catch (err) {
          logger?.error(
            { err, questionId, sessionId: state.boundSessionId },
            'Failed to persist session code',
          );
          sendMessage({ type: 'error', message: 'Failed to save session code' });
        }
      }
      return;
    }

    case 'transcript_final': {
      const transcriptText = msg.text?.trim();

      if (!transcriptText) {
        sendMessage({ type: 'error', message: 'text field required for transcript_final' });
        return;
      }

      if (msg.sessionId && state.boundSessionId && msg.sessionId !== state.boundSessionId) {
        sendMessage({ type: 'error', message: 'sessionId mismatch for transcript_final' });
        return;
      }

      if (typeof msg.code === 'string') {
        if (msg.code.length > MAX_CODE_SIZE) {
          sendMessage({ type: 'error', message: 'Code exceeds maximum allowed size' });
          return;
        }

        state.currentCode = msg.code;
      }

      try {
        if (state.boundSessionId) {
          await prismaClient.$transaction([
            prismaClient.interviewSession.update({
              where: { id: state.boundSessionId },
              data: { code: state.currentCode },
            }),
            prismaClient.sessionMessage.create({
              data: {
                sessionId: state.boundSessionId,
                role: 'user',
                content: transcriptText,
                messageType: 'speech',
              },
            }),
          ]);
        }

        state.conversationHistory.push({ role: 'user', content: transcriptText });
        sendMessage({
          type: 'transcript',
          text: transcriptText,
          sessionId: state.boundSessionId ?? undefined,
          timing: msg.timing,
        });
      } catch (err) {
        logger?.error(
          { err, questionId, sessionId: state.boundSessionId },
          'Transcript persistence failed',
        );
        sendMessage({ type: 'error', message: 'Failed to store transcript' });
      }
      return;
    }

    case 'speech_status': {
      if (msg.sessionId && state.boundSessionId && msg.sessionId !== state.boundSessionId) {
        sendMessage({ type: 'error', message: 'sessionId mismatch for speech_status' });
        return;
      }

      logger?.debug(
        {
          questionId,
          sessionId: state.boundSessionId,
          status: msg.status,
          error: msg.error,
        },
        'Speech status update',
      );
      return;
    }

    case 'request_feedback': {
      try {
        const conversationSnapshot = [...state.conversationHistory];
        const lastUserMessage = [...conversationSnapshot]
          .reverse()
          .find((message) => message.role === 'user');

        const feedback = await feedbackGenerator({
          questionTitle: question.title,
          questionDescription: question.description,
          currentCode: state.currentCode,
          recentTranscript: lastUserMessage?.content ?? '',
          conversationHistory: conversationSnapshot,
        });

        state.conversationHistory.push({ role: 'assistant', content: feedback.content });

        if (state.boundSessionId) {
          await prismaClient.sessionMessage.create({
            data: {
              sessionId: state.boundSessionId,
              role: 'assistant',
              content: feedback.content,
              messageType: 'feedback',
            },
          });
        }

        sendMessage({
          type: 'feedback',
          content: feedback.content,
          feedbackType: feedback.type,
          sessionId: state.boundSessionId ?? undefined,
        });

        if (msg.includeTts) {
          try {
            const audioBuffer = await speechSynthesizer(feedback.content);
            sendMessage({
              type: 'audio',
              audio: audioBuffer.toString('base64'),
            });
          } catch (ttsErr) {
            logger?.error({ err: ttsErr, questionId }, 'TTS failed');
          }
        }
      } catch (err) {
        logger?.error(
          { err, questionId, sessionId: state.boundSessionId },
          'Feedback generation failed',
        );
        sendMessage({ type: 'error', message: 'Failed to generate feedback' });
      }
      return;
    }

    default:
      sendMessage({ type: 'error', message: 'Unknown message type' });
  }
}

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get<{ Querystring: { questionId?: string; sessionId?: string } }>(
    '/api/ws',
    { websocket: true },
    async (socket, request) => {
      const { questionId, sessionId } = request.query;

      if (!questionId) {
        send(socket, { type: 'error', message: 'questionId query param required' });
        socket.close();
        return;
      }

      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: { testCases: true, starterCodes: true },
      });

      if (!question) {
        send(socket, { type: 'error', message: 'Question not found' });
        socket.close();
        return;
      }

      let boundSessionId = sessionId ?? null;
      const hydration = await hydrateWsConnection({
        questionId,
        sessionId: boundSessionId,
        question,
      });

      if (!hydration.ok) {
        send(socket, { type: 'error', message: hydration.error });
        socket.close();
        return;
      }

      const state = hydration.state;
      boundSessionId = state.boundSessionId;

      app.log.info({ questionId, sessionId: boundSessionId }, 'WebSocket connected');

      socket.on('message', async (raw: RawData) => {
        let msg: WsIncoming;
        try {
          msg = JSON.parse(String(raw)) as WsIncoming;
        } catch {
          send(socket, { type: 'error', message: 'Invalid JSON' });
          return;
        }

        await handleWsIncomingMessage({
          questionId,
          question,
          state,
          msg,
          dependencies: {
            logger: app.log,
            sendMessage: (outgoingMessage) => send(socket, outgoingMessage),
          },
        });
      });

      socket.on('close', () => {
        app.log.info({ questionId, sessionId: boundSessionId }, 'WebSocket disconnected');
      });
    },
  );
}
