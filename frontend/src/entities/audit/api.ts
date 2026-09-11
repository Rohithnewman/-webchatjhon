import { apiRequest } from "../../shared/api/client";

export interface AuditEntry {
  id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const auditApi = {
  recent: (limit = 50) => apiRequest<AuditEntry[]>(`/audit-logs?limit=${limit}`),
};
