import { PROTO_VERSION, normalizeCode } from '@ghost-hands/protocol';
import { wsBaseUrl } from './config';
import type { IceServerConfig } from './api';

export interface ApprovedMessage {
  peer: string;
  pointer_token: string;
  ice_servers: IceServerConfig[];
  ice_ttl_s: number;
}

export type JoinRequestMessage = {
  peer: string;
  name: string;
  color: string;
};

export type SignalingHandlers = {
  onApproved?: (msg: ApprovedMessage) => void;
  onPending?: () => void;
  onDenied?: () => void;
  onKicked?: () => void;
  onSessionEnded?: (reason: string) => void;
  onSdp?: (sdp: RTCSessionDescriptionInit, from: string) => void;
  onIce?: (candidate: RTCIceCandidateInit | null, from: string) => void;
  onError?: (code: string, msg?: string) => void;
  onHostReconnecting?: () => void;
  onHostReady?: () => void;
  onReady?: (sessionId?: string) => void;
  onJoinRequest?: (msg: JoinRequestMessage) => void;
  onPeerLeft?: (peer: string, reason: string) => void;
};

export class SignalingClient {
  private ws: WebSocket | null = null;
  private code = '';
  private peerId: string | null = null;
  private closed = false;

  constructor(private readonly handlers: SignalingHandlers) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(code: string): Promise<void> {
    const norm = normalizeCode(code);
    this.code = norm;
    this.closed = false;
    const url = `${wsBaseUrl()}/ws/v1/sessions/${encodeURIComponent(norm)}`;
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('WebSocket failed'));
      ws.onclose = () => {
        if (!this.closed) {
          this.handlers.onError?.('DISCONNECTED', 'signaling closed');
        }
      };
      ws.onmessage = (ev) => this.handleMessage(ev);
    });
  }

  join(opts: { name: string; color: string }): void {
    this.send({
      t: 'join',
      proto: PROTO_VERSION,
      name: opts.name,
      color: opts.color,
    });
  }

  authHost(hostToken: string): void {
    this.send({ t: 'auth', proto: PROTO_VERSION, host_token: hostToken });
  }

  approve(peer: string): void {
    this.send({ t: 'approve', peer });
  }

  sendSdp(sdp: RTCSessionDescriptionInit, to: 'host' | string = 'host'): void {
    this.send({ t: 'sdp', to, sdp });
  }

  sendIce(candidate: RTCIceCandidateInit | null, to: 'host' | string = 'host'): void {
    this.send({ t: 'ice', to, candidate });
  }

  deny(peer: string): void {
    this.send({ t: 'deny', peer });
  }

  kick(peer: string): void {
    this.send({ t: 'kick', peer });
  }

  end(): void {
    this.send({ t: 'end' });
    this.close();
  }

  leave(): void {
    this.send({ t: 'leave' });
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private handleMessage(ev: MessageEvent<string>): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      this.handlers.onError?.('BAD_MESSAGE', 'invalid json');
      return;
    }
    const t = msg.t;
    if (t === 'approved') {
      this.peerId = String(msg.peer ?? '');
      this.handlers.onApproved?.({
        peer: this.peerId,
        pointer_token: String(msg.pointer_token ?? ''),
        ice_servers: (msg.ice_servers as IceServerConfig[]) ?? [],
        ice_ttl_s: Number(msg.ice_ttl_s ?? 0),
      });
      return;
    }
    if (t === 'pending') {
      this.handlers.onPending?.();
      return;
    }
    if (t === 'denied') {
      this.handlers.onDenied?.();
      this.close();
      return;
    }
    if (t === 'kicked') {
      this.handlers.onKicked?.();
      this.close();
      return;
    }
    if (t === 'session_ended') {
      this.handlers.onSessionEnded?.(String(msg.reason ?? 'ended'));
      this.close();
      return;
    }
    if (t === 'host_reconnecting') {
      this.handlers.onHostReconnecting?.();
      return;
    }
    if (t === 'host_ready') {
      this.handlers.onHostReady?.();
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
    if (t === 'error') {
      this.handlers.onError?.(String(msg.code ?? 'ERROR'), msg.msg as string | undefined);
      return;
    }
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
    if (t === 'ping') {
      this.send({ t: 'pong' });
      return;
    }
  }
}