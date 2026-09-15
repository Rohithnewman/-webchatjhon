import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { useMe } from "../../entities/me/api";
import { CreateChatbotDialog } from "../../features/chatbot-create/ui/CreateChatbotDialog";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const { can } = useMe();
  const readOnly = !can("features:use");

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
        onCreateNewBot={readOnly ? undefined : () => setCreateOpen(true)}
        onOpenTemplates={() => setTemplatesOpen(true)}
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

      <CreateChatbotDialog
        open={createOpen}
        pending={false}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (data) => {
          const created = await chatbotApi.create(data);
          await chatbotsQuery.refetch();
          setCreateOpen(false);
          navigate(`/chatbots/${created.id}/flows`);
        }}
      />

      <TemplatesDialog
        open={templatesOpen}
        chatbot={selectedChatbot}
        onClose={() => setTemplatesOpen(false)}
      />
    </div>
  );
}
