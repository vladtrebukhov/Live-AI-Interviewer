import { describe, it, expect, beforeEach } from 'vitest';
import { useInterviewStore } from '../interview-store.js';

describe('useInterviewStore', () => {
  beforeEach(() => {
    useInterviewStore.getState().reset();
  });

  it('has correct initial state', () => {
    const state = useInterviewStore.getState();
    expect(state.questionId).toBeNull();
    expect(state.code).toBe('');
    expect(state.isConnected).toBe(false);
    expect(state.isMicOn).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.testResults).toEqual([]);
    expect(state.language).toBe('typescript');
  });

  it('setLanguage updates language', () => {
    useInterviewStore.getState().setLanguage('javascript');
    expect(useInterviewStore.getState().language).toBe('javascript');
  });

  it('setCode updates code', () => {
    useInterviewStore.getState().setCode('const x = 1;');
    expect(useInterviewStore.getState().code).toBe('const x = 1;');
  });

  it('setQuestionId updates questionId', () => {
    useInterviewStore.getState().setQuestionId('question-123');
    expect(useInterviewStore.getState().questionId).toBe('question-123');
  });

  it('setConnected updates isConnected', () => {
    useInterviewStore.getState().setConnected(true);
    expect(useInterviewStore.getState().isConnected).toBe(true);
  });

  it('setSpeechStatus derives isMicOn from speech lifecycle state', () => {
    expect(useInterviewStore.getState().isMicOn).toBe(false);

    useInterviewStore.getState().setSpeechStatus('starting');
    expect(useInterviewStore.getState().isMicOn).toBe(true);

    useInterviewStore.getState().setSpeechStatus('listening');
    expect(useInterviewStore.getState().isMicOn).toBe(true);

    useInterviewStore.getState().setSpeechStatus('stopping');
    expect(useInterviewStore.getState().isMicOn).toBe(true);

    useInterviewStore.getState().setSpeechStatus('idle');
    expect(useInterviewStore.getState().isMicOn).toBe(false);
  });

  it('addMessage appends messages', () => {
    const msg1 = {
      id: '1',
      role: 'user' as const,
      content: 'Hello',
      type: 'speech',
      createdAt: new Date().toISOString(),
    };
    const msg2 = {
      id: '2',
      role: 'assistant' as const,
      content: 'Hi!',
      type: 'feedback',
      createdAt: new Date().toISOString(),
    };
    useInterviewStore.getState().addMessage(msg1);
    useInterviewStore.getState().addMessage(msg2);
    const messages = useInterviewStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].role).toBe('assistant');
  });

  it('setTestResults replaces test results', () => {
    const results = [
      {
        testCaseId: 'tc-1',
        passed: true,
        actualOutput: '6',
        expectedOutput: '6',
        error: null,
      },
      {
        testCaseId: 'tc-2',
        passed: false,
        actualOutput: '5',
        expectedOutput: '10',
        error: 'Wrong answer',
      },
    ];
    useInterviewStore.getState().setTestResults(results);
    expect(useInterviewStore.getState().testResults).toEqual(results);
  });

  it('reset restores initial state', () => {
    useInterviewStore.getState().setCode('some code');
    useInterviewStore.getState().setQuestionId('s-1');
    useInterviewStore.getState().setConnected(true);
    useInterviewStore.getState().setLanguage('javascript');
    useInterviewStore.getState().setSpeechStatus('listening');
    useInterviewStore.getState().addMessage({
      id: '1',
      role: 'user',
      content: 'hi',
      type: 'speech',
      createdAt: new Date().toISOString(),
    });

    useInterviewStore.getState().reset();

    const state = useInterviewStore.getState();
    expect(state.questionId).toBeNull();
    expect(state.code).toBe('');
    expect(state.isConnected).toBe(false);
    expect(state.isMicOn).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.testResults).toEqual([]);
    expect(state.language).toBe('typescript');
  });
});
