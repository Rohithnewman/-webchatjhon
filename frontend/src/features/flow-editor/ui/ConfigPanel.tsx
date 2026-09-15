import { Clock3, History, RotateCcw, Settings2, Trash2 } from "lucide-react";

import type { FlowNode, FlowVersion } from "../../../entities/chatbot/types";
import { NODE_DEFINITIONS } from "../model/catalog";

interface Props {
  node: FlowNode | null;
  versions: FlowVersion[];
  activeTab: "config" | "history";
  onTabChange: (tab: "config" | "history") => void;
  onChange: (key: string, value: unknown) => void;
  onDelete: () => void;
  onRestore: (version: number) => void;
  restoring: boolean;
  readOnly?: boolean;
}

export function ConfigPanel({ node, versions, activeTab, onTabChange, onChange, onDelete, onRestore, restoring, readOnly = false }: Props) {
  const definition = node ? NODE_DEFINITIONS[node.type] : null;
  return (
    <aside className="config-panel">
      <div className="panel-tabs" role="tablist" aria-label="Editor panels">
        <button className={activeTab === "config" ? "is-active" : ""} onClick={() => onTabChange("config")} role="tab">
          <Settings2 size={16} /> Inspector
        </button>
        <button className={activeTab === "history" ? "is-active" : ""} onClick={() => onTabChange("history")} role="tab">
          <History size={16} /> History
        </button>
      </div>

      {activeTab === "config" ? (
        <div className="config-panel__body">
          {node && definition ? (
            <>
              <div className="selected-node-title">
                <div className={`selected-node-icon palette-item--${definition.accent}`}><definition.icon size={18} /></div>
                <div><strong>{definition.label}</strong><span>{node.id}</span></div>
              </div>
              <div className="field-stack">
                {definition.fields.map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    {field.kind === "textarea" ? (
                      <textarea
                        value={String(node.data[field.key] ?? "")}
                        onChange={(event) => onChange(field.key, event.target.value)}
                        rows={4}
                        disabled={readOnly}
                      />
                    ) : field.kind === "select" ? (
                      <select
                        value={String(node.data[field.key] ?? "")}
                        onChange={(event) => onChange(field.key, event.target.value)}
                        disabled={readOnly}
                      >
                        {field.options?.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
                      </select>
                    ) : (
                      <input
                        type={field.kind === "number" ? "number" : "text"}
                        value={String(node.data[field.key] ?? "")}
                        onChange={(event) => onChange(field.key, field.kind === "number" ? Number(event.target.value) : event.target.value)}
                        disabled={readOnly}
                      />
                    )}
                  </label>
                ))}
              </div>
              <button type="button" className="danger-button" onClick={onDelete} disabled={readOnly || node.type === "start"}>
                <Trash2 size={16} /> Delete node
              </button>
            </>
          ) : (
            <div className="panel-empty"><Settings2 size={22} /><span>No node selected</span></div>
          )}
        </div>
      ) : (
        <div className="history-list">
          {versions.map((version) => (
            <div key={version.id} className={`history-row ${version.is_current ? "is-current" : ""}`}>
              <div className="history-row__icon"><Clock3 size={15} /></div>
              <div><strong>Version {version.version}</strong><span>{new Date(version.created_at).toLocaleString()}</span></div>
              {version.is_current ? <span className="current-tag">Current</span> : (
                <button className="icon-button" title={`Restore version ${version.version}`} aria-label={`Restore version ${version.version}`} onClick={() => onRestore(version.version)} disabled={readOnly || restoring}>
                  <RotateCcw size={15} />
                </button>
              )}
            </div>
          ))}
          {!versions.length && <div className="panel-empty"><History size={22} /><span>No versions</span></div>}
        </div>
      )}
    </aside>
  );
}
