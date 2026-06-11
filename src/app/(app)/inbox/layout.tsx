import { getConversations } from "@/lib/data/conversations";
import { InboxShell } from "@/components/inbox/inbox-shell";
import { RealtimeRefresh } from "@/components/inbox/realtime-refresh";

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const conversations = await getConversations();
  return (
    <>
      <RealtimeRefresh />
      <InboxShell conversations={conversations}>{children}</InboxShell>
    </>
  );
}
