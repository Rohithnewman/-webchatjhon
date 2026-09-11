import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";

import { auditApi } from "../../entities/audit/api";
import { EmptyState, LoadingState, Panel } from "../../shared/ui";

export function ActivityPanel() {
  const entries = useQuery({ queryKey: ["audit-logs"], queryFn: () => auditApi.recent(100), refetchInterval: 5000 });

  if (entries.isLoading) return <LoadingState label="Loading activity" />;
  if (entries.isError) {
    return <EmptyState icon={<ScrollText size={28} />} title="Activity is visible to owners and admins" description="Your role does not include workspace management." />;
  }

  return (
    <Panel>
      <Panel.Header title="Recent activity" meta="Every state-changing request is recorded in the same transaction." />
      <Panel.Body flush>
        {entries.data && entries.data.length > 0 ? (
          <table className="simple-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>
              {entries.data.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.created_at).toLocaleString()}</td>
                  <td>{entry.actor_email ?? "system"}</td>
                  <td><code>{entry.action}</code></td>
                  <td>{entry.target_type ? `${entry.target_type} ${entry.target_id?.slice(0, 8) ?? ""}` : "—"}</td>
                  <td className="audit-meta">{Object.keys(entry.metadata).length ? JSON.stringify(entry.metadata) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={<ScrollText size={28} />} title="Nothing recorded yet" />
        )}
      </Panel.Body>
    </Panel>
  );
}
