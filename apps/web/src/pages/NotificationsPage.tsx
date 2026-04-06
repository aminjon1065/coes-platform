import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type Notification } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingScreen } from '@/components/shared/Spinner';
import { formatDistanceToNow } from 'date-fns';

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-400',
  NORMAL: 'bg-brand-500',
  LOW: 'bg-gray-400',
};

function NotificationRow({ n, onRead }: { n: Notification; onRead: (id: string) => void }) {
  return (
    <div
      className={`flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors cursor-pointer ${!n.isRead ? 'bg-blue-50/40' : ''}`}
      onClick={() => { if (!n.isRead) onRead(n.id); }}
    >
      <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[n.priority] ?? 'bg-gray-400'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${n.isRead ? 'font-normal text-gray-700' : 'font-semibold text-gray-900'}`}>
          {n.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
      </div>
      <div className="text-right shrink-0 space-y-1">
        <p className="text-xs text-gray-400">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
        </p>
        <p className="text-xs text-gray-400 capitalize">{n.type.replace(/_/g, ' ').toLowerCase()}</p>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: () => notificationsApi.list({ limit: 50 }).then((r) => r.data),
  });

  const markRead = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  if (isLoading) return <LoadingScreen />;

  const unreadCount = data?.data.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        action={
          unreadCount > 0 ? (
            <button
              className="btn-secondary"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </button>
          ) : undefined
        }
      />

      <div className="card overflow-hidden divide-y divide-gray-100">
        {data?.data.map((n) => (
          <NotificationRow key={n.id} n={n} onRead={(id) => markRead.mutate(id)} />
        ))}
        {data?.data.length === 0 && (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">No notifications yet.</p>
        )}
      </div>
    </div>
  );
}
