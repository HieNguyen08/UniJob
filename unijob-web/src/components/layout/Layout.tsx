import { Outlet } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { Toaster } from 'react-hot-toast';

export default function Layout() {
  const location = useLocation();
  const isMyJobsRoute =
    location.pathname === '/my-jobs' ||
    location.pathname.startsWith('/my-jobs/') ||
    location.pathname === '/dashboard';

  return (
    <div className="flex min-h-screen flex-col">
      {isMyJobsRoute ? <div className="h-16" /> : <Header />}
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#fff',
            color: '#0a0a0a',
            border: '1px solid #e2e8f0',
          },
        }}
      />
    </div>
  );
}
