// Pyodide Web Worker — CLASSIC worker (importScripts compatible)
// Loaded lazily via usePyodide hook. Executes Python code without blocking the main thread.

/* eslint-disable no-restricted-globals */
// Cast self to any — this is a classic Web Worker, not an ES module worker.
// DedicatedWorkerGlobalScope is available at runtime even though the TS lib doesn't include it.
const ws = self as any; // ws = workerSelf

let pyodideInstance: any = null;
let loadPromise: Promise<any> | null = null;

async function getPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    ws.importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js');
    pyodideInstance = await ws.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/',
    });
    return pyodideInstance;
  })();

  return loadPromise;
}

ws.onmessage = async (e: MessageEvent) => {
  const { id, type, code, testCases } = e.data as {
    id: string;
    type: string;
    code: string;
    testCases?: { input: string; expected: string }[];
  };

  let pyodide: any;
  try {
    pyodide = await getPyodide();
  } catch (err: any) {
    ws.postMessage({
      id,
      status: 'error',
      stdout: '',
      stderr: 'Failed to load Python runtime: ' + (err?.message ?? String(err)),
      result: null,
    });
    return;
  }

  if (type === 'run') {
    const stdout: string[] = [];
    const stderr: string[] = [];

    pyodide.setStdout({ batched: (s: string) => stdout.push(s) });
    pyodide.setStderr({ batched: (s: string) => stderr.push(s) });

    let result: any;
    try {
      result = await pyodide.runPythonAsync(code);
    } catch (err: any) {
      ws.postMessage({
        id,
        status: 'error',
        stdout: stdout.join('\n'),
        stderr: err?.message ?? String(err),
        result: null,
      });
      return;
    }

    ws.postMessage({
      id,
      status: 'ok',
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
      result: result !== undefined && result !== null ? String(result) : null,
    });

  } else if (type === 'test') {
    const results: {
      input: string;
      expected: string;
      actual: string;
      passed: boolean;
      error?: string;
    }[] = [];

    for (const tc of testCases ?? []) {
      const stdout: string[] = [];
      pyodide.setStdout({ batched: (s: string) => stdout.push(s) });
      pyodide.setStderr({ batched: () => {} });

      // Inject stdin mock when input lines are provided
      let runCode: string = code;
      if (tc.input && tc.input.trim() !== '') {
        const inputLines = tc.input
          .split('\n')
          .map((l: string) => JSON.stringify(l))
          .join(', ');
        const stdinMock = `
import sys as _sys
_stdin_lines = [${inputLines}]
_stdin_idx = 0
def _mock_input(prompt=''):
    global _stdin_idx
    if _stdin_idx < len(_stdin_lines):
        val = _stdin_lines[_stdin_idx]
        _stdin_idx += 1
        return val
    return ''
input = _mock_input
`;
        runCode = stdinMock + '\n' + code;
      }

      let actual = '';
      let error: string | undefined;
      try {
        await pyodide.runPythonAsync(runCode);
        actual = stdout.join('\n').trim();
      } catch (err: any) {
        error = err?.message ?? String(err);
        actual = '';
      }

      const expected = (tc.expected ?? '').trim();
      results.push({
        input: tc.input,
        expected,
        actual,
        passed: !error && actual === expected,
        error,
      });
    }

    ws.postMessage({ id, status: 'tested', results });

  } else {
    ws.postMessage({ id, status: 'ok', stdout: '', stderr: '', result: null });
  }
};
