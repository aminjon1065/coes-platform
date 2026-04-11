import { useAuthStore } from '../store/auth.store';
import { enqueueOperation } from './offline-db';

const BASE = '/api/v1';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { offlineQueue?: boolean; queueType?: string } = {},
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  } catch (err) {
    // If offline and queueing is enabled, save to IndexedDB for later sync
    if (!navigator.onLine && options.offlineQueue && body !== undefined) {
      await enqueueOperation({
        type: (options.queueType ?? 'submit_form') as any,
        url: `${BASE}${path}`,
        method,
        body: JSON.stringify(body),
        headers,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });

      // Register a BackgroundSync tag so the service worker drains the queue
      // when connectivity is restored (falls back gracefully if not supported)
      try {
        const reg = await navigator.serviceWorker?.ready;
        if (reg && 'sync' in reg) {
          await (reg as any).sync.register('incident-sync');
        }
      } catch {
        // BackgroundSync not supported in this browser — sync.ts handles it via 'online' event
      }

      throw new Error('OFFLINE_QUEUED');
    }
    throw err;
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────

export function login(username: string, password: string) {
  return request<{ accessToken: string; refreshToken: string }>('POST', '/auth/login', {
    username,
    password,
  });
}

export function ldapLogin(username: string, password: string, domain?: string) {
  return request<{ accessToken: string; refreshToken: string }>('POST', '/auth/ldap/login', {
    username,
    password,
    domain,
  });
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export function getTasks(params: { status?: string; assignedTo?: string } = {}) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<{ data: any[]; total: number }>('GET', `/tasks${qs ? `?${qs}` : ''}`);
}

export function getTask(id: string) {
  return request<any>('GET', `/tasks/${id}`);
}

export function updateTaskStatus(id: string, status: string, comment?: string) {
  return request<any>(
    'PATCH',
    `/tasks/${id}/status`,
    { status, comment },
    { offlineQueue: true, queueType: 'update_task_status' },
  );
}

// ── Incidents ────────────────────────────────────────────────────────────────

export function reportIncident(payload: {
  title: string;
  description: string;
  incidentType: string;
  severity: string;
  coordinates: [number, number]; // [lng, lat]
  departmentId?: string;
}) {
  return request<any>(
    'POST',
    '/gis/incidents',
    payload,
    { offlineQueue: true, queueType: 'create_incident' },
  );
}

// ── Notifications ────────────────────────────────────────────────────────────

export function getNotifications(unreadOnly = false) {
  return request<{ data: any[]; total: number }>(
    'GET',
    `/notifications${unreadOnly ? '?unread=true' : ''}`,
  );
}
