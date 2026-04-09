import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-3xl">Security settings</CardTitle>
          <CardDescription>
            Manage identity protection and multi-factor authentication for the current account.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Two-Factor Authentication</CardTitle>
          <CardDescription>
            Protect your account with a time-based one-time password (TOTP) from an
            authenticator app such as Google Authenticator, Authy, or 1Password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MfaSetupPanel enabled={mfaStatus.enabled} hasSetup={mfaStatus.hasSetup} />
        </CardContent>
      </Card>
    </div>
  );
}
