/**
 * REST + WebSocket base URLs.
 *
 * Local default: same-origin (Vite proxies `/api` + `/ws` to :8000) so
 * `localhost` vs `127.0.0.1` never break CORS.
 * Staging/prod: set `VITE_API_BASE_URL` + `VITE_WS_BASE_URL` on Vercel.
 */

export function apiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (raw && raw.length > 0) return raw.replace(/\/$/, '');
  // Same-origin → Vite / FastAPI proxy
  return '';
}

export function wsBaseUrl(): string {
  const raw = import.meta.env.VITE_WS_BASE_URL?.trim();
  if (raw && raw.length > 0) return raw.replace(/\/$/, '');
  const api = apiBaseUrl();
  if (api.startsWith('https://')) return `wss://${api.slice('https://'.length)}`;
  if (api.startsWith('http://')) return `ws://${api.slice('http://'.length)}`;
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}`;
  }
  return 'ws://localhost:5173';
}

export function pointerJoinUrl(code: string): string {
  const base =
    import.meta.env.VITE_POINTER_BASE_URL?.trim().replace(/\/$/, '') ??
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/join/${code}`;
}
