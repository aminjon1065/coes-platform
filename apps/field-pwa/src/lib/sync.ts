/**
 * Offline queue sync — drains pending_ops from IndexedDB when connectivity is restored.
 * Called on app startup and on navigator 'online' events.
 */
import { useAuthStore } from '../store/auth.store';
import {
  getPendingOperations,
  deletePendingOperation,
  incrementAttempts,
} from './offline-db';

const MAX_ATTEMPTS = 5;

export async function syncPendingOperations(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  if (!navigator.onLine) return { synced: 0, failed: 0, remaining: 0 };

  const ops = await getPendingOperations();
  let synced = 0;
  let failed = 0;

  for (const op of ops) {
    if (op.attempts >= MAX_ATTEMPTS) {
      // Give up after MAX_ATTEMPTS — flag for user review
      failed++;
      continue;
    }

    const token = useAuthStore.getState().accessToken;
    const headers = {
      ...op.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    try {
      const res = await fetch(op.url, {
        method: op.method,
        headers,
        body: op.body,
      });

      if (res.ok) {
        await deletePendingOperation(op.id!);
        synced++;
      } else {
        await incrementAttempts(op.id!);
        failed++;
      }
    } catch {
      await incrementAttempts(op.id!);
      failed++;
    }
  }

  const remaining = (await getPendingOperations()).length;
  return { synced, failed, remaining };
}

/** Register online/offline event listeners to auto-sync and update badge */
export function registerSyncListeners(onStatusChange: (online: boolean) => void): () => void {
  const handleOnline = () => {
    onStatusChange(true);
    syncPendingOperations().catch(console.error);
  };
  const handleOffline = () => onStatusChange(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
