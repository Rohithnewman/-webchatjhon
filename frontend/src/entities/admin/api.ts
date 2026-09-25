import { apiRequest } from "../../shared/api/client";

export type Plan = "free" | "pro" | "enterprise";
export const PLANS: Plan[] = ["free", "pro", "enterprise"];

export type SubscriptionStatus = "active" | "suspended";
export type EffectiveStatus = "active" | "suspended" | "expired";
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["active", "suspended"];

/** Same shape on every endpoint that carries a subscription:
 *  `GET/PATCH /admin/organizations[/{id}]`, `GET /auth/me`, `GET /organization`.
 *  `seat_limit`/`chatbot_limit`/`conversation_limit` are always the EFFECTIVE
 *  limit (override if set, else the plan default); `limits_overridden` reports
 *  which of the three actually carry an override. */
export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus;
  effective_status: EffectiveStatus;
  starts_at: string;
  ends_at: string | null;
  seat_limit: number | null;
  chatbot_limit: number | null;
  conversation_limit: number | null;
  seats_used: number;
  chatbots_used: number;
  conversations_used: number;
  limits_overridden: { seats: boolean; chatbots: boolean; conversations: boolean };
}

/** All fields optional; send `ends_at: null` to clear the expiry, omit it to leave unchanged.
 *  `seat_limit`/`chatbot_limit`/`conversation_limit`: a number sets an override, `null` clears
 *  it back to the plan default, omitting the field leaves it unchanged. */
export interface SubscriptionPatch {
  plan?: Plan;
  status?: SubscriptionStatus;
  starts_at?: string;
  ends_at?: string | null;
  seat_limit?: number | null;
  chatbot_limit?: number | null;
  conversation_limit?: number | null;
}

export interface PlatformStats { organizations: number; workspaces: number; users: number; chatbots: number; conversations: number; locked_organizations: number; }
export interface AdminOrganization { id: string; name: string; plan: Plan; created_at: string; workspace_count: number; member_count: number; subscription: Subscription; }
export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superadmin: boolean;
  is_org_admin?: boolean;
  roles?: string[];
  created_at: string | null;
  organizations: string[];
}

export const adminApi = {
  stats: () => apiRequest<PlatformStats>("/admin/stats"),
  organizations: () => apiRequest<AdminOrganization[]>("/admin/organizations"),
  updateSubscription: (id: string, patch: SubscriptionPatch) =>
    apiRequest<AdminOrganization>(`/admin/organizations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  users: () => apiRequest<AdminUser[]>("/admin/users"),
  createOrganization: (data: { name: string; plan?: Plan; workspace_name?: string }) =>
    apiRequest<AdminOrganization>("/admin/organizations", { method: "POST", body: JSON.stringify(data) }),
  deleteOrganization: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/admin/organizations/${id}`, { method: "DELETE" }),
  updateUser: (id: string, flags: { is_active?: boolean; is_superadmin?: boolean }) =>
    apiRequest<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(flags) }),
  resetPassword: (id: string, password: string) =>
    apiRequest<{ message: string }>(`/admin/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  deleteUser: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),
};
