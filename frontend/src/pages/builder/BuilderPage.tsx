import { ReactFlowProvider } from "@xyflow/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { FlowDocument } from "../../entities/chatbot/types";
import { useAuthStore } from "../../features/auth/model/auth-store";
import { CreateChatbotDialog } from "../../features/chatbot-create/ui/CreateChatbotDialog";
import {
  downloadFlowDocument,
  readFlowDocument,
} from "../../features/flow-editor/lib/flow-document";
import { useFlowGraph } from "../../features/flow-editor/model/use-flow-graph";
import { ConfigPanel } from "../../features/flow-editor/ui/ConfigPanel";
import { NodePalette } from "../../features/flow-editor/ui/NodePalette";
import { ApiError } from "../../shared/api/client";
import { useToast } from "../../shared/ui";
import { BuilderTopbar } from "../../widgets/builder-topbar/BuilderTopbar";
import { ChatbotSidebar } from "../../widgets/chatbot-sidebar/ChatbotSidebar";
import { FlowCanvas } from "../../widgets/flow-canvas/FlowCanvas";

function BuilderWorkspace() {
  const { chatbotId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const logout = useAuthStore((state) => state.logout);
  const graph = useFlowGraph();

  const [panelTab, setPanelTab] = useState<"config" | "history">("config");
  const [createOpen, setCreateOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

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
    // `graph.load` is stable; re-running on graph identity would clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    mutationFn: (document_: FlowDocument) => chatbotApi.saveFlow(selectedId!, document_),
    onSuccess: async (flow) => {
      queryClient.setQueryData(["flow", selectedId], flow);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["versions", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["chatbots"] }),
      ]);
      graph.markSaved();
      toast.success(`Saved version ${flow.version}`);
    },
    onError: notifyError,
  });

  const updateMutation = useMutation({
    mutationFn: (input: { status?: "draft" | "published" }) =>
      chatbotApi.update(selectedId!, input),
    onSuccess: async (chatbot) => {
      await queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      toast.success(chatbot.status === "published" ? "Published" : "Moved to draft");
    },
    onError: notifyError,
  });

  const restoreMutation = useMutation({
    mutationFn: (version: number) => chatbotApi.restore(selectedId!, version),
    onSuccess: async (flow) => {
      queryClient.setQueryData(["flow", selectedId], flow);
      await queryClient.invalidateQueries({ queryKey: ["versions", selectedId] });
      toast.success(`Restored as version ${flow.version}`);
    },
    onError: notifyError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => chatbotApi.remove(selectedId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chatbots"] });
      navigate("/builder");
      toast.success("Chatbot deleted");
    },
    onError: notifyError,
  });

  async function importFlow(file: File) {
    try {
      graph.replace(await readFlowDocument(file));
      toast.success("Flow imported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file isn't a valid flow");
    }
  }

  const loading = chatbotsQuery.isLoading || (Boolean(selectedId) && flowQuery.isLoading);

  return (
    <main className="builder-shell">
      <BuilderTopbar
        chatbot={selectedChatbot}
        dirty={graph.dirty}
        saving={saveMutation.isPending}
        publishing={updateMutation.isPending}
        onToggleNav={() => setNavOpen((open) => !open)}
        onSave={() => saveMutation.mutate(graph.snapshot())}
        onTogglePublished={() =>
          updateMutation.mutate({
            status: selectedChatbot?.status === "published" ? "draft" : "published",
          })
        }
        onExport={() =>
          downloadFlowDocument(graph.snapshot(), selectedChatbot?.name ?? "flow")
        }
        onImport={(file) => void importFlow(file)}
      />

      <div className="builder-layout">
        <ChatbotSidebar
          chatbots={chatbotsQuery.data ?? []}
          loading={chatbotsQuery.isLoading}
          selectedId={selectedId}
          open={navOpen}
          onSelect={(id) => {
            navigate(`/builder/${id}`);
            setNavOpen(false);
          }}
          onCreate={() => setCreateOpen(true)}
          onDelete={() => {
            if (selectedChatbot && window.confirm(`Delete ${selectedChatbot.name}?`)) {
              deleteMutation.mutate();
            }
          }}
          onSignOut={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
        />

        <NodePalette onAdd={graph.addNode} hasStart={graph.hasStart} />

        <FlowCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          viewport={graph.viewport}
          dirty={graph.dirty}
          loading={loading}
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
      </div>

      <CreateChatbotDialog
        open={createOpen}
        pending={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (data) => {
          await createMutation.mutateAsync(data);
        }}
      />
    </main>
  );
}

export function BuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderWorkspace />
    </ReactFlowProvider>
  );
}
