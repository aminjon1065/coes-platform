import Link from "next/link";
import {
  endCallAction,
  joinCallAction,
  leaveCallAction,
  startCallRecordingAction,
  stopCallRecordingAction,
} from "../actions";
import {
  moderateParticipantAction,
  removeParticipantAction,
} from "./actions";
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
    <div className="portal-stack">
      <nav className="portal-note">
        <Link href="/calls">Calls</Link> / {session.title ?? session.id}
      </nav>

      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">{session.status}</span>
            <h2>{session.title ?? "Untitled call session"}</h2>
          </div>
        </div>
        <p className="portal-note">
          channel {session.channelId} | class {session.classification} | max {session.maxParticipants}
        </p>
        <p className="portal-note">
          initiated by {session.initiatedById} | started {session.actualStart ?? "n/a"} | ended {session.endedAt ?? "active"}
        </p>
      </section>

      <section className="portal-panel">
        <CallSessionLiveView session={session} />
      </section>

      {session.status === "active" ? <MediaCallClient sessionId={session.id} /> : null}

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Moderator controls</h2>
          </div>
          <div className="portal-stack">
            {currentParticipant ? (
              <form action={leaveCallAction} className="portal-form">
                <input name="sessionId" type="hidden" value={session.id} />
                <button className="portal-button secondary" type="submit">
                  Leave call
                </button>
              </form>
            ) : (
              <form action={joinCallAction} className="portal-form">
                <input name="sessionId" type="hidden" value={session.id} />
                <button className="portal-button" type="submit">
                  Join call
                </button>
              </form>
            )}

            {session.status === "active" ? (
              <form action={endCallAction} className="portal-form">
                <input name="sessionId" type="hidden" value={session.id} />
                <button className="portal-button secondary" type="submit">
                  End session
                </button>
              </form>
            ) : null}

            {session.status === "active" && !activeRecording ? (
              <form action={startCallRecordingAction} className="portal-form">
                <input name="sessionId" type="hidden" value={session.id} />
                <button className="portal-button secondary" type="submit">
                  Start recording
                </button>
              </form>
            ) : null}

            {activeRecording ? (
              <form action={stopCallRecordingAction} className="portal-form">
                <input name="sessionId" type="hidden" value={session.id} />
                <input name="recordingId" type="hidden" value={activeRecording.id} />
                <button className="portal-button secondary" type="submit">
                  Stop recording
                </button>
              </form>
            ) : null}
          </div>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Operational notes</h2>
          </div>
          <p className="portal-note">
            Live participant and recording state is streamed through the shared portal realtime gateway.
          </p>
          <p className="portal-note">
            Browser media now uses the dedicated mediasoup service in `apps/media`, while this page remains the control plane for permissions, lifecycle, and recording.
          </p>
          <p className="portal-note">
            Recordings finalize server-side into a session artifact manifest. While the recorder is shutting down, the status stays in `processing`.
          </p>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Recordings</h2>
        </div>
        {session.recordings.length === 0 ? (
          <p className="portal-note">No recordings for this session yet.</p>
        ) : (
          <ul className="portal-list">
            {session.recordings.map((recording) => (
              <li key={recording.id}>
                <strong>{recording.status}</strong>
                <p className="portal-note">
                  started {recording.startedAt} | stopped {recording.stoppedAt ?? "active"}
                </p>
                  <p className="portal-note">
                    duration {recording.durationSeconds ?? "n/a"}s | size {recording.sizeBytes ?? "n/a"} bytes
                  </p>
                  <p className="portal-note">
                    artifact {recording.storageKey ?? "not finalized yet"}
                  </p>
                  {recording.status === "ready" ? (
                    <p className="portal-note">
                      <a href={`/api/calls/recordings/${recording.id}/download`}>Download archive</a>
                    </p>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </section>

      {isModerator ? (
        <section className="portal-panel">
          <div className="portal-section-head">
            <h2>Participant moderation</h2>
          </div>
          <ul className="portal-list">
            {session.participants
              .filter((participant) => participant.id !== currentParticipant?.id)
              .map((participant) => (
                <li key={participant.id}>
                  <strong>{participant.displayName}</strong>
                  <p className="portal-note">
                    {participant.status}
                    {participant.isModerator ? " | moderator" : ""}
                  </p>
                  <div className="portal-actions">
                    <form action={moderateParticipantAction}>
                      <input name="sessionId" type="hidden" value={session.id} />
                      <input name="participantId" type="hidden" value={participant.id} />
                      <input name="audioMuted" type="hidden" value={String(!participant.audioMuted)} />
                      <button className="portal-button secondary" type="submit">
                        {participant.audioMuted ? "Unmute audio" : "Mute audio"}
                      </button>
                    </form>
                    <form action={moderateParticipantAction}>
                      <input name="sessionId" type="hidden" value={session.id} />
                      <input name="participantId" type="hidden" value={participant.id} />
                      <input name="videoMuted" type="hidden" value={String(!participant.videoMuted)} />
                      <button className="portal-button secondary" type="submit">
                        {participant.videoMuted ? "Enable video" : "Mute video"}
                      </button>
                    </form>
                    <form action={removeParticipantAction}>
                      <input name="sessionId" type="hidden" value={session.id} />
                      <input name="participantId" type="hidden" value={participant.id} />
                      <button className="portal-button secondary" type="submit">
                        Remove participant
                      </button>
                    </form>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
