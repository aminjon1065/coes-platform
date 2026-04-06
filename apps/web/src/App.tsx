import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/Layout/AppShell';
import { RequireAuth } from '@/components/Layout/RequireAuth';

import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import NotificationsPage from '@/pages/NotificationsPage';

import DocumentsPage from '@/pages/edms/DocumentsPage';
import DocumentDetailPage from '@/pages/edms/DocumentDetailPage';

import MyTasksPage from '@/pages/tasks/MyTasksPage';
import TaskDetailPage from '@/pages/tasks/TaskDetailPage';
import OversightPage from '@/pages/tasks/OversightPage';

import UsersPage from '@/pages/admin/UsersPage';
import DepartmentsPage from '@/pages/admin/DepartmentsPage';
import RolesPage from '@/pages/admin/RolesPage';

// GIS Map Client is served as a separate app at /gis — redirect there
function GisRedirect() {
  return <Navigate to="http://localhost:3001" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          {/* Dashboard */}
          <Route index element={<DashboardPage />} handle={{ title: 'Dashboard' }} />

          {/* EDMS */}
          <Route path="edms" element={<DocumentsPage />} handle={{ title: 'Documents' }} />
          <Route path="edms/:id" element={<DocumentDetailPage />} handle={{ title: 'Document' }} />

          {/* Tasks */}
          <Route path="tasks" element={<MyTasksPage />} handle={{ title: 'My Tasks' }} />
          <Route path="tasks/oversight" element={<OversightPage />} handle={{ title: 'Task Oversight' }} />
          <Route path="tasks/:id" element={<TaskDetailPage />} handle={{ title: 'Task' }} />

          {/* Notifications */}
          <Route path="notifications" element={<NotificationsPage />} handle={{ title: 'Notifications' }} />

          {/* Admin */}
          <Route path="admin" element={<Navigate to="/admin/users" replace />} />
          <Route path="admin/users" element={<UsersPage />} handle={{ title: 'Users' }} />
          <Route path="admin/departments" element={<DepartmentsPage />} handle={{ title: 'Departments' }} />
          <Route path="admin/roles" element={<RolesPage />} handle={{ title: 'Roles & Permissions' }} />

          {/* GIS — links to separate map-client app */}
          <Route path="gis" element={<GisRedirect />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
