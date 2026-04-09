"use client";

import Image from "next/image";
import { useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  enabled: boolean;
  hasSetup: boolean;
};

type SetupState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "qr"; qrCodeDataUri: string; secret: string }
  | { step: "backup_codes"; codes: string[] }
  | { step: "disabling" };

export default function MfaSetupPanel({ enabled, hasSetup }: Props) {
  const [mfaEnabled, setMfaEnabled] = useState(enabled);
  const [state, setState] = useState<SetupState>({ step: "idle" });
  const [confirmToken, setConfirmToken] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleStartSetup() {
    setError(null);
    setState({ step: "loading" });
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { qrCodeDataUri: string; secret: string };
      setState({ step: "qr", qrCodeDataUri: data.qrCodeDataUri, secret: data.secret });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup failed");
      setState({ step: "idle" });
    }
  }

  async function handleConfirmEnable() {
    if (!/^\d{6}$/.test(confirmToken)) {
      setError("Enter a valid 6-digit code");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: confirmToken }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { backupCodes: string[] };
      setMfaEnabled(true);
      setState({ step: "backup_codes", codes: data.backupCodes });
      setConfirmToken("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable MFA");
    }
  }

  async function handleDisable() {
    if (!/^\d{6}$/.test(disableToken)) {
      setError("Enter a valid 6-digit code");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: disableToken }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMfaEnabled(false);
      setState({ step: "idle" });
      setDisableToken("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable MFA");
    }
  }

  function downloadBackupCodes(codes: string[]) {
    const text = codes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coescd-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const errorBanner = error ? (
    <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <p>{error}</p>
    </div>
  ) : null;

  if (state.step === "backup_codes") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <p>MFA enabled successfully.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Save these backup codes in a secure place. Each code can only be used once and will not be shown again.
        </p>
        <div className="grid gap-2 rounded-3xl border border-border/70 bg-slate-950 p-5 font-mono text-sm text-slate-100 sm:grid-cols-2">
          {state.codes.map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => downloadBackupCodes(state.codes)}>
            Download backup codes
          </Button>
          <Button type="button" variant="outline" onClick={() => setState({ step: "idle" })}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (state.step === "qr") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <KeyRound className="mt-0.5 size-4 shrink-0" />
          <p>
            Scan this QR code with your authenticator app, then enter the 6-digit code below to confirm.
          </p>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="overflow-hidden rounded-3xl border border-border/70 bg-white p-4">
            <Image alt="MFA QR Code" height={200} src={state.qrCodeDataUri} unoptimized width={200} />
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Manual key</p>
              <code className="mt-2 block text-sm text-foreground">{state.secret}</code>
            </div>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Confirmation code</span>
              <Input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                type="text"
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            {errorBanner}
            <div className="flex flex-wrap gap-3">
              <Button type="button" disabled={confirmToken.length !== 6} onClick={handleConfirmEnable}>
                Enable MFA
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setState({ step: "idle" });
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mfaEnabled) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            Enabled
          </Badge>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <p>MFA is enabled on your account.</p>
        </div>
        {state.step !== "disabling" ? (
          <Button type="button" variant="outline" onClick={() => setState({ step: "disabling" })}>
            Disable MFA
          </Button>
        ) : (
          <div className="space-y-4 rounded-3xl border border-border/70 bg-background/80 p-5">
            <p className="text-sm text-muted-foreground">
              Enter your current authenticator code to confirm.
            </p>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Code</span>
              <Input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                type="text"
                value={disableToken}
                onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            {errorBanner}
            <div className="flex flex-wrap gap-3">
              <Button type="button" disabled={disableToken.length !== 6} onClick={handleDisable}>
                Confirm disable
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setState({ step: "idle" });
                  setError(null);
                  setDisableToken("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>MFA is not enabled. Your account is protected by password only.</p>
      </div>
      {errorBanner}
      <Button type="button" disabled={state.step === "loading"} onClick={handleStartSetup}>
        {state.step === "loading" ? "Loading..." : hasSetup ? "Re-setup MFA" : "Enable MFA"}
      </Button>
    </div>
  );
}
