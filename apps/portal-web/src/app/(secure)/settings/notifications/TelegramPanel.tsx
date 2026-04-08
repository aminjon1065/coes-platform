"use client";

import { useState, useEffect, useCallback } from "react";

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
    const data = await res.json() as TelegramSub;
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
      const data = await res.json() as { deepLink: string };
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
      if (attempts >= 30) { // 60 seconds
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
    return <p className="portal-note">Loading Telegram status...</p>;
  }

  if (sub?.status === "active") {
    return (
      <div>
        <p style={{ color: "var(--success, green)", fontWeight: 600 }}>
          Connected to Telegram
          {sub.displayName ? ` (${sub.displayName})` : ""}
          {sub.username ? ` @${sub.username}` : ""}
        </p>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button
          className="portal-button secondary"
          onClick={unlink}
          disabled={busy}
          style={{ marginTop: "0.75rem" }}
        >
          {busy ? "Unlinking..." : "Disconnect Telegram"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="portal-note">
        Not connected. Link your Telegram account to receive alerts via the bot.
      </p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {deepLink ? (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="portal-note">
            {polling
              ? "Waiting for you to open the bot link..."
              : "Click the link below to connect:"}
          </p>
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="portal-button"
            style={{ display: "inline-block", marginBottom: "0.5rem" }}
          >
            Open Telegram Bot
          </a>
          {polling && (
            <p className="portal-note" style={{ marginTop: "0.5rem" }}>
              Detecting connection... this may take a few seconds after you open the bot.
            </p>
          )}
          <br />
          <button
            className="portal-button secondary"
            onClick={() => { setDeepLink(null); setPolling(false); }}
            style={{ marginTop: "0.25rem" }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          className="portal-button"
          onClick={generateLink}
          disabled={busy}
          style={{ marginTop: "0.75rem" }}
        >
          {busy ? "Generating link..." : "Connect Telegram"}
        </button>
      )}
    </div>
  );
}
