"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type TelegramSub = {
  chatId: string;
  username?: string | null;
  displayName?: string | null;
  status: string;
} | null;

export default function TelegramPanel() {
  const [sub, setSub] = useState<TelegramSub | undefined>(undefined);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSub = useCallback(async () => {
    const res = await fetch("/api/notifications/telegram-subscription");
    const data = (await res.json()) as TelegramSub;
    setSub(data);
    return data;
  }, []);

  useEffect(() => {
    fetchSub();
  }, [fetchSub]);

  async function generateLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/telegram/link");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { deepLink: string };
      setDeepLink(data.deepLink);
      startPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate link");
    } finally {
      setBusy(false);
    }
  }

  function startPolling() {
    setPolling(true);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const current = await fetchSub();
      if (current?.status === "active") {
        clearInterval(interval);
        setPolling(false);
        setDeepLink(null);
        return;
      }
      if (attempts >= 30) {
        clearInterval(interval);
        setPolling(false);
      }
    }, 2000);
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/notifications/telegram-subscription", { method: "DELETE" });
      setSub(null);
      setDeepLink(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlink");
    } finally {
      setBusy(false);
    }
  }

  if (sub === undefined) {
    return <p className="text-sm text-muted-foreground">Loading Telegram status...</p>;
  }

  return (
    <div className="space-y-4">
      {sub?.status === "active" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <p>
            Connected to Telegram
            {sub.displayName ? ` (${sub.displayName})` : ""}
            {sub.username ? ` @${sub.username}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not connected. Link your Telegram account to receive alerts via the bot.
        </p>
      )}

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {sub?.status === "active" ? (
        <Button disabled={busy} onClick={unlink} type="button" variant="outline">
          {busy ? "Unlinking..." : "Disconnect Telegram"}
        </Button>
      ) : deepLink ? (
        <div className="space-y-4 rounded-3xl border border-border/70 bg-background/80 p-5">
          <p className="text-sm text-muted-foreground">
            {polling
              ? "Waiting for you to open the bot link..."
              : "Click the link below to connect:"}
          </p>
          <a href={deepLink} rel="noopener noreferrer" target="_blank">
            <Button type="button">Open Telegram Bot</Button>
          </a>
          {polling ? (
            <p className="text-sm text-muted-foreground">
              Detecting connection. This may take a few seconds after you open the bot.
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDeepLink(null);
              setPolling(false);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button disabled={busy} onClick={generateLink} type="button">
          {busy ? "Generating link..." : "Connect Telegram"}
        </Button>
      )}
    </div>
  );
}
