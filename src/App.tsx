import { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from 'sonner';

const Customers = lazy(() => import('./pages/Customers').then((m) => ({ default: m.Customers })));
const Stations = lazy(() => import('./pages/Stations').then((m) => ({ default: m.Stations })));
const Menu = lazy(() => import('./pages/Menu').then((m) => ({ default: m.Menu })));
const Games = lazy(() => import('./pages/Games').then((m) => ({ default: m.Games })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Expenses = lazy(() => import('./pages/Expenses').then((m) => ({ default: m.Expenses })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Promotions = lazy(() => import('./pages/Promotions').then((m) => ({ default: m.Promotions })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
      Loading view...
    </div>
  );
}

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
          <Suspense fallback={<PageLoader />}>
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
          </Suspense>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
