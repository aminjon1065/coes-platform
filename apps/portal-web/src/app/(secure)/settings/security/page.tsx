import { authorizedBackendJson } from "@/lib/auth";
import MfaSetupPanel from "./MfaSetupPanel";

async function getMfaStatus() {
  try {
    return await authorizedBackendJson<{ enabled: boolean; hasSetup: boolean }>(
      "/iam/mfa/status",
    );
  } catch {
    return { enabled: false, hasSetup: false };
  }
}

export default async function SecuritySettingsPage() {
  const mfaStatus = await getMfaStatus();

  return (
    <main style={{ padding: "2rem", maxWidth: "640px" }}>
      <h1>Security Settings</h1>

      <section style={{ marginTop: "2rem" }}>
        <h2>Two-Factor Authentication</h2>
        <p className="portal-note">
          Protect your account with a time-based one-time password (TOTP) from an
          authenticator app such as Google Authenticator, Authy, or 1Password.
        </p>
        <MfaSetupPanel enabled={mfaStatus.enabled} hasSetup={mfaStatus.hasSetup} />
      </section>
    </main>
  );
}
