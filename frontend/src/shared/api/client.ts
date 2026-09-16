const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1";
const REFRESH_KEY = "wcb.refresh";

let accessToken: string | null = null;
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);
let refreshInFlight: Promise<AuthTokens> | null = null;

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user_id: string;
  workspace_id: string | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string | null;
}

interface ErrorEnvelope {
  success: false;
  error: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function setTokens(tokens: AuthTokens) {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(REFRESH_KEY);
}

export function hasRefreshToken() {
  return Boolean(refreshToken);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T> | ErrorEnvelope;
  if (!response.ok || !body.success) {
    const error = body as ErrorEnvelope;
    throw new ApiError(response.status, error.error ?? "REQUEST_FAILED", error.message ?? "Request failed", error.details);
  }
  return (body as ApiEnvelope<T>).data;
}

async function rotateTokens(): Promise<AuthTokens> {
  if (!refreshToken) {
    throw new ApiError(401, "UNAUTHENTICATED", "Session expired");
  }
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const tokens = await parseResponse<AuthTokens>(response);
  setTokens(tokens);
  return tokens;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401 && retry && refreshToken) {
    try {
      refreshInFlight ??= rotateTokens();
      await refreshInFlight;
      return apiRequest<T>(path, init, false);
    } catch (error) {
      clearTokens();
      throw error;
    } finally {
      refreshInFlight = null;
    }
  }
  return parseResponse<T>(response);
}

export const authApi = {
  async login(email: string, password: string) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const tokens = await parseResponse<AuthTokens>(response);
    setTokens(tokens);
    return tokens;
  },
  async register(input: { email: string; password: string; full_name: string; org_name: string }) {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const tokens = await parseResponse<AuthTokens>(response);
    setTokens(tokens);
    return tokens;
  },
  async hydrate() {
    if (!refreshToken) return null;
    try {
      return await rotateTokens();
    } catch {
      clearTokens();
      return null;
    }
  },
  async logout() {
    const token = refreshToken;
    clearTokens();
    if (!token) return;
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: token }),
      });
    } catch {
      // Local session is already cleared.
    }
  },
  async switchWorkspace(workspaceId: string) {
    if (!refreshToken) throw new ApiError(401, "UNAUTHENTICATED", "Session expired");
    const tokens = await apiRequest<AuthTokens>("/auth/switch-workspace", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken, workspace_id: workspaceId }),
    });
    setTokens(tokens);
    return tokens;
  },
};
