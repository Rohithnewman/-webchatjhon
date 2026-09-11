import { apiRequest } from "../../shared/api/client";

export const PROVIDERS = ["openai", "anthropic", "gemini", "groq", "mistral", "ollama"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export interface ProviderCredential {
  id: string;
  provider: ProviderName;
  label: string;
  key_last_four: string;
  base_url: string | null;
  is_default: boolean;
}

export interface ProviderCredentialCreate {
  provider: ProviderName;
  api_key: string;
  label: string;
  base_url?: string | null;
  make_default: boolean;
}

export const providerCredentialApi = {
  list: () => apiRequest<ProviderCredential[]>("/provider-credentials"),
  create: (input: ProviderCredentialCreate) =>
    apiRequest<ProviderCredential>("/provider-credentials", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiRequest<{ deleted: boolean }>(`/provider-credentials/${id}`, { method: "DELETE" }),
};
