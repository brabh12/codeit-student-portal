import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePyodide } from '@/hooks/use-pyodide';
import {
  Play,
  SendHorizonal,
  Loader2,
  CheckCircle2,
  XCircle,
  Terminal,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

// Lazy-load Monaco so it doesn't inflate the initial bundle
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

type TestCase = { input: string; expected: string };
type TestResult = {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  error?: string;
};

interface PythonEditorProps {
  questionId: string;
  starterCode: string;
  testCases: TestCase[];
  onSubmit: (code: string, isCorrect: boolean, passingCount: number) => void;
  existingCode?: string;
  readOnly?: boolean;
}

export function PythonEditor({
  questionId,
  starterCode,
  testCases,
  onSubmit,
  existingCode,
  readOnly = false,
}: PythonEditorProps) {
  const defaultCode = existingCode || starterCode || '# Write your Python code here\n';
  const [code, setCode] = useState(defaultCode);
  const [output, setOutput] = useState<string | null>(null);
  const [outputType, setOutputType] = useState<'run' | 'test' | 'error' | 'timeout'>('run');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const { status, runCode, runTests, ensureLoaded } = usePyodide();

  // Trigger Pyodide loading as soon as this component mounts
  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  // Reset when navigating to a different question
  useEffect(() => {
    setCode(existingCode || starterCode || '# Write your Python code here\n');
    setOutput(null);
    setTestResults([]);
    setSubmitted(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  // Scroll output into view whenever it changes
  useEffect(() => {
    if (output !== null || testResults.length > 0) {
      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [output, testResults]);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setOutput(null);
    setTestResults([]);

    const res = await runCode(code);
    setIsRunning(false);

    if (res.timedOut) {
      setOutputType('timeout');
      setOutput('⏱  Execution timed out (9 s limit).\nCheck for infinite loops or very slow operations.');
      return;
    }

    const hasError = Boolean(res.stderr && !res.stdout);
    setOutputType(hasError ? 'error' : 'run');

    const parts: string[] = [];
    if (res.stdout) parts.push(res.stdout);
    if (res.result && res.result !== 'None') parts.push(`→ ${res.result}`);
    if (res.stderr) parts.push(`\n⚠  ${res.stderr}`);
    setOutput(parts.join('\n') || '(no output)');
  }, [code, runCode, isRunning]);

  const handleSubmit = useCallback(async () => {
    if (isRunning) return;

    // No test cases defined — just capture the code
    if (!testCases || testCases.length === 0) {
      setSubmitted(true);
      onSubmit(code, false, 0);
      return;
    }

    setIsRunning(true);
    setOutput(null);
    setTestResults([]);

    const res = await runTests(code, testCases);
    setIsRunning(false);

    if (res.timedOut) {
      setOutputType('timeout');
      setOutput('⏱  Execution timed out (9 s limit).\nCheck for infinite loops or very slow operations.');
      return;
    }

    setTestResults(res.results);
    setOutputType('test');
    setOutput(null);

    const passing = res.results.filter((r) => r.passed).length;
    const allPass = passing === testCases.length;
    setSubmitted(true);
    onSubmit(code, allPass, passing);
  }, [code, testCases, runTests, onSubmit, isRunning]);

  const isLoading = status === 'idle' || status === 'loading';

  const consoleClasses =
    outputType === 'error' || outputType === 'timeout'
      ? 'text-red-400'
      : 'text-emerald-300';

  const allPassed = testResults.length > 0 && testResults.every((r) => r.passed);
  const passingCount = testResults.filter((r) => r.passed).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Status + action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Badge variant="secondary" className="gap-1.5 text-xs py-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading Python runtime…
            </Badge>
          ) : status === 'running' ? (
            <Badge variant="secondary" className="gap-1.5 text-xs py-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running…
            </Badge>
          ) : status === 'error' ? (
            <Badge variant="destructive" className="gap-1.5 text-xs py-1">
              <AlertTriangle className="h-3 w-3" />
              Runtime error
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1.5 text-xs py-1 text-emerald-600 border-emerald-600/50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              Python 3 ready
            </Badge>
          )}

          {submitted && (
            <Badge
              variant={allPassed ? 'default' : 'secondary'}
              className="gap-1.5 text-xs py-1"
            >
              {allPassed ? (
                <><CheckCircle2 className="h-3 w-3" /> Submitted — all passed</>
              ) : (
                <>{passingCount}/{testCases.length} test cases passed</>
              )}
            </Badge>
          )}
        </div>

        {!readOnly && (
          <div className="flex gap-2">
            {/* Reset to starter */}
            <Button
              variant="ghost"
              size="sm"
              title="Reset to starter code"
              onClick={() => {
                setCode(starterCode || '# Write your Python code here\n');
                setOutput(null);
                setTestResults([]);
              }}
              disabled={isRunning}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRun}
              disabled={isRunning || isLoading}
              id="python-run-btn"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Play className="h-4 w-4 mr-1.5" />
              )}
              Run
            </Button>

            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isRunning || isLoading}
              className="bg-primary"
              id="python-submit-btn"
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <SendHorizonal className="h-4 w-4 mr-1.5" />
              )}
              Submit Answer
            </Button>
          </div>
        )}
      </div>

      {/* Code Editor */}
      <div
        className="border rounded-xl overflow-hidden shadow-lg"
        style={{ height: '300px' }}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-slate-400 text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading editor…
            </div>
          }
        >
          <MonacoEditor
            height="300px"
            language="python"
            theme="vs-dark"
            value={code}
            onChange={(v) => {
              if (!readOnly) setCode(v ?? '');
            }}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              readOnly,
              renderLineHighlight: 'line',
              tabSize: 4,
              insertSpaces: true,
              fontFamily:
                "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
              fontLigatures: true,
              cursorBlinking: 'smooth',
              smoothScrolling: true,
              bracketPairColorization: { enabled: true },
              padding: { top: 12, bottom: 12 },
            }}
          />
        </Suspense>
      </div>

      {/* Console Output */}
      {(output !== null || isRunning) && (
        <div
          ref={outputRef}
          className="rounded-xl bg-[#0d1117] border border-slate-700/60 p-4 font-mono text-sm min-h-[90px] shadow-inner"
        >
          <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-3">
            <Terminal className="h-3.5 w-3.5" />
            <span>Output</span>
          </div>
          {isRunning ? (
            <div className="text-slate-400 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…
            </div>
          ) : (
            <pre
              className={`whitespace-pre-wrap text-xs leading-relaxed ${consoleClasses}`}
            >
              {output}
            </pre>
          )}
        </div>
      )}

      {/* Test Results panel */}
      {testResults.length > 0 && (
        <div ref={outputRef} className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Test Results</span>
            <Badge
              variant={allPassed ? 'default' : 'destructive'}
              className="gap-1 text-xs"
            >
              {passingCount} / {testResults.length} passed
            </Badge>
          </div>

          <div className="space-y-2">
            {testResults.map((r, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 text-xs font-mono space-y-1.5 transition-colors ${
                  r.passed
                    ? 'border-emerald-600/30 bg-emerald-950/20'
                    : 'border-red-600/30 bg-red-950/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  {r.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className="font-semibold text-slate-200">
                    Test {i + 1}
                  </span>
                  {r.passed && (
                    <span className="text-emerald-400 text-[10px]">PASSED</span>
                  )}
                  {!r.passed && (
                    <span className="text-red-400 text-[10px]">FAILED</span>
                  )}
                </div>

                {r.input && r.input.trim() !== '' && (
                  <div className="text-slate-500">
                    Input:{' '}
                    <span className="text-slate-300 bg-slate-800/60 px-1 rounded">
                      {r.input}
                    </span>
                  </div>
                )}

                <div className="text-slate-500">
                  Expected:{' '}
                  <span className="text-emerald-300 bg-emerald-900/20 px-1 rounded">
                    {r.expected}
                  </span>
                </div>

                {!r.passed && (
                  <div className="text-slate-500">
                    Got:{' '}
                    <span className="text-red-400 bg-red-900/20 px-1 rounded">
                      {r.error
                        ? `Error — ${r.error.split('\n').slice(-1)[0]}`
                        : r.actual || '(no output)'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hint when there are no test cases */}
      {testCases.length === 0 && !readOnly && (
        <p className="text-xs text-muted-foreground text-center pb-1">
          No test cases defined — your code will be saved but not auto-graded.
        </p>
      )}
    </div>
  );
}
