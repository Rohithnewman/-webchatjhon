export type ConversationStatus = "active" | "handoff" | "closed";
export type MessageRole = "visitor" | "bot" | "agent" | "system";

export interface MessageMeta {
  kind?: "image" | "video" | "link";
  url?: string;
  options?: string[];
  multiple?: boolean;
  inputType?: string;
}

export interface ConversationMessage {
  id: string;
  ordinal: number;
  role: MessageRole;
  content: string;
  node_id?: string | null;
  meta?: MessageMeta;
  created_at: string;
}

export interface ConversationListItem {
  id: string;
  chatbot_id: string;
  status: ConversationStatus;
  visitor_label: string;
  flow_version: number;
  created_at: string;
  updated_at: string;
  last_message?: ConversationMessage | null;
}

export interface ConversationDetail extends ConversationListItem {
  messages: ConversationMessage[];
}
