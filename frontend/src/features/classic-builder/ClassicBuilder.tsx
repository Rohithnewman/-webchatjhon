import {
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  HelpCircle,
  Image,
  Link2,
  ListCheck,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Play,
  Plus,
  Rocket,
  Trash2,
  User,
  Video,
  Workflow,
} from "lucide-react";
import { useState } from "react";

import type { BuilderNodeType, FlowDocument, FlowNode } from "../../entities/chatbot/types";
import { NODE_DEFINITIONS } from "../flow-editor/model/catalog";

/** Turns an option's text into a short, stable id suffix for its routing edge. */
function slugifyOption(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "opt";
}

interface Props {
  flowDoc: FlowDocument;
  flowTitle: string;
  onUpdateFlow: (newDoc: FlowDocument) => void;
  onSwitchToVisual: () => void;
  onOpenTest: () => void;
  onOpenInstall: () => void;
  saveState: "saving" | "unsaved" | "saved";
  readOnly?: boolean;
}

const SAVE_STATE_LABEL: Record<Props["saveState"], string> = {
  saving: "Saving…",
  unsaved: "Unsaved changes",
  saved: "Saved",
};

export function ClassicBuilder({
  flowDoc,
  flowTitle,
  onUpdateFlow,
  onSwitchToVisual,
  onOpenTest,
  onOpenInstall,
  saveState,
  readOnly = false,
}: Props) {
  const nodes = flowDoc.nodes || [];
  const edges = flowDoc.edges || [];

  const [selectedNodeId, setSelectedNodeId] = useState<string>(nodes[0]?.id || "");
  const [activeAccordion, setActiveAccordion] = useState<string>("request");
  const [customizeTab, setCustomizeTab] = useState<"customize" | "advanced">("customize");

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  // Helper to add component in classic mode
  const handleAddComponent = (type: string, defaultData: any) => {
    if (readOnly) return;
    const newId = `node_${Date.now()}`;
    const newNode: FlowNode = {
      id: newId,
      type: type as BuilderNodeType,
      position: { x: 100, y: 100 + nodes.length * 90 },
      data: defaultData as Record<string, unknown>,
    };

    // Auto-link from previous node if applicable
    const lastNode = nodes[nodes.length - 1];
    const newEdges = [...edges];
    if (lastNode && lastNode.type !== "end") {
      newEdges.push({
        id: `e_${lastNode.id}_${newId}`,
        source: lastNode.id,
        target: newId,
      });
    }

    const updatedDoc: FlowDocument = {
      ...flowDoc,
      nodes: [...nodes, newNode],
      edges: newEdges,
    };

    onUpdateFlow(updatedDoc);
    setSelectedNodeId(newId);
  };

  // Helper to update selected node text or prompt
  const handleUpdateSelected = (patch: any) => {
    if (readOnly) return;
    if (!selectedNode) return;
    const updatedNodes = nodes.map((n) =>
      n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n
    );
    onUpdateFlow({ ...flowDoc, nodes: updatedNodes });
  };

  // Helper to set next target step for routing. Only touches the *unlabelled*
  // edge — per-option and true/false routes below own the labelled edges.
  const handleSetNextTarget = (targetId: string) => {
    if (readOnly) return;
    if (!selectedNode) return;
    const filteredEdges = edges.filter((e) => !(e.source === selectedNode.id && !e.label));
    if (targetId) {
      filteredEdges.push({
        id: `e_${selectedNode.id}_${targetId}`,
        source: selectedNode.id,
        target: targetId,
      });
    }
    onUpdateFlow({ ...flowDoc, edges: filteredEdges });
  };

  // Per-option routing for `choice` nodes: writes/replaces the edge whose
  // label equals the option's exact text. The id folds in the option's
  // position (not just its slug) so two options that slugify to the same
  // thing — "Yes!" / "Yes?", or two symbol-only options that both fall back
  // to "opt" — still get distinct, backend-safe edge ids.
  const handleSetOptionTarget = (option: string, index: number, targetId: string) => {
    if (readOnly) return;
    if (!selectedNode) return;
    const filteredEdges = edges.filter((e) => !(e.source === selectedNode.id && e.label === option));
    if (targetId) {
      filteredEdges.push({
        id: `e_${selectedNode.id}_opt${index}_${slugifyOption(option)}`,
        source: selectedNode.id,
        target: targetId,
        label: option,
      });
    }
    onUpdateFlow({ ...flowDoc, edges: filteredEdges });
  };

  // True/false routing for `condition` nodes; the engine matches these
  // labels case-insensitively.
  const handleSetBranchTarget = (branch: "true" | "false", targetId: string) => {
    if (readOnly) return;
    if (!selectedNode) return;
    const filteredEdges = edges.filter(
      (e) => !(e.source === selectedNode.id && String(e.label ?? "").toLowerCase() === branch),
    );
    if (targetId) {
      filteredEdges.push({
        id: `e_${selectedNode.id}_${branch}`,
        source: selectedNode.id,
        target: targetId,
        label: branch,
      });
    }
    onUpdateFlow({ ...flowDoc, edges: filteredEdges });
  };

  const moveNode = (id: string, direction: -1 | 1) => {
    if (readOnly) return;
    const index = nodes.findIndex((n) => n.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= nodes.length || nodes[target].type === "start") return;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    onUpdateFlow({ ...flowDoc, nodes: next });
  };

  const deleteNode = (id: string) => {
    if (readOnly) return;
    const node = nodes.find((n) => n.id === id);
    if (!node || node.type === "start") return;
    if (!window.confirm(`Delete step "${String(node.data?.label ?? node.type)}"?`)) return;
    onUpdateFlow({ ...flowDoc, nodes: nodes.filter((n) => n.id !== id), edges: edges.filter((e) => e.source !== id && e.target !== id) });
    if (selectedNodeId === id) setSelectedNodeId(nodes[0]?.id ?? "");
  };

  // Find next target of selected node (unlabelled edge only)
  const currentNextEdge = edges.find((e) => e.source === selectedNode?.id && !e.label);
  const currentNextTarget = currentNextEdge?.target || "";

  const stepOptionsFor = (excludeId: string) =>
    nodes
      .filter((n) => n.id !== excludeId)
      .map((n) => {
        const idx = nodes.findIndex((candidate) => candidate.id === n.id);
        const nd = (n.data || {}) as Record<string, any>;
        return (
          <option key={n.id} value={n.id}>
            Step {idx + 1}: {String(nd.label || nd.prompt || n.type)}
          </option>
        );
      });

  // Routing section shown on the Advanced tab: per-option targets for
  // `choice`, true/false targets for `condition`, and the generic
  // next-step dropdown for everything else.
  const renderRouting = () => {
    if (!selectedNode) return null;
    const options = stepOptionsFor(selectedNode.id);

    if (selectedNode.type === "choice") {
      const selData = (selectedNode.data || {}) as Record<string, any>;
      const optionLines = String(selData.options ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      return (
        <div className="cust-field-group routing-block">
          <label className="cust-label">Routing</label>
          <p className="form-hint">
            Route every option. Options without a route follow the outgoing edge in the same
            position, which is rarely what you want.
          </p>
          {optionLines.map((option, index) => {
            const edge = edges.find((e) => e.source === selectedNode.id && e.label === option);
            return (
              <div key={`${index}_${option}`} className="routing-row">
                <span className="routing-option-name">{option}</span>
                <select
                  className="cust-dropdown"
                  value={edge?.target ?? ""}
                  onChange={(e) => handleSetOptionTarget(option, index, e.target.value)}
                >
                  <option value="">-- Go to next message --</option>
                  {options}
                </select>
              </div>
            );
          })}
        </div>
      );
    }

    if (selectedNode.type === "condition") {
      const trueEdge = edges.find(
        (e) => e.source === selectedNode.id && String(e.label ?? "").toLowerCase() === "true",
      );
      const falseEdge = edges.find(
        (e) => e.source === selectedNode.id && String(e.label ?? "").toLowerCase() === "false",
      );
      return (
        <div className="cust-field-group routing-block">
          <label className="cust-label">Routing</label>
          <p className="form-hint">
            Set both branches. Unset branches fall back to the first and second outgoing
            edges.
          </p>
          <div className="routing-row">
            <span className="routing-option-name">If true →</span>
            <select
              className="cust-dropdown"
              value={trueEdge?.target ?? ""}
              onChange={(e) => handleSetBranchTarget("true", e.target.value)}
            >
              <option value="">-- Select step --</option>
              {options}
            </select>
          </div>
          <div className="routing-row">
            <span className="routing-option-name">If false →</span>
            <select
              className="cust-dropdown"
              value={falseEdge?.target ?? ""}
              onChange={(e) => handleSetBranchTarget("false", e.target.value)}
            >
              <option value="">-- Select step --</option>
              {options}
            </select>
          </div>
        </div>
      );
    }

    return (
      <div className="cust-field-group">
        <label className="cust-label">Go to next message</label>
        <select
          className="cust-dropdown"
          value={currentNextTarget}
          onChange={(e) => handleSetNextTarget(e.target.value)}
        >
          <option value="">-- Select Next Step --</option>
          {options}
        </select>
      </div>
    );
  };

  return (
    <div className="classic-builder-container">
      {/* Top Header Bar */}
      <header className="classic-topbar">
        <div className="classic-title-col">
          <h2>Edit Your Chat Flow - {flowTitle}</h2>
        </div>

        <div className="classic-actions-group">
          <span className={`save-state-pill save-state-${saveState}`}>
            {SAVE_STATE_LABEL[saveState]}
          </span>

          <button
            type="button"
            className="btn-visualise-flow"
            onClick={onSwitchToVisual}
            title="Switch to Visual Flow Canvas"
          >
            <Workflow size={16} />
            <span>Visualise Flow</span>
          </button>

          <button type="button" className="btn-classic-test" onClick={onOpenTest}>
            <Play size={15} />
            <span>Test</span>
          </button>

          <button type="button" className="btn-classic-install" onClick={onOpenInstall}>
            <Rocket size={15} />
            <span>Install</span>
          </button>
        </div>
      </header>

      {/* 3-Column Layout */}
      <div className="classic-three-columns">
        {/* Column 1: Add Chat Component */}
        <div className="classic-col col-add-components">
          <div className="classic-col-header">
            <h3>Add Chat Component</h3>
          </div>

          <div className="classic-col-body accordion-stack">
            {/* Frequently used */}
            <div className="accordion-section">
              <button
                type="button"
                className="accordion-header-btn"
                onClick={() =>
                  setActiveAccordion(activeAccordion === "freq" ? "" : "freq")
                }
              >
                <span>Frequently used</span>
                {activeAccordion === "freq" ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {activeAccordion === "freq" && (
                <div className="accordion-content-list">
                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("message", {
                        label: "Message",
                        message: "Welcome to our support desk!",
                      })
                    }
                  >
                    <MessageSquare size={16} className="color-send" />
                    <span>Message</span>
                  </button>
                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("choice", {
                        label: "Single Choice",
                        prompt: "How can we assist you?",
                        options: "New Query\nExisting Ticket\nTalk to Agent",
                      })
                    }
                  >
                    <ListCheck size={16} className="color-req" />
                    <span>Single Choice</span>
                  </button>
                </div>
              )}
            </div>

            {/* Request Information */}
            <div className="accordion-section">
              <button
                type="button"
                className="accordion-header-btn"
                onClick={() =>
                  setActiveAccordion(activeAccordion === "request" ? "" : "request")
                }
              >
                <span>Request Information</span>
                {activeAccordion === "request" ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {activeAccordion === "request" && (
                <div className="accordion-content-list">
                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("input", {
                        label: "Name",
                        prompt: "May I know your name please? 🙏",
                        variable: "name",
                        inputType: "text",
                      })
                    }
                  >
                    <User size={16} className="color-blue" />
                    <span>Name</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("input", {
                        label: "Phone Number",
                        prompt: "Please share your phone number:",
                        variable: "phone",
                        inputType: "phone",
                      })
                    }
                  >
                    <Phone size={16} className="color-green" />
                    <span>Phone Number</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("input", {
                        label: "Email",
                        prompt: "What is your email address?",
                        variable: "email",
                        inputType: "email",
                      })
                    }
                  >
                    <Mail size={16} className="color-red" />
                    <span>Email</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("choice", {
                        label: "Single Choice",
                        prompt: "Please choose an option:",
                        options: "Residential Home\nVilla\nCommercial Building",
                      })
                    }
                  >
                    <ListCheck size={16} className="color-teal" />
                    <span>Single Choice</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("choice", {
                        label: "Multiple Choice",
                        prompt: "Select all services you need:",
                        options: "Interior Design\nArchitectural Plan\nCivil Construction",
                        mode: "multiple",
                        variable: "choices",
                      })
                    }
                  >
                    <ListCheck size={16} className="color-purple" />
                    <span>Multiple Choice</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("question", {
                        label: "Text Question",
                        prompt: "Please describe your project:",
                        variable: "description",
                      })
                    }
                  >
                    <HelpCircle size={16} className="color-orange" />
                    <span>Text Question</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("question", {
                        label: "File",
                        prompt: "Please upload your blueprint or plan:",
                        variable: "file",
                      })
                    }
                  >
                    <FileText size={16} className="color-green" />
                    <span>File</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("input", {
                        label: "Location",
                        prompt: "Where is the property located?",
                        variable: "location",
                        inputType: "text",
                      })
                    }
                  >
                    <MapPin size={16} className="color-red" />
                    <span>Location</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("input", {
                        label: "Appointment",
                        prompt: "When would you like a site visit consultation?",
                        variable: "appointment_date",
                        inputType: "date",
                      })
                    }
                  >
                    <Calendar size={16} className="color-blue" />
                    <span>Appointment</span>
                  </button>
                </div>
              )}
            </div>

            {/* Send Information */}
            <div className="accordion-section">
              <button
                type="button"
                className="accordion-header-btn"
                onClick={() =>
                  setActiveAccordion(activeAccordion === "send" ? "" : "send")
                }
              >
                <span>Send Information</span>
                {activeAccordion === "send" ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {activeAccordion === "send" && (
                <div className="accordion-content-list">
                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("message", {
                        label: "Message",
                        message: "Thank you! Our team will contact you shortly.",
                      })
                    }
                  >
                    <MessageSquare size={16} />
                    <span>Message</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("message", {
                        label: "Image/GIF",
                        message: "https://example.com/sample-villa.jpg",
                        kind: "image",
                      })
                    }
                  >
                    <Image size={16} />
                    <span>Image/GIF</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("message", {
                        label: "Video",
                        message: "https://youtube.com/watch?v=sample",
                        kind: "video",
                      })
                    }
                  >
                    <Video size={16} />
                    <span>Video</span>
                  </button>

                  <button
                    type="button"
                    className="component-pick-row"
                    onClick={() =>
                      handleAddComponent("message", {
                        label: "Web Link",
                        message: "https://ambot365.com",
                        kind: "link",
                      })
                    }
                  >
                    <Link2 size={16} />
                    <span>Web Link</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: Create/Reorder Chat Flow */}
        <div className="classic-col col-chat-flow-stream">
          <div className="classic-col-header">
            <h3>Create/Reorder Chat Flow</h3>
          </div>

          <div className="classic-col-body stream-body">
            <div className="stream-messages-stack">
              {nodes.map((node, index) => {
                const isSelected = node.id === selectedNodeId;
                const d = (node.data || {}) as Record<string, any>;
                const optionsList =
                  typeof d.options === "string"
                    ? d.options.split("\n").filter(Boolean)
                    : [];

                const canManage = !readOnly && node.type !== "start";

                return (
                  <div
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    className={`stream-node-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div className="stream-node-header">
                      <span className="step-badge">Step {index + 1}</span>
                      <strong className="node-type-name">{String(d.label || node.type)}</strong>

                      {canManage && (
                        <div className="stream-step-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="step-action-btn"
                            title="Move step up"
                            disabled={index === 0}
                            onClick={() => moveNode(node.id, -1)}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            className="step-action-btn"
                            title="Move step down"
                            disabled={index === nodes.length - 1}
                            onClick={() => moveNode(node.id, 1)}
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            type="button"
                            className="step-action-btn step-action-danger"
                            title="Delete step"
                            onClick={() => deleteNode(node.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="stream-bubble-preview">
                      <p>{String(d.message || d.prompt || "Start conversation")}</p>

                      {optionsList.length > 0 && (
                        <div className="options-pills-row">
                          {optionsList.map((opt: string, i: number) => (
                            <span key={i} className="preview-opt-pill">
                              {opt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="stream-reorder-hint">
              Reordering changes the display order only — routing is explicit through each
              step's edges, so use the Advanced tab's "Go to" controls to change where a step
              leads.
            </p>
          </div>
        </div>

        {/* Column 3: Customize Bot Messages */}
        <div className="classic-col col-customize-message">
          <div className="classic-col-header">
            <h3>Customize Bot Messages</h3>
          </div>

          <div className="classic-col-body customize-body">
            <div className="customize-tab-buttons">
              <button
                type="button"
                className={`cust-tab ${customizeTab === "customize" ? "is-active" : ""}`}
                onClick={() => setCustomizeTab("customize")}
              >
                Customize
              </button>
              <button
                type="button"
                className={`cust-tab ${customizeTab === "advanced" ? "is-active" : ""}`}
                onClick={() => setCustomizeTab("advanced")}
              >
                Advanced
              </button>
            </div>

            {selectedNode ? (() => {
              const selData = (selectedNode.data || {}) as Record<string, any>;
              const definition = NODE_DEFINITIONS[selectedNode.type];
              return (
                <fieldset
                  disabled={readOnly}
                  style={{ border: 0, padding: 0, margin: 0 }}
                  className="customize-fields-stack"
                >
                  {customizeTab === "customize" ? (
                    <>
                      <div className="cust-field-group">
                        <label className="cust-label">
                          {selData.message !== undefined
                            ? "Message"
                            : "Question / Prompt"}
                        </label>
                        <textarea
                          className="cust-textarea"
                          rows={6}
                          value={
                            selData.message !== undefined
                              ? String(selData.message ?? "")
                              : String(selData.prompt ?? "")
                          }
                          onChange={(e) => {
                            if (selData.message !== undefined) {
                              handleUpdateSelected({ message: e.target.value });
                            } else {
                              handleUpdateSelected({ prompt: e.target.value });
                            }
                          }}
                        />
                      </div>

                      {selectedNode.type === "choice" && (
                        <div className="cust-field-group">
                          <label className="cust-label">Choice Options (One per line)</label>
                          <textarea
                            className="cust-textarea"
                            rows={4}
                            value={String(selData.options ?? "")}
                            onChange={(e) => handleUpdateSelected({ options: e.target.value })}
                          />
                        </div>
                      )}

                      {selData.variable !== undefined && (
                        <div className="cust-field-group">
                          <label className="cust-label">Store response in variable</label>
                          <input
                            type="text"
                            className="cust-input"
                            value={String(selData.variable ?? "")}
                            onChange={(e) => handleUpdateSelected({ variable: e.target.value })}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {definition.fields
                        .filter((f) => f.key !== "label")
                        .map((field) => (
                          <div key={field.key} className="cust-field-group">
                            <label className="cust-label">{field.label}</label>
                            {field.kind === "textarea" ? (
                              <textarea
                                className="cust-textarea"
                                rows={4}
                                value={String(selData[field.key] ?? "")}
                                onChange={(e) => handleUpdateSelected({ [field.key]: e.target.value })}
                              />
                            ) : field.kind === "select" ? (
                              <select
                                className="cust-dropdown"
                                value={String(selData[field.key] ?? "")}
                                onChange={(e) => handleUpdateSelected({ [field.key]: e.target.value })}
                              >
                                {field.options?.map((o) => (
                                  <option key={o} value={o}>
                                    {o.replaceAll("_", " ")}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="cust-input"
                                type={field.kind === "number" ? "number" : "text"}
                                value={String(selData[field.key] ?? "")}
                                onChange={(e) =>
                                  handleUpdateSelected({
                                    [field.key]: field.kind === "number" ? Number(e.target.value) : e.target.value,
                                  })
                                }
                              />
                            )}
                          </div>
                        ))}
                      {renderRouting()}
                    </>
                  )}
                </fieldset>
              );
            })() : (
              <div className="cust-empty">Select a step in the center to customize it.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
