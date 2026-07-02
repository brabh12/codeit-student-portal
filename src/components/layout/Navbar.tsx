import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function Navbar() {
  const { profile, signOut } = useAuth();

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="font-bold text-xl text-primary flex items-center gap-2">
          <Link to="/">ClassQuiz</Link>
        </div>

        {profile && (
          <div className="flex items-center gap-4">
            <div className="flex flex-col text-right">
              <span className="text-sm font-semibold">{profile.full_name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {profile.role} {profile.class_name ? `• ${profile.class_name}` : ''}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} title="Logout">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
