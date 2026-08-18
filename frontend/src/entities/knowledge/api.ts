import { apiRequest } from "../../shared/api/client";

export interface KnowledgeBase { id: string; name: string; description: string; embedding_provider: string; embedding_model: string; embedding_dimensions: number; }
export interface Document { id: string; knowledge_base_id: string; filename: string; content_type: string; byte_size: number; status: string; error: string | null; chunk_count: number; }

export const knowledgeApi = {
  list: () => apiRequest<KnowledgeBase[]>("/knowledge-bases"),
  create: (input: { name: string; description?: string }) => apiRequest<KnowledgeBase>("/knowledge-bases", { method: "POST", body: JSON.stringify(input) }),
  documents: (id: string) => apiRequest<Document[]>(`/knowledge-bases/${id}/documents`),
  upload: (id: string, file: File) => { const body = new FormData(); body.append("file", file); return apiRequest<Document>(`/knowledge-bases/${id}/documents`, { method: "POST", body }); },
};
