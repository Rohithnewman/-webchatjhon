import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Building2, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { EffectiveStatus } from "../../entities/admin/api";
import { useMe } from "../../entities/me/api";
import { organizationApi } from "../../entities/organization/api";
import { useAuthStore } from "../../entities/session/auth-store";
import { Badge, Button, Field, Input, LoadingState, Panel, useToast, type BadgeTone } from "../../shared/ui";

const EFFECTIVE_TONE: Record<EffectiveStatus, BadgeTone> = { active: "brand", suspended: "warning", expired: "danger" };
function formatLimit(used: number, limit: number | null) {
  return `${used}/${limit ?? "∞"}`;
}

export function OrganizationPanel() {
  const toast = useToast();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { can } = useMe();
  const switchWorkspace = useAuthStore((s) => s.switchWorkspace);
  const [orgName, setOrgName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  const org = useQuery({ queryKey: ["organization"], queryFn: organizationApi.get });
  const canManage = can("workspace:manage");
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Request failed");
  const refresh = () => client.invalidateQueries({ queryKey: ["organization"] });

  const rename = useMutation({ mutationFn: () => organizationApi.rename(orgName), onSuccess: () => { setOrgName(""); void refresh(); toast.success("Organisation renamed"); }, onError: fail });
  const create = useMutation({ mutationFn: () => organizationApi.createWorkspace(workspaceName), onSuccess: () => { setWorkspaceName(""); void refresh(); void client.invalidateQueries({ queryKey: ["my-workspaces"] }); toast.success("Workspace created — you are its owner"); }, onError: fail });
  const switchTo = useMutation({
    mutationFn: (id: string) => switchWorkspace(id),
    onSuccess: () => { client.clear(); navigate("/chatbots"); toast.success("Switched workspace"); },
    onError: fail,
  });

  if (!org.data) return <LoadingState label="Loading organisation" />;

  const sub = org.data.subscription;

  return (
    <div className="settings-grid">
      <Panel>
        <Panel.Header title="Organisation" />
        <Panel.Body>
          <p className="form-hint"><Building2 size={14} /> <strong>{org.data.name}</strong>. The plan is set by the platform administrator.</p>
          {canManage && (
            <form className="form-stack" onSubmit={(e) => { e.preventDefault(); if (orgName.trim()) rename.mutate(); }}>
              <Field label="Rename organisation"><Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={org.data.name} /></Field>
              <Button type="submit" variant="secondary" disabled={!orgName.trim()} loading={rename.isPending}>Rename</Button>
            </form>
          )}
          {canManage && (
            <form className="form-stack" style={{ marginTop: 20 }} onSubmit={(e) => { e.preventDefault(); if (workspaceName.trim()) create.mutate(); }}>
              <Field label="New workspace"><Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="e.g. Sales team" /></Field>
              <p className="form-hint">Workspaces isolate chatbots, knowledge and conversations. You become the owner of every workspace you create.</p>
              <Button type="submit" variant="primary" icon={<Plus size={15} />} disabled={!workspaceName.trim()} loading={create.isPending}>Create workspace</Button>
            </form>
          )}
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header title={`Workspaces (${org.data.workspaces.length})`} />
        <Panel.Body flush>
          {org.data.workspaces.map((w) => (
            <div key={w.id} className="credential-row">
              <div>
                <strong style={{ textTransform: "none" }}>{w.name}</strong> {w.is_current && <Badge tone="brand">current</Badge>}
                <span className="credential-meta">{w.member_count} member{w.member_count === 1 ? "" : "s"} · created {new Date(w.created_at).toLocaleDateString()}</span>
              </div>
              {!w.is_current && (
                <Button size="sm" variant="ghost" icon={<ArrowRightLeft size={14} />} onClick={() => switchTo.mutate(w.id)} loading={switchTo.isPending}>Switch</Button>
              )}
            </div>
          ))}
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header title="Subscription" meta={<Badge tone={EFFECTIVE_TONE[sub.effective_status]}>{sub.effective_status}</Badge>} />
        <Panel.Body>
          <dl className="subscription-summary">
            <div><dt>Plan</dt><dd style={{ textTransform: "capitalize" }}>{sub.plan}</dd></div>
            <div><dt>Period</dt><dd>{sub.ends_at ? `${sub.starts_at} → ${sub.ends_at}` : `${sub.starts_at} → no expiry`}</dd></div>
            <div><dt>Seats</dt><dd>{formatLimit(sub.seats_used, sub.seat_limit)}</dd></div>
            <div><dt>Chatbots</dt><dd>{formatLimit(sub.chatbots_used, sub.chatbot_limit)}</dd></div>
            <div><dt>Conversations this month</dt><dd>{formatLimit(sub.conversations_used, sub.conversation_limit)}</dd></div>
          </dl>
          <p className="form-hint">Plan, status and period are set by the platform administrator.</p>
        </Panel.Body>
      </Panel>
    </div>
  );
}
