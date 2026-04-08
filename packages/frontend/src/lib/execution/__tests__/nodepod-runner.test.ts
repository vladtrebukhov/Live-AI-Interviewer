import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockBoot } = vi.hoisted(() => ({
  mockBoot: vi.fn(),
}));

vi.mock('@scelar/nodepod', () => ({
  Nodepod: {
    boot: mockBoot,
  },
}));

describe('executeInBrowser', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns unsupported language error for non-js/ts languages', async () => {
    const { executeInBrowser } = await import('../nodepod-runner.js');

    const result = await executeInBrowser('python' as never, 'print("hi")');

    expect(result).toEqual({
      stdout: '',
      stderr: 'Unsupported language: python',
      exitCode: 1,
      timedOut: false,
    });
    expect(mockBoot).not.toHaveBeenCalled();
  });

  it('returns unsupported language error for csharp', async () => {
    const { executeInBrowser } = await import('../nodepod-runner.js');

    const result = await executeInBrowser('csharp' as never, 'Console.WriteLine("hi");');

    expect(result).toEqual({
      stdout: '',
      stderr: 'Unsupported language: csharp',
      exitCode: 1,
      timedOut: false,
    });
    expect(mockBoot).not.toHaveBeenCalled();
  });

  it('executes JavaScript code and returns process output', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const spawn = vi.fn().mockResolvedValue({
      completion: Promise.resolve({
        stdout: '42\n',
        stderr: '',
        exitCode: 0,
      }),
    });

    mockBoot.mockResolvedValue({
      fs: { writeFile },
      spawn,
    });

    const { executeInBrowser } = await import('../nodepod-runner.js');

    const result = await executeInBrowser('javascript', 'console.log(42);', 'stdin-value');

    expect(mockBoot).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('node', ['/main.js']);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toBe('/main.js');
    expect(writeFile.mock.calls[0][1]).toContain('const __AG_INPUT = "stdin-value";');
    expect(writeFile.mock.calls[0][1]).toContain('console.log(42);');
    expect(result).toEqual({
      stdout: '42\n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    });
  });

  it('boots Nodepod runtime only once and reuses it across executions', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const spawn = vi
      .fn()
      .mockResolvedValueOnce({
        completion: Promise.resolve({ stdout: 'first\n', stderr: '', exitCode: 0 }),
      })
      .mockResolvedValueOnce({
        completion: Promise.resolve({ stdout: 'second\n', stderr: '', exitCode: 0 }),
      });

    mockBoot.mockResolvedValue({
      fs: { writeFile },
      spawn,
    });

    const { executeInBrowser } = await import('../nodepod-runner.js');

    const first = await executeInBrowser('typescript', 'console.log("first")');
    const second = await executeInBrowser('javascript', 'console.log("second")');

    expect(mockBoot).toHaveBeenCalledTimes(1);
    expect(first.stdout).toBe('first\n');
    expect(second.stdout).toBe('second\n');
    expect(writeFile.mock.calls[0][0]).toBe('/main.js');
    expect(writeFile.mock.calls[1][0]).toBe('/main.js');
  });

  it('transpiles TypeScript syntax before execution', async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const spawn = vi.fn().mockResolvedValue({
      completion: Promise.resolve({
        stdout: '1\n',
        stderr: '',
        exitCode: 0,
      }),
    });

    mockBoot.mockResolvedValue({
      fs: { writeFile },
      spawn,
    });

    const { executeInBrowser } = await import('../nodepod-runner.js');

    const result = await executeInBrowser('typescript', 'const x: number = 1; console.log(x);');

    expect(spawn).toHaveBeenCalledWith('node', ['/main.js']);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toBe('/main.js');
    expect(writeFile.mock.calls[0][1]).not.toContain(': number');
    expect(result).toEqual({
      stdout: '1\n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    });
  });

  it('returns a timeout result when process does not complete in time', async () => {
    vi.useFakeTimers();

    const kill = vi.fn().mockResolvedValue(undefined);

    mockBoot.mockResolvedValue({
      fs: { writeFile: vi.fn().mockResolvedValue(undefined) },
      spawn: vi.fn().mockResolvedValue({
        kill,
        completion: new Promise(() => {
          // Intentionally unresolved to trigger timeout.
        }),
      }),
    });

    const { executeInBrowser } = await import('../nodepod-runner.js');

    const executionPromise = executeInBrowser('javascript', 'while(true){}');
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await executionPromise;

    expect(result).toEqual({
      stdout: '',
      stderr: 'Execution timed out',
      exitCode: 1,
      timedOut: true,
    });
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('resets cached runtime promise when boot fails so a later call can retry', async () => {
    mockBoot.mockRejectedValueOnce(new Error('boot failed')).mockResolvedValueOnce({
      fs: { writeFile: vi.fn().mockResolvedValue(undefined) },
      spawn: vi.fn().mockResolvedValue({
        completion: Promise.resolve({ stdout: 'ok\n', stderr: '', exitCode: 0 }),
      }),
    });

    const { executeInBrowser } = await import('../nodepod-runner.js');

    await expect(executeInBrowser('javascript', 'console.log("first")')).rejects.toThrow(
      'boot failed',
    );

    const second = await executeInBrowser('javascript', 'console.log("ok")');

    expect(mockBoot).toHaveBeenCalledTimes(2);
    expect(second.stdout).toBe('ok\n');
  });
});
