import { useRef, useCallback, useState } from 'react';

type RunResult = {
  stdout: string;
  stderr: string;
  result: string | null;
  timedOut?: boolean;
};

type TestCaseInput = { input: string; expected: string };

type TestResult = {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  error?: string;
};

type TestsResult = {
  results: TestResult[];
  timedOut?: boolean;
};

type PyodideStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

const TIMEOUT_MS = 9000; // 9s — enough for first Pyodide load plus execution

export function usePyodide() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<PyodideStatus>('idle');
  const pendingRef = useRef<
    Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>
  >(new Map());
  const idCounter = useRef(0);
  // Track whether we've already kicked off loading (survives re-renders)
  const loadStartedRef = useRef(false);

  /** Lazily create the classic worker (importScripts-compatible). */
  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      // The worker file is loaded as a URL at build time via ?worker&url
      // For Vite we inline it via the Worker constructor with type:'classic'
      workerRef.current = new Worker(
        new URL('../workers/python.worker.ts', import.meta.url),
        { type: 'classic' } // MUST be classic so importScripts() works inside
      );

      workerRef.current.onmessage = (e: MessageEvent) => {
        const { id, status: msgStatus, ...rest } = e.data;
        if (!id) return; // ignore bare status broadcasts
        const pending = pendingRef.current.get(id);
        if (pending) {
          pendingRef.current.delete(id);
          pending.resolve({ status: msgStatus, ...rest });
        }
      };

      workerRef.current.onerror = (e) => {
        console.error('[python worker] onerror', e.message);
        pendingRef.current.forEach((p) => p.reject(new Error(e.message)));
        pendingRef.current.clear();
        // Don't null-out the worker here; the next send will recreate it
      };
    }
    return workerRef.current;
  }, []);

  /** Send a message to the worker and return a promise that resolves with the reply. */
  const send = useCallback(
    (payload: object): Promise<any> => {
      const id = String(++idCounter.current);
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRef.current.delete(id);
          // Terminate the frozen worker so future calls get a fresh one
          if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
            loadStartedRef.current = false; // allow re-init
          }
          reject(new Error('__TIMEOUT__'));
        }, TIMEOUT_MS);

        pendingRef.current.set(id, {
          resolve: (v) => {
            clearTimeout(timeoutId);
            resolve(v);
          },
          reject: (err) => {
            clearTimeout(timeoutId);
            reject(err);
          },
        });

        getWorker().postMessage({ id, ...payload });
      });
    },
    [getWorker]
  );

  /** Run arbitrary Python code and return stdout/stderr/result. */
  const runCode = useCallback(
    async (code: string): Promise<RunResult> => {
      setStatus('running');
      try {
        const result = await send({ type: 'run', code });
        setStatus('ready');
        return {
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
          result: result.result ?? null,
        };
      } catch (e: any) {
        setStatus('ready');
        if (e.message === '__TIMEOUT__') {
          return { stdout: '', stderr: '', result: null, timedOut: true };
        }
        return { stdout: '', stderr: String(e.message), result: null };
      }
    },
    [send]
  );

  /** Run student code against an array of test cases. */
  const runTests = useCallback(
    async (
      code: string,
      testCases: TestCaseInput[]
    ): Promise<TestsResult> => {
      setStatus('running');
      try {
        const res = await send({ type: 'test', code, testCases });
        setStatus('ready');
        return { results: res.results ?? [] };
      } catch (e: any) {
        setStatus('ready');
        if (e.message === '__TIMEOUT__') return { results: [], timedOut: true };
        return { results: [] };
      }
    },
    [send]
  );

  /**
   * Trigger Pyodide loading in the background.
   * Safe to call multiple times — only fires once.
   */
  const ensureLoaded = useCallback(() => {
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    setStatus('loading');
    send({ type: 'run', code: 'pass' })
      .then(() => setStatus('ready'))
      .catch(() => {
        loadStartedRef.current = false;
        setStatus('error');
      });
  }, [send]); // `send` is stable (useCallback with no deps that changes)

  return { status, runCode, runTests, ensureLoaded };
}
