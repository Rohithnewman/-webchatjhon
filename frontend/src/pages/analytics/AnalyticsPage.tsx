import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useState } from "react";

import { analyticsApi } from "../../entities/analytics/api";
import { EmptyState, LoadingState, Panel, Select } from "../../shared/ui";
import { DashboardShell } from "../../widgets/navigation/DashboardShell";

const WINDOWS = [7, 30, 90] as const;

export function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const overview = useQuery({
    queryKey: ["analytics", days],
    queryFn: () => analyticsApi.overview(days),
    refetchInterval: 10_000,
  });

  const data = overview.data;
  const peak = Math.max(1, ...(data?.daily.map((d) => d.conversations) ?? [1]));

  return (
    <DashboardShell
      title="Analytics"
      subtitle="Conversation volume across every chatbot in this workspace."
      actions={
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Time window">
          {WINDOWS.map((n) => (
            <option key={n} value={n}>Last {n} days</option>
          ))}
        </Select>
      }
    >
      {overview.isLoading || !data ? (
        <LoadingState label="Crunching numbers" />
      ) : (
        <>
          <div className="stat-grid">
            <StatTile label="Conversations" value={data.totals.conversations} />
            <StatTile label="Messages" value={data.totals.messages} />
            <StatTile label="Chatbots" value={data.totals.chatbots} />
            <StatTile label="Waiting for agent" value={data.totals.handoff} tone="warn" />
            <StatTile label="Active" value={data.totals.active} />
            <StatTile label="Closed" value={data.totals.closed} />
          </div>

          <Panel>
            <Panel.Header title="Conversations per day" meta={`${data.days}-day window`} />
            <Panel.Body>
              {data.daily.length === 0 ? (
                <EmptyState icon={<BarChart3 size={28} />} title="No conversations yet" description="Open the demo page and chat with a bot to see data here." />
              ) : (
                <div className="bar-chart" role="img" aria-label="Conversations per day">
                  {data.daily.map((row) => (
                    <div key={row.day} className="bar-col" title={`${row.day}: ${row.conversations} conversations, ${row.messages} messages`}>
                      <div className="bar" style={{ height: `${(row.conversations / peak) * 100}%` }} />
                      <span className="bar-label">{row.day.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel.Body>
          </Panel>

          <Panel>
            <Panel.Header title="Conversations by chatbot" />
            <Panel.Body flush>
              {data.by_chatbot.length === 0 ? (
                <EmptyState title="Nothing to rank yet" />
              ) : (
                <table className="simple-table">
                  <thead><tr><th>Chatbot</th><th>Conversations</th><th>Share</th></tr></thead>
                  <tbody>
                    {data.by_chatbot.map((row) => (
                      <tr key={row.chatbot_id}>
                        <td>{row.name}</td>
                        <td>{row.conversations}</td>
                        <td>{Math.round((row.conversations / Math.max(1, data.totals.conversations)) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel.Body>
          </Panel>
        </>
      )}
    </DashboardShell>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`stat-tile ${tone === "warn" ? "is-warn" : ""}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}
