import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { organizationApi } from "../../entities/organization/api";
import { useAuthStore } from "../../entities/session/auth-store";
import { useToast } from "../../shared/ui";

export function WorkspaceSwitcher() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const userId = useAuthStore((s) => s.userId);
  const switchWorkspace = useAuthStore((s) => s.switchWorkspace);
  const mine = useQuery({ queryKey: ["my-workspaces", userId], queryFn: organizationApi.mine, enabled: Boolean(userId) });
  const switchTo = useMutation({
    mutationFn: (id: string) => switchWorkspace(id),
    onSuccess: () => { client.clear(); navigate("/chatbots"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not switch workspace"),
  });

  const rows = mine.data ?? [];
  if (rows.length < 2) return null;
  const current = rows.find((r) => r.is_current)?.workspace_id ?? "";

  return (
    <select
      className="workspace-switcher"
      value={current}
      title="Switch workspace"
      aria-label="Switch workspace"
      onChange={(e) => switchTo.mutate(e.target.value)}
      disabled={switchTo.isPending}
    >
      {rows.map((r) => (
        <option key={r.workspace_id} value={r.workspace_id}>{r.organization_name} / {r.workspace_name} ({r.role})</option>
      ))}
    </select>
  );
}
