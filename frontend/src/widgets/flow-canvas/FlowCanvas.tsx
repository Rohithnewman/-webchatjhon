import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FileJson, Plus } from "lucide-react";
import { useMemo } from "react";

import type { FlowEdge, FlowNode } from "../../entities/chatbot/types";
import { NODE_DEFINITIONS } from "../../features/flow-editor/model/catalog";
import { FlowNodeCard } from "../../features/flow-editor/ui/FlowNodeCard";
import { Badge, Button, EmptyState, LoadingState } from "../../shared/ui";

interface Props {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: Viewport;
  dirty: boolean;
  loading: boolean;
  hasChatbot: boolean;
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange<FlowEdge>;
  onConnect: (connection: Connection) => void;
  onSelectNode: (id: string | null) => void;
  onViewportChange: (viewport: Viewport) => void;
  onCreateChatbot: () => void;
}

export function FlowCanvas({
  nodes,
  edges,
  viewport,
  dirty,
  loading,
  hasChatbot,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectNode,
  onViewportChange,
  onCreateChatbot,
}: Props) {
  // Every node type renders through the same card; the type only selects the
  // icon and accent, so one component covers all thirteen.
  const nodeTypes = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(NODE_DEFINITIONS).map((type) => [type, FlowNodeCard]),
      ) as NodeTypes,
    [],
  );

  return (
    <section className="canvas-shell" aria-label="Flow canvas">
      <div className="canvas-meta">
        <span>{nodes.length} nodes</span>
        <span>{edges.length} connections</span>
        {dirty ? <Badge tone="warning">Unsaved</Badge> : null}
      </div>

      {loading ? (
        <LoadingState label="Loading builder" />
      ) : hasChatbot ? (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => onSelectNode(node.id)}
          onPaneClick={() => onSelectNode(null)}
          onMoveEnd={(_, next) => onViewportChange(next)}
          defaultViewport={viewport}
          fitView
          minZoom={0.2}
          maxZoom={2.5}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#cbd2ca" />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={3} />
        </ReactFlow>
      ) : (
        <EmptyState
          icon={<FileJson size={30} aria-hidden />}
          title="No chatbot selected"
          description="Create a chatbot to start building its flow."
          action={
            <Button variant="primary" onClick={onCreateChatbot} icon={<Plus size={16} />}>
              New chatbot
            </Button>
          }
        />
      )}
    </section>
  );
}
