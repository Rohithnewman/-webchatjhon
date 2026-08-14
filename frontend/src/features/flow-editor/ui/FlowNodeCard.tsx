import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { FlowNode } from "../../../entities/chatbot/types";
import { NODE_DEFINITIONS } from "../model/catalog";

export function FlowNodeCard({ data, type, selected }: NodeProps<FlowNode>) {
  const definition = NODE_DEFINITIONS[type];
  const Icon = definition.icon;
  const isStart = type === "start";
  const isEnd = type === "end";

  return (
    <div className={`flow-node flow-node--${definition.accent} ${selected ? "is-selected" : ""}`}>
      {!isStart && <Handle type="target" position={Position.Left} />}
      <div className="flow-node__icon"><Icon size={16} strokeWidth={2} /></div>
      <div className="flow-node__body">
        <strong>{String(data.label || definition.label)}</strong>
        <span>{definition.label}</span>
      </div>
      {!isEnd && <Handle type="source" position={Position.Right} />}
    </div>
  );
}
