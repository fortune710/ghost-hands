import { PROTO_VERSION, normalizeCode } from '@ghost-hands/protocol';
import { WS_BASE_URL } from './config';
import type { IceServerConfig } from './api';

export type SignalingHandlers = {
  onReady?: (sessionId?: string) => void;
  onJoinRequest?: (msg: { peer: string; name: string; color: string }) => void;
  onPeerLeft?: (peer: string, reason: string) => void;
  onSdp?: (sdp: RTCSessionDescriptionInit, from: string) => void;
  onIce?: (candidate: RTCIceCandidateInit | null, from: string) => void;
  onSessionEnded?: (reason: string) => void;
  onError?: (code: string, msg?: string) => void;
};

/** Host-side signaling client for the desktop control/overlay windows. */
export class HostSignaling {
  private ws: WebSocket | null = null;
  private closed = false;

  constructor(private readonly handlers: SignalingHandlers) {}

  async connect(code: string): Promise<void> {
    const norm = normalizeCode(code);
    this.closed = false;
    const url = `${WS_BASE_URL}/ws/v1/sessions/${encodeURIComponent(norm)}`;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket failed'));
      ws.onclose = () => {
        if (!this.closed) this.handlers.onError?.('DISCONNECTED');
      };
      ws.onmessage = (ev) => this.onMessage(ev);
    });
  }

  auth(hostToken: string): void {
    this.send({ t: 'auth', proto: PROTO_VERSION, host_token: hostToken });
  }

  approve(peer: string): void {
    this.send({ t: 'approve', peer });
  }

  deny(peer: string): void {
    this.send({ t: 'deny', peer });
  }

  sendSdp(sdp: RTCSessionDescriptionInit, to: string): void {
    this.send({ t: 'sdp', to, sdp });
  }

  sendIce(candidate: RTCIceCandidateInit | null, to: string): void {
    this.send({ t: 'ice', to, candidate });
  }

  end(): void {
    this.send({ t: 'end' });
    this.close();
  }

  close(): void {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private send(payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private onMessage(ev: MessageEvent<string>): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      return;
    }
    const t = msg.t;
    if (t === 'ready') {
      this.handlers.onReady?.(msg.session_id as string | undefined);
      return;
    }
    if (t === 'join_request') {
      this.handlers.onJoinRequest?.({
        peer: String(msg.peer ?? ''),
        name: String(msg.name ?? ''),
        color: String(msg.color ?? '#4FC3F7'),
      });
      return;
    }
    if (t === 'peer_left') {
      this.handlers.onPeerLeft?.(String(msg.peer ?? ''), String(msg.reason ?? 'leave'));
      return;
    }
    if (t === 'sdp' && msg.sdp) {
      this.handlers.onSdp?.(msg.sdp as RTCSessionDescriptionInit, String(msg.from ?? ''));
      return;
    }
    if (t === 'ice') {
      const candidate =
        msg.candidate === null || msg.candidate === undefined
          ? null
          : (msg.candidate as RTCIceCandidateInit);
      this.handlers.onIce?.(candidate, String(msg.from ?? ''));
      return;
    }
    if (t === 'session_ended') {
      this.handlers.onSessionEnded?.(String(msg.reason ?? 'ended'));
      return;
    }
    if (t === 'error') {
      this.handlers.onError?.(String(msg.code ?? 'ERROR'), msg.msg as string | undefined);
      return;
    }
    if (t === 'ping') {
      this.send({ t: 'pong' });
    }
  }
}

export type { IceServerConfig };
