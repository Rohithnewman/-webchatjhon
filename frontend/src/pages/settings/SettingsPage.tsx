import { useState } from "react";

import { ActivityPanel } from "../../features/activity/ActivityPanel";
import { useAuthStore } from "../../entities/session/auth-store";
import { ProviderCredentialsPanel } from "../../features/provider-credentials/ProviderCredentialsPanel";
import { TeamPanel } from "../../features/team/TeamPanel";
import { Tabs, type TabItem } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

export type SettingsTab = "providers" | "team" | "activity";

const TABS: readonly TabItem<SettingsTab>[] = [
  { id: "providers", label: "AI Providers" },
  { id: "team", label: "Team" },
  { id: "activity", label: "Activity" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("providers");
  const userId = useAuthStore((state) => state.userId);

  return (
    <DashboardShell title="Workspace Settings" subtitle="Keys, people, and activity for this workspace.">
      <div className="settings-tabs">
        <Tabs items={TABS} value={tab} onChange={setTab} label="Settings sections" />
      </div>
      {tab === "providers" && <ProviderCredentialsPanel />}
      {tab === "team" && <TeamPanel currentUserId={userId} />}
      {tab === "activity" && <ActivityPanel />}
    </DashboardShell>
  );
}
