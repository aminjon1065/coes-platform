"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Individual notification types can override these defaults.
      </p>

      <div className="overflow-hidden rounded-3xl border border-border/70">
        <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-border/70 bg-muted/30 px-4 py-3 text-sm font-medium text-foreground">
          <span>Channel</span>
          <span>Enabled</span>
        </div>
        <div className="divide-y divide-border/70 bg-background/80">
          {CHANNELS.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-sm">
              <span className="text-foreground">{label}</span>
              <input
                checked={Boolean(pref[key])}
                className="size-4 accent-[var(--primary)]"
                onChange={() => toggle(key)}
                type="checkbox"
              />
            </div>
          ))}
          <div className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-medium text-foreground">Email throttle (minutes)</p>
              <p className="text-sm text-muted-foreground">0 means no throttle.</p>
            </div>
            <Input
              className="w-full md:w-28"
              max={1440}
              min={0}
              type="number"
              value={pref.emailThrottleMinutes}
              onChange={(e) => {
                setSaved(false);
                setPref((prev) => ({
                  ...prev,
                  emailThrottleMinutes: Math.max(0, Math.min(1440, Number(e.target.value))),
                }));
              }}
            />
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}
      {saved ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <p>Saved.</p>
        </div>
      ) : null}

      <Button disabled={saving} onClick={save} type="button">
        {saving ? "Saving..." : "Save preferences"}
      </Button>
    </div>
  );
}
