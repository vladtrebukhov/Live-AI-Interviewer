import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecuteInBrowser } = vi.hoisted(() => ({
  mockExecuteInBrowser: vi.fn(),
}));

vi.mock('../nodepod-runner.js', () => ({
  executeInBrowser: mockExecuteInBrowser,
}));

describe('runTestCasesInBrowser', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns pass/fail results by comparing trimmed stdout to trimmed expected output', async () => {
    mockExecuteInBrowser
      .mockResolvedValueOnce({
        stdout: '6\n',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      })
      .mockResolvedValueOnce({
        stdout: '7\n',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      });

    const { runTestCasesInBrowser } = await import('../run-tests.js');

    const results = await runTestCasesInBrowser('typescript', 'solution code', [
      { id: 'tc-1', questionId: 'q-1', input: 'a', expectedOutput: '6', isHidden: false },
      { id: 'tc-2', questionId: 'q-1', input: 'b', expectedOutput: '8', isHidden: false },
    ]);

    expect(results).toEqual([
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
        actualOutput: '7',
        expectedOutput: '8',
        error: null,
      },
    ]);
  });

  it('surfaces stderr as test error and preserves original expected output value', async () => {
    mockExecuteInBrowser.mockResolvedValue({
      stdout: 'wrong\n',
      stderr: 'RuntimeError: boom\n',
      exitCode: 1,
      timedOut: false,
    });

    const { runTestCasesInBrowser } = await import('../run-tests.js');

    const [result] = await runTestCasesInBrowser('javascript', 'solution code', [
      { id: 'tc-err', questionId: 'q-1', input: '', expectedOutput: ' expected ', isHidden: true },
    ]);

    expect(result).toEqual({
      testCaseId: 'tc-err',
      passed: false,
      actualOutput: 'wrong',
      expectedOutput: ' expected ',
      error: 'RuntimeError: boom',
    });
  });

  it('uses timeout message when execution timed out and stderr is empty', async () => {
    mockExecuteInBrowser.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 1,
      timedOut: true,
    });

    const { runTestCasesInBrowser } = await import('../run-tests.js');

    const [result] = await runTestCasesInBrowser('typescript', 'solution code', [
      { id: 'tc-timeout', questionId: 'q-1', input: '', expectedOutput: '', isHidden: true },
    ]);

    expect(result.error).toBe('Execution timed out');
    expect(result.passed).toBe(false);
  });

  it('fails when output matches but process exits non-zero with no stderr', async () => {
    mockExecuteInBrowser.mockResolvedValue({
      stdout: 'ok\n',
      stderr: '',
      exitCode: 2,
      timedOut: false,
    });

    const { runTestCasesInBrowser } = await import('../run-tests.js');

    const [result] = await runTestCasesInBrowser('javascript', 'solution code', [
      { id: 'tc-exit', questionId: 'q-1', input: '', expectedOutput: 'ok', isHidden: false },
    ]);

    expect(result).toEqual({
      testCaseId: 'tc-exit',
      passed: false,
      actualOutput: 'ok',
      expectedOutput: 'ok',
      error: 'Process exited with code 2',
    });
  });

  it('captures execution exceptions as failed test results', async () => {
    mockExecuteInBrowser.mockRejectedValue(new Error('Nodepod unavailable'));

    const { runTestCasesInBrowser } = await import('../run-tests.js');

    const [result] = await runTestCasesInBrowser('javascript', 'solution code', [
      { id: 'tc-ex', questionId: 'q-1', input: '', expectedOutput: 'x', isHidden: false },
    ]);

    expect(result).toEqual({
      testCaseId: 'tc-ex',
      passed: false,
      actualOutput: '',
      expectedOutput: 'x',
      error: 'Nodepod unavailable',
    });
  });
});