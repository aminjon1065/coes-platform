import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tasksApi, notificationsApi, edmsApi } from '@/lib/api';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingScreen } from '@/components/shared/Spinner';
import { useAuthStore } from '@/store/auth.store';
import { formatDistanceToNow } from 'date-fns';

function StatCard({ label, value, to, color }: { label: string; value: number; to: string; color: string }) {
  return (
    <Link to={to} className={`card p-5 flex flex-col gap-1 hover:shadow-md transition-shadow border-l-4 ${color}`}>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      <span className="text-sm text-gray-500">{label}</span>
    </Link>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: tasks, isLoading: tl } = useQuery({
    queryKey: ['tasks', 'my', 'dashboard'],
    queryFn: () => tasksApi.myTasks({ limit: 5, status: 'assigned,in_progress' }).then((r) => r.data),
  });

  const { data: overdueTasks } = useQuery({
    queryKey: ['tasks', 'overdue', 'count'],
    queryFn: () => tasksApi.myTasks({ isOverdue: true, limit: 1 }).then((r) => r.data),
  });

  const { data: docs, isLoading: dl } = useQuery({
    queryKey: ['edms', 'recent'],
    queryFn: () => edmsApi.list({ limit: 5, sort: 'updatedAt:desc' }).then((r) => r.data),
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationsApi.list({ isRead: false, limit: 5 }).then((r) => r.data),
  });

  if (tl || dl) return <LoadingScreen />;

  const pendingTaskCount = tasks?.total ?? 0;
  const overdueCount = overdueTasks?.total ?? 0;
  const unreadCount = notifications?.total ?? 0;
  const docsInWorkflow = docs?.data.filter((d) => d.status === 'workflow').length ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Welcome back, {user?.displayName?.split(' ')[0] ?? 'User'}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">Here's what needs your attention today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Tasks" value={pendingTaskCount} to="/tasks" color="border-blue-500" />
        <StatCard label="Overdue Tasks" value={overdueCount} to="/tasks?overdue=true" color="border-red-500" />
        <StatCard label="Docs in Workflow" value={docsInWorkflow} to="/edms?status=workflow" color="border-yellow-500" />
        <StatCard label="Unread Alerts" value={unreadCount} to="/notifications" color="border-brand-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Tasks */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">My Tasks</h3>
            <Link to="/tasks" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <ul className="divide-y divide-gray-50">
            {tasks?.data.length === 0 && (
              <li className="px-5 py-4 text-sm text-gray-400">No active tasks.</li>
            )}
            {tasks?.data.map((task) => (
              <li key={task.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <Link to={`/tasks/${task.id}`} className="text-sm font-medium text-gray-800 hover:text-brand-600 truncate block">
                    {task.title}
                  </Link>
                  {task.dueDate && (
                    <p className={`text-xs mt-0.5 ${task.isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                      Due {formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <StatusBadge value={task.status} />
              </li>
            ))}
          </ul>
        </div>

        {/* Recent Documents */}
        <div className="card">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Recent Documents</h3>
            <Link to="/edms" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <ul className="divide-y divide-gray-50">
            {docs?.data.length === 0 && (
              <li className="px-5 py-4 text-sm text-gray-400">No documents found.</li>
            )}
            {docs?.data.map((doc) => (
              <li key={doc.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <Link to={`/edms/${doc.id}`} className="text-sm font-medium text-gray-800 hover:text-brand-600 truncate block">
                    {doc.registrationNumber ? `${doc.registrationNumber} — ` : ''}{doc.title}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">{doc.documentType}</p>
                </div>
                <StatusBadge value={doc.status} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Notifications */}
      {(notifications?.data.length ?? 0) > 0 && (
        <div className="card">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Unread Notifications</h3>
            <Link to="/notifications" className="text-xs text-brand-600 hover:underline">View all</Link>
          </div>
          <ul className="divide-y divide-gray-50">
            {notifications?.data.map((n) => (
              <li key={n.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50">
                <div
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    n.priority === 'CRITICAL' ? 'bg-red-500' :
                    n.priority === 'HIGH' ? 'bg-orange-400' : 'bg-brand-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{n.body}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
