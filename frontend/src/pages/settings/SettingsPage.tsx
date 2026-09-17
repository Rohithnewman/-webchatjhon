import { useEffect, useMemo, useState } from "react";

import { ActivityPanel } from "../../features/activity/ActivityPanel";
import { useAuthStore } from "../../entities/session/auth-store";
import { useMe } from "../../entities/me/api";
import { OrganizationPanel } from "../../features/organization/OrganizationPanel";
import { ProviderCredentialsPanel } from "../../features/provider-credentials/ProviderCredentialsPanel";
import { RolesPanel } from "../../features/roles/RolesPanel";
import { TeamPanel } from "../../features/team/TeamPanel";
import { Tabs, type TabItem } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

export type SettingsTab = "organization" | "providers" | "team" | "roles" | "activity";

const ALL_TABS: readonly (TabItem<SettingsTab> & { permission: string })[] = [
  { id: "organization", label: "Organisation", permission: "workspace:manage" },
  { id: "providers", label: "AI Providers", permission: "knowledge:manage" },
  { id: "team", label: "Team", permission: "members:manage" },
  { id: "roles", label: "Roles", permission: "members:manage" },
  { id: "activity", label: "Activity", permission: "workspace:manage" },
];

export function SettingsPage() {
  const userId = useAuthStore((state) => state.userId);
  const { can, isReady } = useMe();

  // Optimistic until /auth/me resolves, then trimmed to what this role can
  // actually see — same rule the rail uses for hiding Analytics.
  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => !isReady || can(t.permission)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isReady, can],
  );

  const [tab, setTab] = useState<SettingsTab>("organization");

  useEffect(() => {
    if (isReady && visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, visibleTabs]);

  if (isReady && visibleTabs.length === 0) {
    return (
      <DashboardShell title="Workspace Settings" subtitle="Keys, people, and activity for this workspace.">
        <p className="form-hint">Your role does not include any settings permission.</p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Workspace Settings" subtitle="Keys, people, and activity for this workspace.">
      <div className="settings-tabs">
        <Tabs items={visibleTabs} value={tab} onChange={setTab} label="Settings sections" />
      </div>
      {tab === "organization" && <OrganizationPanel />}
      {tab === "providers" && <ProviderCredentialsPanel />}
      {tab === "team" && <TeamPanel currentUserId={userId} />}
      {tab === "roles" && <RolesPanel />}
      {tab === "activity" && <ActivityPanel />}
    </DashboardShell>
  );
}
