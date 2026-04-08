import Link from "next/link";
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
    <div className="portal-stack">
      <nav className="portal-note">
        <Link href="/chat">Chat</Link> / {channel.name}
      </nav>
      <ChatThreadClient
        channel={channel}
        currentCredentialId={sessionUser?.credentialId ?? ""}
        initialPresence={presence}
      />
    </div>
  );
}
