import { useCallback, useRef, useState } from "react";

import { conversationApi, type ConversationMessage, type ConversationStatus } from "../../entities/conversation";

export function useWidgetSimulator(chatbotId: string | null) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<{ id: string; token: string } | null>(null);

  const start = useCallback(async () => {
    if (!chatbotId) return;
    setBusy(true); setError(null); setMessages([]);
    try {
      const res = await conversationApi.widgetStart(chatbotId);
      session.current = { id: res.conversation.id, token: res.token };
      setConversationId(res.conversation.id); setToken(res.token); setMessages(res.messages); setStatus(res.conversation.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start. Is the chatbot published?");
    } finally { setBusy(false); }
  }, [chatbotId]);

  const send = useCallback(async (text: string) => {
    const current = session.current;
    if (!current || !text.trim() || busy || status === "closed") return;
    const optimistic: ConversationMessage = { id: `tmp-${Date.now()}`, ordinal: Number.MAX_SAFE_INTEGER, role: "visitor", content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    setBusy(true);
    try {
      const turn = await conversationApi.widgetSend(current.id, current.token, text);
      setStatus(turn.status);
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), ...turn.messages]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally { setBusy(false); }
  }, [busy, status]);

  const poll = useCallback(async () => {
    const current = session.current;
    if (!current || status !== "handoff") return;
    const last = messages.reduce((m, x) => (x.ordinal < Number.MAX_SAFE_INTEGER && x.ordinal > m ? x.ordinal : m), 0);
    const res = await conversationApi.widgetPoll(current.id, current.token, last);
    if (res.messages.length) setMessages((prev) => [...prev, ...res.messages]);
    setStatus(res.status);
  }, [messages, status]);

  const reset = useCallback(() => {
    session.current = null;
    setConversationId(null);
    setToken(null);
    setMessages([]);
    setStatus("active");
    setError(null);
  }, []);

  return { messages, status, busy, error, started: Boolean(conversationId), start, send, poll, reset };
}
