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
import { Textarea } from "@/components/ui/textarea";
import { initiateCallAction, scheduleCallAction } from "./actions";
import { listUpcomingCallSchedules } from "@/lib/calls";
import { listChatChannels } from "@/lib/chat";

function toDatetimeLocalValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hours = `${value.getHours()}`.padStart(2, "0");
  const minutes = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default async function CallsPage() {
  const [{ items: schedules, total }, channels] = await Promise.all([
    listUpcomingCallSchedules(),
    listChatChannels(),
  ]);
  const defaultStart = new Date();
  defaultStart.setHours(defaultStart.getHours() + 1, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setHours(defaultEnd.getHours() + 1);

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="outline" className="w-fit">
            Calls
          </Badge>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">Operational calls and scheduled meetings</CardTitle>
            <CardDescription>
              Secure calls reuse portal session, channel context, and clearance model.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Start call now</CardTitle>
            <CardDescription>Initiate an ad hoc bridge for an existing chat channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={initiateCallAction} className="grid gap-4">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Channel</span>
                <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" name="channelId" required>
                  <option value="">Select chat channel</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name} | {channel.type} | class {channel.classification}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Title</span>
                <Input name="title" placeholder="Incident bridge" />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Classification</span>
                  <Input defaultValue="1" max="3" min="0" name="classification" type="number" />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Max participants</span>
                  <Input defaultValue="25" max="200" min="2" name="maxParticipants" type="number" />
                </label>
              </div>
              <Button type="submit">Initiate call</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Schedule meeting</CardTitle>
            <CardDescription>Prepare a scheduled meeting and optionally bind it to a channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={scheduleCallAction} className="grid gap-4">
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Title</span>
                <Input name="title" placeholder="Daily coordination" required />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Description</span>
                <Textarea name="description" rows={4} />
              </label>
              <label className="space-y-2 text-sm font-medium text-foreground">
                <span>Channel</span>
                <select className="flex h-12 w-full rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15" defaultValue="" name="channelId">
                  <option value="">No linked channel</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Start</span>
                  <Input
                    defaultValue={toDatetimeLocalValue(defaultStart)}
                    name="scheduledStart"
                    required
                    type="datetime-local"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>End</span>
                  <Input
                    defaultValue={toDatetimeLocalValue(defaultEnd)}
                    name="scheduledEnd"
                    required
                    type="datetime-local"
                  />
                </label>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Classification</span>
                  <Input defaultValue="1" max="3" min="0" name="classification" type="number" />
                </label>
                <label className="space-y-2 text-sm font-medium text-foreground">
                  <span>Max participants</span>
                  <Input defaultValue="25" max="200" min="2" name="maxParticipants" type="number" />
                </label>
              </div>
              <Button type="submit" variant="outline">Save schedule</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="font-heading text-2xl">Upcoming meetings</CardTitle>
            <CardDescription>Future schedules visible to the current user.</CardDescription>
          </div>
          <Badge variant="secondary">{total} meetings</Badge>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No upcoming meetings.
            </div>
          ) : (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold text-foreground">{schedule.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {schedule.scheduledStart} to {schedule.scheduledEnd}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        class {schedule.classification} | max {schedule.maxParticipants} | organizer {schedule.organizerId}
                      </p>
                      {schedule.description ? (
                        <p className="text-sm text-muted-foreground">{schedule.description}</p>
                      ) : null}
                    </div>
                    {schedule.sessionId ? (
                      <Link href={`/calls/${schedule.sessionId}`}>
                        <Button type="button" variant="outline">Open active session</Button>
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    {schedule.channelId ? (
                      <form action={initiateCallAction}>
                        <input name="channelId" type="hidden" value={schedule.channelId} />
                        <input name="title" type="hidden" value={schedule.title} />
                        <input name="classification" type="hidden" value={String(schedule.classification)} />
                        <input name="maxParticipants" type="hidden" value={String(schedule.maxParticipants)} />
                        <Button type="submit" variant="outline">Start from schedule</Button>
                      </form>
                    ) : (
                      <p className="text-sm text-muted-foreground">No linked channel, schedule is informational only.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
