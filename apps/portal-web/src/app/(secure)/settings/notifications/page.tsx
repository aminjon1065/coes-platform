import { authorizedBackendJson } from "@/lib/auth";
import PushToggle from "./PushToggle";
import TelegramPanel from "./TelegramPanel";
import PreferencesForm from "./PreferencesForm";
import Link from "next/link";

type Preference = {
  notificationType: string | null;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  telegram: boolean;
  push: boolean;
  emailThrottleMinutes: number;
};

async function getPreferences(): Promise<Preference[]> {
  try {
    return await authorizedBackendJson<Preference[]>("/notifications/preferences");
  } catch {
    return [];
  }
}

export default async function NotificationSettingsPage() {
  const preferences = await getPreferences();

  return (
    <div style={{ padding: "2rem", maxWidth: "720px" }}>
      <nav style={{ marginBottom: "1.5rem" }}>
        <Link href="/settings/security" className="portal-button secondary">
          Security
        </Link>
        <span
          className="portal-button"
          style={{ marginLeft: "0.5rem", pointerEvents: "none", opacity: 1 }}
        >
          Notifications
        </span>
      </nav>

      <h1>Notification Settings</h1>

      {/* ── Delivery Preferences ─────────────────────────────────────────── */}
      <section style={{ marginTop: "2rem" }}>
        <h2>Delivery Preferences</h2>
        <PreferencesForm initialPreferences={preferences} />
      </section>

      {/* ── Web Push ─────────────────────────────────────────────────────── */}
      <section style={{ marginTop: "2rem" }}>
        <h2>Browser Push Notifications</h2>
        <p className="portal-note">
          Receive alerts in this browser even when the portal tab is in the background.
          Each device must be enabled separately.
        </p>
        <PushToggle />
      </section>

      {/* ── Telegram ─────────────────────────────────────────────────────── */}
      <section style={{ marginTop: "2rem" }}>
        <h2>Telegram Alerts</h2>
        <p className="portal-note">
          Connect your Telegram account to receive critical alerts via the CoESCD bot.
        </p>
        <TelegramPanel />
      </section>
    </div>
  );
}
