"use client";

import { useState, useEffect } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(Array.from(raw), (c) => c.charCodeAt(0));
}

type SwState = "loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

export default function PushToggle() {
  const [swState, setSwState] = useState<SwState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSwState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setSwState("denied");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSwState(sub ? "subscribed" : "unsubscribed"))
      .catch(() => setSwState("unsubscribed"));
  }, []);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const keyRes = await fetch("/api/notifications/push-public-key");
      const { publicKey } = await keyRes.json() as { publicKey: string };
      if (!publicKey) throw new Error("Push notifications are not configured on this server");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSwState("denied");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subJson = sub.toJSON() as {
        endpoint: string;
        expirationTime?: number | null;
        keys?: { p256dh: string; auth: string };
      };

      await fetch("/api/notifications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          expirationTime: subJson.expirationTime ?? null,
          keys: subJson.keys,
        }),
      });

      setSwState("subscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable push notifications");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/push-subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSwState("unsubscribed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable push notifications");
    } finally {
      setBusy(false);
    }
  }

  if (swState === "loading") {
    return <p className="portal-note">Checking push notification status...</p>;
  }

  if (swState === "unsupported") {
    return (
      <p className="portal-note">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  if (swState === "denied") {
    return (
      <p className="portal-note" style={{ color: "var(--danger)" }}>
        Push notifications are blocked. Allow them in browser settings, then reload.
      </p>
    );
  }

  return (
    <div>
      <p className="portal-note">
        Status:{" "}
        <strong style={{ color: swState === "subscribed" ? "var(--success, green)" : undefined }}>
          {swState === "subscribed" ? "Enabled on this device" : "Disabled"}
        </strong>
      </p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {swState === "subscribed" ? (
        <button
          className="portal-button secondary"
          onClick={unsubscribe}
          disabled={busy}
        >
          {busy ? "Disabling..." : "Disable on this device"}
        </button>
      ) : (
        <button className="portal-button" onClick={subscribe} disabled={busy}>
          {busy ? "Enabling..." : "Enable push notifications"}
        </button>
      )}
    </div>
  );
}
