import { authorizedBackendJson } from "@/lib/auth";

type BackendNotification = {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

type BackendNotificationPreference = {
  id: string;
  notificationType: string | null;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  telegram: boolean;
  push: boolean;
  emailThrottleMinutes: number;
  smsMinPriority: string;
  telegramMinPriority: string;
};

export type NotificationsData = {
  unreadCount: number;
  total: number;
  items: Array<{
    id: string;
    type: string;
    priority: string;
    title: string;
    body: string | null;
    href: string | null;
    isRead: boolean;
    createdAt: string;
  }>;
};

function normalizeValue(value: string) {
  return value.toLowerCase();
}

export async function getNotificationsData(limit = 50): Promise<NotificationsData> {
  const response = await authorizedBackendJson<{
    items: BackendNotification[];
    total: number;
    unreadCount: number;
  }>(`/notifications?limit=${limit}`);

  return {
    unreadCount: response.unreadCount,
    total: response.total,
    items: response.items.map((notification) => ({
      id: notification.id,
      type: normalizeValue(notification.type),
      priority: normalizeValue(notification.priority),
      title: notification.title,
      body: notification.body,
      href: notification.actionUrl,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    })),
  };
}

export async function markNotificationRead(notificationId: string) {
  await authorizedBackendJson<void>(`/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
}

export async function markAllNotificationsRead() {
  return authorizedBackendJson<{ updated: number }>("/notifications/read-all", {
    method: "POST",
  });
}

export async function getNotificationPreferences() {
  const response = await authorizedBackendJson<BackendNotificationPreference[]>(
    "/notifications/preferences",
  );

  return response.map((item) => ({
    id: item.id,
    notificationType: item.notificationType,
    inApp: item.inApp,
    email: item.email,
    sms: item.sms,
    telegram: item.telegram,
    push: item.push,
    emailThrottleMinutes: item.emailThrottleMinutes,
    smsMinPriority: normalizeValue(item.smsMinPriority),
    telegramMinPriority: normalizeValue(item.telegramMinPriority),
  }));
}
