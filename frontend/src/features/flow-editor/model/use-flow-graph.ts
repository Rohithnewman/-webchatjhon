import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useState } from "react";

import type {
  BuilderNodeType,
  FlowDocument,
  FlowEdge,
  FlowNode,
} from "../../../entities/chatbot/types";
import { NODE_DEFINITIONS } from "./catalog";
import { toFlowDocument } from "../lib/flow-document";

const COLUMNS = 3;
const COLUMN_GAP = 220;
const ROW_GAP = 140;

/**
 * Owns the editable graph: nodes, edges, viewport, selection, and the unsaved
 * flag.
 *
 * Extracted from the builder page so the graph rules are testable without
 * mounting a canvas, a router, and a query client.
 */
export function useFlowGraph() {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<FlowEdge>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(
    (document_: FlowDocument) => {
      setNodes(document_.nodes);
      setEdges(document_.edges);
      setViewport(document_.viewport);
      setSelectedNodeId(null);
      setDirty(false);
    },
    [setEdges, setNodes],
  );

  /** Same as `load`, but leaves the graph dirty — used by JSON import. */
  const replace = useCallback(
    (document_: FlowDocument) => {
      setNodes(document_.nodes);
      setEdges(document_.edges);
      setViewport(document_.viewport);
      setSelectedNodeId(null);
      setDirty(true);
    },
    [setEdges, setNodes],
  );

  const onNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeBase>[0]) => {
      onNodesChangeBase(changes);
      // Selecting a node or measuring it is not an edit; marking those dirty
      // would leave Save permanently enabled.
      if (changes.some((change) => change.type !== "select" && change.type !== "dimensions")) {
        setDirty(true);
      }
    },
    [onNodesChangeBase],
  );

  const onEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChangeBase>[0]) => {
      onEdgesChangeBase(changes);
      setDirty(true);
    },
    [onEdgesChangeBase],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge({ ...connection, id: `edge-${crypto.randomUUID()}` }, current),
      );
      setDirty(true);
    },
    [setEdges],
  );

  const addNode = useCallback(
    (type: BuilderNodeType) => {
      const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
      setNodes((current) => [
        ...current,
        {
          id,
          type,
          position: {
            x: 240 + (current.length % COLUMNS) * COLUMN_GAP,
            y: 120 + Math.floor(current.length / COLUMNS) * ROW_GAP,
          },
          data: { ...NODE_DEFINITIONS[type].defaults },
        } as FlowNode,
      ]);
      setSelectedNodeId(id);
      setDirty(true);
    },
    [setNodes],
  );

  const updateSelectedNode = useCallback(
    (key: string, value: unknown) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNodeId
            ? { ...node, data: { ...node.data, [key]: value } }
            : node,
        ),
      );
      setDirty(true);
    },
    [selectedNodeId, setNodes],
  );

  const deleteSelectedNode = useCallback(() => {
    const target = nodes.find((node) => node.id === selectedNodeId);
    // `start` is the flow's only entry point; removing it would make every
    // subsequent save fail validation.
    if (!target || target.type === "start") return;

    setNodes((current) => current.filter((node) => node.id !== target.id));
    setEdges((current) =>
      current.filter((edge) => edge.source !== target.id && edge.target !== target.id),
    );
    setSelectedNodeId(null);
    setDirty(true);
  }, [nodes, selectedNodeId, setEdges, setNodes]);

  return {
    nodes,
    edges,
    viewport,
    dirty,
    selectedNodeId,
    selectedNode: nodes.find((node) => node.id === selectedNodeId) ?? null,
    hasStart: nodes.some((node) => node.type === "start"),
    setViewport,
    setSelectedNodeId,
    markSaved: useCallback(() => setDirty(false), []),
    load,
    replace,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    updateSelectedNode,
    deleteSelectedNode,
    snapshot: useCallback(
      () => toFlowDocument(nodes, edges, viewport),
      [edges, nodes, viewport],
    ),
  };
}
