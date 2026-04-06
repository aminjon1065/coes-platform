import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/lib/api';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { LoadingScreen } from '@/components/shared/Spinner';
import { formatDistanceToNow, format } from 'date-fns';

const TRANSITIONS: Record<string, string[]> = {
  draft: ['assigned'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['blocked', 'done', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);

  const { data: task, isLoading } = useQuery({
    queryKey: ['tasks', 'detail', id],
    queryFn: () => tasksApi.get(id!).then((r) => r.data),
    enabled: !!id,
  });

  const transitionMutation = useMutation({
    mutationFn: (status: string) => tasksApi.transition(id!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', 'detail', id] });
      setConfirmStatus(null);
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => tasksApi.comment(id!, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', 'detail', id] });
      setComment('');
    },
  });

  if (isLoading) return <LoadingScreen />;
  if (!task) return <div className="text-sm text-gray-500">Task not found.</div>;

  const nextStatuses = TRANSITIONS[task.status] ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 flex items-center gap-1">
        <Link to="/tasks" className="hover:text-brand-600">My Tasks</Link>
        <span>/</span>
        <span className="text-gray-800 truncate max-w-xs">{task.title}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <StatusBadge value={task.status} />
            <StatusBadge value={task.priority} />
            {task.isOverdue && <span className="badge bg-red-100 text-red-600">Overdue</span>}
          </div>
          <h2 className="text-xl font-semibold text-gray-900">{task.title}</h2>
          {task.dueDate && (
            <p className={`text-sm ${task.isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
              Due {format(new Date(task.dueDate), 'dd MMM yyyy')}
            </p>
          )}
        </div>
        {nextStatuses.length > 0 && (
          <div className="flex gap-2 shrink-0">
            {nextStatuses.map((s) => (
              <button
                key={s}
                className={s === 'cancelled' ? 'btn-danger' : 'btn-primary'}
                onClick={() => setConfirmStatus(s)}
              >
                → {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {/* Subtasks */}
      {task.subtasks.length > 0 && (
        <div className="card p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Subtasks ({task.subtasks.length})
          </h3>
          <div className="space-y-2">
            {task.subtasks.map((sub) => (
              <Link
                key={sub.id}
                to={`/tasks/${sub.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1 text-sm text-gray-800">{sub.title}</div>
                <StatusBadge value={sub.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Comments ({task.comments.length})
        </h3>
        <div className="space-y-3">
          {task.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-medium shrink-0">
                {c.authorName[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-800">{c.authorName}</span>
                  <span className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{c.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Add comment */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <textarea
            className="input flex-1 resize-none text-sm"
            rows={2}
            placeholder="Add a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            className="btn-primary self-end"
            disabled={!comment.trim() || commentMutation.isPending}
            onClick={() => commentMutation.mutate()}
          >
            Post
          </button>
        </div>
      </div>

      {/* Confirm status modal */}
      {confirmStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Confirm Status Change</h3>
            <p className="text-sm text-gray-600">
              Move task to <strong className="capitalize">{confirmStatus.replace('_', ' ')}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmStatus(null)}>Cancel</button>
              <button
                className={confirmStatus === 'cancelled' ? 'btn-danger' : 'btn-primary'}
                onClick={() => transitionMutation.mutate(confirmStatus)}
                disabled={transitionMutation.isPending}
              >
                {transitionMutation.isPending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
