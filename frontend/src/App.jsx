import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';
import { Spinner } from './components/ui/Feedback';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Route-level code splitting keeps the initial bundle small.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage'));
const DocumentPage = lazy(() => import('./pages/DocumentPage'));
const NotesPage = lazy(() => import('./pages/NotesPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const FullPageSpinner = () => <Spinner className="min-h-[60vh]" />;

function RequireAuth({ children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <Spinner className="min-h-dvh" label="Loading your brain…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function GuestOnly({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return <Spinner className="min-h-dvh" />;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  const { theme } = useTheme();
  return (
    <>
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route
            element={
              <GuestOnly>
                <AuthLayout />
              </GuestOnly>
            }
          >
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:conversationId" element={<ChatPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/knowledge/:documentId" element={<DocumentPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:noteId" element={<NotesPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Toaster position="top-right" richColors closeButton theme={theme} />
    </>
  );
}
