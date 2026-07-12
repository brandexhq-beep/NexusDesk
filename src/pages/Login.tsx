import { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthProvider';
import { db } from '../services/db';
import type { AppSettings } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock, Coffee } from 'lucide-react';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const { login } = useAuth();

  useEffect(() => {
    db.settings.get().then(setSettings);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const success = await login(password);
    if (!success) {
      setError('Incorrect password');
      setPassword('');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black overflow-hidden relative">
      {/* Background ambient gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-background to-emerald-900/10 pointer-events-none" />
      
      <div className="w-full max-w-md p-8 relative z-10">
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            {settings?.cafe_logo_url ? (
              <img src={settings.cafe_logo_url} alt="Logo" className="w-16 h-16 object-cover rounded-2xl shadow-lg shadow-indigo-500/20 mb-4" />
            ) : (
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-lg shadow-indigo-500/20 mb-4">
                <Coffee className="w-8 h-8 text-white" />
              </div>
            )}
            <h1 className="text-2xl font-bold text-white tracking-tight">{settings?.cafe_name || 'Gaming Cafe'}</h1>
            <p className="text-muted-foreground mt-2 text-sm">Enter password to access dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                <Lock className="h-5 w-5" />
              </div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-black/50 border-white/10 text-white placeholder:text-muted-foreground focus-visible:ring-indigo-500 h-12"
                placeholder="Password"
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center font-medium animate-in fade-in slide-in-from-top-1">
                {error}
              </p>
            )}

            <Button 
              type="submit" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 text-md transition-all duration-300 shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:shadow-[0_0_25px_rgba(79,70,229,0.5)] font-medium"
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </Button>
          </form>
          
          <div className="mt-8 text-center border-t border-white/5 pt-6">
            <a href="https://www.brandex.co.in" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground/50 hover:text-indigo-400 transition-colors">
              Built by Brandex
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
