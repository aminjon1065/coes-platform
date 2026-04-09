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
import {
  endCallAction,
  joinCallAction,
  leaveCallAction,
  startCallRecordingAction,
  stopCallRecordingAction,
} from "../actions";
import { moderateParticipantAction, removeParticipantAction } from "./actions";
import { CallSessionLiveView } from "@/components/calls/CallSessionLiveView";
import { MediaCallClient } from "@/components/calls/MediaCallClient";
import { getSessionUser } from "@/lib/auth";
import { getCallSession } from "@/lib/calls";

type CallSessionPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CallSessionPage({ params }: CallSessionPageProps) {
  const { id } = await params;
  const [session, sessionUser] = await Promise.all([getCallSession(id), getSessionUser()]);
  const currentParticipant = session.participants.find(
    (participant) =>
      participant.userId === sessionUser?.credentialId || participant.userId === sessionUser?.id,
  );
  const activeRecording = session.recordings.find((recording) => recording.status === "recording");
  const isModerator = Boolean(currentParticipant?.isModerator);

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link className="transition hover:text-foreground" href="/calls">
          Calls
        </Link>{" "}
        / {session.title ?? session.id}
      </nav>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{session.status}</Badge>
            <Badge variant="secondary">Class {session.classification}</Badge>
            <Badge variant="secondary">Max {session.maxParticipants}</Badge>
          </div>
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">
              {session.title ?? "Untitled call session"}
            </CardTitle>
            <CardDescription>channel {session.channelId}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            initiated by {session.initiatedById}
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            started {session.actualStart ?? "n/a"}
          </div>
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
            ended {session.endedAt ?? "active"}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardContent className="pt-6">
          <CallSessionLiveView session={session} />
        </CardContent>
      </Card>

      {session.status === "active" ? <MediaCallClient sessionId={session.id} /> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Moderator controls</CardTitle>
            <CardDescription>Session membership, lifecycle, and recording controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentParticipant ? (
              <form action={leaveCallAction}>
                <input name="sessionId" type="hidden" value={session.id} />
                <Button type="submit" variant="outline">
                  Leave call
                </Button>
              </form>
            ) : (
              <form action={joinCallAction}>
                <input name="sessionId" type="hidden" value={session.id} />
                <Button type="submit">Join call</Button>
              </form>
            )}

            {session.status === "active" ? (
              <form action={endCallAction}>
                <input name="sessionId" type="hidden" value={session.id} />
                <Button type="submit" variant="outline">
                  End session
                </Button>
              </form>
            ) : null}

            {session.status === "active" && !activeRecording ? (
              <form action={startCallRecordingAction}>
                <input name="sessionId" type="hidden" value={session.id} />
                <Button type="submit" variant="outline">
                  Start recording
                </Button>
              </form>
            ) : null}

            {activeRecording ? (
              <form action={stopCallRecordingAction}>
                <input name="sessionId" type="hidden" value={session.id} />
                <input name="recordingId" type="hidden" value={activeRecording.id} />
                <Button type="submit" variant="outline">
                  Stop recording
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Operational notes</CardTitle>
            <CardDescription>How realtime media and recordings are handled in the portal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Live participant and recording state is streamed through the shared portal realtime gateway.
            </p>
            <p>
              Browser media uses the dedicated mediasoup service in `apps/media`, while this page remains the control plane for permissions, lifecycle, and recording.
            </p>
            <p>
              Recordings finalize server-side into a session artifact manifest. While the recorder is shutting down, the status stays in `processing`.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Recordings</CardTitle>
          <CardDescription>Session capture state and downloadable archives.</CardDescription>
        </CardHeader>
        <CardContent>
          {session.recordings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
              No recordings for this session yet.
            </div>
          ) : (
            <div className="space-y-4">
              {session.recordings.map((recording) => (
                <div key={recording.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{recording.status}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    started {recording.startedAt} | stopped {recording.stoppedAt ?? "active"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    duration {recording.durationSeconds ?? "n/a"}s | size {recording.sizeBytes ?? "n/a"} bytes
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    artifact {recording.storageKey ?? "not finalized yet"}
                  </p>
                  {recording.status === "ready" ? (
                    <a
                      className="mt-3 inline-flex text-sm font-medium text-primary transition hover:text-primary/80"
                      href={`/api/calls/recordings/${recording.id}/download`}
                    >
                      Download archive
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isModerator ? (
        <Card className="border-border/60 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Participant moderation</CardTitle>
            <CardDescription>Moderator-only actions for other session participants.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {session.participants
                .filter((participant) => participant.id !== currentParticipant?.id)
                .map((participant) => (
                  <div key={participant.id} className="rounded-3xl border border-border/70 bg-background/80 p-5">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-foreground">{participant.displayName}</p>
                        <Badge variant="outline">{participant.status}</Badge>
                        {participant.isModerator ? <Badge variant="secondary">moderator</Badge> : null}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <form action={moderateParticipantAction}>
                        <input name="sessionId" type="hidden" value={session.id} />
                        <input name="participantId" type="hidden" value={participant.id} />
                        <input name="audioMuted" type="hidden" value={String(!participant.audioMuted)} />
                        <Button type="submit" variant="outline">
                          {participant.audioMuted ? "Unmute audio" : "Mute audio"}
                        </Button>
                      </form>
                      <form action={moderateParticipantAction}>
                        <input name="sessionId" type="hidden" value={session.id} />
                        <input name="participantId" type="hidden" value={participant.id} />
                        <input name="videoMuted" type="hidden" value={String(!participant.videoMuted)} />
                        <Button type="submit" variant="outline">
                          {participant.videoMuted ? "Enable video" : "Mute video"}
                        </Button>
                      </form>
                      <form action={removeParticipantAction}>
                        <input name="sessionId" type="hidden" value={session.id} />
                        <input name="participantId" type="hidden" value={participant.id} />
                        <Button type="submit" variant="outline">
                          Remove participant
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
