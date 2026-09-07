import { useQuery } from "@tanstack/react-query";
import {
  Download,
  MoreVertical,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import { WidgetEmbedDialog } from "../../features/widget-embed/WidgetEmbedDialog";
import { AmbotShell } from "../../widgets/navigation/AmbotShell";

interface FlowRowData {
  id: string;
  name: string;
  messageCount: number;
  createdOn: string;
  lastModified: string;
  isDefault: boolean;
  isRevisit: boolean;
}

export function ChatFlowsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [embedBot, setEmbedBot] = useState<any | null>(null);

  return (
    <AmbotShell>
      {({ selectedChatbot, chatbots, refetchChatbots }) => {
        // Query current flow
        const flowQuery = useQuery({
          queryKey: ["flow", selectedChatbot?.id],
          queryFn: () => chatbotApi.flow(selectedChatbot!.id),
          enabled: Boolean(selectedChatbot?.id),
        });

        const flow = flowQuery.data;
        const nodeCount = flow?.definition?.nodes?.length ?? 12;

        // Construct mock/real flow list for the chatbot
        const flowRows: FlowRowData[] = selectedChatbot
          ? [
              {
                id: selectedChatbot.id,
                name: `${selectedChatbot.name} Main Flow`,
                messageCount: nodeCount,
                createdOn: new Date(selectedChatbot.created_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                lastModified: new Date(selectedChatbot.updated_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                isDefault: true,
                isRevisit: true,
              },
              {
                id: `${selectedChatbot.id}-support`,
                name: "Customer Support & Handoff Flow",
                messageCount: 18,
                createdOn: "Aug 12th, 2026 10:15 AM",
                lastModified: "Aug 25th, 2026 04:30 PM",
                isDefault: false,
                isRevisit: false,
              },
              {
                id: `${selectedChatbot.id}-booking`,
                name: "Appointment Booking Flow",
                messageCount: 7,
                createdOn: "Aug 18th, 2026 01:20 PM",
                lastModified: "Aug 28th, 2026 06:10 PM",
                isDefault: false,
                isRevisit: false,
              },
            ]
          : [];

        const filteredFlows = flowRows.filter((f) =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (
          <div className="chatflows-page-container">
            <header className="chatflows-header">
              <div className="chatflows-title-col">
                <h1>Website Chatflow</h1>
                <p>
                  Build chatbot conversations for your website to assist visitors and capture
                  leads instantly.
                </p>
              </div>
            </header>

            <div className="chatflows-toolbar">
              <div className="chatflows-search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search flow by name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="chatflows-actions">
                <button
                  type="button"
                  className="btn-import-flow"
                  onClick={() => alert("Flow import dialog")}
                >
                  <Upload size={15} />
                  <span>Import Flow</span>
                </button>
                <button
                  type="button"
                  className="btn-create-flow"
                  onClick={() => {
                    if (selectedChatbot) {
                      navigate(`/builder/${selectedChatbot.id}`);
                    }
                  }}
                >
                  Create New Flow
                </button>
              </div>
            </div>

            <div className="chatflows-table-card">
              <table className="chatflows-table">
                <thead>
                  <tr>
                    <th>Flow name</th>
                    <th># of messages</th>
                    <th>Created on</th>
                    <th>Last modified</th>
                    <th>Default flow</th>
                    <th>Revisit Flow</th>
                    <th className="th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFlows.map((row) => (
                    <tr key={row.id}>
                      <td className="td-flow-name">
                        <button
                          type="button"
                          className="flow-name-btn"
                          onClick={() => {
                            if (selectedChatbot) {
                              navigate(`/builder/${selectedChatbot.id}`);
                            }
                          }}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="td-msg-count">{row.messageCount}</td>
                      <td>{row.createdOn}</td>
                      <td>{row.lastModified}</td>
                      <td>
                        <label className="switch-toggle">
                          <input type="checkbox" defaultChecked={row.isDefault} />
                          <span className="slider round" />
                        </label>
                      </td>
                      <td>
                        <label className="switch-toggle">
                          <input type="checkbox" defaultChecked={row.isRevisit} />
                          <span className="slider round" />
                        </label>
                      </td>
                      <td className="td-actions-cell">
                        <button
                          type="button"
                          className="action-icon-btn is-test"
                          title="Test flow"
                          onClick={() => setEmbedBot(selectedChatbot)}
                        >
                          <UserCheck size={16} />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn is-delete"
                          title="Delete flow"
                          onClick={() => {
                            if (window.confirm("Delete this flow?")) {
                              alert("Flow deleted");
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn is-more"
                          title="More options"
                        >
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredFlows.length === 0 && (
                <div className="table-empty-notice">
                  No chat flows matching "{searchQuery}"
                </div>
              )}
            </div>

            <WidgetEmbedDialog
              open={Boolean(embedBot)}
              chatbot={embedBot}
              onClose={() => setEmbedBot(null)}
            />
          </div>
        );
      }}
    </AmbotShell>
  );
}
