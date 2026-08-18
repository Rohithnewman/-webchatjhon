import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { knowledgeApi } from "../../entities/knowledge/api";
import { Button, Field, Input, LoadingState, Panel, useToast } from "../../shared/ui";

export function KnowledgePage() {
  const toast = useToast(); const client = useQueryClient(); const [name, setName] = useState(""); const [selected, setSelected] = useState<string | null>(null);
  const bases = useQuery({ queryKey: ["knowledge-bases"], queryFn: knowledgeApi.list });
  const docs = useQuery({ queryKey: ["documents", selected], queryFn: () => knowledgeApi.documents(selected!), enabled: Boolean(selected) });
  const create = useMutation({ mutationFn: () => knowledgeApi.create({ name }), onSuccess: () => { setName(""); void client.invalidateQueries({ queryKey: ["knowledge-bases"] }); toast.success("Knowledge base created"); } });
  const upload = useMutation({ mutationFn: (file: File) => knowledgeApi.upload(selected!, file), onSuccess: () => { void client.invalidateQueries({ queryKey: ["documents", selected] }); toast.success("Document queued for processing"); } });
  if (bases.isLoading) return <LoadingState label="Loading knowledge bases" />;
  return <main className="builder-shell" style={{ padding: 32 }}><div style={{ maxWidth: 960, margin: "0 auto" }}><h1>Knowledge</h1><p>Upload documents to make them searchable by your chatbot.</p><Panel><h2>Create knowledge base</h2><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Product documentation" /></Field><Button disabled={!name || create.isPending} onClick={() => create.mutate()}>Create</Button></Panel><Panel><h2>Your knowledge bases</h2>{(bases.data ?? []).map((base) => <div key={base.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}><button onClick={() => setSelected(base.id)}>{base.name}</button><span>{base.embedding_model}</span></div>)}</Panel>{selected && <Panel><h2>Documents</h2><input type="file" accept=".txt,.md,.html,.csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); }} />{(docs.data ?? []).map((doc) => <div key={doc.id} style={{ padding: "10px 0" }}>{doc.filename} — {doc.status}{doc.chunk_count ? ` (${doc.chunk_count} chunks)` : ""}</div>)}</Panel>}</div></main>;
}
