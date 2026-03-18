'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import Editor from '@monaco-editor/react';
import { useInterviewStore } from '@/stores/interview-store';
import { useInterviewSocket } from '@/hooks/use-interview-socket';
import { useAzureSpeechRecognition } from '@/hooks/use-azure-speech-recognition';
import { apiFetch, createInterviewSession, fetchInterviewSession } from '@/lib/api';
import { executeInBrowser } from '@/lib/execution/nodepod-runner';
import { runTestCasesInBrowser } from '@/lib/execution/run-tests';
import { SUPPORTED_LANGUAGES } from '@live-interviewer/shared';
import type { Question, SupportedLanguage } from '@live-interviewer/shared';

function getMicButtonLabel(status: ReturnType<typeof useInterviewStore.getState>['speechStatus']) {
  switch (status) {
    case 'starting':
      return '🎤 Starting…';
    case 'listening':
      return '🎤 Mic On';
    case 'stopping':
      return '🎤 Stopping…';
    case 'error':
      return '🎤 Retry Mic';
    default:
      return '🎤 Mic Off';
  }
}

function getSpeechStatusLabel(
  status: ReturnType<typeof useInterviewStore.getState>['speechStatus'],
) {
  switch (status) {
    case 'starting':
      return 'Starting microphone…';
    case 'listening':
      return 'Listening';
    case 'stopping':
      return 'Stopping microphone…';
    case 'error':
      return 'Mic unavailable';
    default:
      return 'Mic idle';
  }
}

export default function InterviewWorkspace({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  const { questionId } = use(params);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isRunningTests, setIsRunningTests] = useState(false);

  const {
    code,
    setCode,
    language,
    setLanguage,
    sessionId,
    messages,
    testResults,
    runOutput,
    isMicOn,
    speechStatus,
    partialTranscript,
    speechError,
    isConnected,
    setQuestionId,
    setSessionId,
    setSpeechStatus,
    setPartialTranscript,
    setSpeechError,
    setMessages,
    setRunOutput,
    setTestResults,
  } = useInterviewStore();

  const { sendCodeUpdate, sendFinalTranscript, sendSpeechStatus, requestFeedback } =
    useInterviewSocket(question?.id ?? null, sessionId);

  const { startRecognition, stopRecognition, isSupported } = useAzureSpeechRecognition({
    questionId: question?.id ?? null,
    sessionId,
    onStatusChange: setSpeechStatus,
    onPartialTranscript: setPartialTranscript,
    onError: setSpeechError,
    onFinalTranscript: ({ text, timing }) => {
      sendFinalTranscript(text, timing, useInterviewStore.getState().code);
    },
  });

  const handleToggleMic = useCallback(async () => {
    if (isMicOn) {
      await stopRecognition();
      return;
    }

    await startRecognition();
  }, [isMicOn, startRecognition, stopRecognition]);

  // Fetch question data
  useEffect(() => {
    async function fetchQuestion() {
      try {
        const data = await apiFetch<Question>(`/api/questions/${questionId}`);
        const existingState = useInterviewStore.getState();
        const existingSessionId =
          existingState.questionId === questionId ? existingState.sessionId : null;

        const session = existingSessionId
          ? await fetchInterviewSession(existingSessionId).catch(() =>
              createInterviewSession(questionId),
            )
          : await createInterviewSession(questionId);

        setQuestion(data);
        const starterLanguage = useInterviewStore.getState().language;
        const starter = data.starterCodes.find((sc) => sc.language === starterLanguage)?.code ?? '';
        setCode(session.code || starter);
        setMessages(
          (session.messages ?? []).map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            type: message.messageType,
            createdAt: message.createdAt,
          })),
        );
        setQuestionId(questionId);
        setSessionId(session.id);
        setSpeechStatus('idle');
        setPartialTranscript('');
        setSpeechError(null);
      } catch (err) {
        console.error('Failed to fetch question:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchQuestion();
  }, [
    questionId,
    setCode,
    setMessages,
    setPartialTranscript,
    setQuestionId,
    setSessionId,
    setSpeechError,
    setSpeechStatus,
  ]);

  useEffect(() => {
    if (!question?.id || !sessionId) {
      return;
    }

    sendSpeechStatus(speechStatus, speechError ?? undefined);
  }, [question?.id, sessionId, speechStatus, speechError, sendSpeechStatus]);

  // Debounced code update via WebSocket
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);
  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        setCode(value);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => sendCodeUpdate(value), 1000);
      }
    },
    [setCode, sendCodeUpdate],
  );

  const handleRunCode = useCallback(async () => {
    if (!question || isRunningCode) return;

    setIsRunningCode(true);
    setRunOutput('Running...');

    try {
      const result = await executeInBrowser(language, code);
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      setRunOutput(output || `Process exited with code ${result.exitCode}`);
    } catch (error) {
      setRunOutput(error instanceof Error ? error.message : 'Failed to execute code');
    } finally {
      setIsRunningCode(false);
    }
  }, [question, isRunningCode, setRunOutput, language, code]);

  const handleRunTests = useCallback(async () => {
    if (!question || isRunningTests) return;

    setIsRunningTests(true);

    try {
      const results = await runTestCasesInBrowser(language, code, question.testCases);
      setTestResults(results);
    } catch (error) {
      setTestResults([
        {
          testCaseId: 'execution-error',
          passed: false,
          actualOutput: '',
          expectedOutput: '',
          error: error instanceof Error ? error.message : 'Failed to run tests',
        },
      ]);
    } finally {
      setIsRunningTests(false);
    }
  }, [question, isRunningTests, language, code, setTestResults]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading question...</p>
      </main>
    );
  }

  if (!question) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-red-500">Question not found</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-2 flex items-center justify-between bg-gray-50">
        <div>
          <h1 className="text-lg font-bold">{question.title}</h1>
          <span className={`text-xs ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
            {isConnected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleMic}
            disabled={!isSupported || speechStatus === 'starting' || speechStatus === 'stopping'}
            className={`px-3 py-1.5 rounded text-sm font-medium ${
              isMicOn
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {getMicButtonLabel(speechStatus)}
          </button>
          <button
            onClick={requestFeedback}
            className="px-3 py-1.5 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
          >
            Get Feedback
          </button>
          <button
            onClick={handleRunCode}
            disabled={isRunningCode || isRunningTests}
            className="px-3 py-1.5 rounded text-sm font-medium bg-teal-600 text-white hover:bg-teal-700"
          >
            {isRunningCode ? '⏳ Running...' : '▶ Run Code'}
          </button>
          <button
            onClick={handleRunTests}
            disabled={isRunningCode || isRunningTests}
            className="px-3 py-1.5 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {isRunningTests ? '⏳ Testing...' : '🧪 Run Tests'}
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-2 gap-0">
        {/* Left: Problem + Editor */}
        <div className="flex flex-col border-r">
          {/* Problem description (collapsible) */}
          <details className="border-b" open>
            <summary className="px-4 py-2 font-semibold cursor-pointer bg-gray-50 text-sm">
              Problem Description
            </summary>
            <div className="px-4 py-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
              {question.description}
            </div>
          </details>

          {/* Language selector + Monaco Editor */}
          <div className="flex items-center gap-2 border-b bg-gray-900 px-4 py-1.5">
            <label htmlFor="language-select" className="text-sm text-gray-400">
              Language:
            </label>
            <select
              id="language-select"
              value={language}
              onChange={(e) => {
                const newLang = e.target.value as SupportedLanguage;
                setLanguage(newLang);
                if (question) {
                  const starter =
                    question.starterCodes.find((sc) => sc.language === newLang)?.code ?? '';
                  setCode(starter);
                }
              }}
              className="rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              language={
                SUPPORTED_LANGUAGES.find((l) => l.id === language)?.monacoId ?? 'typescript'
              }
              value={code}
              onChange={handleCodeChange}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* Right: Feedback + Test Results */}
        <div className="flex flex-col">
          <div className="border-b bg-gray-50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span
                className={`font-medium ${speechStatus === 'error' ? 'text-red-600' : 'text-gray-700'}`}
              >
                {getSpeechStatusLabel(speechStatus)}
              </span>
              {!isSupported && (
                <span className="text-red-600">
                  Microphone access is unavailable in this browser.
                </span>
              )}
            </div>
            {partialTranscript && (
              <p className="mt-2 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-blue-900">
                <span className="font-medium">Live transcript:</span> {partialTranscript}
              </p>
            )}
            {speechError && <p className="mt-2 text-red-600">{speechError}</p>}
          </div>

          {/* AI Feedback panel */}
          <div className="flex-1 border-b overflow-y-auto">
            <div className="px-4 py-2 font-semibold bg-gray-50 text-sm border-b">AI Feedback</div>
            <div className="p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-gray-400 text-sm">
                  AI feedback will appear here. Speak your thought process or click &quot;Get
                  Feedback&quot;.
                </p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`text-sm p-3 rounded ${
                      msg.role === 'assistant'
                        ? 'bg-blue-50 text-blue-900'
                        : msg.role === 'user'
                          ? 'bg-gray-50 text-gray-800'
                          : 'bg-yellow-50 text-yellow-800'
                    }`}
                  >
                    <span className="font-medium text-xs uppercase">{msg.role}</span>
                    <p className="mt-1">{msg.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Console Output panel */}
          {runOutput && (
            <div className="border-b">
              <div className="px-4 py-2 font-semibold bg-gray-50 text-sm border-b">
                Console Output
              </div>
              <div className="p-4">
                <pre className="bg-gray-900 rounded p-3 text-sm text-gray-300 overflow-auto max-h-48 whitespace-pre-wrap">
                  {runOutput}
                </pre>
              </div>
            </div>
          )}

          {/* Test Results panel */}
          <div className="h-56 overflow-y-auto">
            <div className="px-4 py-2 font-semibold bg-gray-50 text-sm border-b">Test Results</div>
            <div className="p-4">
              {testResults.length === 0 ? (
                <div>
                  <p className="text-gray-400 text-sm mb-3">Run your code to see test results.</p>
                  {question.testCases.map((tc) => (
                    <div key={tc.id} className="text-sm border rounded p-2 mb-2">
                      <div>
                        <span className="font-medium">Input:</span> {tc.input}
                      </div>
                      <div>
                        <span className="font-medium">Expected:</span> {tc.expectedOutput}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                testResults.map((r) => (
                  <div
                    key={r.testCaseId}
                    className={`text-sm border rounded p-2 mb-2 ${
                      r.passed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                    }`}
                  >
                    <span className="font-medium">{r.passed ? '✓ Passed' : '✗ Failed'}</span>
                    {!r.passed && (
                      <div className="mt-1 text-xs">
                        <div>Expected: {r.expectedOutput}</div>
                        <div>Got: {r.actualOutput}</div>
                        {r.error && <div className="text-red-600">Error: {r.error}</div>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
