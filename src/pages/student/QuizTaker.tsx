import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PythonEditor } from '@/components/python/PythonEditor';

type Question = {
  id: string;
  type: 'mcq' | 'true_false' | 'python_code';
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  points_base: number;
  code_starter: string | null;
  order_index: number;
};

type Quiz = {
  id: string;
  title: string;
  duration_seconds: number | null;
  open_at: string | null;
  close_at: string | null;
};

function GlobalTimer({
  seconds,
  onExpire,
}: {
  seconds: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => {
      setRemaining(prev => {
        const next = prev - 1;
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(id);
          onExpire();
        }
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [seconds, onExpire]);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pct = seconds > 0 ? (remaining / seconds) * 100 : 100;
  const urgent = remaining < 60;

  return (
    <div className={`flex flex-col gap-1 ${urgent ? 'text-red-500' : 'text-foreground'}`}>
      <div className="flex items-center gap-2 font-mono font-semibold text-lg">
        <Clock className={`h-5 w-5 ${urgent ? 'animate-pulse' : ''}`} />
        {h > 0 ? `${h}:` : ''}{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </div>
      <Progress value={pct} className={`h-1.5 ${urgent ? '[&>div]:bg-red-500' : ''}`} />
    </div>
  );
}

export function QuizTaker() {
  const { quizId } = useParams<{ quizId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // questionId -> answer
  const [timings, setTimings] = useState<Record<string, number>>({}); // questionId -> seconds
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  // Tracks python question grading: questionId -> { isCorrect, passingCount, code }
  const [pythonGrades, setPythonGrades] = useState<Record<string, { isCorrect: boolean; passingCount: number; code: string }>>({});

  // Load quiz & create/resume attempt
  useEffect(() => {
    if (!quizId || !user) return;

    async function init() {
      setLoading(true);

      // 1. Fetch quiz (RLS will block if outside window)
      const { data: qData, error: qErr } = await supabase
        .from('quizzes')
        .select('id, title, duration_seconds, open_at, close_at')
        .eq('id', quizId)
        .single();

      if (qErr || !qData) {
        setError('Quiz not found or not currently available.');
        setLoading(false);
        return;
      }

      // Verify window client-side too
      const now = new Date();
      if (qData.close_at && new Date(qData.close_at) < now) {
        setError('This quiz has already closed.');
        setLoading(false);
        return;
      }
      if (qData.open_at && new Date(qData.open_at) > now) {
        setError('This quiz is not open yet.');
        setLoading(false);
        return;
      }

      setQuiz(qData);

      // 2. Fetch questions
      const { data: qsData, error: qsErr } = await supabase
        .from('questions')
        .select('id, type, question_text, options, correct_answer, points_base, code_starter, test_cases, order_index')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true });

      if (qsErr || !qsData || qsData.length === 0) {
        setError('No questions found for this quiz.');
        setLoading(false);
        return;
      }
      setQuestions(qsData as Question[]);

      // 3. Find or create attempt
      const { data: existingAttempt } = await supabase
        .from('attempts')
        .select('id, status')
        .eq('quiz_id', quizId)
        .eq('student_id', user!.id)
        .single();

      if (existingAttempt) {
        if (existingAttempt.status === 'submitted' || existingAttempt.status === 'graded') {
          navigate(`/student/results/${quizId}`, { replace: true });
          return;
        }
        setAttemptId(existingAttempt.id);

        // Load any previously saved answers
        const { data: prevAnswers } = await supabase
          .from('answers')
          .select('question_id, student_answer, time_taken_seconds')
          .eq('attempt_id', existingAttempt.id);

        if (prevAnswers && prevAnswers.length > 0) {
          const ans: Record<string, string> = {};
          const tim: Record<string, number> = {};
          prevAnswers.forEach((a: any) => {
            if (a.student_answer) ans[a.question_id] = a.student_answer;
            if (a.time_taken_seconds) tim[a.question_id] = a.time_taken_seconds;
          });
          setAnswers(ans);
          setTimings(tim);

          // Skip to first unanswered
          const firstUnanswered = qsData.findIndex((q: any) => !ans[q.id]);
          if (firstUnanswered !== -1) setCurrentIdx(firstUnanswered);
        }
      } else {
        // Create new attempt
        const { data: newAttempt, error: aErr } = await supabase
          .from('attempts')
          .insert([{ quiz_id: quizId, student_id: user!.id }])
          .select('id')
          .single();

        if (aErr || !newAttempt) {
          setError('Could not start the quiz. Please try again.');
          setLoading(false);
          return;
        }
        setAttemptId(newAttempt.id);
      }

      setLoading(false);
    }

    init();
  }, [quizId, user, navigate]);

  // Reset question timer when navigating
  useEffect(() => {
    setQuestionStartTime(Date.now());
  }, [currentIdx]);

  const handleSubmit = useCallback(async (forcedAnswers?: Record<string, string>) => {
    if (!attemptId || !quizId || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);

    const finalAnswers = forcedAnswers ?? answers;

    // Calculate time for current question if not yet submitted
    const currentQ = questions[currentIdx];
    const finalTimings = { ...timings };
    if (currentQ && !finalTimings[currentQ.id]) {
      finalTimings[currentQ.id] = Math.round((Date.now() - questionStartTime) / 1000);
    }

    // Build answer rows with grading
    const answerRows = questions.map(q => {
      const studentAns = finalAnswers[q.id] ?? null;
      if (q.type === 'python_code') {
        const pg = pythonGrades[q.id];
        return {
          attempt_id: attemptId,
          question_id: q.id,
          student_answer: pg?.code ?? studentAns,
          is_correct: pg ? pg.isCorrect : null,
          points_awarded: pg?.isCorrect ? q.points_base : 0,
          passing_test_cases: pg?.passingCount ?? null,
          time_taken_seconds: finalTimings[q.id] ?? null,
        };
      }
      const isCorrect = studentAns !== null && studentAns === q.correct_answer;
      return {
        attempt_id: attemptId,
        question_id: q.id,
        student_answer: studentAns,
        is_correct: studentAns !== null ? isCorrect : null,
        points_awarded: isCorrect ? q.points_base : 0,
        time_taken_seconds: finalTimings[q.id] ?? null,
      };
    });

    // Upsert answers
    const { error: ansErr } = await supabase.from('answers').upsert(answerRows, {
      onConflict: 'attempt_id,question_id',
    });

    if (ansErr) {
      toast.error('Failed to submit answers. Please try again.');
      submittedRef.current = false;
      setSubmitting(false);
      return;
    }

    // Mark attempt submitted
    const totalPoints = answerRows.reduce((sum, a) => sum + (a.points_awarded ?? 0), 0);
    const { error: upErr } = await supabase
      .from('attempts')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', attemptId);

    if (upErr) {
      toast.error('Failed to mark quiz as submitted.');
      submittedRef.current = false;
      setSubmitting(false);
      return;
    }

    // Update profile total_points
    const { data: profileData } = await supabase
      .from('profiles')
      .select('total_points')
      .eq('id', user!.id)
      .single();

    if (profileData) {
      await supabase
        .from('profiles')
        .update({ total_points: profileData.total_points + totalPoints })
        .eq('id', user!.id);
    }

    toast.success('Quiz submitted!');
    navigate(`/student/results/${quizId}`, { replace: true });
  }, [attemptId, quizId, answers, questions, currentIdx, timings, questionStartTime, user, navigate]);

  const handleTimerExpire = useCallback(() => {
    toast('Time is up! Auto-submitting…', { icon: '⏰' });
    handleSubmit(answers);
  }, [handleSubmit, answers]);

  const recordCurrentTiming = () => {
    const q = questions[currentIdx];
    if (!q) return;
    setTimings(prev => ({
      ...prev,
      [q.id]: prev[q.id] ?? Math.round((Date.now() - questionStartTime) / 1000),
    }));
  };

  const selectAnswer = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const goNext = () => {
    recordCurrentTiming();
    setCurrentIdx(i => Math.min(i + 1, questions.length - 1));
  };

  const goPrev = () => {
    recordCurrentTiming();
    setCurrentIdx(i => Math.max(i - 1, 0));
  };

  if (loading) return (
    <div className="flex justify-center items-center h-64 text-muted-foreground">Loading quiz…</div>
  );

  if (error) return (
    <div className="max-w-md mx-auto mt-20">
      <Card className="border-destructive">
        <CardContent className="pt-6 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <p className="font-semibold text-destructive">{error}</p>
          <Button variant="outline" onClick={() => navigate('/student')}>Back to Dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );

  if (!quiz || questions.length === 0) return null;

  const currentQ = questions[currentIdx];
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b pb-4 pt-2 -mx-4 px-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg truncate">{quiz.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>Q {currentIdx + 1} / {questions.length}</span>
              <span>·</span>
              <span>{answeredCount} answered</span>
            </div>
            <Progress value={progress} className="h-1.5 mt-2" />
          </div>
          {quiz.duration_seconds && (
            <GlobalTimer seconds={quiz.duration_seconds} onExpire={handleTimerExpire} />
          )}
        </div>
      </div>

      {/* Question Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {currentQ.type === 'mcq' ? 'Multiple Choice' : currentQ.type === 'true_false' ? 'True / False' : 'Python Code'}
            </Badge>
            <Badge variant="secondary" className="text-xs">{currentQ.points_base} pts</Badge>
          </div>
          <CardTitle className="text-base leading-relaxed mt-2">{currentQ.question_text}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* MCQ */}
          {currentQ.type === 'mcq' && currentQ.options && (
            <div className="space-y-2">
              {currentQ.options.map((opt, i) => {
                const selected = answers[currentQ.id] === opt;
                return (
                  <button
                    key={i}
                    onClick={() => selectAnswer(currentQ.id, opt)}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium
                      ${selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                  >
                    <span className="inline-block w-6 text-muted-foreground">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* True / False */}
          {currentQ.type === 'true_false' && (
            <div className="grid grid-cols-2 gap-3">
              {['True', 'False'].map(val => {
                const selected = answers[currentQ.id] === val;
                return (
                  <button
                    key={val}
                    onClick={() => selectAnswer(currentQ.id, val)}
                    className={`py-4 rounded-lg border-2 font-semibold text-base transition-all
                      ${selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                  >
                    {val === 'True' ? '✓ True' : '✗ False'}
                  </button>
                );
              })}
            </div>
          )}

          {/* Python Code — Live Editor */}
          {currentQ.type === 'python_code' && (
            <PythonEditor
              questionId={currentQ.id}
              starterCode={currentQ.code_starter ?? ''}
              testCases={(currentQ as any).test_cases ?? []}
              existingCode={answers[currentQ.id]}
              onSubmit={(code, isCorrect, passingCount) => {
                // Store code as the answer and record grade
                selectAnswer(currentQ.id, code);
                setPythonGrades(prev => ({ ...prev, [currentQ.id]: { isCorrect, passingCount, code } }));
                recordCurrentTiming();
                if (isCorrect) toast.success('All test cases passed! ✓');
                else toast(`${passingCount} test case(s) passed.`, { icon: '📊' });
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Question dots nav */}
      <div className="flex flex-wrap gap-2 justify-center">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => { recordCurrentTiming(); setCurrentIdx(i); }}
            className={`h-8 w-8 rounded-full text-xs font-semibold border-2 transition-all
              ${i === currentIdx ? 'border-primary bg-primary text-primary-foreground' :
                answers[q.id] ? 'border-primary/50 bg-primary/10 text-primary' :
                'border-border text-muted-foreground'
              }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between gap-3">
        <Button variant="outline" onClick={goPrev} disabled={currentIdx === 0}>
          ← Previous
        </Button>
        {currentIdx < questions.length - 1 ? (
          <Button onClick={goNext}>
            Next →
          </Button>
        ) : (
          <Button
            onClick={() => handleSubmit()}
            disabled={submitting}
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {submitting ? 'Submitting…' : 'Submit Quiz'}
          </Button>
        )}
      </div>

      {/* Submit from any question */}
      {currentIdx < questions.length - 1 && (
        <div className="text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => handleSubmit()}
            disabled={submitting}
          >
            Submit early ({answeredCount}/{questions.length} answered)
          </Button>
        </div>
      )}
    </div>
  );
}
