import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  PROTO_VERSION,
  encodePose,
  formatDisplayCode,
  normalizeCode,
  Gesture,
  zeroLandmarks,
} from '@ghost-hands/protocol';
import type { Ctrl } from '@ghost-hands/protocol/generated';
import { HAND_CONNECTIONS } from '@ghost-hands/renderer';
import { createHandTracker } from '../tracking/handTracker';
import { PosePipeline, type PipelineCtrlEvent } from '../tracking/posePipeline';
import { loadMapping } from '../tracking/calibrationStore';
import { SignalingClient } from '../lib/signaling';
import { createPointerPeer, type PointerPeerHandle } from '../rtc/offerer';
import { PoseLatencyTracker } from '../rtc/latency';
import type { IceServerConfig } from '../lib/api';

const GESTURE_LABEL: Record<number, string> = {
  [Gesture.None]: 'NONE',
  [Gesture.Point]: 'POINT',
  [Gesture.Pinch]: 'PINCH',
  [Gesture.Palm]: 'CLEAR',
  [Gesture.Fist]: 'FIST',
};

type ConnStatus =
  | 'connecting'
  | 'pending_approval'
  | 'connecting_webrtc'
  | 'live'
  | 'reconnecting'
  | 'ended'
  | 'denied';

const STATUS_LABEL: Record<ConnStatus, string> = {
  connecting: 'Connecting…',
  pending_approval: 'Waiting for sharer approval…',
  connecting_webrtc: 'Negotiating WebRTC…',
  live: 'Live',
  reconnecting: 'Sharer reconnecting…',
  ended: 'Session ended',
  denied: 'Join denied',
};

const POSE_INTERVAL_MS = 33;

export function Live() {
  const { code: raw } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const preferCamera = search.get('camera') === '1';
  const displayCode = formatDisplayCode(normalizeCode(raw ?? ''));
  const state = location.state as { name?: string; color?: string } | null;
  const name = state?.name ?? localStorage.getItem('gh:name') ?? 'Pointer';
  const color = state?.color ?? localStorage.getItem('gh:color') ?? '#4FC3F7';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideRef = useRef(false);
  const peerRef = useRef<PointerPeerHandle | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const pipelineRef = useRef<PosePipeline | null>(null);
  const latestFrameRef = useRef<ReturnType<PosePipeline['update']>['frame'] | null>(null);
  const latencyRef = useRef(new PoseLatencyTracker());
  const poseIntervalRef = useRef(0);
  const ctrlOpenRef = useRef(false);
  const poseOpenRef = useRef(false);
  const iceServersRef = useRef<IceServerConfig[]>([]);
  const connStatusRef = useRef<ConnStatus>('connecting');

  const [connStatus, setConnStatus] = useState<ConnStatus>('connecting');
  const [gesture, setGesture] = useState('NONE');
  const [source, setSource] = useState('synthetic');
  const [fps, setFps] = useState(0);
  const [tip, setTip] = useState({ x: 0.5, y: 0.5 });
  const [running, setRunning] = useState(true);
  const [detail, setDetail] = useState<string | null>(null);

  const sendCtrl = useCallback((payload: PipelineCtrlEvent | Ctrl.Hello) => {
    const ch = peerRef.current?.ctrlChannel;
    if (!ch || ch.readyState !== 'open') return;
    ch.send(JSON.stringify(payload));
  }, []);

  const setStatus = useCallback((next: ConnStatus) => {
    connStatusRef.current = next;
    setConnStatus(next);
  }, []);

  const startWebRtc = useCallback(
    async (iceServers: IceServerConfig[]) => {
      iceServersRef.current = iceServers;
      setDetail(null);
      setStatus('connecting_webrtc');
      peerRef.current?.close();
      poseOpenRef.current = false;
      ctrlOpenRef.current = false;
      const ice = iceServers as RTCIceServer[];
      const peer = createPointerPeer({
        iceServers: ice,
        onLocalIce: (candidate) => {
          signalingRef.current?.sendIce(candidate as RTCIceCandidateInit | null, 'host');
        },
        onCtrlMessage: () => {
          /* M2 — sharer welcome / display_changed land in M3 */
        },
      });
      peerRef.current = peer;

      peer.poseChannel.onopen = () => {
        poseOpenRef.current = true;
        if (ctrlOpenRef.current) setStatus('live');
      };
      peer.ctrlChannel.onopen = () => {
        ctrlOpenRef.current = true;
        const hello: Ctrl.Hello = {
          t: 'hello',
          name,
          color,
          proto: PROTO_VERSION,
          caps: ['pinch', 'palm'],
          enc: 'bin1',
        };
        peer.ctrlChannel.send(JSON.stringify(hello));
        if (poseOpenRef.current) setStatus('live');
      };

      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      signalingRef.current?.sendSdp(peer.pc.localDescription ?? offer, 'host');
    },
    [color, name, setStatus],
  );

  useEffect(() => {
    const code = normalizeCode(raw ?? '');
    if (!code) return;
    let cancelled = false;

    const signaling = new SignalingClient({
      onPending: () => {
        if (!cancelled) {
          setDetail(null);
          setStatus('pending_approval');
        }
      },
      onDenied: () => {
        if (!cancelled) setStatus('denied');
      },
      onKicked: () => {
        if (cancelled) return;
        setStatus('ended');
        setDetail('You were removed from the session.');
      },
      onSessionEnded: (reason) => {
        if (cancelled) return;
        setStatus('ended');
        setDetail(reason);
        peerRef.current?.close();
      },
      onHostReconnecting: () => {
        if (!cancelled && connStatusRef.current !== 'live') {
          setStatus('reconnecting');
        }
      },
      onHostReady: () => {
        if (cancelled) return;
        // Host (re)connected — resend offer if we're still negotiating.
        if (
          connStatusRef.current === 'connecting_webrtc' ||
          connStatusRef.current === 'reconnecting'
        ) {
          if (iceServersRef.current.length > 0) {
            void startWebRtc(iceServersRef.current);
          }
        }
      },
      onApproved: (msg) => {
        if (cancelled) return;
        setDetail(null);
        void startWebRtc(msg.ice_servers);
      },
      onSdp: async (sdp) => {
        if (cancelled || sdp.type !== 'answer' || !peerRef.current) return;
        try {
          await peerRef.current.setRemoteAnswer(sdp);
        } catch (err) {
          console.warn('setRemoteAnswer failed', err);
        }
      },
      onIce: async (_candidate, from) => {
        if (cancelled || from !== 'host' || !peerRef.current) return;
        try {
          await peerRef.current.addIce(_candidate);
        } catch (err) {
          console.warn('addIce failed', err);
        }
      },
      onError: (c, msg) => {
        if (cancelled) return;
        if (c === 'DISCONNECTED') {
          // Signaling drop while waiting for approval / negotiating — recoverable UX.
          if (connStatusRef.current === 'live') return;
          setStatus('ended');
          setDetail('Signaling disconnected. Refresh to retry.');
          return;
        }
        if (c === 'ROOM_FULL') {
          setStatus('ended');
          setDetail('This session already has a pointer.');
        } else if (c === 'ROOM_NOT_FOUND' || c === 'ROOM_EXPIRED') {
          setStatus('ended');
          setDetail(msg ?? c);
        } else if (msg?.includes('host offline')) {
          setDetail('Waiting for sharer to connect…');
          setStatus('connecting_webrtc');
        }
      },
    });
    signalingRef.current = signaling;

    void (async () => {
      try {
        if (!cancelled) {
          setDetail(null);
          setStatus('connecting');
        }
        await signaling.connect(code);
        if (cancelled) {
          signaling.close();
          return;
        }
        signaling.join({ name, color });
      } catch {
        if (!cancelled) {
          setStatus('ended');
          setDetail('Could not open signaling connection.');
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(poseIntervalRef.current);
      peerRef.current?.close();
      peerRef.current = null;
      signaling.close();
      signalingRef.current = null;
    };
  }, [raw, name, color, startWebRtc, setStatus]);

  useEffect(() => {
    if (!running || connStatus === 'ended' || connStatus === 'denied') return;

    pipelineRef.current = new PosePipeline({ mapping: loadMapping() });
    const tracker = createHandTracker({
      video: videoRef.current ?? undefined,
      previewCanvas: canvasRef.current ?? undefined,
      preferSynthetic: !preferCamera,
    });

    tracker.onFrame((sample, meta) => {
      setSource(meta.source);
      setFps(meta.fps);
      let { frame, events } = pipelineRef.current!.update(sample);
      if (hideRef.current) {
        frame = {
          ...frame,
          handPresent: false,
          landmarks: zeroLandmarks(),
        };
      }
      latestFrameRef.current = frame;
      setTip(frame.tip);
      setGesture(GESTURE_LABEL[frame.gesture] ?? 'NONE');
      for (const ev of events) {
        sendCtrl(ev);
      }
      drawLivePreview(
        canvasRef.current,
        frame.handPresent ? frame.landmarks : null,
        frame.tip,
        GESTURE_LABEL[frame.gesture] ?? 'NONE',
        color,
      );
    });
    void tracker.start();

    poseIntervalRef.current = window.setInterval(() => {
      const ch = peerRef.current?.poseChannel;
      const frame = latestFrameRef.current;
      if (!ch || ch.readyState !== 'open' || !frame) return;
      const bytes = encodePose(frame);
      latencyRef.current.recordSend(frame.seq);
      ch.send(new Uint8Array(bytes).buffer);
      // Local encode→send mark (pose-to-render glass-to-glass needs sharer clock in M3).
      latencyRef.current.recordRender(frame.seq);
      window.__GH_LATENCY__ = { p50: latencyRef.current.getP50Ms() };
    }, POSE_INTERVAL_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        hideRef.current = !hideRef.current;
      }
      if (e.key === 'c' || e.key === 'C') {
        sendCtrl({ t: 'clear', scope: 'mine' });
      }
      if (e.key === 'Escape') {
        signalingRef.current?.leave();
        peerRef.current?.close();
        navigate('/join');
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      tracker.stop();
      window.clearInterval(poseIntervalRef.current);
      window.removeEventListener('keydown', onKey);
    };
  }, [running, color, preferCamera, connStatus, navigate, sendCtrl]);

  return (
    <main className="page">
      <h1 className="brand">Ghost Hands</h1>
      <p className="lede">
        {name} · {displayCode} · <span style={{ color }}>●</span> {source} · {gesture}
      </p>
      <p className="status" aria-live="polite">
        {STATUS_LABEL[connStatus]}
        {detail ? ` — ${detail}` : null}
        {connStatus === 'live' && window.__GH_LATENCY__ ? (
          <> · p50 {Math.round(window.__GH_LATENCY__.p50)} ms</>
        ) : null}
      </p>
      <div className="banner">
        Your video stays on this device. Only hand positions are sent.
      </div>

      <div className="preview-wrap live-preview">
        <video ref={videoRef} className="preview-video" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="stage preview-canvas" width={640} height={400} />
        <span className={`gesture-badge gesture-${gesture.toLowerCase()}`}>{gesture}</span>
        <div className="minimap" aria-hidden>
          <div
            className="minimap-tip"
            style={{ left: `${tip.x * 100}%`, top: `${tip.y * 100}%` }}
          />
        </div>
      </div>

      <p className="status">
        ~{fps} fps · Space hide hand · C clear · Esc leave ·{' '}
        <Link to="/calibrate">Calibrate</Link>
      </p>

      <div className="row">
        <button className="primary" type="button" onClick={() => setRunning((v) => !v)}>
          {running ? 'Pause tracking' : 'Resume tracking'}
        </button>
        <Link className="ghost" to="/dev/host" style={{ textDecoration: 'none' }}>
          Dev host
        </Link>
        <Link className="ghost" to="/join">
          Leave
        </Link>
      </div>
    </main>
  );
}

function drawLivePreview(
  canvas: HTMLCanvasElement | null,
  landmarks: Array<{ x: number; y: number }> | null,
  tip: { x: number; y: number },
  gesture: string,
  color: string,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#15202b';
  ctx.fillRect(0, 0, width, height);

  if (landmarks && landmarks.length >= 21) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = landmarks[a]!;
      const pb = landmarks[b]!;
      ctx.beginPath();
      ctx.moveTo(pa.x * width, pa.y * height);
      ctx.lineTo(pb.x * width, pb.y * height);
      ctx.stroke();
    }
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tip.x * width, tip.y * height, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8eef4';
  ctx.font = '12px ui-sans-serif, system-ui';
  ctx.fillText(gesture, tip.x * width + 10, tip.y * height + 4);
}