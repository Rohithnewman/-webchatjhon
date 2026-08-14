import { Bot, ChevronDown, LogOut, MessageSquarePlus, Plus, Trash2 } from "lucide-react";

import type { Chatbot } from "../../entities/chatbot/types";
import { Button, EmptyState, IconButton, ListRow, Panel } from "../../shared/ui";

interface Props {
  chatbots: Chatbot[];
  loading: boolean;
  selectedId?: string;
  open: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: () => void;
  onSignOut: () => void;
}

export function ChatbotSidebar({
  chatbots,
  loading,
  selectedId,
  open,
  onSelect,
  onCreate,
  onDelete,
  onSignOut,
}: Props) {
  const selected = chatbots.find((chatbot) => chatbot.id === selectedId);

  return (
    <nav className={`chatbot-sidebar ${open ? "is-open" : ""}`} aria-label="Chatbots">
      <Panel>
        <Panel.Header
          title="Chatbots"
          actions={
            <IconButton
              label="Create chatbot"
              icon={<Plus size={18} />}
              onClick={onCreate}
            />
          }
        />

        <Panel.Body flush>
          {chatbots.map((chatbot) => (
            <ListRow
              key={chatbot.id}
              selected={chatbot.id === selectedId}
              onSelect={() => onSelect(chatbot.id)}
              leading={<Bot size={17} aria-hidden />}
              title={chatbot.name}
              subtitle={`${chatbot.status} · v${chatbot.current_version ?? 1}`}
              trailing={
                chatbot.id === selectedId ? <ChevronDown size={14} aria-hidden /> : null
              }
            />
          ))}

          {!chatbots.length && !loading ? (
            <EmptyState
              icon={<MessageSquarePlus size={20} aria-hidden />}
              title="No chatbots yet"
              description="Create one to start building a flow."
              action={
                <Button size="sm" variant="primary" onClick={onCreate} icon={<Plus size={15} />}>
                  New chatbot
                </Button>
              }
            />
          ) : null}
        </Panel.Body>

        <Panel.Footer>
          {selected ? (
            <Button
              fullWidth
              variant="ghost"
              size="sm"
              icon={<Trash2 size={16} />}
              onClick={onDelete}
            >
              Delete chatbot
            </Button>
          ) : null}
          <Button
            fullWidth
            variant="ghost"
            size="sm"
            icon={<LogOut size={16} />}
            onClick={onSignOut}
          >
            Sign out
          </Button>
        </Panel.Footer>
      </Panel>
    </nav>
  );
}
