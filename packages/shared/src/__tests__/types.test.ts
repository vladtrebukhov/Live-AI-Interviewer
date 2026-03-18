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
} from '../index.js';

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
});
