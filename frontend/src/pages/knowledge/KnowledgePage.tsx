import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Plus, Upload } from "lucide-react";
import { useState } from "react";

import { knowledgeApi } from "../../entities/knowledge/api";
import { Button, Field, Input, LoadingState, Panel, useToast } from "../../shared/ui";
import { AppHeader } from "../../widgets/app-header/AppHeader";

export function KnowledgePage() {
  const toast = useToast();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const bases = useQuery({ queryKey: ["knowledge-bases"], queryFn: knowledgeApi.list });
  const docs = useQuery({
    queryKey: ["documents", selected],
    queryFn: () => knowledgeApi.documents(selected!),
    enabled: Boolean(selected),
    refetchInterval: (query) => {
      // Poll if any document is pending/processing
      const hasPending = query.state.data?.some(
        (d) => d.status === "pending" || d.status === "processing"
      );
      return hasPending ? 2000 : false;
    },
  });

  const create = useMutation({
    mutationFn: () => knowledgeApi.create({ name }),
    onSuccess: () => {
      setName("");
      void client.invalidateQueries({ queryKey: ["knowledge-bases"] });
      toast.success("Knowledge base created");
    },
  });

  const upload = useMutation({
    mutationFn: (file: File) => knowledgeApi.upload(selected!, file),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["documents", selected] });
      toast.success("Document queued for processing");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Document upload failed");
    },
  });

  if (bases.isLoading) return <LoadingState label="Loading knowledge bases" />;

  const selectedBase = bases.data?.find((b) => b.id === selected);

  return (
    <div className="knowledge-shell">
      <AppHeader />
      <main className="knowledge-main">
        <div className="knowledge-content-wrapper">
          <header className="knowledge-header">
            <h1>Knowledge Bases</h1>
            <p>Upload documents (PDF, DOCX, TXT, MD) to power RAG retrieval in your chatbot flows.</p>
          </header>

          <div className="knowledge-grid">
            <div className="knowledge-sidebar">
              <Panel>
                <Panel.Header title="Create Knowledge Base" />
                <Panel.Body>
                  <Field label="Name">
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="e.g. Product Documentation"
                    />
                  </Field>
                  <Button
                    variant="primary"
                    disabled={!name.trim() || create.isPending}
                    loading={create.isPending}
                    onClick={() => create.mutate()}
                    icon={<Plus size={15} />}
                  >
                    Create
                  </Button>
                </Panel.Body>
              </Panel>

              <Panel>
                <Panel.Header title="Your Knowledge Bases" />
                <Panel.Body flush>
                  {(bases.data ?? []).map((base) => (
                    <button
                      key={base.id}
                      type="button"
                      className={`knowledge-base-item ${base.id === selected ? "is-selected" : ""}`}
                      onClick={() => setSelected(base.id)}
                    >
                      <div className="kb-item-icon">
                        <BookOpen size={16} />
                      </div>
                      <div className="kb-item-info">
                        <strong>{base.name}</strong>
                        <span>{base.embedding_model || "text-embedding-3-small"}</span>
                      </div>
                    </button>
                  ))}
                  {bases.data?.length === 0 && (
                    <div className="kb-empty-list">No knowledge bases yet.</div>
                  )}
                </Panel.Body>
              </Panel>
            </div>

            <div className="knowledge-detail">
              {selectedBase ? (
                <Panel>
                  <Panel.Header
                    title={`Documents: ${selectedBase.name}`}
                    actions={
                      <label className="upload-btn-label">
                        <Upload size={15} />
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept=".txt,.md,.html,.csv,.pdf,.docx"
                          style={{ display: "none" }}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) upload.mutate(file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    }
                  />
                  <Panel.Body>
                    <p className="form-hint">
                      Knowledge base ID for the flow's Knowledge node: <code>{selectedBase.id}</code>
                    </p>
                    {docs.isLoading ? (
                      <LoadingState label="Loading documents..." />
                    ) : docs.data && docs.data.length > 0 ? (
                      <div className="doc-list">
                        {docs.data.map((doc) => (
                          <div key={doc.id} className="doc-item">
                            <div className="doc-item-left">
                              <FileText size={18} />
                              <div>
                                <strong>{doc.filename}</strong>
                                <span className="doc-meta">
                                  {(doc.byte_size / 1024).toFixed(1)} KB · {doc.chunk_count ? `${doc.chunk_count} chunks` : "Pending chunks"}
                                </span>
                              </div>
                            </div>
                            <span className={`doc-status-badge is-${doc.status}`}>
                              {doc.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="docs-empty">
                        <FileText size={32} />
                        <p>No documents uploaded yet in this knowledge base.</p>
                      </div>
                    )}
                  </Panel.Body>
                </Panel>
              ) : (
                <div className="knowledge-placeholder">
                  <BookOpen size={48} />
                  <h3>Select a knowledge base</h3>
                  <p>Choose a knowledge base on the left to view and upload documents.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
