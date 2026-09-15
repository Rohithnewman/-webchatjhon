import { create } from "zustand";

import { authApi, type AuthTokens } from "../../shared/api/client";

type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  workspaceId: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; full_name: string; org_name: string }) => Promise<void>;
  logout: () => Promise<void>;
}

function authenticated(tokens: AuthTokens) {
  return {
    status: "authenticated" as const,
    userId: tokens.user_id,
    workspaceId: tokens.workspace_id,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  userId: null,
  workspaceId: null,
  hydrate: async () => {
    const tokens = await authApi.hydrate();
    set(tokens ? authenticated(tokens) : { status: "anonymous", userId: null, workspaceId: null });
  },
  login: async (email, password) => {
    const tokens = await authApi.login(email, password);
    set(authenticated(tokens));
  },
  register: async (input) => {
    const tokens = await authApi.register(input);
    set(authenticated(tokens));
  },
  logout: async () => {
    await authApi.logout();
    set({ status: "anonymous", userId: null, workspaceId: null });
  },
}));
