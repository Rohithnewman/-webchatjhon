import { apiRequest } from "../../shared/api/client";
import type { Subscription } from "../admin/api";

export interface OrgWorkspace { id: string; name: string; member_count: number; created_at: string; is_current: boolean; }
export interface OrganizationProfile { id: string; name: string; plan: string; workspaces: OrgWorkspace[]; subscription: Subscription; }
export interface MyWorkspace { workspace_id: string; workspace_name: string; organization_id: string; organization_name: string; role: string; is_current: boolean; }

export const organizationApi = {
  get: () => apiRequest<OrganizationProfile>("/organization"),
  rename: (name: string) => apiRequest<OrganizationProfile>("/organization", { method: "PATCH", body: JSON.stringify({ name }) }),
  createWorkspace: (name: string) => apiRequest<OrgWorkspace>("/organization/workspaces", { method: "POST", body: JSON.stringify({ name }) }),
  renameWorkspace: (id: string, name: string) => apiRequest<OrgWorkspace>(`/organization/workspaces/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  mine: () => apiRequest<MyWorkspace[]>("/auth/workspaces"),
};
