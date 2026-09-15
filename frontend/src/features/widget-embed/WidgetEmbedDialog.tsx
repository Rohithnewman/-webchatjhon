import { Bot, Check, Copy, MessageSquare, RefreshCw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Chatbot } from "../../entities/chatbot/types";
import { MessageBody } from "../conversations-inbox/MessageBody";
import { Button, Dialog, useToast } from "../../shared/ui";
import { useWidgetSimulator } from "./use-widget-simulator";

interface Props {
  open: boolean;
  chatbot: Chatbot | null;
  onClose: () => void;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const BACKEND_ROOT = API_BASE.replace(/\/api\/v1$/, "");

export function WidgetEmbedDialog({ open, chatbot, onClose }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "test">("code");
  const [inputText, setInputText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const sim = useWidgetSimulator(chatbot?.id ?? null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sim.messages]);

  useEffect(() => {
    if (sim.error) toast.error(sim.error);
  }, [sim.error, toast]);

  // Poll for handoff replies every 2 seconds while an agent has taken over.
  useEffect(() => {
    if (sim.status !== "handoff") return;
    const id = window.setInterval(() => {
      void sim.poll();
    }, 2000);
    return () => window.clearInterval(id);
  }, [sim.status, sim.poll]);

  if (!chatbot) return null;

  const scriptTag = `<script src="${BACKEND_ROOT}/widget.js" data-chatbot-id="${chatbot.id}" data-api="${API_BASE}" async></script>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendTestMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    void sim.send(text);
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
              if (!sim.started) void sim.start();
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
                <span className={`status-pill status-${sim.status}`}>{sim.status}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void sim.start()}
                disabled={sim.busy}
                icon={<RefreshCw size={13} className={sim.busy ? "spinning" : ""} />}
              >
                Restart
              </Button>
            </div>

            <div className="simulator-messages">
              {sim.messages.length === 0 && !sim.busy ? (
                <div className="simulator-empty">
                  <MessageSquare size={24} />
                  <p>Click Restart to begin a test conversation.</p>
                </div>
              ) : null}

              {sim.messages.map((m) => (
                <div key={m.id || m.ordinal} className={`sim-bubble is-${m.role}`}>
                  <span className="sim-role">{m.role === "visitor" ? "You" : m.role === "agent" ? "Agent" : "Bot"}</span>
                  <div className="sim-text">
                    <MessageBody message={m} />
                  </div>
                </div>
              ))}
              {sim.messages.length > 0 && sim.messages[sim.messages.length - 1].meta?.options?.length ? (
                <div className="sim-options">
                  {sim.messages[sim.messages.length - 1].meta!.options!.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="sim-opt-btn"
                      disabled={sim.busy || sim.status === "closed"}
                      onClick={() => void sim.send(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <form className="simulator-input-row" onSubmit={sendTestMessage}>
              <input
                type="text"
                placeholder={sim.status === "closed" ? "Conversation is closed" : "Type a response..."}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={!sim.started || sim.status === "closed" || sim.busy}
              />
              <Button
                size="sm"
                variant="primary"
                disabled={!inputText.trim() || !sim.started || sim.busy || sim.status === "closed"}
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
