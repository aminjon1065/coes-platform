/**
 * SyncStatus — shows the offline queue state: pending count, last sync time,
 * and a manual "Sync now" button.
 */
import { useState, useEffect, useCallback } from 'react';
import { getPendingOperations } from '../lib/offline-db';
import { syncPendingOperations } from '../lib/sync';

interface SyncState {
  pendingCount: number;
  lastSyncAt: Date | null;
  syncing: boolean;
  lastResult: { synced: number; failed: number } | null;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SyncStatus() {
  const [state, setState] = useState<SyncState>({
    pendingCount: 0,
    lastSyncAt: null,
    syncing: false,
    lastResult: null,
  });

  /** Refresh the pending count from IndexedDB */
  const refreshCount = useCallback(async () => {
    const ops = await getPendingOperations();
    setState((s) => ({ ...s, pendingCount: ops.length }));
  }, []);

  /** Manually trigger a sync flush */
  const handleSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setState((s) => ({ ...s, syncing: true, lastResult: null }));
    try {
      const result = await syncPendingOperations();
      setState((s) => ({
        ...s,
        syncing: false,
        pendingCount: result.remaining,
        lastSyncAt: new Date(),
        lastResult: { synced: result.synced, failed: result.failed },
      }));
    } catch {
      setState((s) => ({ ...s, syncing: false }));
    }
  }, []);

  // Poll pending count every 10 s (avoids IndexedDB observer complexity)
  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, 10_000);
    return () => clearInterval(interval);
  }, [refreshCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    const onOnline = () => handleSync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [handleSync]);

  const isOnline = navigator.onLine;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
        isOnline ? 'bg-slate-800' : 'bg-amber-900/60 border border-amber-700'
      }`}
    >
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-400' : 'bg-amber-400'}`}
      />

      {/* Label */}
      <span className={isOnline ? 'text-slate-300' : 'text-amber-200'}>
        {isOnline ? 'Online' : 'Offline'}
      </span>

      {/* Pending badge */}
      {state.pendingCount > 0 && (
        <span className="bg-amber-600 text-white px-1.5 py-0.5 rounded-full font-semibold">
          {state.pendingCount} pending
        </span>
      )}

      {/* Last sync */}
      {state.lastSyncAt && (
        <span className="text-slate-500 hidden sm:inline">
          Last sync {formatTime(state.lastSyncAt)}
        </span>
      )}

      {/* Result feedback */}
      {state.lastResult && state.lastResult.synced > 0 && (
        <span className="text-green-400">{state.lastResult.synced} sent</span>
      )}
      {state.lastResult && state.lastResult.failed > 0 && (
        <span className="text-red-400">{state.lastResult.failed} failed</span>
      )}

      {/* Sync button */}
      {isOnline && state.pendingCount > 0 && (
        <button
          onClick={handleSync}
          disabled={state.syncing}
          className="ml-auto text-blue-400 hover:text-blue-300 disabled:opacity-50 font-medium"
        >
          {state.syncing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  );
}
