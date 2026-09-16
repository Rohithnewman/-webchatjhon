import { apiRequest } from "../../shared/api/client";

export type Plan = "free" | "pro" | "enterprise";
export const PLANS: Plan[] = ["free", "pro", "enterprise"];

export type SubscriptionStatus = "active" | "suspended";
export type EffectiveStatus = "active" | "suspended" | "expired";
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["active", "suspended"];

/** Same nine-key shape on every endpoint that carries a subscription:
 *  `GET/PATCH /admin/organizations[/{id}]`, `GET /auth/me`, `GET /organization`. */
export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus;
  effective_status: EffectiveStatus;
  starts_at: string;
  ends_at: string | null;
  seat_limit: number | null;
  chatbot_limit: number | null;
  seats_used: number;
  chatbots_used: number;
}

/** All fields optional; send `ends_at: null` to clear the expiry, omit it to leave unchanged. */
export interface SubscriptionPatch {
  plan?: Plan;
  status?: SubscriptionStatus;
  starts_at?: string;
  ends_at?: string | null;
}

export interface PlatformStats { organizations: number; workspaces: number; users: number; chatbots: number; conversations: number; locked_organizations: number; }
export interface AdminOrganization { id: string; name: string; plan: Plan; created_at: string; workspace_count: number; member_count: number; subscription: Subscription; }
export interface AdminUser { id: string; email: string; full_name: string; is_active: boolean; is_superadmin: boolean; created_at: string | null; organizations: string[]; }

export const adminApi = {
  stats: () => apiRequest<PlatformStats>("/admin/stats"),
  organizations: () => apiRequest<AdminOrganization[]>("/admin/organizations"),
  updateSubscription: (id: string, patch: SubscriptionPatch) =>
    apiRequest<AdminOrganization>(`/admin/organizations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  users: () => apiRequest<AdminUser[]>("/admin/users"),
  updateUser: (id: string, flags: { is_active?: boolean; is_superadmin?: boolean }) =>
    apiRequest<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(flags) }),
};
