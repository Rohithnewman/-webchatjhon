import type { Viewport } from "@xyflow/react";

import type { FlowDocument, FlowEdge, FlowNode } from "../../../entities/chatbot/types";
import { flowDocumentSchema } from "../model/flow-schema";

/**
 * Strip React Flow's runtime bookkeeping (measured sizes, selection, drag
 * state) so only the fields the API validates are sent or written to disk.
 */
export function toFlowDocument(
  nodes: FlowNode[],
  edges: FlowEdge[],
  viewport: Viewport,
): FlowDocument {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })) as FlowNode[],
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
      ...(edge.label ? { label: String(edge.label) } : {}),
    })),
    viewport,
  };
}

/** Hands the browser a JSON file named after the chatbot. */
export function downloadFlowDocument(document_: FlowDocument, filename: string): void {
  const blob = new Blob([JSON.stringify(document_, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Parses an uploaded file against the same schema the API enforces, so an
 * invalid import fails here with a readable message rather than as a 400.
 */
export async function readFlowDocument(file: File): Promise<FlowDocument> {
  return flowDocumentSchema.parse(JSON.parse(await file.text())) as FlowDocument;
}
