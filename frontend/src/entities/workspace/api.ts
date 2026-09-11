import { apiRequest } from "../../shared/api/client";

export type RoleName = "owner" | "admin" | "member" | "viewer";
export const ROLES: RoleName[] = ["owner", "admin", "member", "viewer"];

export interface WorkspaceProfile { id: string; name: string; organization_name: string; your_role: RoleName; }
export interface Member { user_id: string; email: string; full_name: string; role: RoleName; joined_at: string; }
export interface MemberAdd { email: string; full_name: string; password: string; role: RoleName; }

export const workspaceApi = {
  profile: () => apiRequest<WorkspaceProfile>("/workspace"),
  members: () => apiRequest<Member[]>("/workspace/members"),
  addMember: (input: MemberAdd) =>
    apiRequest<Member>("/workspace/members", { method: "POST", body: JSON.stringify(input) }),
  changeRole: (userId: string, role: RoleName) =>
    apiRequest<Member>(`/workspace/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (userId: string) =>
    apiRequest<{ removed: boolean }>(`/workspace/members/${userId}`, { method: "DELETE" }),
};
