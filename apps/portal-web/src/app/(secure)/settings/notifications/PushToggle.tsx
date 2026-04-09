"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = Uint8Array.from(Array.from(raw), (c) => c.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
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
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
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
    return <p className="text-sm text-muted-foreground">Checking push notification status...</p>;
  }

  if (swState === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        Push notifications are not supported in this browser.
      </p>
    );
  }

  if (swState === "denied") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <p>Push notifications are blocked. Allow them in browser settings, then reload.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        {swState === "subscribed" ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            Enabled on this device
          </Badge>
        ) : (
          <Badge variant="outline">Disabled</Badge>
        )}
      </div>
      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}
      {swState === "subscribed" ? (
        <Button disabled={busy} onClick={unsubscribe} type="button" variant="outline">
          {busy ? "Disabling..." : "Disable on this device"}
        </Button>
      ) : (
        <Button disabled={busy} onClick={subscribe} type="button">
          {busy ? "Enabling..." : "Enable push notifications"}
        </Button>
      )}
    </div>
  );
}
