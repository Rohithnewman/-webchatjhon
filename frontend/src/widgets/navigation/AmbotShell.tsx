import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { useMe } from "../../entities/me/api";
import { TemplatesDialog } from "../../features/flow-templates/TemplatesDialog";
import { LoadingState } from "../../shared/ui";
import { ChatbotSubNav } from "./ChatbotSubNav";
import { PrimaryNav } from "./PrimaryNav";

interface Props {
  children: (props: {
    selectedChatbot: Chatbot | null;
    chatbots: Chatbot[];
    refetchChatbots: () => void;
  }) => ReactNode;
}

export function AmbotShell({ children }: Props) {
  const navigate = useNavigate();
  const { chatbotId } = useParams();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const { can, isReady } = useMe();
  const readOnly = isReady && !can("bots:manage");

  const chatbotsQuery = useQuery({
    queryKey: ["chatbots"],
    queryFn: chatbotApi.list,
  });

  const chatbots = chatbotsQuery.data ?? [];
  const selectedId = chatbotId ?? chatbots[0]?.id;
  const selectedChatbot = chatbots.find((b) => b.id === selectedId) ?? chatbots[0] ?? null;

  if (chatbotsQuery.isLoading) {
    return <LoadingState label="Loading workspace..." />;
  }

  const handleSelectBot = (id: string) => {
    navigate(`/chatbots/${id}/flows`);
  };

  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <ChatbotSubNav
        chatbots={chatbots}
        selectedChatbot={selectedChatbot}
        onSelectChatbot={handleSelectBot}
        onCreateNewBot={readOnly ? undefined : () => navigate("/chatbots/new")}
        onOpenTemplates={readOnly ? undefined : () => setTemplatesOpen(true)}
      />

      <main className="ambot-main-viewport">
        {children({
          selectedChatbot,
          chatbots,
          refetchChatbots: () => {
            void chatbotsQuery.refetch();
          },
        })}
      </main>

      <TemplatesDialog
        open={templatesOpen}
        chatbot={selectedChatbot}
        onClose={() => setTemplatesOpen(false)}
      />
    </div>
  );
}
