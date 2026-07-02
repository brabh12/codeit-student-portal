import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

export function Home() {
  const { profile, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  if (profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  } else if (profile?.role === 'student') {
    return <Navigate to="/student" replace />;
  }

  return <Navigate to="/login" replace />;
}
