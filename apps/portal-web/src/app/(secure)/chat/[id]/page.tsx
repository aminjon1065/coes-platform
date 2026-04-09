import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChatThreadClient } from "@/components/chat/ChatThreadClient";
import { getSessionUser } from "@/lib/auth";
import { getChatChannelDetail, getPresenceStates } from "@/lib/chat";

type ChatChannelPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ChatChannelPage({ params }: ChatChannelPageProps) {
  const { id } = await params;
  const sessionUser = await getSessionUser();
  const channel = await getChatChannelDetail(id);
  const memberUserIds = channel.members
    .map((member) => member.userId)
    .filter((value): value is string => Boolean(value));
  const presence = Array.from((await getPresenceStates(memberUserIds)).values());

  return (
    <div className="space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link className="transition hover:text-foreground" href="/chat">
          Chat
        </Link>{" "}
        / {channel.name}
      </nav>
      <Card className="border-border/60 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{channel.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChatThreadClient
            channel={channel}
            currentCredentialId={sessionUser?.credentialId ?? ""}
            initialPresence={presence}
          />
        </CardContent>
      </Card>
    </div>
  );
}
