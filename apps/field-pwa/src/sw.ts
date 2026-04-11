/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<unknown>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
clientsClaim();

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/tasks'),
  new StaleWhileRevalidate({
    cacheName: 'tasks-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24,
      }),
    ],
  }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/auth'),
  new NetworkOnly(),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/tiles/'),
  new CacheFirst({
    cacheName: 'tile-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  }),
);

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  if (!payload) {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body ?? '',
      tag: payload.tag ?? 'coescd-notification',
      data: {
        actionUrl: payload.actionUrl ?? '/tasks',
        ...(payload.data ?? {}),
      },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = String(event.notification.data?.actionUrl ?? '/tasks');
  const targetUrl = new URL(rawUrl, self.location.origin).toString();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url === targetUrl) {
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});

// ── BackgroundSync: drain the IndexedDB incident queue when connectivity returns ──

const SYNC_TAG = 'incident-sync';

self.addEventListener('sync', (event) => {
  // 'sync' event arrives when the browser detects restored connectivity
  if ((event as SyncEvent).tag === SYNC_TAG) {
    event.waitUntil(flushIncidentQueue());
  }
});

/**
 * Drain pending_ops from IndexedDB by replaying each stored request.
 * Runs in the service worker context — uses fetch() directly.
 * Successful items are deleted; failed items increment their attempt count
 * and remain in the queue for the next sync opportunity.
 */
async function flushIncidentQueue(): Promise<void> {
  let db: IDBDatabase;

  try {
    db = await openFieldPwaDb();
  } catch {
    // Can't open DB in this SW context — give up and let the page handle it
    return;
  }

  const ops = await getAllPendingOps(db);
  const MAX_ATTEMPTS = 5;

  for (const op of ops) {
    if (op.attempts >= MAX_ATTEMPTS) continue; // already given up

    try {
      const res = await fetch(op.url, {
        method: op.method,
        headers: op.headers as Record<string, string>,
        body: op.body,
      });

      if (res.ok) {
        await deletePendingOp(db, op.id);
      } else {
        await incrementOpAttempts(db, op.id);
      }
    } catch {
      await incrementOpAttempts(db, op.id);
    }
  }
}

// ── Minimal IndexedDB helpers for the service worker context ──
// (Cannot import idb library here — use raw IDBDatabase APIs)

interface SwPendingOp {
  id: number;
  url: string;
  method: string;
  body: string;
  headers: unknown;
  attempts: number;
}

function openFieldPwaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('coescd-field', 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllPendingOps(db: IDBDatabase): Promise<SwPendingOp[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_ops', 'readonly');
    const req = tx.objectStore('pending_ops').getAll();
    req.onsuccess = () => resolve(req.result as SwPendingOp[]);
    req.onerror = () => reject(req.error);
  });
}

function deletePendingOp(db: IDBDatabase, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_ops', 'readwrite');
    const req = tx.objectStore('pending_ops').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function incrementOpAttempts(db: IDBDatabase, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_ops', 'readwrite');
    const store = tx.objectStore('pending_ops');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const op = getReq.result as SwPendingOp | undefined;
      if (op) {
        op.attempts += 1;
        const putReq = store.put(op);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve();
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// Extend the ServiceWorkerGlobalScope type to include the sync event
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

function parsePushPayload(
  event: PushEvent,
): {
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  tag?: string;
  data?: Record<string, unknown>;
} | null {
  try {
    if (event.data) {
      const parsed = event.data.json() as {
        title?: string;
        body?: string;
        actionUrl?: string;
        tag?: string;
        data?: Record<string, unknown>;
      };
      return {
        title: parsed.title ?? 'CoESCD notification',
        body: parsed.body ?? '',
        actionUrl: parsed.actionUrl ?? '/tasks',
        tag: parsed.tag,
        data: parsed.data ?? {},
      };
    }
  } catch {
    if (event.data) {
      return {
        title: 'CoESCD notification',
        body: event.data.text(),
        actionUrl: '/tasks',
      };
    }
  }

  return {
    title: 'CoESCD notification',
    body: '',
    actionUrl: '/tasks',
  };
}

export {};
