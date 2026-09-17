import { apiRequest } from "../../shared/api/client";

export interface WorkspaceProfile { id: string; name: string; organization_name: string; your_role: string; }
export interface Member { user_id: string; email: string; full_name: string; role: string; role_id: string; joined_at: string; }
export interface MemberAdd { email: string; full_name: string; password: string; role: string; }

// D3: organisation-defined roles from the fixed permission catalogue. The
// four system roles (owner/admin/member/viewer) have `organization_id: null`
// and `is_system: true`; an organisation's own roles have both set.
export interface Role {
  id: string;
  name: string;
  permissions: string[];
  organization_id: string | null;
  is_system: boolean;
  in_use: number;
}
export interface RoleCreate { name: string; permissions: string[]; }
export interface RoleUpdate { name?: string; permissions?: string[]; }

/** The fixed permission catalogue (spec §2 D3), with the human label each
 *  control's gating check is described by — used for the roles editor's
 *  checkbox grid and for ReadOnlyBanner's message. */
export interface PermissionCatalogueEntry { id: string; label: string; }
export const PERMISSION_CATALOGUE: PermissionCatalogueEntry[] = [
  { id: "bots:manage", label: "Build bots" },
  { id: "inbox:reply", label: "Reply in inbox" },
  { id: "knowledge:manage", label: "Manage knowledge & AI keys" },
  { id: "analytics:read", label: "View analytics" },
  { id: "members:manage", label: "Manage members" },
  { id: "workspace:manage", label: "Manage organisation" },
];

const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_CATALOGUE.map((entry) => [entry.id, entry.label]),
);

export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission;
}

export const workspaceApi = {
  profile: () => apiRequest<WorkspaceProfile>("/workspace"),
  members: () => apiRequest<Member[]>("/workspace/members"),
  addMember: (input: MemberAdd) =>
    apiRequest<Member>("/workspace/members", { method: "POST", body: JSON.stringify(input) }),
  changeRole: (userId: string, role: string) =>
    apiRequest<Member>(`/workspace/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (userId: string) =>
    apiRequest<{ removed: boolean }>(`/workspace/members/${userId}`, { method: "DELETE" }),
  roles: () => apiRequest<Role[]>("/workspace/roles"),
  createRole: (input: RoleCreate) =>
    apiRequest<Role>("/workspace/roles", { method: "POST", body: JSON.stringify(input) }),
  updateRole: (roleId: string, input: RoleUpdate) =>
    apiRequest<Role>(`/workspace/roles/${roleId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteRole: (roleId: string) =>
    apiRequest<{ deleted: boolean }>(`/workspace/roles/${roleId}`, { method: "DELETE" }),
};
