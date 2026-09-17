import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, History, Play, Search, Trash2, Upload, UserCheck } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { downloadFlowDocument, readFlowDocument } from "../../features/flow-editor/lib/flow-document";
import { WidgetEmbedDialog } from "../../features/widget-embed/WidgetEmbedDialog";
import { useMe } from "../../entities/me/api";
import { permissionLabel } from "../../entities/workspace/api";
import { Badge, ReadOnlyBanner, useToast } from "../../shared/ui";
import { AmbotShell } from "../../widgets/navigation/AmbotShell";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface InnerProps {
  selectedChatbot: Chatbot | null;
  chatbots: Chatbot[];
  refetchChatbots: () => void;
}

function ChatFlowsInner({ selectedChatbot, chatbots, refetchChatbots }: InnerProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [embedBot, setEmbedBot] = useState<Chatbot | null>(null);
  const { can, isReady } = useMe();
  const readOnly = isReady && !can("bots:manage");

  const flowQuery = useQuery({
    queryKey: ["flow", selectedChatbot?.id],
    queryFn: () => chatbotApi.flow(selectedChatbot!.id),
    enabled: Boolean(selectedChatbot?.id),
  });
  const versionsQuery = useQuery({
    queryKey: ["versions", selectedChatbot?.id],
    queryFn: () => chatbotApi.versions(selectedChatbot!.id),
    enabled: Boolean(selectedChatbot?.id),
  });

  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ["flow", selectedChatbot?.id] });
    await client.invalidateQueries({ queryKey: ["versions", selectedChatbot?.id] });
    refetchChatbots();
  };
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Request failed");

  const importFlow = useMutation({
    mutationFn: async (file: File) => chatbotApi.saveFlow(selectedChatbot!.id, await readFlowDocument(file)),
    onSuccess: async (flow) => { await invalidate(); toast.success(`Imported as version ${flow.version}`); },
    onError: fail,
  });
  const togglePublish = useMutation({
    mutationFn: (bot: Chatbot) =>
      chatbotApi.update(bot.id, { status: bot.status === "published" ? "draft" : "published" }),
    onSuccess: async (bot) => { await invalidate(); toast.success(bot.status === "published" ? "Published — the widget is live" : "Unpublished"); },
    onError: fail,
  });
  const removeBot = useMutation({
    mutationFn: (id: string) => chatbotApi.remove(id),
    onSuccess: async () => { refetchChatbots(); toast.success("Chatbot deleted"); navigate("/chatbots"); },
    onError: fail,
  });

  const rows = chatbots.filter((b) => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const flow = flowQuery.data;

  return (
    <div className="chatflows-page-container">
      <header className="chatflows-header">
        <div className="chatflows-title-col">
          <h1>Website Chatflow</h1>
          <p>Each chatbot has one live flow with a full version history. Publish to make the widget answer visitors.</p>
        </div>
      </header>

      {readOnly && <ReadOnlyBanner label={permissionLabel("bots:manage")} />}

      <div className="chatflows-toolbar">
        <div className="chatflows-search-box">
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search chatbot by name" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="chatflows-actions">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f && selectedChatbot) importFlow.mutate(f); e.target.value = ""; }}
          />
          {!readOnly && (
            <button type="button" className="btn-import-flow" disabled={!selectedChatbot || importFlow.isPending} onClick={() => fileInput.current?.click()}>
              <Upload size={15} /><span>Import Flow (JSON)</span>
            </button>
          )}
          <button type="button" className="btn-import-flow" disabled={!flow} onClick={() => flow && downloadFlowDocument(flow.definition, selectedChatbot?.name ?? "flow")}>
            <Download size={15} /><span>Export Flow</span>
          </button>
          <button type="button" className="btn-create-flow" onClick={() => selectedChatbot && navigate(`/builder/${selectedChatbot.id}`)}>
            Open Builder
          </button>
        </div>
      </div>

      <div className="chatflows-table-card">
        <table className="chatflows-table">
          <thead>
            <tr>
              <th>Chatbot</th><th># of nodes</th><th>Created on</th><th>Last modified</th><th>Published</th><th>Versions</th><th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((bot) => {
              const isSelected = bot.id === selectedChatbot?.id;
              return (
                <tr key={bot.id} className={isSelected ? "is-selected" : ""}>
                  <td className="td-flow-name">
                    <button type="button" className="flow-name-btn" onClick={() => navigate(`/builder/${bot.id}`)}>{bot.name}</button>
                  </td>
                  <td className="td-msg-count">{isSelected && flow ? flow.definition.nodes.length : "—"}</td>
                  <td>{fmt(bot.created_at)}</td>
                  <td>{fmt(bot.updated_at)}</td>
                  <td>
                    {readOnly ? (
                      <Badge tone={bot.status === "published" ? "brand" : "neutral"}>
                        {bot.status === "published" ? "Published" : "Draft"}
                      </Badge>
                    ) : (
                      <label className="switch-toggle" title={bot.status === "published" ? "Unpublish" : "Publish"}>
                        <input type="checkbox" checked={bot.status === "published"} onChange={() => togglePublish.mutate(bot)} />
                        <span className="slider round" />
                      </label>
                    )}
                  </td>
                  <td>{isSelected ? <span className="version-pill"><History size={13} /> v{bot.current_version ?? 0} · {versionsQuery.data?.length ?? 0} saved</span> : `v${bot.current_version ?? 0}`}</td>
                  <td className="td-actions-cell">
                    <button type="button" className="action-icon-btn is-test" title="Test in simulator" onClick={() => setEmbedBot(bot)}><UserCheck size={16} /></button>
                    <button type="button" className="action-icon-btn" title="Open builder" onClick={() => navigate(`/builder/${bot.id}`)}><Play size={16} /></button>
                    {!readOnly && (
                      <button
                        type="button"
                        className="action-icon-btn is-delete"
                        title="Delete chatbot"
                        onClick={() => { if (window.confirm(`Delete "${bot.name}" and all its flow versions?`)) removeBot.mutate(bot.id); }}
                      ><Trash2 size={16} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="table-empty-notice">No chatbots matching "{searchQuery}"</div>}
      </div>

      <WidgetEmbedDialog open={Boolean(embedBot)} chatbot={embedBot} onClose={() => setEmbedBot(null)} />
    </div>
  );
}

export function ChatFlowsPage() {
  return <AmbotShell>{(props) => <ChatFlowsInner {...props} />}</AmbotShell>;
}
