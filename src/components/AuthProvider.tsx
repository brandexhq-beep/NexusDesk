import { createContext, useContext, useState, useEffect } from 'react';

// @ts-ignore
const api = window.api;

interface AuthContextType {
  isAuthenticated: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuth = await api.auth.check();
      setIsAuthenticated(isAuth);
      setLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (password: string) => {
    const success = await api.auth.login(password);
    if (success) {
      setIsAuthenticated(true);
    }
    return success;
  };

  const logout = async () => {
    await api.auth.logout();
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
