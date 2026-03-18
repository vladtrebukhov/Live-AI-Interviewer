import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

const SPEECH_TOKEN_TTL_SECONDS = 600;
const TOKEN_REQUEST_WINDOW_MS = 60_000;
const MAX_TOKEN_REQUESTS_PER_WINDOW = 10;

const tokenRequestLog = new Map<string, number[]>();

interface SpeechTokenRequestBody {
  questionId?: string;
  sessionId?: string;
}

interface SpeechTokenResponse {
  token: string;
  region: string;
  endpoint?: string;
  expiresInSeconds: number;
}

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new globalThis.URL(value).origin;
  } catch {
    return undefined;
  }
}

function getRequestOrigin(headers: Record<string, unknown>): string | undefined {
  const originHeader = typeof headers.origin === 'string' ? headers.origin : undefined;
  if (originHeader) {
    return normalizeOrigin(originHeader);
  }

  const refererHeader = typeof headers.referer === 'string' ? headers.referer : undefined;
  return normalizeOrigin(refererHeader);
}

function isRateLimited(ipAddress: string): boolean {
  const now = Date.now();
  const recentRequests = (tokenRequestLog.get(ipAddress) ?? []).filter(
    (timestamp) => now - timestamp < TOKEN_REQUEST_WINDOW_MS,
  );

  if (recentRequests.length >= MAX_TOKEN_REQUESTS_PER_WINDOW) {
    tokenRequestLog.set(ipAddress, recentRequests);
    return true;
  }

  recentRequests.push(now);
  tokenRequestLog.set(ipAddress, recentRequests);
  return false;
}

function getSpeechTokenUrl(region: string, endpoint: string | undefined): string {
  if (endpoint) {
    return new globalThis.URL('/sts/v1.0/issueToken', endpoint).toString();
  }

  return `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
}

function getBrowserSpeechEndpoint(endpoint: string | undefined): string | undefined {
  if (!endpoint) {
    return undefined;
  }

  try {
    const parsed = new globalThis.URL(endpoint);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Regional Cognitive endpoints (e.g. https://eastus2.api.cognitive.microsoft.com)
    // are valid for token issuance but should not be passed to the browser Speech SDK
    // as direct recognition endpoints.
    if (host.endsWith('.api.cognitive.microsoft.com')) {
      return undefined;
    }

    // Only expose explicit Speech endpoint paths for browser endpoint mode.
    if (!path.includes('/speech/')) {
      return undefined;
    }

    return parsed.toString();
  } catch {
    return undefined;
  }
}

async function validateSpeechScope(
  body: SpeechTokenRequestBody,
): Promise<{ questionId: string } | null> {
  const { questionId, sessionId } = body;

  if (sessionId) {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { questionId: true },
    });

    if (!session) {
      return null;
    }

    if (questionId && questionId !== session.questionId) {
      throw new Error('session_question_mismatch');
    }

    return { questionId: session.questionId };
  }

  if (!questionId) {
    return null;
  }

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true },
  });

  return question ? { questionId: question.id } : null;
}

async function issueSpeechToken(
  key: string,
  region: string,
  endpoint: string | undefined,
): Promise<string> {
  const response = await globalThis.fetch(getSpeechTokenUrl(region, endpoint), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    signal: globalThis.AbortSignal.timeout(5_000),
  });

  const responseText = await response.text();
  if (!response.ok || !responseText) {
    throw new Error(`speech_token_upstream_${response.status}`);
  }

  return responseText;
}

export async function speechRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SpeechTokenRequestBody }>('/token', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Vary', 'Origin');

    const allowedOrigin = normalizeOrigin(
      globalThis.process.env.FRONTEND_URL ?? 'http://localhost:3000',
    );
    const requestOrigin = getRequestOrigin(request.headers as Record<string, unknown>);

    if (allowedOrigin && requestOrigin !== allowedOrigin) {
      return reply
        .code(403)
        .send({ error: 'Speech token requests must originate from the configured frontend' });
    }

    const key = globalThis.process.env.AZURE_SPEECH_KEY;
    const region = globalThis.process.env.AZURE_SPEECH_REGION;
    const endpoint = globalThis.process.env.AZURE_SPEECH_ENDPOINT;

    if (!key || !region) {
      app.log.error('Azure Speech configuration missing for token issuance');
      return reply.code(503).send({ error: 'Azure Speech is not configured on the server' });
    }

    if (isRateLimited(request.ip)) {
      return reply
        .code(429)
        .send({ error: 'Too many Speech token requests. Please try again shortly.' });
    }

    const body = request.body ?? {};
    if (!body.questionId && !body.sessionId) {
      return reply.code(400).send({ error: 'questionId or sessionId is required' });
    }

    let validatedScope: { questionId: string } | null;
    try {
      validatedScope = await validateSpeechScope(body);
    } catch (error) {
      if (error instanceof Error && error.message === 'session_question_mismatch') {
        return reply.code(400).send({ error: 'sessionId does not match the provided questionId' });
      }
      throw error;
    }

    if (!validatedScope) {
      return reply.code(404).send({ error: 'Unable to verify the requested interview scope' });
    }

    try {
      const token = await issueSpeechToken(key, region, endpoint);

      const payload: SpeechTokenResponse = {
        token,
        region,
        endpoint: getBrowserSpeechEndpoint(endpoint),
        expiresInSeconds: SPEECH_TOKEN_TTL_SECONDS,
      };

      return reply.send(payload);
    } catch (error) {
      app.log.error(
        {
          error,
          questionId: validatedScope.questionId,
          hasEndpoint: Boolean(endpoint),
          ip: request.ip,
        },
        'Azure Speech token issuance failed',
      );

      return reply.code(502).send({ error: 'Failed to acquire Azure Speech token' });
    }
  });
}
