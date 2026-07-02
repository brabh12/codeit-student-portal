import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Trophy,
  ArrowLeft,
  Code2,
  Loader2,
} from 'lucide-react';

// Lazy-load Monaco for read-only code review in results
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

type QuestionData = {
  type: 'mcq' | 'true_false' | 'python_code';
  question_text: string;
  correct_answer: string;
  points_base: number;
  options: string[] | null;
  test_cases: { input: string; expected: string }[] | null;
  order_index: number;
};

type AnswerRow = {
  question_id: string;
  student_answer: string | null;
  is_correct: boolean | null;
  points_awarded: number;
  time_taken_seconds: number | null;
  passing_test_cases: number | null;
  // Supabase returns joined 1-to-1 relations as an object (not array) when using foreign key fk
  questions: QuestionData;
};

export function QuizResults() {
  const { quizId } = useParams<{ quizId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [quizTitle, setQuizTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!quizId || !user) return;

    async function load() {
      setLoading(true);

      // Fetch quiz title
      const { data: qData } = await supabase
        .from('quizzes')
        .select('title')
        .eq('id', quizId)
        .single();
      if (qData) setQuizTitle(qData.title);

      // Fetch attempt
      const { data: attempt } = await supabase
        .from('attempts')
        .select('id, status, submitted_at')
        .eq('quiz_id', quizId)
        .eq('student_id', user!.id)
        .single();

      if (!attempt) {
        setLoading(false);
        return;
      }

      // Fetch answers with joined question data
      const { data: ansRows } = await supabase
        .from('answers')
        .select(`
          question_id,
          student_answer,
          is_correct,
          points_awarded,
          time_taken_seconds,
          passing_test_cases,
          questions (
            type,
            question_text,
            correct_answer,
            points_base,
            options,
            test_cases,
            order_index
          )
        `)
        .eq('attempt_id', attempt.id)
        .order('questions(order_index)', { ascending: true });

      if (ansRows) {
        const sorted = [...(ansRows as unknown as AnswerRow[])].sort(
          (a, b) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0)
        );
        setAnswers(sorted);
      }
      setLoading(false);
    }

    load();
  }, [quizId, user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading results…
      </div>
    );
  }

  const totalPoints = answers.reduce((s, a) => s + (a.points_awarded ?? 0), 0);
  const maxPoints = answers.reduce((s, a) => s + (a.questions?.points_base ?? 0), 0);
  const correctCount = answers.filter((a) => a.is_correct === true).length;
  const pct = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/student')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
        </Button>
        <h1 className="font-bold text-xl flex-1 truncate">{quizTitle} — Results</h1>
      </div>

      {/* Score summary */}
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-3xl font-bold">{totalPoints} / {maxPoints}</p>
                <p className="text-sm text-muted-foreground">{correctCount}/{answers.length} questions correct</p>
              </div>
            </div>
            <Badge
              className="text-lg px-4 py-2"
              variant={pct >= 50 ? 'default' : 'destructive'}
            >
              {pct}%
            </Badge>
          </div>
          <Progress value={pct} className="h-3" />
        </CardContent>
      </Card>

      {/* Per-question breakdown */}
      <div className="space-y-4">
        {answers.map((a, i) => {
          const q = a.questions;
          if (!q) return null;
          const isPython = q.type === 'python_code';
          const isExpanded = expandedCode === a.question_id;

          return (
            <Card
              key={a.question_id}
              className={`border-l-4 ${
                a.is_correct === true
                  ? 'border-l-emerald-500'
                  : a.is_correct === false
                  ? 'border-l-red-500'
                  : 'border-l-muted'
              }`}
            >
              <CardHeader className="py-3 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {q.type === 'mcq'
                        ? 'Multiple Choice'
                        : q.type === 'true_false'
                        ? 'True / False'
                        : 'Python Code'}
                    </Badge>
                    {isPython && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Code2 className="h-3 w-3" /> Code
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {a.is_correct === true ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : a.is_correct === false ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <span className="text-xs text-muted-foreground">not answered</span>
                    )}
                    <span className="text-sm font-semibold">
                      {a.points_awarded ?? 0}/{q.points_base} pts
                    </span>
                  </div>
                </div>
                <CardTitle className="text-sm font-medium leading-relaxed mt-2">
                  Q{i + 1}. {q.question_text}
                </CardTitle>
              </CardHeader>

              <CardContent className="pt-3 space-y-2 text-sm">
                {/* MCQ / True-False */}
                {!isPython && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-32 shrink-0">Your answer:</span>
                      <span
                        className={
                          a.is_correct === true
                            ? 'text-emerald-600 font-medium'
                            : 'text-red-500 font-medium'
                        }
                      >
                        {a.student_answer ?? '—'}
                      </span>
                    </div>
                    {a.is_correct !== true && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-32 shrink-0">Correct answer:</span>
                        <span className="text-emerald-600 font-medium">{q.correct_answer}</span>
                      </div>
                    )}
                  </>
                )}

                {/* Python code */}
                {isPython && (
                  <div className="space-y-2">
                    {/* Partial credit info */}
                    {a.passing_test_cases !== null && q.test_cases && q.test_cases.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            a.is_correct
                              ? 'default'
                              : a.passing_test_cases > 0
                              ? 'secondary'
                              : 'destructive'
                          }
                          className="text-xs"
                        >
                          {a.passing_test_cases}/{q.test_cases.length} test cases passed
                        </Badge>
                      </div>
                    )}
                    {!a.student_answer && (
                      <p className="text-muted-foreground text-xs">No code submitted.</p>
                    )}
                    {a.student_answer && (
                      <div>
                        <button
                          className="text-xs text-primary underline hover:no-underline"
                          onClick={() =>
                            setExpandedCode(isExpanded ? null : a.question_id)
                          }
                        >
                          {isExpanded ? 'Hide code' : 'View submitted code'}
                        </button>
                        {isExpanded && (
                          <div
                            className="mt-2 border rounded-xl overflow-hidden shadow-md"
                            style={{ height: '220px' }}
                          >
                            <Suspense
                              fallback={
                                <div className="h-full bg-[#1e1e1e] flex items-center justify-center text-slate-400 text-sm gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                </div>
                              }
                            >
                              <MonacoEditor
                                height="220px"
                                language="python"
                                theme="vs-dark"
                                value={a.student_answer}
                                options={{
                                  readOnly: true,
                                  fontSize: 13,
                                  minimap: { enabled: false },
                                  scrollBeyondLastLine: false,
                                  lineNumbers: 'on',
                                  padding: { top: 8 },
                                  fontFamily:
                                    "'JetBrains Mono', 'Fira Code', monospace",
                                }}
                              />
                            </Suspense>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Timing */}
                {a.time_taken_seconds !== null && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                    <Clock className="h-3 w-3" />
                    {a.time_taken_seconds}s spent on this question
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {answers.length === 0 && (
        <div className="text-center text-muted-foreground py-12">
          No results found for this quiz.
        </div>
      )}
    </div>
  );
}