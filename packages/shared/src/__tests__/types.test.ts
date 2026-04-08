import { describe, it, expect } from 'vitest';
import type {
  Question,
  TestCase,
  InterviewSession,
  SessionMessage,
  CodeExecutionRequest,
  CodeExecutionResult,
  TestCaseResult,
  StarterCode,
  SupportedLanguage,
} from '../index.js';
import { SUPPORTED_LANGUAGES, EXECUTABLE_LANGUAGES } from '../index.js';

describe('Shared types smoke test', () => {
  it('creates a valid Question with TestCases', () => {
    const tc: TestCase = {
      id: 'tc-1',
      questionId: 'q-1',
      input: '[1,2,3]',
      expectedOutput: '6',
      isHidden: false,
    };
    const sc: StarterCode = {
      id: 'sc-1',
      language: 'typescript',
      code: 'function sum(arr: number[]) {}',
    };
    const question: Question = {
      id: 'q-1',
      title: 'Sum Array',
      description: 'Return the sum of an array',
      difficulty: 'easy',
      tags: ['arrays'],
      starterCodes: [sc],
      testCases: [tc],
    };
    expect(question.difficulty).toBe('easy');
    expect(question.testCases).toHaveLength(1);
    expect(question.starterCodes).toHaveLength(1);
  });

  it('creates a valid InterviewSession', () => {
    const session: InterviewSession = {
      id: 's-1',
      questionId: 'q-1',
      code: 'console.log(1)',
      status: 'active',
      startedAt: new Date(),
      endedAt: null,
    };
    expect(session.status).toBe('active');
    expect(session.endedAt).toBeNull();
  });

  it('creates a valid SessionMessage', () => {
    const msg: SessionMessage = {
      id: 'm-1',
      sessionId: 's-1',
      role: 'assistant',
      content: 'Can you explain your approach?',
      messageType: 'feedback',
      createdAt: new Date(),
    };
    expect(msg.role).toBe('assistant');
  });

  it('creates valid CodeExecution types', () => {
    const req: CodeExecutionRequest = {
      language: 'javascript',
      code: 'console.log(1)',
      input: '',
    };
    const res: CodeExecutionResult = {
      stdout: '1\n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    };
    expect(req.language).toBe('javascript');
    expect(res.exitCode).toBe(0);
  });

  it('creates a valid TestCaseResult', () => {
    const result: TestCaseResult = {
      testCaseId: 'tc-1',
      passed: true,
      actualOutput: '6',
      expectedOutput: '6',
      error: null,
    };
    expect(result.passed).toBe(true);
    expect(result.error).toBeNull();
  });

  it('includes csharp in SupportedLanguage type', () => {
    const lang: SupportedLanguage = 'csharp';
    expect(lang).toBe('csharp');
  });

  it('SUPPORTED_LANGUAGES includes C# with correct monacoId', () => {
    const csharp = SUPPORTED_LANGUAGES.find((l) => l.id === 'csharp');
    expect(csharp).toBeDefined();
    expect(csharp!.label).toBe('C#');
    expect(csharp!.monacoId).toBe('csharp');
  });

  it('SUPPORTED_LANGUAGES contains all three languages', () => {
    const ids = SUPPORTED_LANGUAGES.map((l) => l.id);
    expect(ids).toContain('typescript');
    expect(ids).toContain('javascript');
    expect(ids).toContain('csharp');
    expect(SUPPORTED_LANGUAGES).toHaveLength(3);
  });

  it('EXECUTABLE_LANGUAGES includes js and ts but not csharp', () => {
    expect(EXECUTABLE_LANGUAGES.has('typescript')).toBe(true);
    expect(EXECUTABLE_LANGUAGES.has('javascript')).toBe(true);
    expect(EXECUTABLE_LANGUAGES.has('csharp')).toBe(false);
  });

  it('creates a valid StarterCode with csharp language', () => {
    const sc: StarterCode = {
      id: 'sc-csharp',
      language: 'csharp',
      code: 'public class Solution { }',
    };
    expect(sc.language).toBe('csharp');
  });
});
