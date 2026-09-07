import { Send } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { ConversationStatus } from "../../entities/conversation";
import { Button } from "../../shared/ui";

interface Props {
  status: ConversationStatus;
  sending: boolean;
  onSend: (content: string) => void;
}

export function LiveAgentInput({ status, sending, onSend }: Props) {
  const [text, setText] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText("");
  };

  if (status === "closed") {
    return (
      <div className="agent-input-bar is-closed">
        <span>This conversation has been closed. No further replies can be sent.</span>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="agent-input-bar is-active-flow">
        <span>
          Chatbot flow is currently handling this session. Live-agent replies become available once
          the conversation transfers to handoff.
        </span>
      </div>
    );
  }

  return (
    <form className="agent-input-bar" onSubmit={handleSubmit}>
      <div className="agent-input-alert">
        <span className="live-pulse" />
        <strong>Visitor is in handoff queue waiting for an agent reply.</strong>
      </div>
      <div className="agent-input-row">
        <input
          type="text"
          className="agent-text-field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message to the visitor as live agent..."
          disabled={sending}
          autoFocus
        />
        <Button
          size="sm"
          variant="primary"
          disabled={!text.trim() || sending}
          loading={sending}
          icon={<Send size={15} />}
        >
          Send
        </Button>
      </div>
    </form>
  );
}
