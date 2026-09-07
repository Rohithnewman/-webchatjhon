import { apiRequest } from "../../shared/api/client";
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationMessage,
  ConversationStatus,
} from "./types";

export interface WidgetConversationStart {
  conversation: ConversationListItem;
  chatbot_name: string;
  token: string;
  messages: ConversationMessage[];
}

export interface WidgetTurnResponse {
  status: ConversationStatus;
  messages: ConversationMessage[];
}

export const conversationApi = {
  list: (params?: { chatbot_id?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.chatbot_id) query.set("chatbot_id", params.chatbot_id);
    if (params?.status && params.status !== "all") query.set("status", params.status);
    const qs = query.toString();
    return apiRequest<ConversationListItem[]>(`/conversations${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) => apiRequest<ConversationDetail>(`/conversations/${id}`),

  reply: (id: string, content: string) =>
    apiRequest<ConversationMessage>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  close: (id: string) =>
    apiRequest<ConversationDetail>(`/conversations/${id}/close`, {
      method: "POST",
    }),

  // Public widget API helper for live testing within the dashboard
  widgetStart: (chatbot_id: string) =>
    apiRequest<WidgetConversationStart>("/widget/conversations", {
      method: "POST",
      body: JSON.stringify({ chatbot_id }),
    }),

  widgetSend: (conversation_id: string, token: string, content: string) =>
    apiRequest<WidgetTurnResponse>(`/widget/conversations/${conversation_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    }),

  widgetPoll: (conversation_id: string, token: string, after = 0) =>
    apiRequest<WidgetTurnResponse>(
      `/widget/conversations/${conversation_id}/messages?after=${after}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    ),
};
