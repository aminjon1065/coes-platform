import Link from "next/link";
import { Shield, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
            <Shield className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Two-Factor Authentication</h1>
            <p className="text-sm text-muted-foreground">
              {isBackup
                ? "Enter one of your backup codes."
                : "Enter the 6-digit code from your authenticator app."}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isBackup ? "Backup code" : "Authenticator code"}
            </CardTitle>
            <CardDescription>
              {isBackup
                ? "Each backup code can only be used once."
                : "The code rotates every 30 seconds."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isBackup ? (
              <form action={verifyBackupCodeAction} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="backup_code">
                    Backup Code
                  </label>
                  <Input
                    id="backup_code"
                    autoComplete="off"
                    autoFocus
                    maxLength={9}
                    name="backup_code"
                    placeholder="XXXX-XXXX"
                    type="text"
                  />
                </div>
                <Button className="w-full" type="submit">
                  Verify backup code
                </Button>
              </form>
            ) : (
              <form action={verifyTotpAction} className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="code">
                    Authenticator Code
                  </label>
                  <Input
                    id="code"
                    autoComplete="one-time-code"
                    autoFocus
                    inputMode="numeric"
                    maxLength={6}
                    name="code"
                    placeholder="000000"
                    type="text"
                  />
                </div>
                <Button className="w-full" type="submit">
                  Verify code
                </Button>
              </form>
            )}

            {hasError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {isBackup
                  ? "Invalid or already-used backup code."
                  : "Invalid code. Check your authenticator app and try again."}
              </div>
            )}

            <Separator />

            <div className="flex flex-col gap-2">
              {isBackup ? (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/verify-mfa">Use authenticator code instead</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href="/verify-mfa?mode=backup">Use a backup code instead</Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="sm" className="w-full text-muted-foreground">
                <Link href="/login">← Back to login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
