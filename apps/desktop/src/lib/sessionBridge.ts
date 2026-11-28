/** Cross-window session handoff between control and overlay (localStorage + BroadcastChannel). */

export const SESSION_STORAGE_KEY = 'gh:desktop:session';
export const SESSION_CHANNEL = 'gh-desktop-session';

export interface DesktopSessionState {
  code: string;
  display_code: string;
  join_url: string;
  host_token: string;
  ice_servers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
  auto_admit: boolean;
  status: 'waiting' | 'live' | 'ended';
  pointer?: { peer: string; name: string; color: string } | null;
}

export type BridgeMessage =
  | { type: 'session'; state: DesktopSessionState }
  | { type: 'clear' }
  | { type: 'approve'; peer: string }
  | { type: 'deny'; peer: string }
  | { type: 'end' }
  | { type: 'pointer'; pointer: { peer: string; name: string; color: string } | null }
  | { type: 'status'; status: string; pending?: { peer: string; name: string; color: string } | null };

export function saveSession(state: DesktopSessionState): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
  postBridge({ type: 'session', state });
}

export function loadSession(): DesktopSessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DesktopSessionState;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  postBridge({ type: 'clear' });
}

export function postBridge(msg: BridgeMessage): void {
  try {
    const ch = new BroadcastChannel(SESSION_CHANNEL);
    ch.postMessage(msg);
    ch.close();
  } catch {
    /* ignore */
  }
}

export function openBridge(handler: (msg: BridgeMessage) => void): BroadcastChannel | null {
  try {
    const ch = new BroadcastChannel(SESSION_CHANNEL);
    ch.onmessage = (ev: MessageEvent<BridgeMessage>) => {
      if (ev.data) handler(ev.data);
    };
    return ch;
  } catch {
    return null;
  }
}
