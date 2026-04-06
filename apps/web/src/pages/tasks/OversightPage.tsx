import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { tasksApi } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingScreen } from '@/components/shared/Spinner';
import { formatDistanceToNow } from 'date-fns';

export default function OversightPage() {
  const [status, setStatus] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'oversight', { status, overdueOnly, page }],
    queryFn: () =>
      tasksApi.oversight({
        status: status || undefined,
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
        title="Task Oversight"
        subtitle={`${data?.total ?? 0} tasks across your subordinates`}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="input w-auto text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          {['', 'assigned', 'in_progress', 'blocked', 'overdue', 'done'].map((s) => (
            <option key={s} value={s}>{s || 'All Statuses'}</option>
          ))}
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

      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Title', 'Assignee', 'Priority', 'Due', 'Status'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.data.map((task) => (
              <tr key={task.id} className={`hover:bg-gray-50 ${task.isOverdue ? 'bg-red-50/30' : ''}`}>
                <td className="px-4 py-3">
                  <Link to={`/tasks/${task.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                    {task.title}
                  </Link>
                  {task.isOverdue && (
                    <span className="ml-2 badge bg-red-100 text-red-600 text-xs">Overdue</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{task.assigneeName ?? '—'}</td>
                <td className="px-4 py-3"><StatusBadge value={task.priority} /></td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {task.dueDate
                    ? formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })
                    : '—'}
                </td>
                <td className="px-4 py-3"><StatusBadge value={task.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.data.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No tasks in your oversight scope.</p>
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
