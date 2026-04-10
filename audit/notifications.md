# Module: Notifications

## Overview
Multi-channel notification delivery system supporting in-app, email (SMTP), SMS (HTTP), Telegram Bot, and Web Push (VAPID). User preferences control which channels are active, with per-channel throttle settings to prevent alert fatigue.

---

## Current Issues

- ❌ **No retry mechanism for failed deliveries** — If SMTP, SMS, or Telegram fails (network timeout, provider down), the notification is simply logged as failed. There is no queue-based retry with exponential backoff.
- ❌ **Telegram webhook secret defined but no webhook handler** — `TELEGRAM_WEBHOOK_SECRET` is in `.env.example` and presumably validated, but no controller or route exists to receive incoming Telegram updates. The integration is send-only with no bidirectional capability.
- ❌ **Template coverage is incomplete** — Only `TASK_*` templates are defined. EDMS events (document registered, resolution issued), system alerts, audit warnings, and call invitations have no templates.
- ❌ **Throttle implementation unclear** — The preference entity has `throttleSettings` but the throttle enforcement logic in `NotificationsService` is not clearly implemented. There may be no actual rate limiting applied.
- ❌ **Web Push subscription lifecycle not managed** — Push subscriptions expire or become invalid (browser uninstalled, permissions revoked). Invalid subscriptions are never pruned, causing silent delivery failures.

---

## Missing Functionality

- 🚫 **Queue-based delivery with retry** — BullMQ (backed by Redis) job queue per channel with 3 retries and exponential backoff.
- 🚫 **Delivery status tracking** — Per-channel `DeliveryAttempt` records (timestamp, status, error message) for observability.
- 🚫 **Unsubscribe / opt-out enforcement** — No global unsubscribe mechanism; legal requirement for email.
- 🚫 **Notification digest** — Batch multiple related notifications into a single daily/weekly digest email.
- 🚫 **Template management UI / API** — No CRUD for templates; adding a new event type requires a code deploy.
- 🚫 **Missing notification templates** — `EDMS_*`, `FILE_*`, `CALL_*`, `SYSTEM_*`, `AUTH_*` template namespaces.

---

## Technical Debt

- 🧱 **`EmailNotificationProvider` has direct Nodemailer coupling** — The provider creates a transport inline with config values. Testing requires a real SMTP server. Should use a transport factory abstracted behind an interface.
- 🧱 **SMS provider is a plain HTTP POST** — No SDK abstraction. Changing SMS vendors requires editing the provider class. Should use a provider interface with swappable implementations.
- 🧱 **Channel providers not individually feature-flagged at runtime** — If SMTP goes down, all email notifications fail immediately. Should degrade gracefully to in-app only.
- 🧱 **Notification preferences are user-scoped, not position-scoped** — For government roles, notification routing should consider position (e.g., acting assignments should receive notifications for the acting position).

---

## Risks

- 🔓 **Lost notifications on provider failure** — No retry means critical alerts (task overdue, security event) may be silently dropped.
- 🔓 **Spam risk without throttle** — If throttle is not enforced, a single incident generating 100 task updates could send 100 emails to a single user.
- 🔓 **Push subscription data persisted indefinitely** — Old subscriptions for decommissioned browsers accumulate, wasting storage and generating errors.

---

## Recommendations

- ✅ **Introduce BullMQ notification queue:**
  ```typescript
  // notification.processor.ts
  @Processor('notifications')
  export class NotificationProcessor {
    @Process('send')
    async handle(job: Job<NotificationJob>) {
      await this.providers[job.data.channel].send(job.data);
    }
  }
  ```
- ✅ **Add delivery attempt logging:**
  ```typescript
  // notification-delivery-attempt.entity.ts
  { notificationId, channel, attemptedAt, status: 'sent'|'failed', errorMessage }
  ```
- ✅ **Implement throttle with Redis sliding window:**
  ```typescript
  const key = `notif_throttle:${userId}:${channel}:${eventType}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, throttleWindowSeconds);
  if (count > maxPerWindow) return; // skip
  ```
- ✅ **Add periodic push subscription validation** — Cron job sends a silent ping to each subscription; mark invalid ones as inactive on 410 Gone response.
- ✅ **Define missing templates** in `notification-templates.ts` — at minimum: `EDMS_DOCUMENT_REGISTERED`, `EDMS_RESOLUTION_ISSUED`, `CALL_INVITED`, `SYSTEM_MAINTENANCE`.
