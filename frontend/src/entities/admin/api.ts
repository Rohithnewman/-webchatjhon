import { apiRequest } from "../../shared/api/client";

export type Plan = "free" | "pro" | "enterprise";
export const PLANS: Plan[] = ["free", "pro", "enterprise"];

export interface PlatformStats { organizations: number; workspaces: number; users: number; chatbots: number; conversations: number; }
export interface AdminOrganization { id: string; name: string; plan: Plan; created_at: string; workspace_count: number; member_count: number; }
export interface AdminUser { id: string; email: string; full_name: string; is_active: boolean; is_superadmin: boolean; created_at: string | null; organizations: string[]; }

export const adminApi = {
  stats: () => apiRequest<PlatformStats>("/admin/stats"),
  organizations: () => apiRequest<AdminOrganization[]>("/admin/organizations"),
  setPlan: (id: string, plan: Plan) =>
    apiRequest<AdminOrganization>(`/admin/organizations/${id}`, { method: "PATCH", body: JSON.stringify({ plan }) }),
  users: () => apiRequest<AdminUser[]>("/admin/users"),
  updateUser: (id: string, flags: { is_active?: boolean; is_superadmin?: boolean }) =>
    apiRequest<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(flags) }),
};
