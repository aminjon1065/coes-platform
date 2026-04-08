import Link from "next/link";
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
    <div className="portal-stack">
      <section className="portal-panel">
        <div className="portal-section-head">
          <div>
            <span className="portal-pill">Chat</span>
            <h2>Channels</h2>
          </div>
          <p className="portal-note">{channels.length} active channels</p>
        </div>
        <div className="portal-columns admin-split">
          <form action={createChatChannelAction} className="portal-form">
            <h3>Create group channel</h3>
            <label>
              Name
              <input className="portal-input" name="name" required />
            </label>
            <label>
              Classification
              <select className="portal-input" defaultValue="1" name="classification">
                <option value="0">Public</option>
                <option value="1">Internal</option>
                <option value="2">Confidential</option>
                <option value="3">Secret</option>
              </select>
            </label>
            <label>
              Retention days
              <input className="portal-input" min="1" name="retentionDays" type="number" />
            </label>
            <fieldset className="portal-fieldset">
              <legend>Members</legend>
              <div className="portal-check-grid">
                {positions.map((position) => (
                  <label key={position.id} className="portal-check">
                    <input name="memberPositionIds" type="checkbox" value={position.id} />
                    <span>
                      {position.title}
                      {position.departmentName ? ` (${position.departmentName})` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="portal-button" type="submit">
              Create group
            </button>
          </form>

          <form action={createDirectChannelAction} className="portal-form">
            <h3>Start direct channel</h3>
            <label>
              Target position
              <select className="portal-input" defaultValue="" name="targetPositionId">
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
            <button className="portal-button" type="submit">
              Open DM
            </button>
          </form>
        </div>
      </section>

      <section className="portal-panel">
        <ul className="portal-list">
          {channels.length === 0 ? (
            <li>No channels available.</li>
          ) : (
            channels.map((channel) => (
              <li key={channel.id}>
                <div className="portal-row">
                  <div>
                    <Link className="portal-item-link" href={`/chat/${channel.id}`}>
                      {channel.name}
                    </Link>
                    <p className="portal-note">
                      {channel.type} · class {channel.classification} · {channel.status}
                    </p>
                  </div>
                  <div className="portal-metadata">
                    <span>Unread {channel.unreadCount}</span>
                    <span>{formatDateTime(channel.updatedAt)}</span>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
