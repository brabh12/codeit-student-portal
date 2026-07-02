import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';
import Papa from 'papaparse';
import toast from 'react-hot-toast';

export function ResultsTab() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadQuizzes() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('quizzes').select('id, title').eq('created_by', user.id).order('created_at', { ascending: false });
      if (data) setQuizzes(data);
    }
    loadQuizzes();
  }, []);

  useEffect(() => {
    if (!selectedQuiz) return;
    async function loadResults() {
      setLoading(true);
      const { data } = await supabase
        .from('attempts')
        .select(`
          id, student_id, started_at, submitted_at, status,
          student:profiles(full_name, class_name),
          answers(points_awarded, is_correct, time_taken_seconds)
        `)
        .eq('quiz_id', selectedQuiz);
      
      if (data) {
        // Compute totals from answers
        const formatted = data.map((attempt: any) => {
          const totalPoints = attempt.answers.reduce((acc: number, curr: any) => acc + (curr.points_awarded || 0), 0);
          const totalTime = attempt.answers.reduce((acc: number, curr: any) => acc + (curr.time_taken_seconds || 0), 0);
          const correctCount = attempt.answers.filter((a: any) => a.is_correct).length;
          
          return {
            ...attempt,
            totalPoints,
            totalTime,
            correctCount,
            totalQuestions: attempt.answers.length
          };
        });
        setAttempts(formatted);
      }
      setLoading(false);
    }
    loadResults();
  }, [selectedQuiz]);

  const exportCSV = () => {
    if (!attempts || attempts.length === 0) {
      toast.error('No data to export');
      return;
    }
    
    const csvData = attempts.map(a => ({
      Student_Name: a.student?.full_name,
      Class: a.student?.class_name,
      Status: a.status,
      Score: a.totalPoints,
      Correct_Answers: `${a.correctCount}/${a.totalQuestions}`,
      Total_Time_Seconds: a.totalTime,
      Submitted_At: a.submitted_at || 'Not submitted'
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `quiz_results_${selectedQuiz}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Quiz Analytics</CardTitle>
          <CardDescription>Select a quiz to view student performance and export results.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-center">
            <div className="w-[300px]">
              <Select value={selectedQuiz || ''} onValueChange={setSelectedQuiz}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a quiz..." />
                </SelectTrigger>
                <SelectContent>
                  {quizzes.map(q => (
                    <SelectItem key={q.id} value={q.id}>{q.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={exportCSV} disabled={!selectedQuiz || attempts.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>

          <div className="mt-8 border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Accuracy</TableHead>
                  <TableHead>Time Taken</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!selectedQuiz ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Please select a quiz above.</TableCell></TableRow>
                ) : loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading results...</TableCell></TableRow>
                ) : attempts.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No attempts found for this quiz.</TableCell></TableRow>
                ) : (
                  attempts.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <div>{a.student?.full_name}</div>
                        <div className="text-xs text-muted-foreground">{a.student?.class_name}</div>
                      </TableCell>
                      <TableCell className="font-bold text-primary">{a.totalPoints} pts</TableCell>
                      <TableCell>{a.correctCount} / {a.totalQuestions}</TableCell>
                      <TableCell>{a.totalTime}s</TableCell>
                      <TableCell className="capitalize">{a.status.replace('_', ' ')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
