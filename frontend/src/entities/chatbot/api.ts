import { apiRequest } from "../../shared/api/client";
import type { Chatbot, FlowDocument, FlowRecord, FlowVersion } from "./types";

export const chatbotApi = {
  list: () => apiRequest<Chatbot[]>("/chatbots"),
  create: (input: { name: string; description: string }) =>
    apiRequest<Chatbot>("/chatbots", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: Partial<Pick<Chatbot, "name" | "description" | "status">>) =>
    apiRequest<Chatbot>(`/chatbots/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  remove: (id: string) => apiRequest<{ deleted: boolean }>(`/chatbots/${id}`, { method: "DELETE" }),
  flow: (id: string) => apiRequest<FlowRecord>(`/chatbots/${id}/flow`),
  saveFlow: (id: string, document: FlowDocument) =>
    apiRequest<FlowRecord>(`/chatbots/${id}/flow`, { method: "PUT", body: JSON.stringify(document) }),
  versions: (id: string) => apiRequest<FlowVersion[]>(`/chatbots/${id}/flow/versions`),
  restore: (id: string, version: number) =>
    apiRequest<FlowRecord>(`/chatbots/${id}/flow/versions/${version}/restore`, { method: "POST" }),
};
