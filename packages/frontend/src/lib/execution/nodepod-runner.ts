import { Nodepod } from '@scelar/nodepod';
import type { SupportedLanguage } from '@live-interviewer/shared';
import ts from 'typescript';

type NodepodRuntime = Awaited<ReturnType<typeof Nodepod.boot>>;
type SpawnedProcess = Awaited<ReturnType<NodepodRuntime['spawn']>>;

export interface BrowserExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

const EXECUTION_TIMEOUT_MS = 10_000;
const ALLOWED_LANGUAGES = new Set<SupportedLanguage>(['javascript', 'typescript']);

let runtimePromise: Promise<NodepodRuntime> | null = null;

async function getRuntime(): Promise<NodepodRuntime> {
  if (!runtimePromise) {
    runtimePromise = Nodepod.boot().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

function transpileTypeScriptToJavaScript(source: string): { outputText: string; error: string | null } {
  const transpileResult = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: false,
    },
    reportDiagnostics: true,
  });

  const diagnostics = transpileResult.diagnostics ?? [];
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

  if (errors.length === 0) {
    return { outputText: transpileResult.outputText, error: null };
  }

  const errorText = errors
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    .join('\n');

  return {
    outputText: '',
    error: errorText || 'TypeScript transpilation failed',
  };
}

async function terminateProcess(proc: SpawnedProcess): Promise<void> {
  const processWithTerminate = proc as {
    kill?: () => void | Promise<void>;
    terminate?: () => void | Promise<void>;
  };

  try {
    if (typeof processWithTerminate.kill === 'function') {
      await processWithTerminate.kill();
      return;
    }

    if (typeof processWithTerminate.terminate === 'function') {
      await processWithTerminate.terminate();
    }
  } catch {
    // Ignore cleanup errors on timeout best-effort termination.
  }
}

function createWrappedCode(code: string, input: string): string {
  return `
const __AG_INPUT = ${JSON.stringify(input)};
const __agFs = require('node:fs');
const __agReadFileSync = __agFs.readFileSync.bind(__agFs);
__agFs.readFileSync = (...args) => {
  const target = args[0];
  if (target === 0 || target === '/dev/stdin') {
    return __AG_INPUT;
  }
  return __agReadFileSync(...args);
};
${code}
`;
}

export async function executeInBrowser(
  language: SupportedLanguage,
  code: string,
  input = '',
): Promise<BrowserExecutionResult> {
  if (!ALLOWED_LANGUAGES.has(language)) {
    return {
      stdout: '',
      stderr: `Unsupported language: ${language}`,
      exitCode: 1,
      timedOut: false,
    };
  }

  const runtime = await getRuntime();
  const wrappedCode = createWrappedCode(code, input);

  let executableCode = wrappedCode;
  if (language === 'typescript') {
    const transpilation = transpileTypeScriptToJavaScript(wrappedCode);
    if (transpilation.error) {
      return {
        stdout: '',
        stderr: transpilation.error,
        exitCode: 1,
        timedOut: false,
      };
    }

    executableCode = transpilation.outputText;
  }

  const fileName = '/main.js';
  await runtime.fs.writeFile(fileName, executableCode);

  const proc = await runtime.spawn('node', [fileName]);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<'timed_out'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timed_out'), EXECUTION_TIMEOUT_MS);
  });

  const completion = proc.completion.then((result) => ({ status: 'completed' as const, result }));
  const status = await Promise.race([completion, timeout]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (status === 'timed_out') {
    await terminateProcess(proc);
    return {
      stdout: '',
      stderr: 'Execution timed out',
      exitCode: 1,
      timedOut: true,
    };
  }

  return {
    stdout: status.result.stdout,
    stderr: status.result.stderr,
    exitCode: status.result.exitCode,
    timedOut: false,
  };
}
