import { Bot, Check, Copy, MessageSquare, Play, RefreshCw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Chatbot } from "../../entities/chatbot/types";
import { conversationApi, type ConversationMessage } from "../../entities/conversation";
import { Button, Dialog } from "../../shared/ui";

interface Props {
  open: boolean;
  chatbot: Chatbot | null;
  onClose: () => void;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const BACKEND_ROOT = API_BASE.replace(/\/api\/v1$/, "");

export function WidgetEmbedDialog({ open, chatbot, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "test">("code");

  // Simulator state
  const [testing, setTesting] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [widgetToken, setWidgetToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [botStatus, setBotStatus] = useState<string>("active");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!chatbot) return null;

  const scriptTag = `<script src="${BACKEND_ROOT}/widget.js" data-chatbot-id="${chatbot.id}" data-api="${API_BASE}" async></script>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startSimulator = async () => {
    setTesting(true);
    setMessages([]);
    try {
      const res = await conversationApi.widgetStart(chatbot.id);
      setConvId(res.conversation.id);
      setWidgetToken(res.token);
      setMessages(res.messages || []);
      setBotStatus(res.conversation.status);
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to start test session. Ensure chatbot is published.");
    } finally {
      setTesting(false);
    }
  };

  const sendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convId || !widgetToken || !inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText("");
    setSending(true);

    // Optimistic visitor message
    const tempMsg: ConversationMessage = {
      id: `temp-${Date.now()}`,
      ordinal: messages.length + 1,
      role: "visitor",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const turn = await conversationApi.widgetSend(convId, widgetToken, text);
      setBotStatus(turn.status);
      setMessages((prev) => {
        // Replace temp or append returned messages
        const others = prev.filter((m) => m.id !== tempMsg.id);
        return [...others, ...turn.messages];
      });
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Embed & Test: ${chatbot.name}`}>
      <div className="embed-dialog-content">
        <div className="embed-tabs">
          <button
            type="button"
            className={`embed-tab ${activeTab === "code" ? "is-active" : ""}`}
            onClick={() => setActiveTab("code")}
          >
            Snippet Code
          </button>
          <button
            type="button"
            className={`embed-tab ${activeTab === "test" ? "is-active" : ""}`}
            onClick={() => {
              setActiveTab("test");
              if (!convId) void startSimulator();
            }}
          >
            Interactive Test
          </button>
        </div>

        {activeTab === "code" ? (
          <div className="embed-code-view">
            <p className="embed-hint">
              Paste this one script tag into the <code>&lt;body&gt;</code> of any HTML page to embed your chatbot widget.
            </p>
            <div className="embed-snippet-box">
              <pre>
                <code>{scriptTag}</code>
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopy}
                icon={copied ? <Check size={14} /> : <Copy size={14} />}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {chatbot.status !== "published" && (
              <div className="embed-warning">
                ⚠️ Note: This chatbot is currently in <strong>{chatbot.status}</strong> mode. The widget only responds to visitors once you click <strong>Publish</strong> in the builder topbar.
              </div>
            )}
          </div>
        ) : (
          <div className="embed-simulator-view">
            <div className="simulator-top">
              <div className="simulator-status">
                <Bot size={16} />
                <span>{chatbot.name}</span>
                <span className={`status-pill status-${botStatus}`}>{botStatus}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={startSimulator}
                disabled={testing}
                icon={<RefreshCw size={13} className={testing ? "spinning" : ""} />}
              >
                Restart
              </Button>
            </div>

            <div className="simulator-messages">
              {messages.length === 0 && !testing ? (
                <div className="simulator-empty">
                  <MessageSquare size={24} />
                  <p>Click Restart to begin a test conversation.</p>
                </div>
              ) : null}

              {messages.map((m) => (
                <div key={m.id || m.ordinal} className={`sim-bubble is-${m.role}`}>
                  <span className="sim-role">{m.role === "visitor" ? "You" : m.role === "agent" ? "Agent" : "Bot"}</span>
                  <div className="sim-text">{m.content}</div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <form className="simulator-input-row" onSubmit={sendTestMessage}>
              <input
                type="text"
                placeholder={botStatus === "closed" ? "Conversation is closed" : "Type a response..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={!convId || botStatus === "closed" || sending}
              />
              <Button
                size="sm"
                variant="primary"
                disabled={!inputText.trim() || !convId || sending || botStatus === "closed"}
                icon={<Send size={14} />}
              >
                Send
              </Button>
            </form>
          </div>
        )}
      </div>
    </Dialog>
  );
}
