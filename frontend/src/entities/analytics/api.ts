import { apiRequest } from "../../shared/api/client";

export interface AnalyticsOverview {
  days: number;
  totals: { conversations: number; messages: number; chatbots: number; active: number; handoff: number; closed: number };
  daily: { day: string; conversations: number; messages: number }[];
  by_chatbot: { chatbot_id: string; name: string; conversations: number }[];
}

export const analyticsApi = {
  overview: (days: number) => apiRequest<AnalyticsOverview>(`/analytics/overview?days=${days}`),
};
