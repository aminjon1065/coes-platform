import Link from "next/link";
import { getNotificationsData } from "@/lib/notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,242,252,0.88))]">
          <CardHeader className="space-y-4">
            <Badge className="w-fit">Notifications</Badge>
            <div className="space-y-3">
              <CardTitle className="font-display text-4xl leading-tight">Inbox</CardTitle>
              <CardDescription className="max-w-2xl text-base">
                {notifications.unreadCount > 0
                  ? `${notifications.unreadCount} unread items require review.`
                  : "All caught up."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {notifications.unreadCount > 0 ? (
              <form action={markAllNotificationsReadAction}>
                <Button type="submit" variant="secondary">
                  Mark all read
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/70 bg-[linear-gradient(180deg,rgba(13,27,47,0.94),rgba(19,46,78,0.9))] text-white">
          <CardHeader>
            <CardDescription className="text-white/60">Message state</CardDescription>
            <CardTitle className="font-display text-3xl text-white">
              {notifications.items.length} item{notifications.items.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-white/70">
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Unread: {notifications.unreadCount}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
              Read: {notifications.items.length - notifications.unreadCount}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-2xl">Notification feed</CardTitle>
          <CardDescription>Priority and delivery feed for the current operator.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {notifications.items.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                No notifications available.
              </li>
            ) : (
              notifications.items.map((notification) => (
                <li className={`rounded-3xl border p-4 ${notification.isRead ? "border-border/70 bg-white/70" : "border-sky-200 bg-sky-50/70"}`} key={notification.id}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {notification.href ? (
                          <Link className="font-semibold text-foreground" href={notification.href}>
                            {notification.title}
                          </Link>
                        ) : (
                          <span className="font-semibold text-foreground">{notification.title}</span>
                        )}
                        <Badge variant="secondary">{notification.priority}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {notification.body ?? "No message body"} · {notification.type.replaceAll("_", " ")}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatRelativeTime(notification.createdAt)}</p>
                    </div>
                    {!notification.isRead ? (
                      <form action={markNotificationReadAction}>
                        <input name="id" type="hidden" value={notification.id} />
                        <Button type="submit" variant="secondary">
                          Mark read
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
