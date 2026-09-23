import type { Chatbot } from "../../entities/chatbot/types";

export type Purpose = NonNullable<Chatbot["use_case"]>;

export interface PurposeCard {
  id: Purpose;
  title: string;
  description: string;
  templateId: string;
  botName: string;
  emoji: string;
}

export const PURPOSES: readonly PurposeCard[] = [
  { id: "leads", title: "Get more leads", description: "More flexibility, custom flow and more", templateId: "lead-capture", botName: "Lead capture bot", emoji: "🎯" },
  { id: "support", title: "Help my customers with their Queries", description: "Instant responses, personalized support, and efficient issue resolution", templateId: "support-handoff", botName: "Customer support bot", emoji: "💬" },
  { id: "sales", title: "Sell my products", description: "Engage customers, showcase products, and drive sales.", templateId: "sell-products", botName: "Sales bot", emoji: "🛍️" },
  { id: "appointment", title: "Appointment booking", description: "Customized solutions, engaging conversations, and more.", templateId: "appointment-booking", botName: "Appointment bot", emoji: "📅" },
  { id: "other", title: "Other use cases", description: "What are you planning to use the chatbot for?", templateId: "generic", botName: "New bot", emoji: "✨" },
];

export const OTHER_SUGGESTIONS = ["Customer Onboarding", "Order Tracking", "Event / Webinar Registration"] as const;
