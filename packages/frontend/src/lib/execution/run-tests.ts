import type { SupportedLanguage, TestCase, TestCaseResult } from '@agentsgalore/shared';
import { executeInBrowser } from './nodepod-runner';

export async function runTestCasesInBrowser(
  language: SupportedLanguage,
  code: string,
  testCases: TestCase[],
): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];

  for (const testCase of testCases) {
    try {
      const execution = await executeInBrowser(language, code, testCase.input);
      const actualOutput = execution.stdout.trim();
      const expectedOutput = testCase.expectedOutput.trim();
      const trimmedStderr = execution.stderr.trim();
      const passed =
        actualOutput === expectedOutput &&
        !execution.timedOut &&
        trimmedStderr.length === 0 &&
        execution.exitCode === 0;

      results.push({
        testCaseId: testCase.id,
        passed,
        actualOutput,
        expectedOutput: testCase.expectedOutput,
        error:
          execution.timedOut
            ? 'Execution timed out'
            : trimmedStderr || (execution.exitCode !== 0 ? `Process exited with code ${execution.exitCode}` : null),
      });
    } catch (error) {
      results.push({
        testCaseId: testCase.id,
        passed: false,
        actualOutput: '',
        expectedOutput: testCase.expectedOutput,
        error: error instanceof Error ? error.message : 'Unknown execution error',
      });
    }
  }

  return results;
}
