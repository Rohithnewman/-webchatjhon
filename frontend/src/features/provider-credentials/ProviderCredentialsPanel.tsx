import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  PROVIDERS,
  providerCredentialApi,
  type ProviderName,
} from "../../entities/provider-credential/api";
import { Badge, Button, EmptyState, Field, Input, LoadingState, Panel, Select, useToast } from "../../shared/ui";

export function ProviderCredentialsPanel() {
  const toast = useToast();
  const client = useQueryClient();
  const [provider, setProvider] = useState<ProviderName>("openai");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const credentials = useQuery({ queryKey: ["provider-credentials"], queryFn: providerCredentialApi.list });

  const create = useMutation({
    mutationFn: () =>
      providerCredentialApi.create({
        provider,
        api_key: apiKey,
        label: label || provider,
        base_url: baseUrl.trim() || null,
        make_default: true,
      }),
    onSuccess: () => {
      setApiKey("");
      setLabel("");
      setBaseUrl("");
      void client.invalidateQueries({ queryKey: ["provider-credentials"] });
      toast.success("Provider key stored (encrypted at rest)");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Could not store key"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => providerCredentialApi.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["provider-credentials"] });
      toast.success("Key removed");
    },
  });

  const keyless = provider === "ollama";
  const canSubmit = keyless || apiKey.trim().length > 0;

  return (
    <div className="settings-grid">
      <Panel>
        <Panel.Header title="Add a provider key" />
        <Panel.Body>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) create.mutate();
            }}
          >
            <Field label="Provider">
              <Select value={provider} onChange={(e) => setProvider(e.target.value as ProviderName)}>
                {PROVIDERS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </Field>
            <Field label={keyless ? "API key (not needed for Ollama)" : "API key"}>
              <Input
                type="password"
                value={apiKey}
                disabled={keyless}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keyless ? "—" : "sk-..."}
                autoComplete="off"
              />
            </Field>
            <Field label="Label (optional)">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Production key" />
            </Field>
            <Field label="Base URL (optional)">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={keyless ? "http://localhost:11434/v1" : "Leave empty for the provider default"}
              />
            </Field>
            <p className="form-hint">
              Keys are encrypted with Fernet before they reach the database and are never returned by the API.
            </p>
            <Button type="submit" variant="primary" icon={<Plus size={15} />} loading={create.isPending} disabled={!canSubmit || create.isPending}>
              Store key
            </Button>
          </form>
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header title="Stored keys" />
        <Panel.Body flush>
          {credentials.isLoading ? (
            <LoadingState label="Loading keys" />
          ) : credentials.data && credentials.data.length > 0 ? (
            credentials.data.map((credential) => (
              <div key={credential.id} className="credential-row">
                <div>
                  <strong>{credential.provider}</strong> · {credential.label}
                  <span className="credential-meta">
                    ends with ····{credential.key_last_four || "none"}
                    {credential.base_url ? ` · ${credential.base_url}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {credential.is_default && <Badge tone="brand">default</Badge>}
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove.mutate(credential.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<KeyRound size={28} />}
              title="No provider keys yet"
              description="Store a key so the AI response node can call a model. Ollama needs no key if it runs locally."
            />
          )}
        </Panel.Body>
      </Panel>
    </div>
  );
}
