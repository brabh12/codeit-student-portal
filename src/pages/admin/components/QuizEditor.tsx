import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, GripVertical } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

export function QuizEditor({ quizId, onBack }: { quizId: string, onBack: () => void }) {
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const { data: qData } = await supabase.from('quizzes').select('*').eq('id', quizId).single();
    if (qData) setQuiz(qData);

    const { data: qsData } = await supabase.from('questions').select('*').eq('quiz_id', quizId).order('order_index', { ascending: true });
    if (qsData) setQuestions(qsData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [quizId]);

  const updateQuiz = async (field: string, value: any) => {
    setQuiz({ ...quiz, [field]: value });
  };

  const saveQuiz = async () => {
    const { error } = await supabase.from('quizzes').update({
      title: quiz.title,
      description: quiz.description,
      subject: quiz.subject,
      quiz_type: quiz.quiz_type,
      open_at: quiz.open_at || null,
      close_at: quiz.close_at || null,
      duration_seconds: quiz.duration_seconds || null,
      is_published: quiz.is_published
    }).eq('id', quizId);

    if (error) toast.error('Failed to save quiz settings');
    else toast.success('Quiz settings saved');
  };

  const addQuestion = async (type: 'mcq' | 'true_false' | 'python_code') => {
    const newOrder = questions.length > 0 ? Math.max(...questions.map(q => q.order_index)) + 1 : 0;
    const newQuestion = {
      quiz_id: quizId,
      type,
      question_text: 'New Question',
      options: type === 'mcq' ? ['Option 1', 'Option 2'] : null,
      correct_answer: type === 'true_false' ? 'True' : 'Option 1',
      points_base: 10,
      order_index: newOrder,
      test_cases: type === 'python_code' ? [{ input: "", expected: "" }] : null
    };

    const { error } = await supabase.from('questions').insert([newQuestion]);
    if (error) toast.error('Failed to add question');
    else {
      toast.success('Question added');
      loadData();
    }
  };

  const updateQuestion = async (id: string, updates: any) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const saveQuestion = async (id: string, updates: any) => {
    const { error } = await supabase.from('questions').update(updates).eq('id', id);
    if (!error) toast.success('Question saved');
    else toast.error('Failed to save question');
    loadData();
  };

  const deleteQuestion = async (id: string) => {
    if(!confirm("Delete question?")) return;
    await supabase.from('questions').delete().eq('id', id);
    loadData();
  };

  const moveQuestion = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === questions.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentQ = questions[index];
    const targetQ = questions[targetIndex];

    await supabase.from('questions').update({ order_index: targetQ.order_index }).eq('id', currentQ.id);
    await supabase.from('questions').update({ order_index: currentQ.order_index }).eq('id', targetQ.id);
    loadData();
  };

  if (loading || !quiz) return <div>Loading...</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
        <h2 className="text-2xl font-bold flex-1">Editing Quiz: {quiz.title}</h2>
        <Button variant={quiz.is_published ? "destructive" : "default"} onClick={() => {
          updateQuiz('is_published', !quiz.is_published);
          setTimeout(saveQuiz, 100);
        }}>
          {quiz.is_published ? "Unpublish" : "Publish"}
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quiz Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={quiz.title} onChange={e => updateQuiz('title', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={quiz.description || ''} onChange={e => updateQuiz('description', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={quiz.subject || ''} onChange={e => updateQuiz('subject', e.target.value)} />
            </div>
            <Button onClick={saveQuiz}>Save Details</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Open At (UTC)</Label>
              <Input type="datetime-local" value={quiz.open_at ? new Date(quiz.open_at).toISOString().slice(0,16) : ''} onChange={e => updateQuiz('open_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />
            </div>
            <div className="space-y-2">
              <Label>Close At (UTC)</Label>
              <Input type="datetime-local" value={quiz.close_at ? new Date(quiz.close_at).toISOString().slice(0,16) : ''} onChange={e => updateQuiz('close_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />
            </div>
            <div className="space-y-2">
              <Label>Duration (Minutes)</Label>
              <Input type="number" value={(quiz.duration_seconds || 0) / 60} onChange={e => updateQuiz('duration_seconds', parseInt(e.target.value) * 60)} />
            </div>
            <Button onClick={saveQuiz}>Save Schedule</Button>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Questions</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addQuestion('mcq')}><Plus className="mr-2 h-4 w-4"/> MCQ</Button>
            <Button variant="outline" size="sm" onClick={() => addQuestion('true_false')}><Plus className="mr-2 h-4 w-4"/> T/F</Button>
            <Button variant="outline" size="sm" onClick={() => addQuestion('python_code')}><Plus className="mr-2 h-4 w-4"/> Python Code</Button>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((q, index) => (
            <Card key={q.id}>
              <CardHeader className="py-3 flex flex-row items-center justify-between bg-muted/30">
                <div className="flex items-center gap-4">
                  <Badge>{q.type.toUpperCase()}</Badge>
                  <span className="font-medium">Question {index + 1} ({q.points_base} pts)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => moveQuestion(index, 'up')} disabled={index === 0}><ArrowUp className="h-4 w-4"/></Button>
                  <Button variant="ghost" size="icon" onClick={() => moveQuestion(index, 'down')} disabled={index === questions.length - 1}><ArrowDown className="h-4 w-4"/></Button>
                  <Button variant="destructive" size="icon" onClick={() => deleteQuestion(q.id)}><Trash2 className="h-4 w-4"/></Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Question Text</Label>
                  <Textarea value={q.question_text} onChange={e => updateQuestion(q.id, { question_text: e.target.value })} />
                </div>
                
                {q.type === 'mcq' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Answer Options</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const opts = [...(q.options || []), `Option ${(q.options || []).length + 1}`];
                          updateQuestion(q.id, { options: opts });
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Option
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {(q.options || []).map((opt: string, optIdx: number) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm text-muted-foreground w-6 shrink-0">{String.fromCharCode(65 + optIdx)}.</span>
                          <Input
                            className="flex-1 font-mono text-sm"
                            value={opt}
                            onChange={(e) => {
                              const updated = [...(q.options || [])];
                              updated[optIdx] = e.target.value;
                              // If the old value was the correct answer, update it too
                              const wasCorrect = q.correct_answer === opt;
                              updateQuestion(q.id, {
                                options: updated,
                                ...(wasCorrect ? { correct_answer: e.target.value } : {}),
                              });
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive shrink-0"
                            disabled={(q.options || []).length <= 2}
                            onClick={() => {
                              const updated = (q.options || []).filter((_: string, i: number) => i !== optIdx);
                              updateQuestion(q.id, { options: updated });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <Label>Correct Answer</Label>
                      <Select
                        value={q.correct_answer}
                        onValueChange={(val) => updateQuestion(q.id, { correct_answer: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select the correct option…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(q.options || []).map((opt: string, i: number) => (
                            <SelectItem key={i} value={opt}>
                              {String.fromCharCode(65 + i)}. {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {q.type === 'true_false' && (
                  <div className="space-y-2 flex flex-col">
                    <Label>Correct Answer</Label>
                    <Select value={q.correct_answer} onValueChange={val => updateQuestion(q.id, {correct_answer: val})}>
                      <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="True">True</SelectItem>
                        <SelectItem value="False">False</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {q.type === 'python_code' && (
                  <>
                    <div className="space-y-2">
                      <Label>Starter Code</Label>
                      <div className="border rounded-xl overflow-hidden shadow-md" style={{ height: '220px' }}>
                        <Suspense fallback={<div className="bg-[#1e1e1e] h-full flex items-center justify-center text-slate-400 text-sm gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading editor…</div>}>
                          <MonacoEditor
                            height="200px"
                            language="python"
                            theme="vs-dark"
                            value={q.code_starter || ''}
                            onChange={v => updateQuestion(q.id, { code_starter: v ?? '' })}
                            options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 4, wordWrap: 'on', lineNumbers: 'on' }}
                          />
                        </Suspense>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Test Cases</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const current = q.test_cases || [];
                            updateQuestion(q.id, { test_cases: [...current, { input: '', expected: '' }] });
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Test Case
                        </Button>
                      </div>
                      {(q.test_cases || []).length === 0 && (
                        <div className="text-xs text-muted-foreground border border-dashed rounded p-3 text-center">
                          No test cases yet. Add at least one.
                        </div>
                      )}
                      {(q.test_cases || []).map((tc: { input: string; expected: string }, tcIdx: number) => (
                        <div key={tcIdx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start bg-muted/30 rounded p-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Input (stdin)</Label>
                            <Textarea
                              className="font-mono text-xs h-16 resize-none"
                              placeholder="e.g. 3\n5"
                              value={tc.input}
                              onChange={e => {
                                const updated = [...(q.test_cases || [])];
                                updated[tcIdx] = { ...updated[tcIdx], input: e.target.value };
                                updateQuestion(q.id, { test_cases: updated });
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Expected Output</Label>
                            <Textarea
                              className="font-mono text-xs h-16 resize-none"
                              placeholder="e.g. 8"
                              value={tc.expected}
                              onChange={e => {
                                const updated = [...(q.test_cases || [])];
                                updated[tcIdx] = { ...updated[tcIdx], expected: e.target.value };
                                updateQuestion(q.id, { test_cases: updated });
                              }}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="mt-5 text-destructive hover:text-destructive"
                            onClick={() => {
                              const updated = (q.test_cases || []).filter((_: any, i: number) => i !== tcIdx);
                              updateQuestion(q.id, { test_cases: updated });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Points</Label>
                  <Input type="number" className="w-[100px]" value={q.points_base} onChange={e => updateQuestion(q.id, { points_base: parseInt(e.target.value) })} />
                </div>

                <Button variant="secondary" onClick={() => saveQuestion(q.id, q)}>Save Question Settings</Button>
              </CardContent>
            </Card>
          ))}
          {questions.length === 0 && <div className="text-center p-8 border border-dashed rounded text-muted-foreground">No questions added yet.</div>}
        </div>
      </div>
    </div>
  );
}
