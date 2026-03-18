const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ApiSessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType: 'code' | 'speech' | 'feedback' | 'system';
  createdAt: string;
}

export interface InterviewSessionResponse {
  id: string;
  questionId: string;
  code: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: string;
  endedAt: string | null;
  messages?: ApiSessionMessage[];
}

export interface SpeechTokenRequest {
  questionId?: string;
  sessionId?: string;
}

export interface SpeechTokenResponse {
  token: string;
  region: string;
  endpoint?: string;
  expiresInSeconds: number;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchSpeechToken(payload: SpeechTokenRequest): Promise<SpeechTokenResponse> {
  return apiFetch<SpeechTokenResponse>('/api/speech/token', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createInterviewSession(questionId: string): Promise<InterviewSessionResponse> {
  return apiFetch<InterviewSessionResponse>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ questionId }),
  });
}

export async function fetchInterviewSession(sessionId: string): Promise<InterviewSessionResponse> {
  return apiFetch<InterviewSessionResponse>(`/api/sessions/${sessionId}`);
}
