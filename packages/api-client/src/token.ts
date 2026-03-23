const ACCESS_KEY = "maschina_token";
const REFRESH_KEY = "maschina_refresh_token";
const SESSION_KEY = "maschina_session_id";

export const token = {
  get: (): string | null => localStorage.getItem(ACCESS_KEY),
  set: (t: string): void => localStorage.setItem(ACCESS_KEY, t),
  clear: (): void => localStorage.removeItem(ACCESS_KEY),
};

export const refreshToken = {
  get: (): string | null => localStorage.getItem(REFRESH_KEY),
  set: (t: string): void => localStorage.setItem(REFRESH_KEY, t),
  clear: (): void => localStorage.removeItem(REFRESH_KEY),
};

export const sessionId = {
  get: (): string | null => localStorage.getItem(SESSION_KEY),
  set: (id: string): void => localStorage.setItem(SESSION_KEY, id),
  clear: (): void => localStorage.removeItem(SESSION_KEY),
};

export function storeSession(tokens: {
  accessToken: string;
  refreshToken: string;
  sessionId?: string;
}): void {
  token.set(tokens.accessToken);
  refreshToken.set(tokens.refreshToken);
  if (tokens.sessionId) sessionId.set(tokens.sessionId);
}

export function clearSession(): void {
  token.clear();
  refreshToken.clear();
  sessionId.clear();
}
