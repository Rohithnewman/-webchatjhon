import { useState } from "react";

import { ProviderCredentialsPanel } from "../../features/provider-credentials/ProviderCredentialsPanel";
import { Tabs, type TabItem } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

export type SettingsTab = "providers";

const TABS: readonly TabItem<SettingsTab>[] = [
  { id: "providers", label: "AI Providers" },
];

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("providers");

  return (
    <DashboardShell title="Workspace Settings" subtitle="Keys, people, and activity for this workspace.">
      <div className="settings-tabs">
        <Tabs items={TABS} value={tab} onChange={setTab} label="Settings sections" />
      </div>
      {tab === "providers" && <ProviderCredentialsPanel />}
    </DashboardShell>
  );
}
