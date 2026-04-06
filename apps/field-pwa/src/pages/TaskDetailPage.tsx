import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getTask, updateTaskStatus } from '../lib/api';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'open'],
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    if (!id) return;
    getTask(id)
      .then(setTask)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [id]);

  async function handleStatusChange(newStatus: string) {
    if (!task) return;
    setSaving(true);
    setError(null);
    setQueued(false);

    try {
      const updated = await updateTaskStatus(task.id, newStatus, comment || undefined);
      setTask(updated);
      setComment('');
    } catch (err: any) {
      if (err.message === 'OFFLINE_QUEUED') {
        setQueued(true);
        setTask((prev: any) => ({ ...prev, status: newStatus }));
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <p className="text-slate-400">Task not found</p>
      </div>
    );
  }

  const transitions = ALLOWED_TRANSITIONS[task.status] ?? [];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="bg-slate-800 px-4 py-3 flex items-center gap-3 shadow-lg">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-400 hover:text-white text-xl font-light"
        >
          ←
        </button>
        <h1 className="font-bold text-base flex-1 truncate">{task.title}</h1>
      </header>

      <div className="p-4 space-y-4">
        <div className="bg-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex gap-3 text-sm">
            <span className="text-slate-400">Status</span>
            <span className="font-medium capitalize">{task.status.replace('_', ' ')}</span>
          </div>
          <div className="flex gap-3 text-sm">
            <span className="text-slate-400">Priority</span>
            <span className="font-medium capitalize">{task.priority}</span>
          </div>
          {task.dueDate && (
            <div className="flex gap-3 text-sm">
              <span className="text-slate-400">Due</span>
              <span>{new Date(task.dueDate).toLocaleDateString()}</span>
            </div>
          )}
          {task.description && (
            <p className="text-sm text-slate-300 border-t border-slate-700 pt-3">
              {task.description}
            </p>
          )}
        </div>

        {queued && (
          <div className="bg-amber-900/40 text-amber-300 text-sm rounded-lg px-3 py-2">
            Status update saved offline — will sync when online
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 text-red-300 text-sm rounded-lg px-3 py-2">{error}</div>
        )}

        {transitions.length > 0 && (
          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Update Status</h2>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (optional)"
              rows={3}
              className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2 flex-wrap">
              {transitions.map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-lg px-4 py-2 capitalize transition-colors"
                >
                  {saving ? '…' : `Mark ${status.replace('_', ' ')}`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
