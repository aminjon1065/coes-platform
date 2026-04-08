import Link from "next/link";
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
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Calls</span>
            <h2>Operational calls and scheduled meetings</h2>
          </div>
        </div>
        <p className="portal-note">
          Secure office calls share the portal session, channel context, and clearance
          model. Use this workspace for instant coordination and scheduled meetings.
        </p>
      </section>

      <section className="portal-columns admin-split">
        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Start call now</h2>
          </div>
          <form action={initiateCallAction} className="portal-form">
            <label>
              Channel
              <select className="portal-input" name="channelId" required>
                <option value="">Select chat channel</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name} | {channel.type} | class {channel.classification}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input className="portal-input" name="title" placeholder="Incident bridge" />
            </label>
            <label>
              Classification
              <input className="portal-input" defaultValue="1" max="3" min="0" name="classification" type="number" />
            </label>
            <label>
              Max participants
              <input className="portal-input" defaultValue="25" max="200" min="2" name="maxParticipants" type="number" />
            </label>
            <button className="portal-button" type="submit">
              Initiate call
            </button>
          </form>
        </article>

        <article className="portal-panel">
          <div className="portal-section-head">
            <h2>Schedule meeting</h2>
          </div>
          <form action={scheduleCallAction} className="portal-form">
            <label>
              Title
              <input className="portal-input" name="title" placeholder="Daily coordination" required />
            </label>
            <label>
              Description
              <textarea className="portal-input" name="description" rows={4} />
            </label>
            <label>
              Channel
              <select className="portal-input" defaultValue="" name="channelId">
                <option value="">No linked channel</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start
              <input
                className="portal-input"
                defaultValue={toDatetimeLocalValue(defaultStart)}
                name="scheduledStart"
                required
                type="datetime-local"
              />
            </label>
            <label>
              End
              <input
                className="portal-input"
                defaultValue={toDatetimeLocalValue(defaultEnd)}
                name="scheduledEnd"
                required
                type="datetime-local"
              />
            </label>
            <label>
              Classification
              <input className="portal-input" defaultValue="1" max="3" min="0" name="classification" type="number" />
            </label>
            <label>
              Max participants
              <input className="portal-input" defaultValue="25" max="200" min="2" name="maxParticipants" type="number" />
            </label>
            <button className="portal-button secondary" type="submit">
              Save schedule
            </button>
          </form>
        </article>
      </section>

      <section className="portal-panel">
        <div className="portal-section-head">
          <h2>Upcoming meetings</h2>
        </div>
        <p className="portal-note">{total} visible scheduled meetings</p>
        <ul className="portal-list">
          {schedules.length === 0 ? (
            <li>No upcoming meetings.</li>
          ) : (
            schedules.map((schedule) => (
              <li key={schedule.id}>
                <strong>{schedule.title}</strong>
                <p className="portal-note">
                  {schedule.scheduledStart} to {schedule.scheduledEnd}
                </p>
                <p className="portal-note">
                  class {schedule.classification} | max {schedule.maxParticipants} | organizer {schedule.organizerId}
                </p>
                {schedule.description ? <p className="portal-note">{schedule.description}</p> : null}
                {schedule.sessionId ? (
                  <p>
                    <Link className="portal-item-link" href={`/calls/${schedule.sessionId}`}>
                      Open active session
                    </Link>
                  </p>
                ) : null}
                {schedule.channelId ? (
                  <form action={initiateCallAction} className="portal-form">
                    <input name="channelId" type="hidden" value={schedule.channelId} />
                    <input name="title" type="hidden" value={schedule.title} />
                    <input name="classification" type="hidden" value={String(schedule.classification)} />
                    <input name="maxParticipants" type="hidden" value={String(schedule.maxParticipants)} />
                    <button className="portal-button secondary" type="submit">
                      Start from schedule
                    </button>
                  </form>
                ) : (
                  <p className="portal-note">No linked channel, schedule is informational only.</p>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
