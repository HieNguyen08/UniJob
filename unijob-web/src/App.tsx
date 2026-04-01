import { useEffect } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';

// Layout
import Layout from '@/components/layout/Layout';

// Pages
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import JobList from '@/pages/JobList';
import JobDetail from '@/pages/JobDetail';
import CreateJob from '@/pages/CreateJob';
import Profile from '@/pages/Profile';
import MyJobs from '@/pages/MyJobs';
import MyJobCandidates from '@/pages/MyJobCandidates';
import MyJobAcceptance from '@/pages/MyJobAcceptance';
import CVExport from '@/pages/CVExport';
import NotFound from '@/pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }: { children: JSX.Element }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  const initialize = useAuthStore((state) => state.initialize);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-[var(--color-muted-foreground)]">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route
          path="/login"
          element={(
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          )}
        />
        <Route path="/jobs" element={<JobList />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route
          path="/create-job"
          element={(
            <ProtectedRoute>
              <CreateJob />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/profile"
          element={(
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/dashboard"
          element={(
            <ProtectedRoute>
              <MyJobs />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/my-jobs"
          element={(
            <ProtectedRoute>
              <MyJobs />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/my-jobs/candidates"
          element={(
            <ProtectedRoute>
              <MyJobCandidates />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/my-jobs/acceptance"
          element={(
            <ProtectedRoute>
              <MyJobAcceptance />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/cv-export"
          element={(
            <ProtectedRoute>
              <CVExport />
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
