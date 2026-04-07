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
