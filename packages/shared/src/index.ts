export interface StarterCode {
  id: string;
  language: SupportedLanguage;
  code: string;
}

export interface Question {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  starterCodes: StarterCode[];
  testCases: TestCase[];
}

export interface TestCase {
  id: string;
  questionId: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

export interface InterviewSession {
  id: string;
  questionId: string;
  code: string;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: Date;
  endedAt: Date | null;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType: 'code' | 'speech' | 'feedback' | 'system';
  createdAt: Date;
}

export interface LLMFeedbackRequest {
  questionId: string;
  questionContext: string;
  currentCode: string;
  recentTranscript: string;
  conversationHistory: SessionMessage[];
}

export interface LLMFeedbackResponse {
  content: string;
  type: 'clarification' | 'hint' | 'feedback' | 'confirmation' | 'follow-up';
}

export type SupportedLanguage = 'typescript' | 'javascript' | 'csharp';

export const SUPPORTED_LANGUAGES: { id: SupportedLanguage; label: string; monacoId: string }[] = [
  { id: 'typescript', label: 'TypeScript', monacoId: 'typescript' },
  { id: 'javascript', label: 'JavaScript', monacoId: 'javascript' },
  { id: 'csharp', label: 'C#', monacoId: 'csharp' },
];

/** Languages that support browser-side code execution via Nodepod. */
export const EXECUTABLE_LANGUAGES = new Set<SupportedLanguage>(['javascript', 'typescript']);

export interface CodeExecutionRequest {
  language: SupportedLanguage;
  code: string;
  input: string;
}

export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface TestCaseResult {
  testCaseId: string;
  passed: boolean;
  actualOutput: string;
  expectedOutput: string;
  error: string | null;
}

export interface SpeechRecognitionTiming {
  offset?: number;
  duration?: number;
  offsetMs?: number;
  durationMs?: number;
}

export type WsSpeechStatus = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

export type WsIncoming =
  | { type: 'code_update'; code: string; sessionId?: string }
  | {
      type: 'transcript_final';
      text: string;
      sessionId?: string;
      code?: string;
      timing?: SpeechRecognitionTiming;
    }
  | { type: 'speech_status'; status: WsSpeechStatus; error?: string; sessionId?: string }
  | { type: 'request_feedback'; includeTts?: boolean; sessionId?: string };

export type WsOutgoing =
  | { type: 'transcript'; text: string; sessionId?: string; timing?: SpeechRecognitionTiming }
  | { type: 'feedback'; content: string; feedbackType: string; sessionId?: string }
  | { type: 'error'; message: string }
  | { type: 'audio'; audio: string };
