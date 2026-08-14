import { z } from "zod";

export const nodeTypes = [
  "start", "message", "question", "choice", "condition", "input", "llm",
  "knowledge_search", "http_request", "webhook", "delay", "handoff", "end",
] as const;

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(nodeTypes),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});

export const flowDocumentSchema = z.object({
  nodes: z.array(nodeSchema).min(1).max(250),
  edges: z.array(edgeSchema).max(500),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().min(0.1).max(4),
  }).default({ x: 0, y: 0, zoom: 1 }),
}).superRefine((flow, context) => {
  const starts = flow.nodes.filter((node) => node.type === "start");
  if (starts.length !== 1) {
    context.addIssue({ code: "custom", message: "Flow must contain exactly one start node" });
  }
  const ids = new Set(flow.nodes.map((node) => node.id));
  if (ids.size !== flow.nodes.length) {
    context.addIssue({ code: "custom", message: "Node IDs must be unique" });
  }
  for (const edge of flow.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      context.addIssue({ code: "custom", message: "An edge references a missing node" });
    }
  }
});
