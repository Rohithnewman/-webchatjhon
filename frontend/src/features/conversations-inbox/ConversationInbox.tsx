import { AlertCircle, Bot, Inbox, MessageSquare } from "lucide-react";

import type { ConversationListItem } from "../../entities/conversation";

interface Props {
  conversations: ConversationListItem[];
  selectedId: string | null;
  statusFilter: string;
  chatbotNames: Record<string, string>;
  onSelect: (id: string) => void;
  onStatusFilterChange: (status: string) => void;
}

function formatRelativeTime(isoString: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
}

export function ConversationInbox({
  conversations,
  selectedId,
  statusFilter,
  chatbotNames,
  onSelect,
  onStatusFilterChange,
}: Props) {
  const handoffCount = conversations.filter((c) => c.status === "handoff").length;

  return (
    <aside className="inbox-sidebar">
      <div className="inbox-header">
        <div className="inbox-title">
          <MessageSquare size={18} />
          <h2>Conversations</h2>
        </div>

        <div className="inbox-filter-tabs">
          <button
            type="button"
            className={`inbox-tab ${statusFilter === "all" ? "is-active" : ""}`}
            onClick={() => onStatusFilterChange("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`inbox-tab is-handoff ${statusFilter === "handoff" ? "is-active" : ""}`}
            onClick={() => onStatusFilterChange("handoff")}
          >
            Handoff {handoffCount > 0 ? <span className="tab-badge">{handoffCount}</span> : null}
          </button>
          <button
            type="button"
            className={`inbox-tab ${statusFilter === "active" ? "is-active" : ""}`}
            onClick={() => onStatusFilterChange("active")}
          >
            Active
          </button>
          <button
            type="button"
            className={`inbox-tab ${statusFilter === "closed" ? "is-active" : ""}`}
            onClick={() => onStatusFilterChange("closed")}
          >
            Closed
          </button>
        </div>
      </div>

      <div className="inbox-list">
        {conversations.length === 0 ? (
          <div className="inbox-empty">
            <Inbox size={28} className="empty-icon" />
            <p>No conversations found</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const isSelected = conv.id === selectedId;
            const botName = chatbotNames[conv.chatbot_id] ?? "Chatbot";
            const lastMsg = conv.last_message;

            return (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                className={`inbox-item ${isSelected ? "is-selected" : ""} is-${conv.status}`}
                onClick={() => onSelect(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(conv.id);
                }}
              >
                <div className="inbox-item-header">
                  <div className="inbox-item-author">
                    <span className="inbox-visitor-label">{conv.visitor_label}</span>
                    {conv.status === "handoff" ? (
                      <span className="handoff-pill">
                        <AlertCircle size={12} /> Handoff
                      </span>
                    ) : null}
                  </div>
                  <span className="inbox-item-time">
                    {formatRelativeTime(conv.updated_at || conv.created_at)}
                  </span>
                </div>

                <div className="inbox-item-preview">
                  {lastMsg ? (
                    <span className="preview-content">
                      <strong>{lastMsg.role === "agent" ? "You: " : lastMsg.role === "bot" ? "Bot: " : ""}</strong>
                      {lastMsg.content}
                    </span>
                  ) : (
                    <span className="preview-empty">New conversation</span>
                  )}
                </div>

                <div className="inbox-item-footer">
                  <span className="inbox-bot-badge">
                    <Bot size={11} /> {botName}
                  </span>
                  <span className={`status-dot-sm is-${conv.status}`} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
