"use client";

import { useState } from "react";

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
      const data = await res.json() as { qrCodeDataUri: string; secret: string };
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
      const data = await res.json() as { backupCodes: string[] };
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

  // ── Backup codes view ────────────────────────────────────────────────────

  if (state.step === "backup_codes") {
    return (
      <div>
        <p style={{ color: "var(--success, green)", fontWeight: 600 }}>
          MFA enabled successfully.
        </p>
        <p className="portal-note">
          Save these backup codes in a secure place. Each code can only be used once.
          They will not be shown again.
        </p>
        <div style={{ fontFamily: "monospace", lineHeight: 2, background: "#f5f5f5", padding: "1rem", borderRadius: "4px" }}>
          {state.codes.map(code => (
            <div key={code}>{code}</div>
          ))}
        </div>
        <button
          className="portal-button"
          style={{ marginTop: "1rem" }}
          onClick={() => {
            const text = state.codes.join("\n");
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "coescd-backup-codes.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download backup codes
        </button>
        <button
          className="portal-button secondary"
          style={{ marginTop: "0.5rem", marginLeft: "0.5rem" }}
          onClick={() => setState({ step: "idle" })}
        >
          Done
        </button>
      </div>
    );
  }

  // ── QR code setup view ───────────────────────────────────────────────────

  if (state.step === "qr") {
    return (
      <div>
        <p className="portal-note">
          Scan this QR code with your authenticator app, then enter the 6-digit code below
          to confirm.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={state.qrCodeDataUri} alt="MFA QR Code" style={{ width: 200, height: 200 }} />
        <p className="portal-note" style={{ marginTop: "0.5rem" }}>
          Manual key: <code style={{ userSelect: "all" }}>{state.secret}</code>
        </p>
        <label style={{ display: "block", marginTop: "1rem" }}>
          Confirmation code
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={confirmToken}
            onChange={e => setConfirmToken(e.target.value.replace(/\D/g, ""))}
            autoComplete="one-time-code"
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <button
          className="portal-button"
          style={{ marginTop: "0.75rem" }}
          onClick={handleConfirmEnable}
          disabled={confirmToken.length !== 6}
        >
          Enable MFA
        </button>
        <button
          className="portal-button secondary"
          style={{ marginLeft: "0.5rem" }}
          onClick={() => { setState({ step: "idle" }); setError(null); }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Enabled state ─────────────────────────────────────────────────────────

  if (mfaEnabled) {
    return (
      <div>
        <p style={{ color: "var(--success, green)", fontWeight: 600 }}>
          MFA is enabled on your account.
        </p>
        {state.step !== "disabling" ? (
          <button
            className="portal-button secondary"
            style={{ marginTop: "0.75rem" }}
            onClick={() => setState({ step: "disabling" })}
          >
            Disable MFA
          </button>
        ) : (
          <div style={{ marginTop: "0.75rem" }}>
            <p className="portal-note">
              Enter your current authenticator code to confirm.
            </p>
            <label>
              Code
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={disableToken}
                onChange={e => setDisableToken(e.target.value.replace(/\D/g, ""))}
                autoComplete="one-time-code"
                style={{ display: "block", marginTop: "0.25rem" }}
              />
            </label>
            {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
            <button
              className="portal-button"
              style={{ marginTop: "0.75rem", background: "var(--danger)" }}
              onClick={handleDisable}
              disabled={disableToken.length !== 6}
            >
              Confirm disable
            </button>
            <button
              className="portal-button secondary"
              style={{ marginLeft: "0.5rem" }}
              onClick={() => { setState({ step: "idle" }); setError(null); setDisableToken(""); }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Not enabled ───────────────────────────────────────────────────────────

  return (
    <div>
      <p style={{ color: "var(--warning, orange)" }}>
        MFA is not enabled. Your account is protected by password only.
      </p>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      <button
        className="portal-button"
        style={{ marginTop: "0.75rem" }}
        onClick={handleStartSetup}
        disabled={state.step === "loading"}
      >
        {state.step === "loading" ? "Loading..." : hasSetup ? "Re-setup MFA" : "Enable MFA"}
      </button>
    </div>
  );
}
