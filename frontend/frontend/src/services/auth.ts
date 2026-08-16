/**
 * Workspace token handling (backend M5: one bearer token == one workspace).
 *
 * - Token lives in localStorage under TOKEN_KEY.
 * - A `?token=` query parameter on first load is adopted and stripped from
 *   the URL, so participants can be handed a single link.
 * - apiClient attaches `Authorization: Bearer <token>`; on 401 it dispatches
 *   the UNAUTHORIZED_EVENT so <TokenGate> can prompt for a token.
 */

export const TOKEN_KEY = 'pl_workspace_token';
export const UNAUTHORIZED_EVENT = 'pl:unauthorized';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode etc. -- token then lives only for this page load */
  }
}

/** Adopt ?token=... from the URL (once) and remove it from the address bar. */
export function adoptTokenFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const t = url.searchParams.get('token');
  if (!t) return;
  setToken(t);
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

/** Append ?token= to a direct resource URL (PDFs) that cannot carry headers. */
export function withToken(url: string): string {
  const t = getToken();
  if (!t) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(t);
}

export function notifyUnauthorized(): void {
  window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}
