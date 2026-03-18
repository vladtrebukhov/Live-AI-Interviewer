import { create } from 'zustand';
import type { SupportedLanguage } from '@agentsgalore/shared';

export type SpeechRecognitionStatus = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

interface InterviewState {
  questionId: string | null;
  sessionId: string | null;
  code: string;
  isConnected: boolean;
  isMicOn: boolean;
  speechStatus: SpeechRecognitionStatus;
  partialTranscript: string;
  speechError: string | null;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    type: string;
    createdAt: string;
  }>;
  testResults: Array<{
    testCaseId: string;
    passed: boolean;
    actualOutput: string;
    expectedOutput: string;
    error: string | null;
  }>;
  runOutput: string;
  language: SupportedLanguage;

  setQuestionId: (id: string) => void;
  setSessionId: (id: string | null) => void;
  setCode: (code: string) => void;
  setLanguage: (language: SupportedLanguage) => void;
  setConnected: (connected: boolean) => void;
  setSpeechStatus: (status: SpeechRecognitionStatus) => void;
  setPartialTranscript: (text: string) => void;
  setSpeechError: (error: string | null) => void;
  setMessages: (messages: InterviewState['messages']) => void;
  addMessage: (message: InterviewState['messages'][0]) => void;
  setTestResults: (results: InterviewState['testResults']) => void;
  setRunOutput: (output: string) => void;
  reset: () => void;
}

const initialState = {
  questionId: null,
  sessionId: null,
  code: '',
  isConnected: false,
  isMicOn: false,
  speechStatus: 'idle' as SpeechRecognitionStatus,
  partialTranscript: '',
  speechError: null,
  messages: [],
  testResults: [],
  runOutput: '',
  language: 'typescript' as const,
};

export const useInterviewStore = create<InterviewState>((set) => ({
  ...initialState,
  setQuestionId: (id) => set({ questionId: id }),
  setSessionId: (id) => set({ sessionId: id }),
  setCode: (code) => set({ code }),
  setLanguage: (language) => set({ language }),
  setConnected: (connected) => set({ isConnected: connected }),
  setSpeechStatus: (status) =>
    set({
      speechStatus: status,
      isMicOn: status === 'starting' || status === 'listening' || status === 'stopping',
    }),
  setPartialTranscript: (text) => set({ partialTranscript: text }),
  setSpeechError: (error) => set({ speechError: error }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setTestResults: (results) => set({ testResults: results }),
  setRunOutput: (output) => set({ runOutput: output }),
  reset: () => set(initialState),
}));
