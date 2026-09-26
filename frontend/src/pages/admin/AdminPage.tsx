import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Key,
  Layers,
  MoreVertical,
  Plus,
  Power,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  PLANS,
  SUBSCRIPTION_STATUSES,
  adminApi,
  type AdminOrganization,
  type AdminUser,
  type EffectiveStatus,
  type Plan,
  type SubscriptionPatch,
  type SubscriptionStatus,
} from "../../entities/admin/api";
import { useMe } from "../../entities/me/api";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  LoadingState,
  Panel,
  Select,
  Tabs,
  useToast,
  type BadgeTone,
  type TabItem,
} from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

type AdminTab = "overview" | "organizations" | "subscriptions" | "users";
const TABS: readonly TabItem<AdminTab>[] = [
  { id: "overview", label: "Overview" },
  { id: "organizations", label: "Organisations" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "users", label: "Users" },
];

function formatAdminDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  const day = date.getDate();
  const suffix = (d: number) => {
    if (d > 3 && d < 21) return "th";
    switch (d % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  };
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  const time = date.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${month} ${day}${suffix(day)}, ${year} ${time}`;
}

export function AdminPage() {
  const { me, isLoading } = useMe();
  const [tab, setTab] = useState<AdminTab>("overview");

  if (isLoading) return <LoadingState label="Checking access" />;
  if (!me?.is_superadmin) {
    return (
      <DashboardShell title="Platform admin">
        <EmptyState
          icon={<ShieldAlert size={28} />}
          title="Superadmin only"
          description="This console is limited to platform administrators."
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title="Dashboard"
      subtitle={tab === "overview" ? "Overview" : "Every organisation, subscription, and user on this deployment."}
    >
      <div className="settings-tabs">
        <Tabs items={TABS} value={tab} onChange={setTab} label="Admin sections" />
      </div>
      {tab === "overview" && <Overview />}
      {tab === "organizations" && <Organizations />}
      {tab === "subscriptions" && <Subscriptions />}
      {tab === "users" && <Users myUserId={me.user_id} />}
    </DashboardShell>
  );
}

/* ==========================================================================
   Create Organization Dialog (Superadmin only)
   ========================================================================== */
function CreateOrganizationDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (org: AdminOrganization) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<Plan>("free");
  const [workspaceName, setWorkspaceName] = useState("Default");
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    try {
      const created = await adminApi.createOrganization({
        name: name.trim(),
        plan,
        workspace_name: workspaceName.trim() || "Default",
      });
      toast.success(`Organisation "${created.name}" created successfully`);
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create organisation");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} title="Create New Organisation">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p className="dialog-subtitle" style={{ margin: 0 }}>
          Provision a new multi-tenant organization. Only Superadmins can add organizations.
        </p>
        <div className="admin-modal-field">
          <label>Organisation Name *</label>
          <input
            type="text"
            required
            placeholder="e.g. Acme Corporation"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="admin-modal-field">
          <label>Subscription Plan</label>
          <Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </Select>
        </div>
        <div className="admin-modal-field">
          <label>Primary Workspace Name</label>
          <input
            type="text"
            placeholder="Default"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending} icon={<Plus size={15} />}>
            Create Organisation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ==========================================================================
   Customer / Organization Edit Dialog
   ========================================================================== */
function OrganizationEditDialog({
  org,
  onClose,
  onSave,
  pending,
}: {
  org: AdminOrganization;
  onClose: () => void;
  onSave: (patch: SubscriptionPatch) => Promise<void>;
  pending: boolean;
}) {
  const sub = org.subscription;
  const [plan, setPlan] = useState<Plan>(sub.plan);
  const [status, setStatus] = useState<SubscriptionStatus>(sub.status);
  const [endsAt, setEndsAt] = useState<string>(sub.ends_at ?? "");
  const [seatLimit, setSeatLimit] = useState<string>(sub.seat_limit !== null ? String(sub.seat_limit) : "");
  const [chatbotLimit, setChatbotLimit] = useState<string>(sub.chatbot_limit !== null ? String(sub.chatbot_limit) : "");
  const [conversationLimit, setConversationLimit] = useState<string>(
    sub.conversation_limit !== null ? String(sub.conversation_limit) : ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: SubscriptionPatch = {
      plan,
      status,
      ends_at: endsAt || null,
      seat_limit: seatLimit.trim() === "" ? null : Number(seatLimit),
      chatbot_limit: chatbotLimit.trim() === "" ? null : Number(chatbotLimit),
      conversation_limit: conversationLimit.trim() === "" ? null : Number(conversationLimit),
    };
    await onSave(patch);
    onClose();
  };

  return (
    <Dialog open={true} onClose={onClose} title={`Customer Settings: ${org.name}`}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p className="dialog-subtitle" style={{ margin: 0 }}>
          Manage plan, status and limits for <strong>{org.name}</strong>.
        </p>
        <div className="admin-modal-grid">
          <div className="admin-modal-field">
            <label>Subscription Plan</label>
            <Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
              {PLANS.map((p) => (
                <option key={p} value={p}>{p.toUpperCase()}</option>
              ))}
            </Select>
          </div>
          <div className="admin-modal-field">
            <label>Customer Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}>
              {SUBSCRIPTION_STATUSES.map((s) => (
                <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </Select>
          </div>
          <div className="admin-modal-field">
            <label>Subscription Expiry</label>
            <input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <div className="admin-modal-field">
            <label>Seat Limit (Users)</label>
            <input
              type="number"
              min={0}
              placeholder="Plan default"
              value={seatLimit}
              onChange={(e) => setSeatLimit(e.target.value)}
            />
          </div>
          <div className="admin-modal-field">
            <label>Chatbot Limit</label>
            <input
              type="number"
              min={0}
              placeholder="Plan default"
              value={chatbotLimit}
              onChange={(e) => setChatbotLimit(e.target.value)}
            />
          </div>
          <div className="admin-modal-field">
            <label>Conversation Limit</label>
            <input
              type="number"
              min={0}
              placeholder="Plan default"
              value={conversationLimit}
              onChange={(e) => setConversationLimit(e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>Save Changes</Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ==========================================================================
   Overview Tab (Superadmin Dashboard)
   ========================================================================== */
function Overview() {
  const toast = useToast();
  const client = useQueryClient();
  const [editOrg, setEditOrg] = useState<AdminOrganization | null>(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);

  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: adminApi.stats, refetchInterval: 10_000 });
  const orgs = useQuery({ queryKey: ["admin", "organizations"], queryFn: adminApi.organizations, refetchInterval: 10_000 });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users, refetchInterval: 10_000 });

  const update = useMutation({
    mutationFn: (input: { id: string; patch: SubscriptionPatch }) => adminApi.updateSubscription(input.id, input.patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Customer settings updated");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const deleteOrg = useMutation({
    mutationFn: (id: string) => adminApi.deleteOrganization(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Organisation deleted successfully");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete organisation"),
  });

  if (!stats.data || !orgs.data || !users.data) {
    return <LoadingState label="Loading platform dashboard..." />;
  }

  const s = stats.data;
  const orgList = orgs.data;
  const userList = users.data;

  // Calculate metrics
  const totalCustomers = orgList.length;
  const paidCustomers = orgList.filter(
    (o) => o.subscription.plan !== "free" && o.subscription.effective_status === "active"
  ).length;
  const suspendedCustomers = orgList.filter((o) => o.subscription.effective_status !== "active").length;

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const thisWeekSignups = orgList.filter((o) => new Date(o.created_at).getTime() >= weekAgo).length;
  const todaySignups = orgList.filter((o) => new Date(o.created_at).getTime() >= dayAgo).length;

  // Map users to organizations to find primary email
  const userMap = new Map<string, AdminUser>();
  for (const u of userList) {
    for (const orgName of u.organizations) {
      if (!userMap.has(orgName)) {
        userMap.set(orgName, u);
      }
    }
  }

  const handleToggleSuspend = (org: AdminOrganization) => {
    const isCurrentlyActive = org.subscription.effective_status === "active";
    const confirmMessage = isCurrentlyActive
      ? `Suspend customer "${org.name}"? Active chatbot widgets will stop answering visitors.`
      : `Reactivate customer "${org.name}"?`;
    if (window.confirm(confirmMessage)) {
      update.mutate({
        id: org.id,
        patch: { status: isCurrentlyActive ? "suspended" : "active" },
      });
    }
  };

  const handleDelete = (org: AdminOrganization) => {
    if (window.confirm(`Are you sure you want to delete organisation "${org.name}"? This action is restricted to Superadmins and will remove all associated workspaces.`)) {
      deleteOrg.mutate(org.id);
    }
  };

  return (
    <div className="admin-overview-container">
      {/* 8 Metric Cards Grid - Note: Superadmin has NO message limit */}
      <div className="admin-metrics-grid">
        {/* Card 1: Total Customers */}
        <div className="admin-metric-card">
          <div className="admin-metric-top">
            <span className="admin-metric-label">Total Customers</span>
            <span className="admin-metric-icon">👦</span>
          </div>
          <div className="admin-metric-value">{totalCustomers}</div>
        </div>

        {/* Card 2: Paid Customers */}
        <div className="admin-metric-card">
          <div className="admin-metric-top">
            <span className="admin-metric-label">Paid Customers</span>
            <span className="admin-metric-icon">🤩</span>
          </div>
          <div className="admin-metric-value">{paidCustomers}</div>
        </div>

        {/* Card 3: Suspended Customers */}
        <div className="admin-metric-card">
          <div className="admin-metric-top">
            <span className="admin-metric-label">Suspended Customers</span>
            <span className="admin-metric-icon">👦</span>
          </div>
          <div className="admin-metric-value">{suspendedCustomers}</div>
        </div>

        {/* Card 4: This week's Sign-up */}
        <div className="admin-metric-card">
          <div className="admin-metric-top">
            <span className="admin-metric-label">This week's Sign-up</span>
            <span className="admin-metric-icon">😎</span>
          </div>
          <div className="admin-metric-value">{thisWeekSignups}</div>
        </div>

        {/* Card 5: Today's Sign-ups */}
        <div className="admin-metric-card">
          <div className="admin-metric-top">
            <span className="admin-metric-label">Today's Sign-ups</span>
            <span className="admin-metric-icon">😄</span>
          </div>
          <div className="admin-metric-value">{todaySignups}</div>
        </div>

        {/* Card 6: Active Chatbots (Superadmin has NO message limit) */}
        <div className="admin-metric-card">
          <div className="admin-metric-top">
            <span className="admin-metric-label">Active Chatbots</span>
            <span className="admin-metric-icon" style={{ color: "#2563eb" }}>
              <Bot size={20} />
            </span>
          </div>
          <div className="admin-metric-value">{s.chatbots}</div>
        </div>

        {/* Card 7: Team Members */}
        <div className="admin-metric-card">
          <div className="admin-metric-top">
            <span className="admin-metric-label">Team Members</span>
            <span className="admin-metric-icon" style={{ color: "#475569" }}>
              <UsersIcon size={20} />
            </span>
          </div>
          <div className="admin-metric-value">{userList.length}</div>
        </div>

        {/* Card 8: Active Workspaces */}
        <div className="admin-metric-card">
          <div className="admin-metric-top">
            <span className="admin-metric-label">Active Workspaces</span>
            <span className="admin-metric-icon" style={{ color: "#0891b2" }}>
              <Layers size={20} />
            </span>
          </div>
          <div className="admin-metric-value">{s.workspaces}</div>
        </div>
      </div>

      {/* Recent Sign Ups Section */}
      <div className="admin-recent-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 className="admin-recent-heading" style={{ margin: 0 }}>Recent Sign Ups</h2>
          <button
            type="button"
            className="sub-primary-btn"
            onClick={() => setShowCreateOrg(true)}
          >
            <Plus size={16} /> Create Organisation
          </button>
        </div>
        <div className="admin-recent-table-card">
          <table className="admin-recent-table">
            <thead>
              <tr>
                <th>Sr. No.</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Active Plan</th>
                <th>Location</th>
                <th>Last Login</th>
                <th>Joined On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgList.map((org, index) => {
                const owner = userMap.get(org.name);
                const email = owner?.email ?? "connect@ambot365.in";
                const lastLoginStr = owner?.created_at ?? org.created_at;

                return (
                  <tr key={org.id}>
                    <td className="admin-sr-no">{index + 1}.</td>
                    <td>
                      <button
                        type="button"
                        className="admin-customer-btn"
                        onClick={() => setEditOrg(org)}
                        title="Click to view details and edit plan"
                      >
                        {org.name}
                      </button>
                    </td>
                    <td>{email}</td>
                    <td>NA</td>
                    <td>
                      <button
                        type="button"
                        className="admin-info-circle-btn"
                        title={`Plan: ${org.subscription.plan.toUpperCase()} (${org.subscription.effective_status}) — Click to configure`}
                        onClick={() => setEditOrg(org)}
                      >
                        i
                      </button>
                    </td>
                    <td>-</td>
                    <td>{formatAdminDate(lastLoginStr)}</td>
                    <td>{formatAdminDate(org.created_at)}</td>
                    <td>
                      <div className="admin-actions-cell">
                        <button
                          type="button"
                          className="admin-row-action-btn is-manage"
                          title="Manage Customer Plan"
                          onClick={() => setEditOrg(org)}
                        >
                          <UserCheck size={16} />
                        </button>
                        <button
                          type="button"
                          className="admin-row-action-btn is-delete"
                          title={org.subscription.effective_status === "active" ? "Suspend Customer" : "Reactivate Customer"}
                          onClick={() => handleToggleSuspend(org)}
                        >
                          <Power size={16} />
                        </button>
                        <button
                          type="button"
                          className="admin-row-action-btn is-delete"
                          title="Delete Organisation (Superadmin Only)"
                          onClick={() => handleDelete(org)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {orgList.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                    No customer sign-ups recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        type="button"
        className="admin-floating-badge"
        title="Superadmin Multi-Tenant Controller"
        onClick={() => toast.success("Superadmin console active. Multi-tenancy enabled across all workspaces.")}
      >
        <Bot size={24} />
      </button>

      {/* Create Organization Modal */}
      {showCreateOrg && (
        <CreateOrganizationDialog
          onClose={() => setShowCreateOrg(false)}
          onCreated={() => {
            void client.invalidateQueries({ queryKey: ["admin"] });
          }}
        />
      )}

      {/* Edit Organization Modal */}
      {editOrg && (
        <OrganizationEditDialog
          org={editOrg}
          onClose={() => setEditOrg(null)}
          onSave={async (patch) => {
            await update.mutateAsync({ id: editOrg.id, patch });
          }}
          pending={update.isPending}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   Subscription Management (Matching User Screenshots 1 & 2)
   ========================================================================== */

interface PlanItem {
  id: string;
  name: string;
  displayName: string;
  isDefault: boolean;
  status: boolean;
  visibility: boolean;
  price: string;
  period: string;
  features: string[];
  restrictions: { bots: number; messages: number; seats: number };
}

const INITIAL_PLANS: PlanItem[] = [
  {
    id: "p1",
    name: "Ambot365 Demo",
    displayName: "A365 Demo",
    isDefault: false,
    status: true,
    visibility: true,
    price: "$0",
    period: "Trial",
    features: ["Website Widget", "Basic Bot", "Analytics"],
    restrictions: { bots: 1, messages: 500, seats: 2 },
  },
  {
    id: "p2",
    name: "INR",
    displayName: "INR Plan",
    isDefault: true,
    status: true,
    visibility: true,
    price: "₹2,499",
    period: "Monthly",
    features: ["Website Widget", "WhatsApp Cloud API", "Analytics", "Live Handover"],
    restrictions: { bots: 5, messages: 15000, seats: 10 },
  },
  {
    id: "p3",
    name: "Standard Web",
    displayName: "Standard Web",
    isDefault: false,
    status: true,
    visibility: true,
    price: "$29",
    period: "Monthly",
    features: ["Website Widget", "Slack Integration", "Custom Branding"],
    restrictions: { bots: 3, messages: 5000, seats: 5 },
  },
  {
    id: "p4",
    name: "Pro",
    displayName: "Professional Tier",
    isDefault: false,
    status: true,
    visibility: true,
    price: "$49",
    period: "Monthly",
    features: ["All Integrations", "Unlimited Bots", "Full API Access", "Priority SLA"],
    restrictions: { bots: 25, messages: 50000, seats: 25 },
  },
  {
    id: "p5",
    name: "Enterprise",
    displayName: "Enterprise Custom",
    isDefault: false,
    status: true,
    visibility: true,
    price: "Custom",
    period: "Annual",
    features: ["Dedicated Infrastructure", "Custom LLM Fine-Tuning", "White-label"],
    restrictions: { bots: 100, messages: 500000, seats: 100 },
  },
];

function Subscriptions() {
  const toast = useToast();
  const client = useQueryClient();
  const [subTab, setSubTab] = useState<"plan" | "addons" | "invoices" | "configuration">("plan");
  const [planView, setPlanView] = useState<"list" | "create">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [plans, setPlans] = useState<PlanItem[]>(INITIAL_PLANS);
  const [assignPlanModal, setAssignPlanModal] = useState<PlanItem | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const orgs = useQuery({ queryKey: ["admin", "organizations"], queryFn: adminApi.organizations });

  // Accordion state for Create Plan wizard (Screenshot 2)
  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>({
    1: true,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
  });

  // Create Plan Form state
  const [newPlanName, setNewPlanName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newPrice, setNewPrice] = useState("$39");
  const [newPeriod, setNewPeriod] = useState("Monthly");
  const [newTrialDays, setNewTrialDays] = useState("14");
  const [newBotLimit, setNewBotLimit] = useState("5");
  const [newMessageLimit, setNewMessageLimit] = useState("10000");
  const [newSeatLimit, setNewSeatLimit] = useState("10");

  const toggleAccordion = (index: number) => {
    setOpenAccordions((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleToggleDefault = (id: string) => {
    setPlans((prev) =>
      prev.map((p) => ({
        ...p,
        isDefault: p.id === id,
      }))
    );
    toast.success("Default plan updated");
  };

  const handleToggleStatus = (id: string) => {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: !p.status } : p))
    );
  };

  const handleAssignPlan = async () => {
    if (!assignPlanModal || !selectedOrgId) return;
    const mappedPlan: Plan =
      assignPlanModal.name.toLowerCase().includes("pro")
        ? "pro"
        : assignPlanModal.name.toLowerCase().includes("enter")
        ? "enterprise"
        : "free";

    try {
      await adminApi.updateSubscription(selectedOrgId, { plan: mappedPlan });
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast.success(`Assigned "${assignPlanModal.displayName}" to organisation.`);
      setAssignPlanModal(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to assign plan");
    }
  };

  const handleSaveNewPlan = () => {
    if (!newPlanName.trim()) {
      toast.error("Please enter a Plan Name in Step 1 (Plan Basics)");
      setOpenAccordions((prev) => ({ ...prev, 1: true }));
      return;
    }

    const created: PlanItem = {
      id: "p_" + Date.now(),
      name: newPlanName.trim(),
      displayName: newDisplayName.trim() || newPlanName.trim(),
      isDefault: false,
      status: true,
      visibility: true,
      price: newPrice,
      period: newPeriod,
      features: ["Website Widget", "WhatsApp Cloud API", "Analytics"],
      restrictions: {
        bots: Number(newBotLimit) || 3,
        messages: Number(newMessageLimit) || 5000,
        seats: Number(newSeatLimit) || 5,
      },
    };

    setPlans((prev) => [...prev, created]);
    toast.success(`Plan "${created.displayName}" created and published!`);
    setPlanView("list");
  };

  const filteredPlans = plans.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="sub-mgmt-container">
      {/* Header Box with Sub-navigation tabs (Screenshot 1) */}
      <div className="sub-mgmt-header-box">
        <h1 className="sub-mgmt-main-title">Subscription Management</h1>
        <div className="sub-mgmt-nav-tabs">
          <button
            type="button"
            className={`sub-mgmt-tab-btn ${subTab === "plan" ? "is-active" : ""}`}
            onClick={() => { setSubTab("plan"); setPlanView("list"); }}
          >
            Plan
          </button>
          <button
            type="button"
            className={`sub-mgmt-tab-btn ${subTab === "addons" ? "is-active" : ""}`}
            onClick={() => setSubTab("addons")}
          >
            Add-ons
          </button>
          <button
            type="button"
            className={`sub-mgmt-tab-btn ${subTab === "invoices" ? "is-active" : ""}`}
            onClick={() => setSubTab("invoices")}
          >
            Invoices
          </button>
          <button
            type="button"
            className={`sub-mgmt-tab-btn ${subTab === "configuration" ? "is-active" : ""}`}
            onClick={() => setSubTab("configuration")}
          >
            Configuration
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="sub-mgmt-content">
        {subTab === "plan" && planView === "list" && (
          <div>
            <div className="sub-manage-plans-header">
              <h2 className="sub-section-title">Manage Plans</h2>
            </div>
            <div className="sub-manage-toolbar">
              <div className="sub-search-box">
                <Search size={16} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search Here"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="sub-primary-btn"
                onClick={() => setPlanView("create")}
              >
                Create Plan
              </button>
            </div>

            <div className="sub-plan-table-wrapper">
              <table className="sub-plan-table">
                <thead>
                  <tr>
                    <th>Plan Name</th>
                    <th>Display Name</th>
                    <th>Make Default</th>
                    <th>Status</th>
                    <th>Visibility</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <span
                          className="plan-name-link"
                          onClick={() => {
                            setNewPlanName(plan.name);
                            setNewDisplayName(plan.displayName);
                            setPlanView("create");
                          }}
                        >
                          {plan.name}
                        </span>
                      </td>
                      <td>{plan.displayName}</td>
                      <td>
                        <label className="sub-switch-toggle" title="Toggle default plan">
                          <input
                            type="checkbox"
                            checked={plan.isDefault}
                            onChange={() => handleToggleDefault(plan.id)}
                          />
                          <span className="sub-switch-slider"></span>
                        </label>
                      </td>
                      <td>
                        <label className="sub-switch-toggle" title="Toggle active status">
                          <input
                            type="checkbox"
                            checked={plan.status}
                            onChange={() => handleToggleStatus(plan.id)}
                          />
                          <span className="sub-switch-slider"></span>
                        </label>
                      </td>
                      <td>
                        <span
                          className="plan-visibility-icon"
                          title="Visible in customer catalog"
                        >
                          <Eye size={16} />
                        </span>
                      </td>
                      <td>
                        <div className="plan-actions-group">
                          <button
                            type="button"
                            className="plan-action-icon-btn"
                            title="Assign this plan to a tenant organisation"
                            onClick={() => {
                              setAssignPlanModal(plan);
                              if (orgs.data && orgs.data[0]) {
                                setSelectedOrgId(orgs.data[0].id);
                              }
                            }}
                          >
                            <UserPlus size={16} />
                          </button>
                          <button
                            type="button"
                            className="plan-action-icon-btn"
                            title="More options"
                            onClick={() => {
                              setNewPlanName(plan.name);
                              setNewDisplayName(plan.displayName);
                              setPlanView("create");
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPlans.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                        No plans match your search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create Plan Wizard View (Matching Screenshot 2) */}
        {subTab === "plan" && planView === "create" && (
          <div className="create-plan-container">
            <div className="create-plan-top-header">
              <button
                type="button"
                className="create-plan-back-btn"
                title="Back to Manage Plans"
                onClick={() => setPlanView("list")}
              >
                <ArrowLeft size={18} />
              </button>
              <h2 className="create-plan-main-title">Create Plan</h2>
            </div>

            <div className="create-plan-accordions">
              {/* Accordion 1: Plan Basics */}
              <div className={`plan-accordion-card ${openAccordions[1] ? "is-open" : ""}`}>
                <div className="plan-accordion-header" onClick={() => toggleAccordion(1)}>
                  <div className="plan-accordion-left">
                    <span className="plan-accordion-num">1</span>
                    <div className="plan-accordion-title-wrap">
                      <h3 className="plan-accordion-title">Plan Basics</h3>
                      <p className="plan-accordion-desc">
                        Tailor your Chatbot Pricing Plan's name, activation periods, trial, payment subscription periods, pricing, & taxation.
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`plan-accordion-chevron ${openAccordions[1] ? "is-expanded" : ""}`}
                  />
                </div>
                {openAccordions[1] && (
                  <div className="plan-accordion-body">
                    <div className="plan-form-grid-2">
                      <div className="plan-form-field">
                        <label>Plan Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Standard Web"
                          value={newPlanName}
                          onChange={(e) => setNewPlanName(e.target.value)}
                        />
                      </div>
                      <div className="plan-form-field">
                        <label>Display Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. Standard Web Plan"
                          value={newDisplayName}
                          onChange={(e) => setNewDisplayName(e.target.value)}
                        />
                      </div>
                      <div className="plan-form-field">
                        <label>Pricing ($ or ₹)</label>
                        <input
                          type="text"
                          placeholder="e.g. $49"
                          value={newPrice}
                          onChange={(e) => setNewPrice(e.target.value)}
                        />
                      </div>
                      <div className="plan-form-field">
                        <label>Billing Period</label>
                        <select
                          value={newPeriod}
                          onChange={(e) => setNewPeriod(e.target.value)}
                        >
                          <option value="Monthly">Monthly</option>
                          <option value="Yearly">Yearly (Save 20%)</option>
                          <option value="Lifetime">Lifetime Access</option>
                        </select>
                      </div>
                      <div className="plan-form-field">
                        <label>Free Trial Days</label>
                        <input
                          type="number"
                          min={0}
                          value={newTrialDays}
                          onChange={(e) => setNewTrialDays(e.target.value)}
                        />
                      </div>
                      <div className="plan-form-field">
                        <label>Taxation Rate (%)</label>
                        <input type="number" min={0} defaultValue={18} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 2: Features */}
              <div className={`plan-accordion-card ${openAccordions[2] ? "is-open" : ""}`}>
                <div className="plan-accordion-header" onClick={() => toggleAccordion(2)}>
                  <div className="plan-accordion-left">
                    <span className="plan-accordion-num">2</span>
                    <div className="plan-accordion-title-wrap">
                      <h3 className="plan-accordion-title">Features</h3>
                      <p className="plan-accordion-desc">
                        Tailor available platforms and features seamlessly for users.
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`plan-accordion-chevron ${openAccordions[2] ? "is-expanded" : ""}`}
                  />
                </div>
                {openAccordions[2] && (
                  <div className="plan-accordion-body">
                    <div className="plan-checks-grid">
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Website Chat Widget Embed</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>White-label / Remove Branding</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Live Chat Agent Handover</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Advanced Analytics Dashboard</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Custom Domain & CNAME</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Dedicated REST API & Webhooks</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 3: Integrations */}
              <div className={`plan-accordion-card ${openAccordions[3] ? "is-open" : ""}`}>
                <div className="plan-accordion-header" onClick={() => toggleAccordion(3)}>
                  <div className="plan-accordion-left">
                    <span className="plan-accordion-num">3</span>
                    <div className="plan-accordion-title-wrap">
                      <h3 className="plan-accordion-title">Integrations</h3>
                      <p className="plan-accordion-desc">
                        Select the integrations you want to offer your users.
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`plan-accordion-chevron ${openAccordions[3] ? "is-expanded" : ""}`}
                  />
                </div>
                {openAccordions[3] && (
                  <div className="plan-accordion-body">
                    <div className="plan-checks-grid">
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Website JavaScript Snippet</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>WhatsApp Business Cloud API</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Slack Workspace App</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Telegram Bot API</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Facebook Messenger</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Zapier / Make Automation</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 4: Feature Restrictions */}
              <div className={`plan-accordion-card ${openAccordions[4] ? "is-open" : ""}`}>
                <div className="plan-accordion-header" onClick={() => toggleAccordion(4)}>
                  <div className="plan-accordion-left">
                    <span className="plan-accordion-num">4</span>
                    <div className="plan-accordion-title-wrap">
                      <h3 className="plan-accordion-title">Feature Restrictions</h3>
                      <p className="plan-accordion-desc">
                        Set limits on the number of messages for Website & WhatsApp, platform bots, contacts, integrations, & data storage periods.
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`plan-accordion-chevron ${openAccordions[4] ? "is-expanded" : ""}`}
                  />
                </div>
                {openAccordions[4] && (
                  <div className="plan-accordion-body">
                    <div className="plan-form-grid-3">
                      <div className="plan-form-field">
                        <label>Max Chatbots per Workspace</label>
                        <input
                          type="number"
                          value={newBotLimit}
                          onChange={(e) => setNewBotLimit(e.target.value)}
                        />
                      </div>
                      <div className="plan-form-field">
                        <label>Monthly Message Quota</label>
                        <input
                          type="number"
                          value={newMessageLimit}
                          onChange={(e) => setNewMessageLimit(e.target.value)}
                        />
                      </div>
                      <div className="plan-form-field">
                        <label>Team Member Seats</label>
                        <input
                          type="number"
                          value={newSeatLimit}
                          onChange={(e) => setNewSeatLimit(e.target.value)}
                        />
                      </div>
                      <div className="plan-form-field">
                        <label>Knowledge Base Docs Limit</label>
                        <input type="number" defaultValue={25} />
                      </div>
                      <div className="plan-form-field">
                        <label>Data Retention Period</label>
                        <select defaultValue="365">
                          <option value="30">30 Days</option>
                          <option value="90">90 Days</option>
                          <option value="365">1 Year</option>
                          <option value="unlimited">Unlimited (Forever)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 5: Associated Add-ons */}
              <div className={`plan-accordion-card ${openAccordions[5] ? "is-open" : ""}`}>
                <div className="plan-accordion-header" onClick={() => toggleAccordion(5)}>
                  <div className="plan-accordion-left">
                    <span className="plan-accordion-num">5</span>
                    <div className="plan-accordion-title-wrap">
                      <h3 className="plan-accordion-title">Associated Add-ons</h3>
                      <p className="plan-accordion-desc">
                        Add-ons enabled in this section will be displayed to customers as add-ons available with this plan.
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`plan-accordion-chevron ${openAccordions[5] ? "is-expanded" : ""}`}
                  />
                </div>
                {openAccordions[5] && (
                  <div className="plan-accordion-body">
                    <div className="plan-checks-grid">
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Extra 5,000 Messages Pack (+$20/mo)</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Dedicated SLA & 24/7 Priority Support (+$99/mo)</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" defaultChecked />
                        <span>Custom LLM Fine-tuning & Training (+$199/mo)</span>
                      </label>
                      <label className="plan-check-item">
                        <input type="checkbox" />
                        <span>WhatsApp Dedicated Number Setup (+$49 once)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion 6: Review Plan */}
              <div className={`plan-accordion-card ${openAccordions[6] ? "is-open" : ""}`}>
                <div className="plan-accordion-header" onClick={() => toggleAccordion(6)}>
                  <div className="plan-accordion-left">
                    <span className="plan-accordion-num">6</span>
                    <div className="plan-accordion-title-wrap">
                      <h3 className="plan-accordion-title">Review Plan</h3>
                      <p className="plan-accordion-desc">
                        Double-check all the details you've added to your plans before finalizing.
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={18}
                    className={`plan-accordion-chevron ${openAccordions[6] ? "is-expanded" : ""}`}
                  />
                </div>
                {openAccordions[6] && (
                  <div className="plan-accordion-body">
                    <div className="plan-review-summary-card">
                      <div className="plan-review-row">
                        <span className="plan-review-label">Plan Name:</span>
                        <span className="plan-review-val">{newPlanName || "Not set yet"}</span>
                      </div>
                      <div className="plan-review-row">
                        <span className="plan-review-label">Display Name:</span>
                        <span className="plan-review-val">{newDisplayName || newPlanName || "Not set yet"}</span>
                      </div>
                      <div className="plan-review-row">
                        <span className="plan-review-label">Pricing:</span>
                        <span className="plan-review-val">{newPrice} / {newPeriod}</span>
                      </div>
                      <div className="plan-review-row">
                        <span className="plan-review-label">Trial:</span>
                        <span className="plan-review-val">{newTrialDays} Days</span>
                      </div>
                      <div className="plan-review-row">
                        <span className="plan-review-label">Limits:</span>
                        <span className="plan-review-val">{newBotLimit} Bots · {newMessageLimit} Messages · {newSeatLimit} Seats</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
                      <button
                        type="button"
                        className="sub-mgmt-tab-btn"
                        onClick={() => setPlanView("list")}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="sub-primary-btn"
                        onClick={handleSaveNewPlan}
                      >
                        <Sparkles size={16} /> Save & Publish Plan
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SubTab: Add-ons */}
        {subTab === "addons" && (
          <div>
            <h2 className="sub-section-title" style={{ marginBottom: 16 }}>Available Add-ons Catalog</h2>
            <div className="plan-checks-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              <div className="plan-review-summary-card">
                <strong>Extra 5,000 Messages</strong>
                <span style={{ fontSize: 13, color: "#64748b" }}>Monthly quota top-up for high volume chatbots</span>
                <span style={{ fontWeight: 700, color: "#2563eb", marginTop: 8 }}>$20.00 / month</span>
                <Badge tone="brand">Active in Catalog</Badge>
              </div>
              <div className="plan-review-summary-card">
                <strong>WhatsApp Cloud API Setup</strong>
                <span style={{ fontSize: 13, color: "#64748b" }}>Dedicated Meta Verified number configuration</span>
                <span style={{ fontWeight: 700, color: "#2563eb", marginTop: 8 }}>$49.00 one-time</span>
                <Badge tone="brand">Active in Catalog</Badge>
              </div>
              <div className="plan-review-summary-card">
                <strong>24/7 Priority SLA Support</strong>
                <span style={{ fontSize: 13, color: "#64748b" }}>Guaranteed 1-hour ticket response time</span>
                <span style={{ fontWeight: 700, color: "#2563eb", marginTop: 8 }}>$99.00 / month</span>
                <Badge tone="brand">Active in Catalog</Badge>
              </div>
              <div className="plan-review-summary-card">
                <strong>Custom AI Fine-Tuning</strong>
                <span style={{ fontSize: 13, color: "#64748b" }}>Bespoke dataset embedding and model weights</span>
                <span style={{ fontWeight: 700, color: "#2563eb", marginTop: 8 }}>$199.00 / month</span>
                <Badge tone="brand">Active in Catalog</Badge>
              </div>
            </div>
          </div>
        )}

        {/* SubTab: Invoices */}
        {subTab === "invoices" && (
          <div>
            <h2 className="sub-section-title" style={{ marginBottom: 16 }}>Tenant Organization Invoices</h2>
            <div className="sub-plan-table-wrapper">
              <table className="sub-plan-table">
                <thead>
                  <tr>
                    <th>Invoice ID</th>
                    <th>Organisation</th>
                    <th>Plan</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(orgs.data ?? []).map((o, idx) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600, color: "#2563eb" }}>INV-2026-00{idx + 1}</td>
                      <td>{o.name}</td>
                      <td><Badge tone="neutral">{o.subscription.plan.toUpperCase()}</Badge></td>
                      <td>{o.subscription.plan === "free" ? "$0.00" : o.subscription.plan === "pro" ? "$49.00" : "$299.00"}</td>
                      <td>{new Date(o.created_at).toLocaleDateString()}</td>
                      <td><Badge tone="brand">PAID</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SubTab: Configuration */}
        {subTab === "configuration" && (
          <div>
            <h2 className="sub-section-title" style={{ marginBottom: 16 }}>Billing & Gateway Configuration</h2>
            <div className="plan-form-grid-2" style={{ maxWidth: 650 }}>
              <div className="plan-form-field">
                <label>Default Currency</label>
                <select defaultValue="USD">
                  <option value="USD">USD ($ - United States Dollar)</option>
                  <option value="INR">INR (₹ - Indian Rupee)</option>
                  <option value="EUR">EUR (€ - Euro)</option>
                  <option value="GBP">GBP (£ - British Pound)</option>
                </select>
              </div>
              <div className="plan-form-field">
                <label>Stripe Publishable Key</label>
                <input type="text" placeholder="pk_live_..." defaultValue="pk_live_demo_stripe" />
              </div>
              <div className="plan-form-field">
                <label>Stripe Secret Key</label>
                <input type="password" placeholder="sk_live_..." defaultValue="••••••••••••••••" />
              </div>
              <div className="plan-form-field">
                <label>Razorpay Key ID</label>
                <input type="text" placeholder="rzp_live_..." defaultValue="rzp_live_demo_rzp" />
              </div>
              <div className="plan-form-field">
                <label>Default Tax Rate (%)</label>
                <input type="number" defaultValue={18} />
              </div>
              <div className="plan-form-field">
                <label>Invoice Prefix</label>
                <input type="text" defaultValue="INV-2026-" />
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <button
                type="button"
                className="sub-primary-btn"
                onClick={() => toast.success("Billing configuration saved.")}
              >
                Save Configuration
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assign Plan to Organization Modal */}
      {assignPlanModal && (
        <Dialog
          open={true}
          onClose={() => setAssignPlanModal(null)}
          title={`Assign Plan: ${assignPlanModal.displayName}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p className="dialog-subtitle" style={{ margin: 0 }}>
              Select a customer organisation to assign the <strong>{assignPlanModal.displayName}</strong> plan to.
            </p>
            <div className="admin-modal-field">
              <label>Target Organisation</label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
              >
                {(orgs.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} (Current: {o.subscription.plan.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Button type="button" variant="ghost" onClick={() => setAssignPlanModal(null)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleAssignPlan}>
                Assign Plan
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/* ==========================================================================
   Organizations Tab
   ========================================================================== */
const EFFECTIVE_TONE: Record<EffectiveStatus, BadgeTone> = { active: "brand", suspended: "warning", expired: "danger" };

function formatLimit(used: number, limit: number | null) {
  return `${used} / ${limit ?? "∞"}`;
}

function Organizations() {
  const toast = useToast();
  const client = useQueryClient();
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [editOrg, setEditOrg] = useState<AdminOrganization | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | "free" | "pro" | "enterprise">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");

  const orgs = useQuery({ queryKey: ["admin", "organizations"], queryFn: adminApi.organizations, refetchInterval: 10_000 });

  const update = useMutation({
    mutationFn: (input: { id: string; patch: SubscriptionPatch }) => adminApi.updateSubscription(input.id, input.patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Subscription updated successfully");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update subscription"),
  });

  const deleteOrg = useMutation({
    mutationFn: (id: string) => adminApi.deleteOrganization(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Organisation deleted successfully");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete organisation"),
  });

  if (!orgs.data) return <LoadingState label="Loading organisations" />;

  const allOrgs = orgs.data;
  const activeCount = allOrgs.filter((o) => o.subscription.effective_status === "active").length;
  const totalWorkspaces = allOrgs.reduce((acc, o) => acc + (o.workspace_count || 1), 0);
  const totalBotsUsed = allOrgs.reduce((acc, o) => acc + (o.subscription.chatbots_used || 0), 0);

  const freeCount = allOrgs.filter((o) => o.subscription.plan === "free").length;
  const proCount = allOrgs.filter((o) => o.subscription.plan === "pro").length;
  const entCount = allOrgs.filter((o) => o.subscription.plan === "enterprise").length;

  const filteredOrgs = allOrgs.filter((o) => {
    const matchesSearch = o.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (planFilter !== "all" && o.subscription.plan !== planFilter) return false;

    if (statusFilter === "active" && o.subscription.effective_status !== "active") return false;
    if (statusFilter === "suspended" && o.subscription.effective_status === "active") return false;

    return true;
  });

  const handleDelete = (org: AdminOrganization) => {
    if (window.confirm(`Are you sure you want to delete organisation "${org.name}"? This is restricted to Superadmins and will remove all tenant workspaces.`)) {
      deleteOrg.mutate(org.id);
    }
  };

  const handleToggleSuspend = (org: AdminOrganization) => {
    const isCurrentlyActive = org.subscription.effective_status === "active";
    const confirmMessage = isCurrentlyActive
      ? `Suspend organisation "${org.name}"? Active chatbots will stop replying.`
      : `Reactivate organisation "${org.name}"?`;
    if (window.confirm(confirmMessage)) {
      update.mutate({
        id: org.id,
        patch: { status: isCurrentlyActive ? "suspended" : "active" },
      });
    }
  };

  return (
    <div className="admin-orgs-container">
      {/* Executive Metric Cards */}
      <div className="admin-users-stats-grid">
        <div className="admin-user-stat-card">
          <div className="admin-user-stat-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <Building2 size={22} />
          </div>
          <div className="admin-user-stat-info">
            <span className="admin-user-stat-val">{allOrgs.length}</span>
            <span className="admin-user-stat-label">Total Organisations</span>
          </div>
        </div>

        <div className="admin-user-stat-card">
          <div className="admin-user-stat-icon" style={{ background: "#dcfce7", color: "#16a34a" }}>
            <CheckCircle2 size={22} />
          </div>
          <div className="admin-user-stat-info">
            <span className="admin-user-stat-val">{activeCount}</span>
            <span className="admin-user-stat-label">Active Subscriptions</span>
          </div>
        </div>

        <div className="admin-user-stat-card">
          <div className="admin-user-stat-icon" style={{ background: "#ede9fe", color: "#7c3aed" }}>
            <Layers size={22} />
          </div>
          <div className="admin-user-stat-info">
            <span className="admin-user-stat-val">{totalWorkspaces}</span>
            <span className="admin-user-stat-label">Workspaces</span>
          </div>
        </div>

        <div className="admin-user-stat-card">
          <div className="admin-user-stat-icon" style={{ background: "#e0f2fe", color: "#0284c7" }}>
            <Bot size={22} />
          </div>
          <div className="admin-user-stat-info">
            <span className="admin-user-stat-val">{totalBotsUsed}</span>
            <span className="admin-user-stat-label">Deployed Chatbots</span>
          </div>
        </div>
      </div>

      {/* Main Organisations Table Card */}
      <div className="admin-users-card">
        {/* Search, Filter & Action Toolbar */}
        <div className="admin-users-toolbar">
          <div className="admin-users-search-group">
            <div className="admin-users-search-box">
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search organisation by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="admin-users-org-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "suspended")}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div className="admin-users-filter-pills">
              <button
                type="button"
                className={`admin-user-pill-btn ${planFilter === "all" ? "is-active" : ""}`}
                onClick={() => setPlanFilter("all")}
              >
                All ({allOrgs.length})
              </button>
              <button
                type="button"
                className={`admin-user-pill-btn ${planFilter === "free" ? "is-active" : ""}`}
                onClick={() => setPlanFilter("free")}
              >
                Free ({freeCount})
              </button>
              <button
                type="button"
                className={`admin-user-pill-btn ${planFilter === "pro" ? "is-active" : ""}`}
                onClick={() => setPlanFilter("pro")}
              >
                Pro ({proCount})
              </button>
              <button
                type="button"
                className={`admin-user-pill-btn ${planFilter === "enterprise" ? "is-active" : ""}`}
                onClick={() => setPlanFilter("enterprise")}
              >
                Enterprise ({entCount})
              </button>
            </div>

            <button
              type="button"
              className="sub-primary-btn"
              onClick={() => setShowCreateOrg(true)}
            >
              <Plus size={15} /> Create Organisation
            </button>
          </div>
        </div>

        {/* Organisations Table */}
        <div className="sub-plan-table-wrapper">
          <table className="sub-plan-table">
            <thead>
              <tr>
                <th>Organisation</th>
                <th>Plan & Billing</th>
                <th>Status</th>
                <th>Monthly Capacity & Usage</th>
                <th>Effective Limits</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.map((org) => {
                const sub = org.subscription;
                const avatar = getAvatarStyle(org.id);
                const initials = getUserInitials(org.name);

                // Calculate progress percentages
                const seatsPct = sub.seat_limit ? Math.min(100, Math.round((sub.seats_used / sub.seat_limit) * 100)) : 10;
                const botsPct = sub.chatbot_limit ? Math.min(100, Math.round((sub.chatbots_used / sub.chatbot_limit) * 100)) : 10;
                const convosPct = sub.conversation_limit ? Math.min(100, Math.round((sub.conversations_used / sub.conversation_limit) * 100)) : 10;

                const hasOverrides =
                  sub.limits_overridden.seats ||
                  sub.limits_overridden.chatbots ||
                  sub.limits_overridden.conversations;

                return (
                  <tr key={org.id}>
                    <td>
                      <div className="admin-org-cell">
                        <span
                          className="admin-org-avatar"
                          style={{ background: avatar.bg, color: avatar.color }}
                        >
                          {initials}
                        </span>
                        <div className="admin-org-info-col">
                          <span
                            className="admin-org-name"
                            style={{ cursor: "pointer" }}
                            title="Click to configure organization settings"
                            onClick={() => setEditOrg(org)}
                          >
                            {org.name}
                          </span>
                          <span className="admin-org-meta">
                            {org.workspace_count} Workspace{org.workspace_count === 1 ? "" : "s"} · Created {formatAdminDate(org.created_at)}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div>
                        {sub.plan === "free" && <span className="admin-plan-badge-free">FREE TIER</span>}
                        {sub.plan === "pro" && <span className="admin-plan-badge-pro">PRO TIER</span>}
                        {sub.plan === "enterprise" && <span className="admin-plan-badge-enterprise">ENTERPRISE</span>}
                        <div className="admin-org-period-text">
                          {sub.ends_at ? `Expires: ${formatAdminDate(sub.ends_at)}` : "No expiry (Lifetime)"}
                        </div>
                      </div>
                    </td>

                    <td>
                      <Badge tone={sub.effective_status === "active" ? "brand" : "warning"}>
                        {sub.effective_status.toUpperCase()}
                      </Badge>
                    </td>

                    <td>
                      <div className="admin-org-usage-box">
                        {/* Seats progress */}
                        <div className="admin-usage-row">
                          <span className="admin-usage-label">Seats:</span>
                          <span className="admin-usage-val">{sub.seats_used} / {sub.seat_limit ?? "∞"}</span>
                        </div>
                        <div className="admin-usage-progress">
                          <div
                            className="admin-usage-progress-bar"
                            style={{
                              width: `${seatsPct}%`,
                              background: seatsPct >= 100 ? "#dc2626" : seatsPct >= 75 ? "#f59e0b" : "#2563eb",
                            }}
                          />
                        </div>

                        {/* Bots progress */}
                        <div className="admin-usage-row" style={{ marginTop: 2 }}>
                          <span className="admin-usage-label">Bots:</span>
                          <span className="admin-usage-val">{sub.chatbots_used} / {sub.chatbot_limit ?? "∞"}</span>
                        </div>
                        <div className="admin-usage-progress">
                          <div
                            className="admin-usage-progress-bar"
                            style={{
                              width: `${botsPct}%`,
                              background: botsPct >= 100 ? "#dc2626" : botsPct >= 75 ? "#f59e0b" : "#10b981",
                            }}
                          />
                        </div>

                        {/* Conversations progress */}
                        <div className="admin-usage-row" style={{ marginTop: 2 }}>
                          <span className="admin-usage-label">Chats:</span>
                          <span className="admin-usage-val">{sub.conversations_used} / {sub.conversation_limit ?? "∞"}</span>
                        </div>
                        <div className="admin-usage-progress">
                          <div
                            className="admin-usage-progress-bar"
                            style={{
                              width: `${convosPct}%`,
                              background: convosPct >= 100 ? "#dc2626" : convosPct >= 75 ? "#f59e0b" : "#8b5cf6",
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="admin-limits-summary-pill">
                        <span>{sub.seat_limit ?? "∞"} users · {sub.chatbot_limit ?? "∞"} bots</span>
                        <span>{sub.conversation_limit ? `${sub.conversation_limit.toLocaleString()} chats/mo` : "Unlimited chats"}</span>
                        {hasOverrides && (
                          <span className="admin-limits-override-tag">
                            ✨ Custom Overrides
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div className="admin-user-actions-row">
                        {/* Configure Plan & Limits Modal Button */}
                        <button
                          type="button"
                          className="admin-user-btn is-key"
                          title="Configure Customer Plan, Expiry & Limit Overrides"
                          onClick={() => setEditOrg(org)}
                        >
                          <SlidersHorizontal size={14} />
                        </button>

                        {/* Suspend / Reactivate Button */}
                        <button
                          type="button"
                          className="admin-user-btn is-power"
                          disabled={update.isPending}
                          title={sub.effective_status === "active" ? "Suspend Organisation" : "Reactivate Organisation"}
                          onClick={() => handleToggleSuspend(org)}
                        >
                          <Power size={14} />
                        </button>

                        {/* Delete Organisation Button */}
                        <button
                          type="button"
                          className="admin-user-btn is-danger"
                          disabled={deleteOrg.isPending}
                          title="Delete Organisation"
                          onClick={() => handleDelete(org)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredOrgs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "36px", color: "#64748b" }}>
                    No organisations match your search query or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Organization Modal */}
      {showCreateOrg && (
        <CreateOrganizationDialog
          onClose={() => setShowCreateOrg(false)}
          onCreated={() => {
            void client.invalidateQueries({ queryKey: ["admin"] });
          }}
        />
      )}

      {/* Edit Organization Modal */}
      {editOrg && (
        <OrganizationEditDialog
          org={editOrg}
          onClose={() => setEditOrg(null)}
          onSave={async (patch) => {
            await update.mutateAsync({ id: editOrg.id, patch });
          }}
          pending={update.isPending}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   Users Tab (Fine-Tuned Multi-Tenant User Management)
   ========================================================================== */

function UserPasswordResetDialog({
  user,
  onClose,
  onReset,
  pending,
}: {
  user: AdminUser;
  onClose: () => void;
  onReset: (password: string) => Promise<void>;
  pending: boolean;
}) {
  const [password, setPassword] = useState("");

  const generatePassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
    let gen = "";
    for (let i = 0; i < 14; i++) {
      gen += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(gen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return;
    await onReset(password);
    onClose();
  };

  return (
    <Dialog open={true} onClose={onClose} title={`Reset Password: ${user.full_name}`}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p className="dialog-subtitle" style={{ margin: 0 }}>
          Set a new temporary password for <strong>{user.email}</strong>. All active sessions and refresh tokens will be immediately revoked.
        </p>
        <div className="admin-modal-field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label>New Password (min 8 characters) *</label>
            <button
              type="button"
              onClick={generatePassword}
              style={{
                background: "none",
                border: "none",
                color: "#2563eb",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <RefreshCw size={12} /> Generate Secure
            </button>
          </div>
          <input
            type="text"
            required
            minLength={8}
            placeholder="Enter or generate new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={pending}
            disabled={password.length < 8 || pending}
            icon={<Key size={14} />}
          >
            Reset Password
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function UserDeleteDialog({
  user,
  onClose,
  onConfirm,
  pending,
}: {
  user: AdminUser;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  pending: boolean;
}) {
  return (
    <Dialog open={true} onClose={onClose} title="Delete User">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p className="dialog-subtitle" style={{ margin: 0 }}>
          Are you sure you want to permanently delete user <strong>{user.full_name}</strong> (<code>{user.email}</code>)?
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "#dc2626", background: "#fef2f2", padding: "10px 14px", borderRadius: 8 }}>
          ⚠️ This will soft-delete their account, detach all multi-tenant organization memberships, and revoke all active login sessions.
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={pending}
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
            icon={<Trash2 size={14} />}
          >
            Delete User
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name.slice(0, 2) || "U").toUpperCase();
}

const AVATAR_COLORS = [
  { bg: "#e0ecff", color: "#1d4ed8" },
  { bg: "#fef3c7", color: "#b45309" },
  { bg: "#ede9fe", color: "#6d28d9" },
  { bg: "#dcfce7", color: "#15803d" },
  { bg: "#fce7f3", color: "#be185d" },
];

function getAvatarStyle(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash + id.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash];
}

function Users({ myUserId }: { myUserId: string }) {
  const toast = useToast();
  const client = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "org_admin" | "member" | "superadmin">("all");
  const [resetTargetUser, setResetTargetUser] = useState<AdminUser | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<AdminUser | null>(null);

  const users = useQuery({ queryKey: ["admin", "users"], queryFn: adminApi.users, refetchInterval: 10_000 });

  const update = useMutation({
    mutationFn: (input: { id: string; flags: { is_active?: boolean; is_superadmin?: boolean } }) =>
      adminApi.updateUser(input.id, input.flags),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast.success("User updated successfully");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update user"),
  });

  const resetPassword = useMutation({
    mutationFn: (input: { id: string; password: string }) =>
      adminApi.resetPassword(input.id, input.password),
    onSuccess: () => {
      toast.success("Password reset successfully. The user can now log in with the new password.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to reset password"),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
      toast.success("User deleted successfully");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete user"),
  });

  if (!users.data) return <LoadingState label="Loading users" />;

  const allUsers = users.data;
  const activeCount = allUsers.filter((u) => u.is_active).length;
  const orgAdminCount = allUsers.filter((u) => u.is_org_admin).length;
  const superAdminCount = allUsers.filter((u) => u.is_superadmin).length;

  // Extract all unique organization names
  const allOrganizations = Array.from(
    new Set(allUsers.flatMap((u) => u.organizations))
  ).filter(Boolean);

  // Filter users
  const filteredUsers = allUsers.filter((u) => {
    // Search filter
    const matchesSearch =
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // Org filter
    if (selectedOrg !== "all") {
      if (!u.organizations.includes(selectedOrg)) return false;
    }

    // Role filter
    if (roleFilter === "superadmin" && !u.is_superadmin) return false;
    if (roleFilter === "org_admin" && !u.is_org_admin) return false;
    if (roleFilter === "member" && (u.is_superadmin || u.is_org_admin)) return false;

    return true;
  });

  return (
    <div className="admin-users-container">
      {/* Top Metric Cards */}
      <div className="admin-users-stats-grid">
        <div className="admin-user-stat-card">
          <div className="admin-user-stat-icon" style={{ background: "#eff6ff", color: "#2563eb" }}>
            <UsersIcon size={22} />
          </div>
          <div className="admin-user-stat-info">
            <span className="admin-user-stat-val">{allUsers.length}</span>
            <span className="admin-user-stat-label">Total Users</span>
          </div>
        </div>

        <div className="admin-user-stat-card">
          <div className="admin-user-stat-icon" style={{ background: "#dcfce7", color: "#16a34a" }}>
            <UserCheck size={22} />
          </div>
          <div className="admin-user-stat-info">
            <span className="admin-user-stat-val">{activeCount}</span>
            <span className="admin-user-stat-label">Active Users</span>
          </div>
        </div>

        <div className="admin-user-stat-card">
          <div className="admin-user-stat-icon" style={{ background: "#ede9fe", color: "#7c3aed" }}>
            <ShieldCheck size={22} />
          </div>
          <div className="admin-user-stat-info">
            <span className="admin-user-stat-val">{orgAdminCount}</span>
            <span className="admin-user-stat-label">Org Admins</span>
          </div>
        </div>

        <div className="admin-user-stat-card">
          <div className="admin-user-stat-icon" style={{ background: "#fef3c7", color: "#d97706" }}>
            <ShieldAlert size={22} />
          </div>
          <div className="admin-user-stat-info">
            <span className="admin-user-stat-val">{superAdminCount}</span>
            <span className="admin-user-stat-label">Superadmins</span>
          </div>
        </div>
      </div>

      {/* Main Users Table Card */}
      <div className="admin-users-card">
        {/* Toolbar: Search, Org Filter & Role Filter Pills */}
        <div className="admin-users-toolbar">
          <div className="admin-users-search-group">
            <div className="admin-users-search-box">
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="admin-users-org-select"
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
            >
              <option value="all">All Organisations ({allUsers.length})</option>
              {allOrganizations.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-users-filter-pills">
            <button
              type="button"
              className={`admin-user-pill-btn ${roleFilter === "all" ? "is-active" : ""}`}
              onClick={() => setRoleFilter("all")}
            >
              All ({allUsers.length})
            </button>
            <button
              type="button"
              className={`admin-user-pill-btn ${roleFilter === "org_admin" ? "is-active" : ""}`}
              onClick={() => setRoleFilter("org_admin")}
            >
              Org Admins ({orgAdminCount})
            </button>
            <button
              type="button"
              className={`admin-user-pill-btn ${roleFilter === "member" ? "is-active" : ""}`}
              onClick={() => setRoleFilter("member")}
            >
              Members ({allUsers.length - superAdminCount - orgAdminCount})
            </button>
            <button
              type="button"
              className={`admin-user-pill-btn ${roleFilter === "superadmin" ? "is-active" : ""}`}
              onClick={() => setRoleFilter("superadmin")}
            >
              Superadmins ({superAdminCount})
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="sub-plan-table-wrapper">
          <table className="sub-plan-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Organisation</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined On</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isMe = user.id === myUserId;
                const avatar = getAvatarStyle(user.id);
                const initials = getUserInitials(user.full_name);

                return (
                  <tr key={user.id}>
                    <td>
                      <div className="admin-user-cell">
                        <span
                          className="admin-user-avatar"
                          style={{ background: avatar.bg, color: avatar.color }}
                        >
                          {initials}
                        </span>
                        <div className="admin-user-info-col">
                          <span className="admin-user-name">
                            {user.full_name} {isMe && <Badge tone="brand">you</Badge>}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: "#475569", fontSize: 13 }}>{user.email}</span>
                    </td>
                    <td>
                      {user.organizations.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {user.organizations.map((org) => (
                            <Badge key={org} tone="neutral">
                              {org}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>Platform (Global)</span>
                      )}
                    </td>
                    <td>
                      {user.is_superadmin ? (
                        <span className="admin-role-badge-super">SUPERADMIN</span>
                      ) : user.is_org_admin ? (
                        <span className="admin-role-badge-org-admin">ORG ADMIN</span>
                      ) : (
                        <span className="admin-role-badge-member">MEMBER</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={user.is_active ? "brand" : "danger"}>
                        {user.is_active ? "ACTIVE" : "DEACTIVATED"}
                      </Badge>
                    </td>
                    <td>
                      <span style={{ fontSize: 12.5, color: "#64748b" }}>
                        {formatAdminDate(user.created_at)}
                      </span>
                    </td>
                    <td>
                      <div className="admin-user-actions-row">
                        {/* Reset Password Button */}
                        <button
                          type="button"
                          className="admin-user-btn is-key"
                          title="Reset Password"
                          onClick={() => setResetTargetUser(user)}
                        >
                          <Key size={14} />
                        </button>

                        {/* Deactivate / Reactivate Status Button */}
                        <button
                          type="button"
                          className="admin-user-btn is-power"
                          disabled={isMe || update.isPending}
                          title={user.is_active ? "Deactivate user" : "Reactivate user"}
                          onClick={() =>
                            update.mutate({ id: user.id, flags: { is_active: !user.is_active } })
                          }
                        >
                          <Power size={14} />
                        </button>

                        {/* Superadmin Toggle Button */}
                        <button
                          type="button"
                          className="admin-user-btn"
                          disabled={
                            isMe ||
                            (!user.is_superadmin && user.organizations.length > 0) ||
                            update.isPending
                          }
                          title={
                            !user.is_superadmin && user.organizations.length > 0
                              ? "Belongs to an organisation — superadmins have no tenancy"
                              : user.is_superadmin
                              ? "Revoke Superadmin"
                              : "Make Superadmin"
                          }
                          onClick={() =>
                            update.mutate({
                              id: user.id,
                              flags: { is_superadmin: !user.is_superadmin },
                            })
                          }
                        >
                          <Shield size={14} color={user.is_superadmin ? "#d97706" : "#64748b"} />
                        </button>

                        {/* Delete User Button */}
                        <button
                          type="button"
                          className="admin-user-btn is-danger"
                          disabled={isMe || deleteUser.isPending}
                          title={isMe ? "You cannot delete yourself" : "Delete user"}
                          onClick={() => setDeleteTargetUser(user)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "36px", color: "#64748b" }}>
                    No users found matching your search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetTargetUser && (
        <UserPasswordResetDialog
          user={resetTargetUser}
          onClose={() => setResetTargetUser(null)}
          onReset={async (password) => {
            await resetPassword.mutateAsync({ id: resetTargetUser.id, password });
          }}
          pending={resetPassword.isPending}
        />
      )}

      {/* Delete User Confirmation Modal */}
      {deleteTargetUser && (
        <UserDeleteDialog
          user={deleteTargetUser}
          onClose={() => setDeleteTargetUser(null)}
          onConfirm={async () => {
            await deleteUser.mutateAsync(deleteTargetUser.id);
          }}
          pending={deleteUser.isPending}
        />
      )}
    </div>
  );
}
