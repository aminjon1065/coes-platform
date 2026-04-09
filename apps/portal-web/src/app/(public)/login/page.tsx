import Link from "next/link";
import { Shield, AlertCircle } from "lucide-react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const errorCode = typeof params.error === "string" ? params.error : "";
  const errorMessage =
    errorCode === "missing-credentials"
      ? "Username and password are required."
      : errorCode === "invalid-credentials"
        ? "Invalid username or password."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
            <Shield className="size-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">CoES Portal</h1>
            <p className="text-sm text-muted-foreground">Sign in to your account</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>
              Enter your credentials. MFA verification continues on the next screen if enabled.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={loginAction} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="username">
                  Username
                </label>
                <Input
                  id="username"
                  name="username"
                  placeholder="j.dushanbekov"
                  type="text"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                />
              </div>
              <Button className="w-full" type="submit">
                Sign in
              </Button>
            </form>

            {errorMessage && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {errorMessage}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href="/dashboard" className="underline-offset-2 hover:underline">
            Skip to dashboard →
          </Link>
        </p>
      </div>
    </main>
  );
}
