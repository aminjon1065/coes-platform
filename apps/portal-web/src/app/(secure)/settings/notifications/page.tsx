import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authorizedBackendJson } from "@/lib/auth";
import PreferencesForm from "./PreferencesForm";
import PushToggle from "./PushToggle";
import TelegramPanel from "./TelegramPanel";

type Preference = {
  notificationType: string | null;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  telegram: boolean;
  push: boolean;
  emailThrottleMinutes: number;
};

async function getPreferences(): Promise<Preference[]> {
  try {
    return await authorizedBackendJson<Preference[]>("/notifications/preferences");
  } catch {
    return [];
  }
}

export default async function NotificationSettingsPage() {
  const preferences = await getPreferences();

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader className="gap-4">
          <div className="space-y-1">
            <CardTitle className="font-heading text-3xl">Notification settings</CardTitle>
            <CardDescription>
              Manage delivery channels for browser, Telegram, and default portal notifications.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/settings/security">
              <Button type="button" variant="outline">Security</Button>
            </Link>
            <Button type="button" disabled>Notifications</Button>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Delivery Preferences</CardTitle>
          <CardDescription>Default delivery channels for all notification types.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm initialPreferences={preferences} />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Browser Push Notifications</CardTitle>
          <CardDescription>
            Receive alerts in this browser even when the portal tab is in the background.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PushToggle />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Telegram Alerts</CardTitle>
          <CardDescription>
            Connect your Telegram account to receive critical alerts via the CoESCD bot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TelegramPanel />
        </CardContent>
      </Card>
    </div>
  );
}
