import Link from "next/link";
import { getNotificationsData } from "@/lib/notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";

function formatRelativeTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export default async function NotificationsPage() {
  const notifications = await getNotificationsData();

  return (
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Notifications</span>
            <h2>Inbox</h2>
            <p className="portal-note">
              {notifications.unreadCount > 0
                ? `${notifications.unreadCount} unread items require review.`
                : "All caught up."}
            </p>
          </div>
          {notifications.unreadCount > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button className="portal-button secondary" type="submit">
                Mark all read
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="portal-panel">
        <ul className="portal-list">
          {notifications.items.length === 0 ? (
            <li>No notifications available.</li>
          ) : (
            notifications.items.map((notification) => (
              <li
                className={notification.isRead ? "portal-notification" : "portal-notification unread"}
                key={notification.id}
              >
                <div className="portal-row">
                  <div className="portal-notification-main">
                    <div className="portal-row">
                      <div>
                        {notification.href ? (
                          <Link className="portal-item-link" href={notification.href}>
                            {notification.title}
                          </Link>
                        ) : (
                          <span className="portal-item-link">{notification.title}</span>
                        )}
                        <p className="portal-note">
                          {notification.body ?? "No message body"} ·{" "}
                          {notification.type.replaceAll("_", " ")}
                        </p>
                      </div>
                      <span className="portal-pill">{notification.priority}</span>
                    </div>
                    <p className="portal-note">{formatRelativeTime(notification.createdAt)}</p>
                  </div>
                  {!notification.isRead ? (
                    <form action={markNotificationReadAction}>
                      <input name="id" type="hidden" value={notification.id} />
                      <button className="portal-button secondary" type="submit">
                        Mark read
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
