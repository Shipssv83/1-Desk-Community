import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import Login from './pages/Login';
import AppShell from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import Conversations from './pages/Conversations';
import Contacts from './pages/Contacts';
import Inboxes from './pages/Inboxes';
import Bots from './pages/Bots';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import Operators from './pages/Operators';
import Integrations from './pages/Integrations';

function ProtectedRoute({ children }) {
  const { user, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-platform-bg text-platform-accent">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Restricts a route to admins. Operators are bounced back to their settings.
function AdminRoute({ children }) {
  const { user } = useAuthStore();
  if (user && user.role !== 'admin') {
    return <Navigate to="/app/settings" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Landing moved to a separate project (1desk-landing). Root → login. */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />

        <Route
          path="/app/*"
          element={
            <ProtectedRoute>
              <AppShell>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/conversations" element={<Conversations />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
                  {/* Top-level work-tool sections (admin) */}
                  <Route path="/bots" element={<AdminRoute><Bots /></AdminRoute>} />
                  <Route path="/inboxes" element={<AdminRoute><Inboxes /></AdminRoute>} />
                  <Route path="/integrations" element={<AdminRoute><Integrations /></AdminRoute>} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/settings/profile" element={<Profile />} />
                  <Route path="/settings/operators" element={<AdminRoute><Operators /></AdminRoute>} />
                  <Route path="/settings/inboxes" element={<AdminRoute><Inboxes /></AdminRoute>} />
                  <Route path="/settings/bots" element={<AdminRoute><Bots /></AdminRoute>} />
                  <Route path="*" element={<Navigate to="/app/" replace />} />
                </Routes>
              </AppShell>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
