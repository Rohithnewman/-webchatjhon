import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../shared/api/client";
import { useAuthStore } from "../session/auth-store";

export interface Me {
  user_id: string;
  email: string;
  full_name: string;
  is_superadmin: boolean;
  workspace_id: string;
  role: "owner" | "admin" | "member" | "viewer" | null;
  permissions: string[];
}

export const meApi = { get: () => apiRequest<Me>("/auth/me") };

/** Who am I in the current workspace. Re-fetched whenever the signed-in user
 *  or workspace changes because both are part of the query key. */
export function useMe() {
  const userId = useAuthStore((s) => s.userId);
  const workspaceId = useAuthStore((s) => s.workspaceId);
  const query = useQuery({
    queryKey: ["me", userId, workspaceId],
    queryFn: meApi.get,
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
  const permissions = query.data?.permissions ?? [];
  const can = (permission: string) => permissions.includes("*") || permissions.includes(permission);
  return { ...query, me: query.data, can };
}
