import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listPositions } from "@/lib/admin";
import { listChatChannels } from "@/lib/chat";
import { createChatChannelAction, createDirectChannelAction } from "./actions";

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-GB");
}

export default async function ChatChannelsPage() {
  const [channels, positions] = await Promise.all([listChatChannels(), listPositions()]);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="w-fit">
              Chat
            </Badge>
            <div className="space-y-1">
              <CardTitle className="font-heading text-3xl">Channels</CardTitle>
              <CardDescription>Secure messaging channels and direct coordination lines.</CardDescription>
            </div>
          </div>
          <Badge variant="secondary">{channels.length} active channels</Badge>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-2">
          <form action={createChatChannelAction} className="space-y-4 rounded-3xl border border-border/70 bg-background/80 p-5">
            <h3 className="text-lg font-semibold text-foreground">Create group channel</h3>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Name</span>
              <Input name="name" required />
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Classification</span>
              <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="1" name="classification">
                <option value="0">Public</option>
                <option value="1">Internal</option>
                <option value="2">Confidential</option>
                <option value="3">Secret</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Retention days</span>
              <Input min="1" name="retentionDays" type="number" />
            </label>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground">Members</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {positions.map((position) => (
                  <label key={position.id} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground">
                    <input className="mt-0.5 size-4 accent-[var(--primary)]" name="memberPositionIds" type="checkbox" value={position.id} />
                    <span>
                      {position.title}
                      {position.departmentName ? ` (${position.departmentName})` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button type="submit">Create group</Button>
          </form>

          <form action={createDirectChannelAction} className="space-y-4 rounded-3xl border border-border/70 bg-background/80 p-5">
            <h3 className="text-lg font-semibold text-foreground">Start direct channel</h3>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Target position</span>
              <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="" name="targetPositionId">
                <option disabled value="">
                  Select position
                </option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.title}
                    {position.departmentName ? ` (${position.departmentName})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Open DM</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Active channels</CardTitle>
          <CardDescription>Recent activity, unread counts, and channel status.</CardDescription>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No channels available.
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((channel) => (
                <Link
                  key={channel.id}
                  className="block rounded-3xl border border-border/70 bg-background/80 p-5 transition hover:border-primary/35 hover:shadow-sm"
                  href={`/chat/${channel.id}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">{channel.name}</h3>
                        <Badge variant="outline">{channel.type}</Badge>
                        <Badge variant="secondary">{channel.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        class {channel.classification} | unread {channel.unreadCount}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatDateTime(channel.updatedAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
