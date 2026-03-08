const KEY = "maschina_token";

export const token = {
  get: (): string | null => localStorage.getItem(KEY),
  set: (t: string): void => localStorage.setItem(KEY, t),
  clear: (): void => localStorage.removeItem(KEY),
};
