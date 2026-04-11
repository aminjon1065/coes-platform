import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTasks } from '../lib/api';
import { cacheTasks, getCachedTasks, type CachedTask } from '../lib/offline-db';
import { OfflineBadge } from '../components/OfflineBadge';
import { SyncStatus } from '../components/SyncStatus';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-600',
  in_progress: 'bg-yellow-600',
  completed: 'bg-green-600',
  cancelled: 'bg-slate-600',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
};

export default function TaskListPage() {
  const [tasks, setTasks] = useState<CachedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const unsubOnline = () => setOffline(false);
    const unsubOffline = () => setOffline(true);
    window.addEventListener('online', unsubOnline);
    window.addEventListener('offline', unsubOffline);
    return () => {
      window.removeEventListener('online', unsubOnline);
      window.removeEventListener('offline', unsubOffline);
    };
  }, []);

  useEffect(() => {
    loadTasks();
  }, [filterStatus]);

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await getTasks({ status: filterStatus || undefined });
      const cached: CachedTask[] = res.data.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignedTo: t.assignedTo ?? null,
        description: t.description ?? null,
        dueDate: t.dueDate ?? null,
        cachedAt: new Date().toISOString(),
      }));
      await cacheTasks(cached);
      setTasks(cached);
    } catch {
      // Fall back to cached
      const cached = await getCachedTasks();
      setTasks(filterStatus ? cached.filter((t) => t.status === filterStatus) : cached);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="bg-slate-800 px-4 py-3 flex items-center justify-between shadow-lg">
        <h1 className="font-bold text-lg">My Tasks</h1>
        <OfflineBadge />
      </header>

      <div className="px-4 py-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-700 text-white text-sm rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Sync status bar — shows pending queue count + manual sync button */}
      <div className="mx-4 mt-1 mb-3">
        <SyncStatus />
      </div>

      {offline && (
        <div className="mx-4 mb-3 bg-amber-900/40 text-amber-300 text-sm rounded-lg px-3 py-2">
          Offline — showing cached tasks. Reports will be sent when connectivity is restored.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-center text-slate-400 mt-12 text-sm">No tasks found</p>
      ) : (
        <ul className="px-4 space-y-2 pb-24">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                to={`/tasks/${task.id}`}
                className="block bg-slate-800 rounded-xl p-4 hover:bg-slate-750 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm line-clamp-2">{task.title}</span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[task.status] ?? 'bg-slate-600'}`}
                  >
                    {task.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                  <span className="font-semibold text-orange-400">
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </span>
                  {task.dueDate && (
                    <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 flex">
        <Link to="/tasks" className="flex-1 py-3 text-center text-xs text-blue-400 font-medium">
          Tasks
        </Link>
        <Link to="/report" className="flex-1 py-3 text-center text-xs text-slate-400">
          Report
        </Link>
        <Link to="/notifications" className="flex-1 py-3 text-center text-xs text-slate-400">
          Alerts
        </Link>
      </nav>
    </div>
  );
}
