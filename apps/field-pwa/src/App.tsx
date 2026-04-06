import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { syncPendingOperations, registerSyncListeners } from './lib/sync';
import { subscribeToPush, requestPushPermission } from './lib/push-notifications';

import LoginPage from './pages/LoginPage';
import TaskListPage from './pages/TaskListPage';
import TaskDetailPage from './pages/TaskDetailPage';
import ReportIncidentPage from './pages/ReportIncidentPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { isAuthenticated, accessToken } = useAuthStore();

  useEffect(() => {
    // Sync any queued operations when the app loads and connectivity is available
    if (navigator.onLine) {
      syncPendingOperations().catch(console.error);
    }

    const cleanup = registerSyncListeners((online) => {
      if (online) syncPendingOperations().catch(console.error);
    });

    return cleanup;
  }, []);

  useEffect(() => {
    // Set up push notifications after login
    if (!isAuthenticated || !accessToken) return;

    requestPushPermission().then((permission) => {
      if (permission === 'granted') {
        subscribeToPush(accessToken).catch(console.error);
      }
    });
  }, [isAuthenticated, accessToken]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/tasks"
          element={
            <RequireAuth>
              <TaskListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <RequireAuth>
              <TaskDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/report"
          element={
            <RequireAuth>
              <ReportIncidentPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/tasks' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
