import Link from "next/link";
import { verifyTotpAction, verifyBackupCodeAction } from "./actions";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function VerifyMfaPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const mode = typeof params.mode === "string" ? params.mode : "totp";
  const hasError = params.error === "invalid-code";
  const isBackup = mode === "backup";

  return (
    <main className="portal-auth">
      <section className="portal-auth-card">
        <h1>Two-Factor Authentication</h1>
        <p className="portal-note">
          {isBackup
            ? "Enter one of your backup codes to continue."
            : "Enter the 6-digit code from your authenticator app."}
        </p>

        {isBackup ? (
          <form action={verifyBackupCodeAction}>
            <label>
              Backup Code
              <input
                name="backup_code"
                placeholder="XXXX-XXXX"
                type="text"
                maxLength={9}
                autoComplete="off"
                autoFocus
              />
            </label>
            <button className="portal-button" type="submit">
              Verify
            </button>
          </form>
        ) : (
          <form action={verifyTotpAction}>
            <label>
              Authenticator Code
              <input
                name="code"
                placeholder="000000"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
              />
            </label>
            <button className="portal-button" type="submit">
              Verify
            </button>
          </form>
        )}

        {hasError && (
          <p className="portal-note" style={{ color: "var(--danger)" }}>
            {isBackup
              ? "Invalid or already-used backup code. Try again."
              : "Invalid code. Please check your authenticator app and try again."}
          </p>
        )}

        <div className="portal-actions">
          {isBackup ? (
            <Link className="portal-button secondary" href="/verify-mfa">
              Use authenticator code instead
            </Link>
          ) : (
            <Link className="portal-button secondary" href="/verify-mfa?mode=backup">
              Use a backup code instead
            </Link>
          )}
          <Link className="portal-button secondary" href="/login">
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}
