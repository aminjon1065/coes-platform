import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(15,92,156,0.10),_transparent_40%),linear-gradient(180deg,#f4f7fb_0%,#eef3f8_100%)] px-6 py-12">
      <Card className="w-full max-w-md border-border/60 bg-white/95 shadow-xl">
        <CardHeader>
          <CardTitle className="font-heading text-5xl">404</CardTitle>
          <CardDescription>
            The requested route does not exist in the portal or is no longer available.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/dashboard">
            <Button type="button">Back to dashboard</Button>
          </Link>
          <Link href="/login">
            <Button type="button" variant="outline">Sign in again</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
