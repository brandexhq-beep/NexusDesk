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
      try {
        if (api?.auth?.check) {
          const isAuth = await api.auth.check();
          setIsAuthenticated(isAuth);
        } else {
          // Running in browser dev mode without electron preload
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.warn('Auth check fallback:', err);
        setIsAuthenticated(true);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (password: string) => {
    if (api?.auth?.login) {
      const success = await api.auth.login(password);
      if (success) {
        setIsAuthenticated(true);
      }
      return success;
    }
    setIsAuthenticated(true);
    return true;
  };

  const logout = async () => {
    if (api?.auth?.logout) {
      await api.auth.logout();
    }
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
