import { clearSession, refreshToken, storeSession, token } from "./token.js";

const BASE =
  typeof import.meta !== "undefined" && (import.meta as Record<string, unknown>).env
    ? (((import.meta as Record<string, unknown>).env as Record<string, string>).VITE_API_URL ??
      "http://localhost:3000")
    : "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

function shouldRetry(error: unknown, attempt: number): boolean {
  if (attempt >= RETRY_ATTEMPTS) return false;
  if (error instanceof ApiError) return error.status >= 500;
  return true; // network error
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryRefresh(): Promise<boolean> {
  const rt = refreshToken.get();
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) return false;
    const tokens = await res.json();
    storeSession(tokens);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  _retried = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;

  let attempt = 0;

  while (true) {
    try {
      const res = await fetch(`${BASE}${path}`, { ...init, headers });

      if (!res.ok) {
        // 401 — try refresh once then retry, otherwise signal session expired
        if (res.status === 401 && !_retried && path !== "/auth/refresh") {
          const refreshed = await tryRefresh();
          if (refreshed) return apiFetch<T>(path, init, true);
          clearSession();
          window.dispatchEvent(new CustomEvent("maschina:session-expired"));
        }

        let message = res.statusText;
        try {
          const body = await res.json();
          message = body.message ?? body.error ?? message;
        } catch {
          // ignore parse errors
        }
        throw new ApiError(res.status, message);
      }

      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      if (!shouldRetry(err, attempt)) throw err;
      await delay(RETRY_BASE_MS * 2 ** attempt);
      attempt++;
    }
  }
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: "GET" }),

  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),

  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),

  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),

  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
