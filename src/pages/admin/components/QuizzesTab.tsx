import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';
import { QuizEditor } from './QuizEditor';

export function QuizzesTab() {
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [previewQuizId, setPreviewQuizId] = useState<string | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);

  const loadQuizzes = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setQuizzes(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadQuizzes();
  }, []);

  const handleCreateQuiz = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newQuiz = {
      title: 'New Quiz',
      created_by: user.id,
      is_published: false
    };

    const { data, error } = await supabase.from('quizzes').insert([newQuiz]).select().single();
    if (error) {
      toast.error('Failed to create quiz');
    } else if (data) {
      toast.success('Quiz created!');
      setEditingQuizId(data.id);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this quiz?')) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete quiz');
    } else {
      toast.success('Quiz deleted');
      loadQuizzes();
    }
  };

  const openPreview = async (quiz: any) => {
    setPreviewQuizId(quiz.id);
    const { data } = await supabase.from('questions').select('*').eq('quiz_id', quiz.id).order('order_index', { ascending: true });
    setPreviewQuestions(data || []);
  };

  if (editingQuizId) {
    return <QuizEditor quizId={editingQuizId} onBack={() => { setEditingQuizId(null); loadQuizzes(); }} />
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Manage Quizzes</h2>
          <p className="text-sm text-muted-foreground">Create, edit, and publish your quizzes.</p>
        </div>
        <Button onClick={handleCreateQuiz}>Create New Quiz</Button>
      </div>

      <Dialog open={!!previewQuizId} onOpenChange={(open) => { if(!open) setPreviewQuizId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Preview</DialogTitle>
            <DialogDescription>This is how students will see the questions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {previewQuestions.length === 0 ? (
              <div className="text-muted-foreground text-center">No questions added yet.</div>
            ) : (
              previewQuestions.map((q, idx) => (
                <Card key={q.id}>
                  <CardHeader className="py-3 bg-muted/30">
                    <CardTitle className="text-base">Question {idx + 1} ({q.points_base} pts)</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <p className="font-semibold">{q.question_text}</p>
                    {q.type === 'mcq' && q.options && (
                      <div className="space-y-2 pl-4">
                        {(q.options as string[]).map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input type="radio" name={`q-${q.id}`} id={`q-${q.id}-${i}`} className="h-4 w-4" disabled />
                            <label htmlFor={`q-${q.id}-${i}`}>{opt}</label>
                          </div>
                        ))}
                      </div>
                    )}
                    {q.type === 'true_false' && (
                      <div className="space-y-2 pl-4">
                        <div className="flex items-center gap-2">
                          <input type="radio" name={`q-${q.id}`} id={`q-${q.id}-t`} className="h-4 w-4" disabled />
                          <label htmlFor={`q-${q.id}-t`}>True</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="radio" name={`q-${q.id}`} id={`q-${q.id}-f`} className="h-4 w-4" disabled />
                          <label htmlFor={`q-${q.id}-f`}>False</label>
                        </div>
                      </div>
                    )}
                    {q.type === 'python_code' && (
                      <div className="bg-slate-900 text-slate-50 p-4 rounded font-mono text-sm whitespace-pre">
                        {q.code_starter || "# Write your python code here..."}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setPreviewQuizId(null)}>Close Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time Window</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4">Loading...</TableCell></TableRow>
              ) : quizzes.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No quizzes found. Create one!</TableCell></TableRow>
              ) : (
                quizzes.map(quiz => (
                  <TableRow key={quiz.id}>
                    <TableCell className="font-medium">{quiz.title}</TableCell>
                    <TableCell>{quiz.subject || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={quiz.is_published ? "default" : "secondary"}>
                        {quiz.is_published ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {quiz.open_at ? new Date(quiz.open_at).toLocaleString() : 'Not Set'}
                      {' - '}
                      {quiz.close_at ? new Date(quiz.close_at).toLocaleString() : 'Not Set'}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="secondary" size="sm" onClick={() => openPreview(quiz)}>Preview</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingQuizId(quiz.id)}>Edit</Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(quiz.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
