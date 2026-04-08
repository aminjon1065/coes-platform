"use client";

import { useState } from "react";

type Preference = {
  notificationType: string | null;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  telegram: boolean;
  push: boolean;
  emailThrottleMinutes: number;
};

type Props = {
  initialPreferences: Preference[];
};

const CHANNELS: { key: keyof Preference; label: string }[] = [
  { key: "inApp", label: "In-app" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
  { key: "telegram", label: "Telegram" },
  { key: "sms", label: "SMS" },
];

const DEFAULT_PREF: Preference = {
  notificationType: null,
  inApp: true,
  email: true,
  sms: false,
  telegram: false,
  push: true,
  emailThrottleMinutes: 0,
};

export default function PreferencesForm({ initialPreferences }: Props) {
  const existing = initialPreferences.find((p) => p.notificationType === null) ?? DEFAULT_PREF;
  const [pref, setPref] = useState<Preference>(existing);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(channel: keyof Preference) {
    setSaved(false);
    setPref((prev) => ({ ...prev, [channel]: !prev[channel] }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationType: null,
          inApp: pref.inApp,
          email: pref.email,
          sms: pref.sms,
          telegram: pref.telegram,
          push: pref.push,
          emailThrottleMinutes: pref.emailThrottleMinutes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="portal-note">
        Default delivery channels for all notification types. Individual notification
        types can override these defaults.
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "1rem" }}>
        <thead>
          <tr>
            <th style={thStyle}>Channel</th>
            <th style={thStyle}>Enabled</th>
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map(({ key, label }) => (
            <tr key={key}>
              <td style={tdStyle}>{label}</td>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  checked={Boolean(pref[key])}
                  onChange={() => toggle(key)}
                />
              </td>
            </tr>
          ))}
          <tr>
            <td style={tdStyle}>Email throttle (minutes)</td>
            <td style={tdStyle}>
              <input
                type="number"
                min={0}
                max={1440}
                value={pref.emailThrottleMinutes}
                onChange={(e) => {
                  setSaved(false);
                  setPref((prev) => ({
                    ...prev,
                    emailThrottleMinutes: Math.max(0, Math.min(1440, Number(e.target.value))),
                  }));
                }}
                style={{ width: "80px" }}
              />
              <span className="portal-note" style={{ marginLeft: "0.5rem" }}>
                (0 = no throttle)
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {error && <p style={{ color: "var(--danger)", marginTop: "0.5rem" }}>{error}</p>}
      {saved && <p style={{ color: "var(--success, green)", marginTop: "0.5rem" }}>Saved.</p>}

      <button
        className="portal-button"
        style={{ marginTop: "1rem" }}
        onClick={save}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save preferences"}
      </button>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #eee",
};
