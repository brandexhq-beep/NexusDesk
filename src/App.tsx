import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/Customers';
import { Stations } from './pages/Stations';
import { Menu } from './pages/Menu';
import { Games } from './pages/Games';
import { Reports } from './pages/Reports';
import { Expenses } from './pages/Expenses';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Promotions } from './pages/Promotions';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from 'sonner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return <div className="h-screen w-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Login />;
  }
  
  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <Toaster theme="dark" position="bottom-right" />
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="stations" element={<Stations />} />
              <Route path="menu" element={<Menu />} />
              <Route path="games" element={<Games />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="reports" element={<Reports />} />
              <Route path="promotions" element={<Promotions />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
