import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
        <Route path="/login" element={<Login />} />
        <Route path="/jobs" element={<JobList />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/create-job" element={<CreateJob />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/dashboard" element={<MyJobs />} />
        <Route path="/my-jobs" element={<MyJobs />} />
        <Route path="/my-jobs/candidates" element={<MyJobCandidates />} />
        <Route path="/my-jobs/acceptance" element={<MyJobAcceptance />} />
        <Route path="/cv-export" element={<CVExport />} />
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
