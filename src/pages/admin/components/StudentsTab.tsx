import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import toast from 'react-hot-toast';

export function StudentsTab() {
  const [students, setStudents] = useState<any[]>([]);
  const [classCodes, setClassCodes] = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [newPoints, setNewPoints] = useState<number>(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load students
    const { data: sData } = await supabase.from('profiles').select('*').eq('role', 'student').order('full_name');
    if (sData) setStudents(sData);

    // Load class codes
    const { data: cData } = await supabase.from('class_codes').select('*').eq('created_by', user.id).order('created_at', { ascending: false });
    if (cData) setClassCodes(cData);

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const cleanPrefix = newClassName.replace(/\s+/g, '').substring(0, 5).toUpperCase();
    const code = `${cleanPrefix}-${randomSuffix}`;

    const { error } = await supabase.from('class_codes').insert([{
      code,
      class_name: newClassName,
      created_by: user.id
    }]);

    if (!error) {
      setNewClassName('');
      toast.success('Class code created');
      loadData();
    } else {
      toast.error('Failed to create code');
    }
  };

  const toggleClassCode = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('class_codes').update({ is_active: !currentStatus }).eq('id', id);
    if (!error) {
      toast.success(`Class code ${currentStatus ? 'deactivated' : 'activated'}`);
      loadData();
    } else toast.error('Failed to update status');
  };

  const adjustPoints = async () => {
    if (!selectedStudent) return;
    const { error } = await supabase.from('profiles').update({ total_points: newPoints }).eq('id', selectedStudent.id);
    if (!error) {
      toast.success('Points updated successfully');
      setDialogOpen(false);
      loadData();
    } else {
      toast.error('Failed to update points');
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <Card>
        <CardHeader>
          <CardTitle>Manage Class Codes</CardTitle>
          <CardDescription>Generate codes for students to join your platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateCode} className="flex gap-2 mb-6">
            <Input 
              placeholder="e.g. CS101 Spring" 
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
            />
            <Button type="submit">Generate Code</Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classCodes.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.class_name}</TableCell>
                  <TableCell>
                    <code className="bg-primary/10 text-primary px-2 py-1 rounded">{c.code}</code>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant={c.is_active ? "outline" : "secondary"} 
                      size="sm"
                      onClick={() => toggleClassCode(c.id, c.is_active)}
                    >
                      {c.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Students Directory</CardTitle>
          <CardDescription>View all enrolled students and modify their XP.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Points</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-4">Loading...</TableCell></TableRow>
              ) : students.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No students registered yet.</TableCell></TableRow>
              ) : (
                students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.full_name}</TableCell>
                    <TableCell>{student.class_name}</TableCell>
                    <TableCell className="font-bold text-primary">{student.total_points}</TableCell>
                    <TableCell className="text-right">
                      <Dialog open={dialogOpen && selectedStudent?.id === student.id} onOpenChange={(open) => {
                        setDialogOpen(open);
                        if (open) {
                          setSelectedStudent(student);
                          setNewPoints(student.total_points);
                        } else {
                          setSelectedStudent(null);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">Adjust XP</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Adjust Points - {student.full_name}</DialogTitle>
                            <DialogDescription>
                              Modify the total XP for this student manually.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>New Total Points</Label>
                              <Input type="number" value={newPoints} onChange={e => setNewPoints(parseInt(e.target.value))} />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                            <Button onClick={adjustPoints}>Save Changes</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
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
