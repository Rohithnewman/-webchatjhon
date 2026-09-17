import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  PLANS,
  SUBSCRIPTION_STATUSES,
  adminApi,
  type AdminOrganization,
  type EffectiveStatus,
  type Plan,
  type SubscriptionPatch,
  type SubscriptionStatus,
} from "../../entities/admin/api";
import { useMe } from "../../entities/me/api";
import { Badge, Button, EmptyState, LoadingState, Panel, Select, Tabs, useToast, type BadgeTone, type TabItem } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

type AdminTab = "overview" | "organizations" | "users";
const TABS: readonly TabItem<AdminTab>[] = [
  { id: "overview", label: "Overview" },
  { id: "organizations", label: "Organisations" },
  { id: "users", label: "Users" },
];

export function AdminPage() {
  const { me, isLoading } = useMe();
  const [tab, setTab] = useState<AdminTab>("overview");

  if (isLoading) return <LoadingState label="Checking access" />;
  if (!me?.is_superadmin) {
    return (
      <DashboardShell title="Platform admin">
        <EmptyState icon={<ShieldAlert size={28} />} title="Superadmin only" description="This console is limited to platform administrators." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Platform admin" subtitle="Every organisation and user on this deployment. Tenant content stays private to its workspace.">
      <div className="settings-tabs"><Tabs items={TABS} value={tab} onChange={setTab} label="Admin sections" /></div>
      {tab === "overview" && <Overview />}
      {tab === "organizations" && <Organizations />}
      {tab === "users" && <Users myUserId={me.user_id} />}
    </DashboardShell>
  );
}

function Overview() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: adminApi.stats, refetchInterval: 10_000 });
  if (!stats.data) return <LoadingState label="Loading platform stats" />;
  const s = stats.data;
  return (
    <div className="stat-grid">
      {([["Organisations", s.organizations], ["Workspaces", s.workspaces], ["Users", s.users], ["Chatbots", s.chatbots], ["Conversations", s.conversations]] as const).map(([label, value]) => (
        <div key={label} className="stat-tile"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong></div>
      ))}
      <div className={`stat-tile${s.locked_organizations > 0 ? " is-warn" : ""}`}>
        <span className="stat-label">Suspended or expired</span>
        <strong className="stat-value">{s.locked_organizations}</strong>
      </div>
    </div>
  );
}

const EFFECTIVE_TONE: Record<EffectiveStatus, BadgeTone> = { active: "brand", suspended: "warning", expired: "danger" };

function formatLimit(used: number, limit: number | null) {
  return `${used} / ${limit ?? "∞"}`;
}

function Organizations() {
  const toast = useToast();
  const client = useQueryClient();
  const orgs = useQuery({ queryKey: ["admin", "organizations"], queryFn: adminApi.organizations });
  const update = useMutation({
    mutationFn: (input: { id: string; patch: SubscriptionPatch }) => adminApi.updateSubscription(input.id, input.patch),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["admin"] }); toast.success("Subscription updated"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  if (!orgs.data) return <LoadingState label="Loading organisations" />;
  return (
    <Panel>
      <Panel.Header title={`Organisations (${orgs.data.length})`} />
      <Panel.Body flush>
        <table className="simple-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Period</th>
              <th>Effective</th>
              <th>Limits</th>
              <th>Usage this month</th>
              <th>Workspaces</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {orgs.data.map((org) => (
              <OrganizationRow key={org.id} org={org} onPatch={(patch) => update.mutateAsync({ id: org.id, patch })} pending={update.isPending} />
            ))}
          </tbody>
        </table>
      </Panel.Body>
    </Panel>
  );
}

function OrganizationRow({
  org,
  onPatch,
  pending,
}: {
  org: AdminOrganization;
  onPatch: (patch: SubscriptionPatch) => Promise<AdminOrganization>;
  pending: boolean;
}) {
  const sub = org.subscription;
  // Fire-and-forget uses of onPatch (everything but the limit inputs, which need the
  // rejection to revert their own draft) swallow the rejection here — the mutation's own
  // onError already raised the toast, so there is nothing left to report at this call site.
  const fireAndForget = (patch: SubscriptionPatch) => { onPatch(patch).catch(() => {}); };
  return (
    <tr>
      <td>{org.name}</td>
      <td>
        <Select value={sub.plan} disabled={pending} onChange={(e) => fireAndForget({ plan: e.target.value as Plan })} aria-label={`Plan for ${org.name}`}>
          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </td>
      <td>
        <Select value={sub.status} disabled={pending} onChange={(e) => fireAndForget({ status: e.target.value as SubscriptionStatus })} aria-label={`Status for ${org.name}`}>
          {SUBSCRIPTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="date"
            className="subscription-date-input"
            value={sub.starts_at}
            disabled={pending}
            onChange={(e) => e.target.value && fireAndForget({ starts_at: e.target.value })}
            aria-label={`Start date for ${org.name}`}
          />
          <span aria-hidden>→</span>
          <input
            type="date"
            className="subscription-date-input"
            value={sub.ends_at ?? ""}
            disabled={pending}
            onChange={(e) => fireAndForget({ ends_at: e.target.value || null })}
            aria-label={`End date for ${org.name}`}
          />
          {sub.ends_at ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => fireAndForget({ ends_at: null })}>
              Clear
            </Button>
          ) : null}
        </div>
      </td>
      <td><Badge tone={EFFECTIVE_TONE[sub.effective_status]}>{sub.effective_status}</Badge></td>
      <td>
        <div className="limit-input-row">
          <LimitInput
            label={`User limit for ${org.name}`}
            value={sub.seat_limit}
            overridden={sub.limits_overridden.seats}
            pending={pending}
            onCommit={(v) => onPatch({ seat_limit: v })}
          />
          <LimitInput
            label={`Bot limit for ${org.name}`}
            value={sub.chatbot_limit}
            overridden={sub.limits_overridden.chatbots}
            pending={pending}
            onCommit={(v) => onPatch({ chatbot_limit: v })}
          />
          <LimitInput
            label={`Conversation limit for ${org.name}`}
            value={sub.conversation_limit}
            overridden={sub.limits_overridden.conversations}
            pending={pending}
            onCommit={(v) => onPatch({ conversation_limit: v })}
          />
        </div>
      </td>
      <td>
        users {formatLimit(sub.seats_used, sub.seat_limit)} · bots {formatLimit(sub.chatbots_used, sub.chatbot_limit)} · chats {formatLimit(sub.conversations_used, sub.conversation_limit)} (this month)
      </td>
      <td>{org.workspace_count}</td>
      <td>{new Date(org.created_at).toLocaleDateString()}</td>
    </tr>
  );
}

/** A single override control: blank input showing the plan default as a placeholder, or the
 *  override value when one is set, plus a "default" button to clear it. Commits on blur/Enter
 *  only — the shared mutation disables every input in the row while a commit is in flight. */
function LimitInput({
  label,
  value,
  overridden,
  pending,
  onCommit,
}: {
  label: string;
  /** Effective limit: the override when `overridden`, otherwise the plan default. */
  value: number | null;
  overridden: boolean;
  pending: boolean;
  onCommit: (value: number | null) => Promise<unknown>;
}) {
  const initial = overridden && value !== null ? String(value) : "";
  const [draft, setDraft] = useState(initial);

  useEffect(() => setDraft(initial), [initial]);

  // Re-entrancy guard: set synchronously before onCommit is even called (and therefore before
  // the shared mutation's pending state can flip), cleared in `finally` once the commit settles.
  // Disabling the still-focused input when `pending` flips true makes the browser fire a second
  // blur — this flag makes that (and any other re-entrant call) a no-op instead of a second PATCH.
  const committing = useRef(false);

  // Reverts the draft to the last-known-good value when the PATCH is rejected — the mutation's
  // own onError already raised the toast, this just keeps the input from showing a value the
  // server never accepted.
  const send = async (v: number | null) => {
    committing.current = true;
    try {
      await onCommit(v);
    } catch {
      setDraft(initial);
    } finally {
      committing.current = false;
    }
  };

  const commit = () => {
    if (committing.current) return;
    const trimmed = draft.trim();
    if (trimmed === "") {
      if (overridden) void send(null);
      else setDraft("");
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 0) { setDraft(initial); return; }
    if (overridden && n === value) return;
    void send(n);
  };

  return (
    <span className="limit-input-group">
      <input
        type="number"
        min={0}
        className="limit-input"
        value={draft}
        placeholder={value === null ? "∞" : String(value)}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        aria-label={label}
      />
      {overridden && (
        <Button
          size="sm"
          variant="ghost"
          className="limit-default-btn"
          disabled={pending}
          // Keep focus on the input through the click so it never blurs — otherwise the
          // mousedown-triggered blur commits the (possibly just-typed) draft first, then the
          // click sends null, firing two PATCH requests.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setDraft(""); void send(null); }}
        >
          default
        </Button>
      )}
    </span>
  );
}

function Users({ myUserId }: { myUserId: string }) {
  const toast = useToast();
  const client = useQueryClient();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users });
  const update = useMutation({
    mutationFn: (input: { id: string; flags: { is_active?: boolean; is_superadmin?: boolean } }) => adminApi.updateUser(input.id, input.flags),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["admin"] }); toast.success("User updated"); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  if (!users.data) return <LoadingState label="Loading users" />;
  return (
    <Panel>
      <Panel.Header title={`Users (${users.data.length})`} />
      <Panel.Body flush>
        <table className="simple-table">
          <thead><tr><th>Name</th><th>Email</th><th>Organisations</th><th>Status</th><th>Superadmin</th><th></th></tr></thead>
          <tbody>
            {users.data.map((user) => {
              const isMe = user.id === myUserId;
              return (
                <tr key={user.id}>
                  <td>{user.full_name} {isMe && <Badge tone="brand">you</Badge>}</td>
                  <td>{user.email}</td>
                  <td>{user.organizations.join(", ") || "—"}</td>
                  <td><Badge tone={user.is_active ? "brand" : "danger"}>{user.is_active ? "active" : "deactivated"}</Badge></td>
                  <td>{user.is_superadmin ? <Badge tone="warning">superadmin</Badge> : "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <Button size="sm" variant={user.is_active ? "danger" : "secondary"} disabled={isMe} onClick={() => update.mutate({ id: user.id, flags: { is_active: !user.is_active } })}>
                      {user.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isMe || (!user.is_superadmin && user.organizations.length > 0)}
                      title={!user.is_superadmin && user.organizations.length > 0 ? "Belongs to an organisation — superadmins have no tenancy" : undefined}
                      onClick={() => update.mutate({ id: user.id, flags: { is_superadmin: !user.is_superadmin } })}
                    >
                      {user.is_superadmin ? "Revoke admin" : "Make admin"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel.Body>
    </Panel>
  );
}
