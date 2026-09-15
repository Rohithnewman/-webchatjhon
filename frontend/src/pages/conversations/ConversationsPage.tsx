import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { chatbotApi } from "../../entities/chatbot/api";
import { conversationApi } from "../../entities/conversation";
import { useMe } from "../../entities/me/api";
import { ConversationInbox } from "../../features/conversations-inbox/ConversationInbox";
import { ConversationTranscript } from "../../features/conversations-inbox/ConversationTranscript";
import { useToast } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

export function ConversationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can, isReady } = useMe();
  const readOnly = isReady && !can("features:use");

  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load chatbots for bot name mapping
  const chatbotsQuery = useQuery({
    queryKey: ["chatbots"],
    queryFn: chatbotApi.list,
  });

  const chatbotNames = (chatbotsQuery.data ?? []).reduce<Record<string, string>>(
    (acc, bot) => {
      acc[bot.id] = bot.name;
      return acc;
    },
    {}
  );

  // Fetch conversations list with auto-refresh every 3s
  const conversationsQuery = useQuery({
    queryKey: ["conversations", statusFilter],
    queryFn: () => conversationApi.list({ status: statusFilter }),
    refetchInterval: 3000,
  });

  const conversations = conversationsQuery.data ?? [];

  // If selected conversation not set or invalid, select the first
  const activeId = selectedId ?? conversations[0]?.id ?? null;

  // Fetch full transcript for selected conversation
  const transcriptQuery = useQuery({
    queryKey: ["conversation-detail", activeId],
    queryFn: () => (activeId ? conversationApi.get(activeId) : null),
    enabled: Boolean(activeId),
    refetchInterval: (query) => {
      // Poll faster (2s) while active or in handoff
      const status = query.state.data?.status;
      return status === "handoff" || status === "active" ? 2000 : 8000;
    },
  });

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: (content: string) => {
      if (!activeId) throw new Error("No conversation selected");
      return conversationApi.reply(activeId, content);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversation-detail", activeId] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Reply sent to visitor");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to send agent reply");
    },
  });

  // Close mutation
  const closeMutation = useMutation({
    mutationFn: () => {
      if (!activeId) throw new Error("No conversation selected");
      return conversationApi.close(activeId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversation-detail", activeId] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation closed");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to close conversation");
    },
  });

  const selectedConversation = transcriptQuery.data ?? null;
  const currentBotName = selectedConversation
    ? chatbotNames[selectedConversation.chatbot_id]
    : undefined;

  return (
    <DashboardShell title="Inbox" subtitle="Live conversations from every published chatbot. Reply here when a flow hands off to an agent.">
      <div className="conversations-main-grid">
        <ConversationInbox
          conversations={conversations}
          selectedId={activeId}
          statusFilter={statusFilter}
          chatbotNames={chatbotNames}
          onSelect={(id) => setSelectedId(id)}
          onStatusFilterChange={(st) => setStatusFilter(st)}
        />
        <ConversationTranscript
          conversation={selectedConversation}
          chatbotName={currentBotName}
          loading={transcriptQuery.isLoading}
          sending={replyMutation.isPending}
          closing={closeMutation.isPending}
          onSendReply={(content) => replyMutation.mutate(content)}
          onCloseConversation={() => closeMutation.mutate()}
          readOnly={readOnly}
        />
      </div>
    </DashboardShell>
  );
}
