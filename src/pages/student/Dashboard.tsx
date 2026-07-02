import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Trophy, BookOpen, History, CheckCircle2, Lock } from 'lucide-react';

type Quiz = {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  open_at: string | null;
  close_at: string | null;
  duration_seconds: number | null;
  is_published: boolean;
};

type AttemptSummary = {
  quiz_id: string;
  status: string;
  submitted_at: string | null;
  totalPoints: number;
};

function Countdown({ target }: { target: string }) {
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    const calc = () => setDiff(Math.max(0, new Date(target).getTime() - Date.now()));
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [target]);

  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return (
    <span className="font-mono text-sm text-amber-600 dark:text-amber-400">
      {hours > 0 ? `${hours}h ` : ''}{String(mins).padStart(2, '0')}m {String(secs).padStart(2, '0')}s
    </span>
  );
}

function QuizCard({
  quiz,
  status,
  attempt,
  onStart,
  onViewResult,
}: {
  quiz: Quiz;
  status: 'open' | 'upcoming' | 'closed';
  attempt?: AttemptSummary;
  onStart: (quiz: Quiz) => void;
  onViewResult: (quizId: string, attemptStatus: string) => void;
}) {
  return (
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{quiz.title}</CardTitle>
          <Badge
            variant={status === 'open' ? 'default' : status === 'upcoming' ? 'secondary' : 'outline'}
            className="shrink-0"
          >
            {status === 'open' ? 'Open' : status === 'upcoming' ? 'Upcoming' : 'Closed'}
          </Badge>
        </div>
        {quiz.subject && (
          <CardDescription className="text-xs">{quiz.subject}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        {quiz.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{quiz.description}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {quiz.duration_seconds && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {Math.round(quiz.duration_seconds / 60)} min
            </span>
          )}
          {status === 'open' && quiz.close_at && (
            <span className="flex items-center gap-1 text-red-500">
              <Clock className="h-3 w-3" />
              Closes in <Countdown target={quiz.close_at} />
            </span>
          )}
          {status === 'upcoming' && quiz.open_at && (
            <span className="flex items-center gap-1">
              Opens in <Countdown target={quiz.open_at} />
            </span>
          )}
          {status === 'closed' && attempt && (
            <span className="flex items-center gap-1 text-primary font-medium">
              <Trophy className="h-3 w-3" />
              Score: {attempt.totalPoints} pts
            </span>
          )}
        </div>

        <div className="mt-auto pt-2">
          {status === 'open' && !attempt && (
            <Button className="w-full" size="sm" onClick={() => onStart(quiz)}>
              Start Quiz
            </Button>
          )}
          {status === 'open' && attempt?.status === 'in_progress' && (
            <Button className="w-full" size="sm" variant="outline" onClick={() => onStart(quiz)}>
              Continue Quiz
            </Button>
          )}
          {(status === 'closed' || attempt?.status === 'submitted' || attempt?.status === 'graded') && attempt && (
            <Button className="w-full" size="sm" variant="secondary" onClick={() => onViewResult(quiz.id, attempt.status)}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> View Results
            </Button>
          )}
          {status === 'upcoming' && (
            <Button className="w-full" size="sm" variant="ghost" disabled>
              <Lock className="h-4 w-4 mr-1" /> Not open yet
            </Button>
          )}
          {status === 'closed' && !attempt && (
            <Button className="w-full" size="sm" variant="ghost" disabled>
              <Lock className="h-4 w-4 mr-1" /> Missed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function QuizSection({
  title,
  icon,
  quizzes,
  status,
  attempts,
  onStart,
  onViewResult,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  quizzes: Quiz[];
  status: 'open' | 'upcoming' | 'closed';
  attempts: AttemptSummary[];
  onStart: (quiz: Quiz) => void;
  onViewResult: (quizId: string, attemptStatus: string) => void;
  emptyText: string;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        {icon} {title}
        <Badge variant="outline" className="text-xs">{quizzes.length}</Badge>
      </h2>
      {quizzes.length === 0 ? (
        <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quizzes.map(q => (
            <QuizCard
              key={q.id}
              quiz={q}
              status={status}
              attempt={attempts.find(a => a.quiz_id === q.id)}
              onStart={onStart}
              onViewResult={onViewResult}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StudentDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [attempts, setAttempts] = useState<AttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Fetch all published quizzes (RLS ensures only published ones come through)
      const { data: qData } = await supabase
        .from('quizzes')
        .select('id, title, description, subject, open_at, close_at, duration_seconds, is_published')
        .eq('is_published', true)
        .order('open_at', { ascending: true });

      if (qData) setQuizzes(qData);

      // Fetch student's own attempts
      const { data: aData } = await supabase
        .from('attempts')
        .select('quiz_id, status, submitted_at, answers(points_awarded)');

      if (aData) {
        const mapped: AttemptSummary[] = aData.map((a: any) => ({
          quiz_id: a.quiz_id,
          status: a.status,
          submitted_at: a.submitted_at,
          totalPoints: (a.answers || []).reduce((sum: number, ans: any) => sum + (ans.points_awarded || 0), 0),
        }));
        setAttempts(mapped);
      }
      setLoading(false);
    }
    load();
  }, []);

  const openQuizzes = quizzes.filter(q => {
    const open = !q.open_at || new Date(q.open_at) <= now;
    const notClosed = !q.close_at || new Date(q.close_at) >= now;
    return open && notClosed;
  });
  const upcomingQuizzes = quizzes.filter(q => q.open_at && new Date(q.open_at) > now);
  const closedQuizzes = quizzes.filter(q => q.close_at && new Date(q.close_at) < now);

  const handleStart = async (quiz: Quiz) => {
    const existingAttempt = attempts.find(a => a.quiz_id === quiz.id);
    if (existingAttempt?.status === 'submitted' || existingAttempt?.status === 'graded') {
      navigate(`/student/results/${quiz.id}`);
      return;
    }
    navigate(`/student/quiz/${quiz.id}`);
  };

  const handleViewResult = (quizId: string) => {
    navigate(`/student/results/${quizId}`);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-muted-foreground">
        Loading quizzes…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">My Class</div>
            <div className="font-semibold truncate">{profile?.class_name || '—'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Total XP</div>
            <div className="font-bold text-primary text-lg">{profile?.total_points ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Quizzes Taken</div>
            <div className="font-bold text-lg">{attempts.filter(a => a.status !== 'in_progress').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Open Now</div>
            <div className="font-bold text-lg text-green-600">{openQuizzes.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="quizzes">
        <TabsList>
          <TabsTrigger value="quizzes"><BookOpen className="h-4 w-4 mr-1" />Quizzes</TabsTrigger>
          <TabsTrigger value="history"><History className="h-4 w-4 mr-1" />My History</TabsTrigger>
        </TabsList>

        <TabsContent value="quizzes" className="space-y-8 mt-6">
          <QuizSection
            title="Open Now"
            icon={<span className="h-2 w-2 rounded-full bg-green-500 inline-block" />}
            quizzes={openQuizzes}
            status="open"
            attempts={attempts}
            onStart={handleStart}
            onViewResult={handleViewResult}
            emptyText="No quizzes are open right now. Check back soon!"
          />
          <QuizSection
            title="Upcoming"
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            quizzes={upcomingQuizzes}
            status="upcoming"
            attempts={attempts}
            onStart={handleStart}
            onViewResult={handleViewResult}
            emptyText="No upcoming quizzes scheduled."
          />
          <QuizSection
            title="Closed"
            icon={<Lock className="h-4 w-4 text-muted-foreground" />}
            quizzes={closedQuizzes}
            status="closed"
            attempts={attempts}
            onStart={handleStart}
            onViewResult={handleViewResult}
            emptyText="No closed quizzes yet."
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <HistoryTab attempts={attempts} quizzes={quizzes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HistoryTab({ attempts, quizzes }: { attempts: AttemptSummary[]; quizzes: Quiz[] }) {
  const navigate = useNavigate();
  const submitted = attempts.filter(a => a.status === 'submitted' || a.status === 'graded');

  if (submitted.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-10 text-center text-muted-foreground">
        You haven't completed any quizzes yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {submitted.map(attempt => {
        const quiz = quizzes.find(q => q.id === attempt.quiz_id);
        return (
          <Card key={attempt.quiz_id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
            <div>
              <div className="font-semibold">{quiz?.title ?? 'Unknown Quiz'}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Submitted {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString() : '—'}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-primary font-bold">{attempt.totalPoints} pts</div>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/student/results/${attempt.quiz_id}`)}>
                View Results
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
