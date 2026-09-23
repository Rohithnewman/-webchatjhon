import type { Edge, Node, Viewport } from "@xyflow/react";

export type BuilderNodeType =
  | "start"
  | "message"
  | "question"
  | "choice"
  | "condition"
  | "input"
  | "llm"
  | "knowledge_search"
  | "http_request"
  | "webhook"
  | "delay"
  | "handoff"
  | "end";

export type FlowNodeData = Record<string, unknown> & {
  label?: string;
};

export type FlowNode = Node<FlowNodeData, BuilderNodeType>;
export type FlowEdge = Edge;

export interface FlowDocument {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: Viewport;
  design?: Record<string, any>;
}

export interface Chatbot {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  current_version: number | null;
  created_at: string;
  updated_at: string;
  platform: "website" | "whatsapp" | "instagram" | "facebook" | "telegram";
  use_case: "leads" | "support" | "sales" | "appointment" | "other" | null;
  use_case_note: string | null;
  install_format: "chat_button" | "landing_page" | null;
  installed_url: string | null;
  installed_at: string | null;
}

export type InstallVerifyResult =
  | { connected: true; url: string; verified_at: string }
  | { connected: false; reason: "unreachable" | "script_missing" | "wrong_chatbot" };

export interface FlowRecord {
  id: string;
  workspace_id: string;
  chatbot_id: string;
  version: number;
  definition: FlowDocument;
  is_current: boolean;
  created_by: string;
  created_at: string;
}

export interface FlowVersion {
  id: string;
  version: number;
  is_current: boolean;
  created_by: string;
  created_at: string;
}
