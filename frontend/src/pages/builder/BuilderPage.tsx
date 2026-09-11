import { ReactFlowProvider } from "@xyflow/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Maximize2,
  Minimize2,
  Play,
  Plus,
  Redo2,
  Rocket,
  Search,
  Trash2,
  Undo2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { FlowDocument } from "../../entities/chatbot/types";
import { useAuthStore } from "../../features/auth/model/auth-store";
import { CreateChatbotDialog } from "../../features/chatbot-create/ui/CreateChatbotDialog";
import { ClassicBuilder } from "../../features/classic-builder/ClassicBuilder";
import {
  ComponentLibraryModal,
  type ComponentItemDef,
} from "../../features/component-library/ComponentLibraryModal";
import {
  downloadFlowDocument,
  readFlowDocument,
} from "../../features/flow-editor/lib/flow-document";
import { useFlowGraph } from "../../features/flow-editor/model/use-flow-graph";
import { ConfigPanel } from "../../features/flow-editor/ui/ConfigPanel";
import { WidgetEmbedDialog } from "../../features/widget-embed/WidgetEmbedDialog";
import { ApiError } from "../../shared/api/client";
import { useToast } from "../../shared/ui";
import { FlowCanvas } from "../../widgets/flow-canvas/FlowCanvas";
import { ChatbotSubNav } from "../../widgets/navigation/ChatbotSubNav";
import { PrimaryNav } from "../../widgets/navigation/PrimaryNav";

function BuilderWorkspace() {
  const { chatbotId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const logout = useAuthStore((state) => state.logout);
  const graph = useFlowGraph();

  // Mode: "classic" or "visual"
  const [builderMode, setBuilderMode] = useState<"classic" | "visual">("classic");

  const [panelTab, setPanelTab] = useState<"config" | "history">("config");
  const [createOpen, setCreateOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [compModalOpen, setCompModalOpen] = useState(false);

  const chatbotsQuery = useQuery({ queryKey: ["chatbots"], queryFn: chatbotApi.list });
  const selectedId = chatbotId ?? chatbotsQuery.data?.[0]?.id;
  const selectedChatbot = chatbotsQuery.data?.find((bot) => bot.id === selectedId) ?? null;

  const flowQuery = useQuery({
    queryKey: ["flow", selectedId],
    queryFn: () => chatbotApi.flow(selectedId!),
    enabled: Boolean(selectedId),
  });

  const versionsQuery = useQuery({
    queryKey: ["versions", selectedId],
    queryFn: () => chatbotApi.versions(selectedId!),
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!chatbotId && selectedId) navigate(`/builder/${selectedId}`, { replace: true });
  }, [chatbotId, navigate, selectedId]);

  useEffect(() => {
    if (flowQuery.data) graph.load(flowQuery.data.definition);
  }, [flowQuery.data]);

  const notifyError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : "Something went wrong");

  const createMutation = useMutation({
    mutationFn: chatbotApi.create,
    onSuccess: async (chatbot) => {
      await queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      setCreateOpen(false);
      navigate(`/builder/${chatbot.id}`);
      toast.success("Chatbot created");
    },
    onError: notifyError,
  });

  const saveMutation = useMutation({
    mutationFn: (doc: FlowDocument) => chatbotApi.saveFlow(selectedId!, doc),
    onSuccess: async (flow) => {
      graph.markSaved();
      await queryClient.invalidateQueries({ queryKey: ["flow", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["versions", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      toast.success(`Saved flow v${flow.version}`);
    },
    onError: notifyError,
  });

  const restoreMutation = useMutation({
    mutationFn: (version: number) => chatbotApi.restore(selectedId!, version),
    onSuccess: async (flow) => {
      graph.load(flow.definition);
      graph.markSaved();
      await queryClient.invalidateQueries({ queryKey: ["flow", selectedId] });
      await queryClient.invalidateQueries({ queryKey: ["versions", selectedId] });
      toast.success(`Restored as version ${flow.version}`);
    },
    onError: notifyError,
  });

  const handleAddFromLibrary = (comp: ComponentItemDef) => {
    graph.addNode(comp.nodeType as any);
  };

  const currentSnapshot = graph.snapshot();
  const botTitle = selectedChatbot?.name ?? "AmBot";

  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <ChatbotSubNav
        chatbots={chatbotsQuery.data ?? []}
        selectedChatbot={selectedChatbot}
        onSelectChatbot={(id) => navigate(`/builder/${id}`)}
        onCreateNewBot={() => setCreateOpen(true)}
      />

      <main className="ambot-main-viewport">
        {builderMode === "classic" ? (
          // ── CLASSIC BUILDER (3-Column View) ──────────────────────────────────
          <ClassicBuilder
            flowDoc={currentSnapshot}
            flowTitle={botTitle}
            onUpdateFlow={(newDoc) => {
              graph.load(newDoc);
              saveMutation.mutate(newDoc);
            }}
            onSwitchToVisual={() => setBuilderMode("visual")}
            onOpenTest={() => setEmbedOpen(true)}
            onOpenInstall={() => navigate(`/chatbots/${selectedId}/install`)}
          />
        ) : (
          // ── VISUAL FLOW BUILDER (Canvas View) ────────────────────────────────
          <div className="visual-canvas-workspace">
            {/* Visual Top Toolbar matching Screenshots */}
            <header className="visual-top-controls">
              <div className="canvas-tool-group">
                <button
                  type="button"
                  className="canvas-tool-btn"
                  title="Zoom In"
                  onClick={() =>
                    graph.setViewport({ ...graph.viewport, zoom: graph.viewport.zoom + 0.15 })
                  }
                >
                  <ZoomIn size={16} />
                </button>
                <button
                  type="button"
                  className="canvas-tool-btn"
                  title="Zoom Out"
                  onClick={() =>
                    graph.setViewport({ ...graph.viewport, zoom: Math.max(0.2, graph.viewport.zoom - 0.15) })
                  }
                >
                  <ZoomOut size={16} />
                </button>
                <button
                  type="button"
                  className="canvas-tool-btn"
                  title="Fit to view"
                  onClick={() => graph.setViewport({ x: 0, y: 0, zoom: 1 })}
                >
                  <Maximize2 size={16} />
                </button>
              </div>

              <div className="canvas-actions-right">
                <button
                  type="button"
                  className="btn-add-component-main"
                  onClick={() => setCompModalOpen(true)}
                >
                  <Plus size={16} />
                  <span>+ Add Component</span>
                </button>

                <button
                  type="button"
                  className="btn-switch-classic"
                  onClick={() => setBuilderMode("classic")}
                  title="Switch to Classic Builder"
                >
                  <Workflow size={15} />
                  <span>Classic View</span>
                </button>

                <button
                  type="button"
                  className="btn-canvas-test"
                  onClick={() => setEmbedOpen(true)}
                >
                  <Play size={15} />
                  <span>Test Bot</span>
                </button>

                <button
                  type="button"
                  className="btn-canvas-install"
                  onClick={() => navigate(`/chatbots/${selectedId}/install`)}
                >
                  <Rocket size={15} />
                  <span>Install</span>
                </button>
              </div>
            </header>

            <div className="visual-canvas-body">
              <FlowCanvas
                nodes={graph.nodes}
                edges={graph.edges}
                viewport={graph.viewport}
                dirty={graph.dirty}
                loading={flowQuery.isLoading}
                hasChatbot={Boolean(selectedId)}
                onNodesChange={graph.onNodesChange}
                onEdgesChange={graph.onEdgesChange}
                onConnect={graph.onConnect}
                onSelectNode={(id) => {
                  graph.setSelectedNodeId(id);
                  if (id) setPanelTab("config");
                }}
                onViewportChange={graph.setViewport}
                onCreateChatbot={() => setCreateOpen(true)}
              />

              {graph.selectedNode && (
                <ConfigPanel
                  node={graph.selectedNode}
                  versions={versionsQuery.data ?? []}
                  activeTab={panelTab}
                  onTabChange={setPanelTab}
                  onChange={graph.updateSelectedNode}
                  onDelete={graph.deleteSelectedNode}
                  onRestore={(version) => restoreMutation.mutate(version)}
                  restoring={restoreMutation.isPending}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <ComponentLibraryModal
        open={compModalOpen}
        onClose={() => setCompModalOpen(false)}
        onSelectComponent={handleAddFromLibrary}
      />

      <CreateChatbotDialog
        open={createOpen}
        pending={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (data) => {
          await createMutation.mutateAsync(data);
        }}
      />

      <WidgetEmbedDialog
        open={embedOpen}
        chatbot={selectedChatbot}
        onClose={() => setEmbedOpen(false)}
      />
    </div>
  );
}

export function BuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderWorkspace />
    </ReactFlowProvider>
  );
}
