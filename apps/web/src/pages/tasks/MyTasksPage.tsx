import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tasksApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingScreen } from '@/components/shared/Spinner';
import { formatDistanceToNow, isPast } from 'date-fns';

const STATUS_OPTIONS = ['', 'assigned', 'in_progress', 'blocked', 'done', 'cancelled'];
const PRIORITY_OPTIONS = ['', 'low', 'normal', 'high', 'critical'];

export default function MyTasksPage() {
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'my', { status, priority, overdueOnly, page }],
    queryFn: () =>
      tasksApi.myTasks({
        status: status || undefined,
        priority: priority || undefined,
        isOverdue: overdueOnly || undefined,
        page,
        limit: LIMIT,
      }).then((r) => r.data),
  });

  if (isLoading) return <LoadingScreen />;
  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader
        title="My Tasks"
        subtitle={`${data?.total ?? 0} tasks assigned to you`}
        action={<Link to="/tasks/new" className="btn-primary">+ New Task</Link>}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select className="input w-auto text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </select>
        <select className="input w-auto text-sm" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}>
          {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p || 'All Priorities'}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => { setOverdueOnly(e.target.checked); setPage(1); }}
            className="rounded border-gray-300"
          />
          Overdue only
        </label>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {data?.data.map((task) => (
          <Link
            key={task.id}
            to={`/tasks/${task.id}`}
            className="card flex items-center gap-4 p-4 hover:shadow-md transition-shadow block"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                {task.isOverdue && (
                  <span className="badge bg-red-100 text-red-600 shrink-0">Overdue</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                {task.dueDate && (
                  <span className={`text-xs ${
                    task.isOverdue ? 'text-red-500' :
                    isPast(new Date(task.dueDate)) ? 'text-orange-500' : 'text-gray-400'
                  }`}>
                    Due {formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}
                  </span>
                )}
                {task.assigneeName && (
                  <span className="text-xs text-gray-400">{task.assigneeName}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge value={task.priority} />
              <StatusBadge value={task.status} />
            </div>
          </Link>
        ))}
        {data?.data.length === 0 && (
          <div className="card p-8 text-center text-sm text-gray-400">No tasks found.</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
