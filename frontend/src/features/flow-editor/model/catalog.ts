import {
  Bot,
  Braces,
  CircleStop,
  Clock3,
  GitBranch,
  Handshake,
  HelpCircle,
  ListChecks,
  MessageSquareText,
  Play,
  Search,
  TextCursorInput,
  Webhook,
  type LucideIcon,
} from "lucide-react";

import type { BuilderNodeType } from "../../../entities/chatbot/types";

export interface ConfigField {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "number" | "select";
  options?: string[];
}

export interface NodeDefinition {
  type: BuilderNodeType;
  label: string;
  category: "Conversation" | "Logic" | "Integration";
  icon: LucideIcon;
  accent: string;
  defaults: Record<string, unknown>;
  fields: ConfigField[];
}

export const NODE_CATALOG: NodeDefinition[] = [
  { type: "start", label: "Start", category: "Conversation", icon: Play, accent: "green", defaults: { label: "Start" }, fields: [{ key: "label", label: "Label" }] },
  { type: "message", label: "Message", category: "Conversation", icon: MessageSquareText, accent: "blue", defaults: { label: "Message", message: "Enter a message" }, fields: [{ key: "label", label: "Label" }, { key: "message", label: "Message", kind: "textarea" }] },
  { type: "question", label: "Question", category: "Conversation", icon: HelpCircle, accent: "cyan", defaults: { label: "Question", prompt: "What would you like to know?", variable: "answer" }, fields: [{ key: "label", label: "Label" }, { key: "prompt", label: "Prompt", kind: "textarea" }, { key: "variable", label: "Save as" }] },
  { type: "choice", label: "Choice", category: "Conversation", icon: ListChecks, accent: "teal", defaults: { label: "Choice", prompt: "Choose an option", options: "Option A\nOption B" }, fields: [{ key: "label", label: "Label" }, { key: "prompt", label: "Prompt" }, { key: "options", label: "Options", kind: "textarea" }] },
  { type: "input", label: "Input", category: "Conversation", icon: TextCursorInput, accent: "green", defaults: { label: "Input", variable: "input", inputType: "text" }, fields: [{ key: "label", label: "Label" }, { key: "variable", label: "Save as" }, { key: "inputType", label: "Input type", kind: "select", options: ["text", "email", "number", "phone"] }] },
  { type: "llm", label: "AI response", category: "Conversation", icon: Bot, accent: "violet",
    defaults: { label: "AI response", prompt: "You are a helpful assistant for this business. Answer briefly.", provider: "openai", model: "", temperature: 0.7 },
    fields: [
      { key: "label", label: "Label" },
      { key: "prompt", label: "System prompt", kind: "textarea" },
      { key: "provider", label: "Provider", kind: "select", options: ["openai", "anthropic", "gemini", "groq", "mistral", "ollama"] },
      { key: "model", label: "Model (blank = provider default)" },
      { key: "temperature", label: "Temperature", kind: "number" },
    ] },
  { type: "handoff", label: "Handoff", category: "Conversation", icon: Handshake, accent: "amber", defaults: { label: "Handoff", queue: "Support", message: "Connecting you with an agent" }, fields: [{ key: "label", label: "Label" }, { key: "queue", label: "Queue" }, { key: "message", label: "Message", kind: "textarea" }] },
  { type: "end", label: "End", category: "Conversation", icon: CircleStop, accent: "red", defaults: { label: "End", message: "Conversation complete" }, fields: [{ key: "label", label: "Label" }, { key: "message", label: "Closing message" }] },
  { type: "condition", label: "Condition", category: "Logic", icon: GitBranch, accent: "amber", defaults: { label: "Condition", variable: "answer", operator: "equals", value: "" }, fields: [{ key: "label", label: "Label" }, { key: "variable", label: "Variable" }, { key: "operator", label: "Operator", kind: "select", options: ["equals", "not_equals", "contains", "greater_than", "less_than"] }, { key: "value", label: "Value" }] },
  { type: "knowledge_search", label: "Knowledge", category: "Logic", icon: Search, accent: "blue",
    defaults: { label: "Knowledge search", knowledgeBaseId: "", query: "{{last_message}}", topK: 3, variable: "knowledge" },
    fields: [
      { key: "label", label: "Label" },
      { key: "knowledgeBaseId", label: "Knowledge base ID (copy from Knowledge page)" },
      { key: "query", label: "Query" },
      { key: "topK", label: "Top results", kind: "number" },
      { key: "variable", label: "Save results as" },
    ] },
  { type: "delay", label: "Delay", category: "Logic", icon: Clock3, accent: "gray", defaults: { label: "Delay", seconds: 2 }, fields: [{ key: "label", label: "Label" }, { key: "seconds", label: "Seconds", kind: "number" }] },
  { type: "http_request", label: "HTTP request", category: "Integration", icon: Braces, accent: "orange", defaults: { label: "HTTP request", url: "https://", method: "GET" }, fields: [{ key: "label", label: "Label" }, { key: "url", label: "URL" }, { key: "method", label: "Method", kind: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"] }] },
  { type: "webhook", label: "Webhook", category: "Integration", icon: Webhook, accent: "orange", defaults: { label: "Webhook", url: "https://", event: "flow.event" }, fields: [{ key: "label", label: "Label" }, { key: "url", label: "URL" }, { key: "event", label: "Event" }] },
];

export const NODE_DEFINITIONS = Object.fromEntries(
  NODE_CATALOG.map((definition) => [definition.type, definition]),
) as Record<BuilderNodeType, NodeDefinition>;
