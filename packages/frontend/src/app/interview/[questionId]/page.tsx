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

type OutputTab = 'testcases' | 'output';

/** Drag handle for resizable panels. Attaches window-level listeners only during active drag. */
function DragHandle({
  onDrag,
}: {
  onDrag: (deltaX: number) => void;
}) {
  const lastX = useRef(0);
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    lastX.current = e.clientX;

    const handleMove = (ev: PointerEvent) => {
      const delta = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onDragRef.current(delta);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, []);

  return (
    <div
      onPointerDown={onPointerDown}
      className="w-1.5 shrink-0 bg-border hover:bg-accent/40 active:bg-accent/60 transition-colors cursor-col-resize select-none touch-none"
    />
  );
}

function getMicButtonLabel(status: ReturnType<typeof useInterviewStore.getState>['speechStatus']) {
  switch (status) {
    case 'starting':
      return 'Starting…';
    case 'listening':
      return 'Mic On';
    case 'stopping':
      return 'Stopping…';
    case 'error':
      return 'Retry';
    default:
      return 'Mic Off';
  }
}

function getSpeechStatusLabel(
  status: ReturnType<typeof useInterviewStore.getState>['speechStatus'],
) {
  switch (status) {
    case 'starting':
      return 'Starting microphone…';
    case 'listening':
      return 'Listening…';
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
  const [activeTab, setActiveTab] = useState<OutputTab>('testcases');

  // Panel widths as percentages (left%, right%). Center = 100 - left - right.
  const [leftPct, setLeftPct] = useState(25);
  const [rightPct, setRightPct] = useState(25);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLeftDrag = useCallback((deltaX: number) => {
    if (!containerRef.current) return;
    const totalW = containerRef.current.offsetWidth;
    const deltaPct = (deltaX / totalW) * 100;
    setLeftPct((prev) => Math.min(40, Math.max(15, prev + deltaPct)));
  }, []);

  const handleRightDrag = useCallback((deltaX: number) => {
    if (!containerRef.current) return;
    const totalW = containerRef.current.offsetWidth;
    const deltaPct = (deltaX / totalW) * 100;
    // Dragging right handle: moving right shrinks the right panel
    setRightPct((prev) => Math.min(40, Math.max(15, prev - deltaPct)));
  }, []);

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
    setActiveTab('output');

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
    setActiveTab('testcases');

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
      <main className="h-screen flex items-center justify-center bg-background">
        <p className="text-text-muted text-sm">Loading question...</p>
      </main>
    );
  }

  if (!question) {
    return (
      <main className="h-screen flex items-center justify-center bg-background">
        <p className="text-danger text-sm">Question not found</p>
      </main>
    );
  }

  const passedCount = testResults.filter((r) => r.passed).length;
  const totalTests = testResults.length || question.testCases.length;

  return (
    <main className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top header bar — compact, dark */}
      <header className="h-10 min-h-[40px] border-b border-border bg-surface flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded bg-accent flex items-center justify-center">
            <span className="text-xs font-bold text-background">{'</>'}</span>
          </div>
          <h1 className="text-sm font-semibold text-foreground truncate max-w-xs">
            {question.title}
          </h1>
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              question.difficulty === 'easy'
                ? 'bg-accent-muted text-accent'
                : question.difficulty === 'medium'
                  ? 'bg-yellow-900/30 text-warning'
                  : 'bg-red-900/30 text-danger'
            }`}
          >
            {question.difficulty}
          </span>
          <span
            className={`text-xs flex items-center gap-1 ${isConnected ? 'text-accent' : 'text-danger'}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-accent' : 'bg-danger'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Speech status */}
          <span className="text-xs text-text-muted hidden md:inline">
            {getSpeechStatusLabel(speechStatus)}
          </span>
          {/* Mic toggle */}
          <button
            onClick={handleToggleMic}
            disabled={!isSupported || speechStatus === 'starting' || speechStatus === 'stopping'}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              isMicOn
                ? 'bg-danger/20 text-danger hover:bg-danger/30'
                : 'bg-surface-alt text-text-secondary hover:bg-border'
            }`}
          >
            🎤 {getMicButtonLabel(speechStatus)}
          </button>
        </div>
      </header>

      {/* Main content — resizable 3-panel split */}
      <div ref={containerRef} className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left panel — Problem description */}
        <div style={{ width: `${leftPct}%` }} className="shrink-0 flex flex-col bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Problem
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <h2 className="text-base font-semibold text-foreground mb-3">{question.title}</h2>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {question.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-surface-alt text-text-muted px-2 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Description */}
            <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
              {question.description}
            </div>

            {/* Test cases preview */}
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
                Sample Test Cases
              </h3>
              {question.testCases.map((tc, idx) => (
                <div
                  key={tc.id}
                  className="mb-3 rounded bg-surface-alt border border-border p-3"
                >
                  <div className="text-xs text-text-muted mb-1">Sample {idx}</div>
                  <div className="font-mono text-xs text-foreground">
                    <div className="mb-1">
                      <span className="text-text-muted">Input: </span>
                      {tc.input}
                    </div>
                    <div>
                      <span className="text-text-muted">Output: </span>
                      {tc.expectedOutput}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live transcript bar (inside left panel at bottom) */}
          {partialTranscript && (
            <div className="border-t border-border px-4 py-2 bg-accent-muted">
              <p className="text-xs text-accent truncate">
                <span className="font-medium">Live: </span>
                {partialTranscript}
              </p>
            </div>
          )}
          {speechError && (
            <div className="border-t border-border px-4 py-1.5 bg-danger/10">
              <p className="text-xs text-danger truncate">{speechError}</p>
            </div>
          )}
        </div>

        <DragHandle onDrag={handleLeftDrag} />

        {/* Center panel — Editor + Output tabs */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Language selector bar */}
          <div className="h-9 min-h-[36px] flex items-center gap-2 border-b border-border bg-surface px-4">
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
              className="rounded border border-border bg-surface-alt px-2 py-1 text-xs text-foreground focus:border-accent focus:outline-none"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* Code editor */}
          <div className="flex-1 min-h-0 relative">
            <div className="absolute inset-0">
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
                padding: { top: 12 },
                renderLineHighlight: 'gutter',
              }}
            />
            </div>
          </div>

          {/* Output panel — tabbed */}
          <div className="h-64 min-h-[160px] flex flex-col border-t border-border">
            {/* Tab bar */}
            <div className="h-9 min-h-[36px] flex items-center border-b border-border bg-surface px-1">
              {(
                [
                  { id: 'testcases' as const, label: 'Test Cases' },
                  { id: 'output' as const, label: 'Output' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
                    activeTab === tab.id
                      ? 'text-accent bg-accent-muted'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'testcases' && testResults.length > 0 && (
                    <span className="ml-1.5 text-xs">
                      ({passedCount}/{testResults.length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto bg-surface">
              {/* Test Cases tab */}
              {activeTab === 'testcases' && (
                <div className="p-3 space-y-2">
                  {testResults.length === 0
                    ? question.testCases.map((tc, idx) => (
                        <div
                          key={tc.id}
                          className="rounded border border-border bg-surface-alt p-3"
                        >
                          <div className="text-xs text-text-muted mb-1.5 font-medium">
                            Case {idx}
                          </div>
                          <div className="font-mono text-xs text-text-secondary space-y-1">
                            <div>
                              <span className="text-text-muted">Input: </span>
                              {tc.input}
                            </div>
                            <div>
                              <span className="text-text-muted">Expected: </span>
                              {tc.expectedOutput}
                            </div>
                          </div>
                        </div>
                      ))
                    : testResults.map((r, idx) => (
                        <div
                          key={r.testCaseId}
                          className={`rounded border p-3 ${
                            r.passed
                              ? 'border-accent/30 bg-accent-muted'
                              : 'border-danger/30 bg-danger/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs font-semibold ${r.passed ? 'text-accent' : 'text-danger'}`}
                            >
                              {r.passed ? '✓ Passed' : '✗ Failed'}
                            </span>
                            <span className="text-xs text-text-muted">Case {idx}</span>
                          </div>
                          {!r.passed && (
                            <div className="font-mono text-xs text-text-secondary space-y-0.5 mt-1">
                              <div>
                                <span className="text-text-muted">Expected: </span>
                                {r.expectedOutput}
                              </div>
                              <div>
                                <span className="text-text-muted">Got: </span>
                                {r.actualOutput}
                              </div>
                              {r.error && (
                                <div className="text-danger mt-1">{r.error}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                </div>
              )}

              {/* Output tab */}
              {activeTab === 'output' && (
                <div className="p-3">
                  {runOutput ? (
                    <pre className="font-mono text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">
                      {runOutput}
                    </pre>
                  ) : (
                    <p className="text-xs text-text-muted">
                      Run your code to see output here.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bottom action bar */}
          <div className="h-11 min-h-[44px] flex items-center justify-between border-t border-border bg-surface px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={requestFeedback}
                className="px-3 py-1.5 rounded text-xs font-medium bg-surface-alt text-text-secondary hover:bg-border transition-colors border border-border"
              >
                Get Feedback
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunCode}
                disabled={isRunningCode || isRunningTests}
                className="px-4 py-1.5 rounded text-xs font-medium bg-surface-alt text-foreground hover:bg-border transition-colors border border-border disabled:opacity-50"
              >
                {isRunningCode ? 'Running…' : '▶ Run Code'}
              </button>
              <button
                onClick={handleRunTests}
                disabled={isRunningCode || isRunningTests}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-accent text-background hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isRunningTests ? 'Testing…' : 'Run Tests'}
              </button>
            </div>
          </div>
        </div>

        <DragHandle onDrag={handleRightDrag} />

        {/* Right panel — AI Chat */}
        <div style={{ width: `${rightPct}%` }} className="shrink-0 flex flex-col bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              AI Chat
            </span>
            {messages.length > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-accent text-background text-[10px] font-medium">
                {messages.length}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-xs text-text-muted">
                AI feedback will appear here. Speak your thought process or click
                &quot;Get Feedback&quot;.
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`text-xs p-3 rounded ${
                    msg.role === 'assistant'
                      ? 'bg-accent-muted text-foreground'
                      : msg.role === 'user'
                        ? 'bg-surface-alt text-text-secondary'
                        : 'bg-yellow-900/20 text-warning'
                  }`}
                >
                  <span className="font-semibold text-[10px] uppercase tracking-wider text-text-muted">
                    {msg.role}
                  </span>
                  <p className="mt-1 leading-relaxed">{msg.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
