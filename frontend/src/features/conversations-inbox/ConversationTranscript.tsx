import { Bot, CheckCircle2, Clock, User, UserCheck, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import type {
  ConversationDetail,
  ConversationMessage,
} from "../../entities/conversation";
import { permissionLabel } from "../../entities/workspace/api";
import { Button, StatusDot } from "../../shared/ui";
import { LiveAgentInput } from "./LiveAgentInput";
import { MessageBody } from "./MessageBody";

interface Props {
  conversation: ConversationDetail | null;
  chatbotName?: string;
  loading: boolean;
  sending: boolean;
  closing: boolean;
  onSendReply: (content: string) => void;
  onCloseConversation: () => void;
  readOnly?: boolean;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function MessageItem({ message }: { message: ConversationMessage }) {
  if (message.role === "system") {
    return (
      <div className="transcript-msg is-system">
        <span className="transcript-system-pill">{message.content}</span>
      </div>
    );
  }

  const isVisitor = message.role === "visitor";
  const isAgent = message.role === "agent";
  const isBot = message.role === "bot";

  return (
    <div
      className={`transcript-msg ${isVisitor ? "is-visitor" : isAgent ? "is-agent" : "is-bot"}`}
    >
      <div className="transcript-avatar">
        {isVisitor ? (
          <User size={15} />
        ) : isAgent ? (
          <UserCheck size={15} />
        ) : (
          <Bot size={15} />
        )}
      </div>
      <div className="transcript-bubble-container">
        <div className="transcript-bubble-header">
          <span className="transcript-bubble-author">
            {isVisitor ? "Visitor" : isAgent ? "Live Agent" : "Chatbot"}
          </span>
          <span className="transcript-bubble-time">{formatTime(message.created_at)}</span>
        </div>
        <div className="transcript-bubble">
          <MessageBody message={message} />
        </div>
      </div>
    </div>
  );
}

export function ConversationTranscript({
  conversation,
  chatbotName,
  loading,
  sending,
  closing,
  onSendReply,
  onCloseConversation,
  readOnly = false,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages]);

  if (!conversation) {
    return (
      <div className="transcript-empty">
        <div className="transcript-empty-content">
          <Clock size={40} className="empty-icon" />
          <h3>No conversation selected</h3>
          <p>Choose a conversation from the left to view messages and manage live handoff.</p>
        </div>
      </div>
    );
  }

  const isClosed = conversation.status === "closed";

  return (
    <div className="transcript-container">
      <header className="transcript-header">
        <div className="transcript-info">
          <div className="transcript-title-row">
            <StatusDot status={conversation.status === "active" ? "draft" : conversation.status === "handoff" ? "published" : "archived"} />
            <h2>{conversation.visitor_label}</h2>
            <span className={`status-badge is-${conversation.status}`}>
              {conversation.status.toUpperCase()}
            </span>
          </div>
          <div className="transcript-sub-row">
            <span>Bot: {chatbotName ?? conversation.chatbot_id.slice(0, 8)}</span>
            <span>·</span>
            <span>Flow v{conversation.flow_version}</span>
            <span>·</span>
            <span>Started {new Date(conversation.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="transcript-actions">
          {!isClosed ? (
            <Button
              size="sm"
              variant="secondary"
              loading={closing}
              onClick={onCloseConversation}
              icon={<XCircle size={15} />}
            >
              End Conversation
            </Button>
          ) : (
            <span className="closed-label">
              <CheckCircle2 size={15} /> Closed
            </span>
          )}
        </div>
      </header>

      <div className="transcript-body">
        {loading && !conversation.messages?.length ? (
          <div className="transcript-loading">Loading transcript...</div>
        ) : (
          <div className="transcript-messages">
            {conversation.messages.map((msg) => (
              <MessageItem key={msg.id || msg.ordinal} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {readOnly ? (
        <div className="agent-input-bar is-closed">
          <span>Your role does not include {permissionLabel("inbox:reply")}</span>
        </div>
      ) : (
        <LiveAgentInput
          status={conversation.status}
          sending={sending}
          onSend={onSendReply}
        />
      )}
    </div>
  );
}
