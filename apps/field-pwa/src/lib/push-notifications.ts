/**
 * Web Push Notifications helper.
 * Handles permission request, subscription management, and sending
 * the subscription endpoint to the backend for server-side push.
 */
const BASE = '/api/v1';

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
}

export async function subscribeToPush(accessToken: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const registration = await navigator.serviceWorker.ready;

  // Public VAPID key — should come from env or backend config endpoint
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
  if (!vapidPublicKey) {
    console.warn('VITE_VAPID_PUBLIC_KEY not set — push notifications disabled');
    return;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  // Register subscription with backend
  await fetch(`${BASE}/notifications/push-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(subscription.toJSON()),
  });
}

export async function unsubscribeFromPush(accessToken: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await subscription.unsubscribe();

  await fetch(`${BASE}/notifications/push-subscription`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
}

/** Convert base64 VAPID public key to Uint8Array for subscribe() */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
