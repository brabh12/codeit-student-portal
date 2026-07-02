import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export function OverviewTab() {
  const [stats, setStats] = useState({
    totalQuizzes: 0,
    totalStudents: 0,
    avgScore: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Students count
      const { count: studentsCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student');

      // Quizzes count
      const { count: quizzesCount } = await supabase
        .from('quizzes')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id);

      // Average score - approximate or precise using sum of total_points or attempts.
      // Let's get attempts grouped by student or sum of points_awarded
      const { data: answersData } = await supabase
        .from('answers')
        .select('points_awarded');
      
      let avg = 0;
      if (answersData && answersData.length > 0) {
        const totalPoints = answersData.reduce((acc, curr) => acc + (curr.points_awarded || 0), 0);
        avg = totalPoints / answersData.length;
      }

      setStats({
        totalQuizzes: quizzesCount || 0,
        totalStudents: studentsCount || 0,
        avgScore: Math.round(avg * 10) / 10,
      });

      // Recent Activity
      const { data: attemptsData } = await supabase
        .from('attempts')
        .select(`
          id, 
          status, 
          started_at, 
          submitted_at,
          student:profiles(full_name),
          quiz:quizzes(title)
        `)
        .order('started_at', { ascending: false })
        .limit(10);

      if (attemptsData) {
        setRecentActivity(attemptsData);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Quizzes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : stats.totalQuizzes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : stats.totalStudents}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Score (Points / Q)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : stats.avgScore}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Quiz Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Quiz</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-4">Loading...</TableCell></TableRow>
              ) : recentActivity.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No recent activity.</TableCell></TableRow>
              ) : (
                recentActivity.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="font-medium">{activity.student?.full_name || 'Unknown'}</TableCell>
                    <TableCell>{activity.quiz?.title || 'Unknown'}</TableCell>
                    <TableCell>
                      <Badge variant={activity.status === 'submitted' || activity.status === 'graded' ? 'default' : 'secondary'}>
                        {activity.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(activity.started_at).toLocaleString()}</TableCell>
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
