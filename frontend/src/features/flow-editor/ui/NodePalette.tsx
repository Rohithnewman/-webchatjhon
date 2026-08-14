import { NODE_CATALOG } from "../model/catalog";
import type { BuilderNodeType } from "../../../entities/chatbot/types";

interface Props {
  onAdd: (type: BuilderNodeType) => void;
  hasStart: boolean;
}

export function NodePalette({ onAdd, hasStart }: Props) {
  const categories = ["Conversation", "Logic", "Integration"] as const;
  return (
    <aside className="node-palette" aria-label="Node palette">
      <div className="panel-heading">
        <span>Nodes</span>
        <small>{NODE_CATALOG.length}</small>
      </div>
      <div className="node-palette__scroll">
        {categories.map((category) => (
          <section key={category} className="palette-group">
            <h2>{category}</h2>
            <div className="palette-grid">
              {NODE_CATALOG.filter((item) => item.category === category).map((item) => {
                const Icon = item.icon;
                const disabled = item.type === "start" && hasStart;
                return (
                  <button
                    key={item.type}
                    type="button"
                    className={`palette-item palette-item--${item.accent}`}
                    onClick={() => onAdd(item.type)}
                    disabled={disabled}
                    title={disabled ? "A flow can contain one start node" : `Add ${item.label}`}
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}
