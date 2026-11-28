import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  decodePose,
  formatDisplayCode,
  Gesture,
  type PoseFrame,
} from '@ghost-hands/protocol';
import { OverlayRenderer } from '@ghost-hands/renderer';
import { createSession } from '../lib/api';
import { pointerJoinUrl } from '../lib/config';
import { SignalingClient } from '../lib/signaling';
import type { PipelineCtrlEvent } from '../tracking/posePipeline';

const GESTURE_LABEL: Record<number, string> = {
  [Gesture.None]: 'NONE',
  [Gesture.Point]: 'POINT',
  [Gesture.Pinch]: 'PINCH',
  [Gesture.Palm]: 'CLEAR',
  [Gesture.Fist]: 'FIST',
};

type CtrlPayload = PipelineCtrlEvent | { t: 'hello'; name: string; color: string };

/**
 * Browser-side sharer for local M2 smoke: REST create + WS host + WebRTC answerer.
 */
export function NetworkHost() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OverlayRenderer | null>(null);
  const latestPose = useRef<PoseFrame | null>(null);
  const pointerMeta = useRef({ name: '—', color: '#4FC3F7' });
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const currentStrokeId = useRef<string | null>(null);
  const rafRef = useRef(0);

  const [code, setCode] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [status, setStatus] = useState('Starting…');
  const [gesture, setGesture] = useState('NONE');
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastFpsAt = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new OverlayRenderer(canvas);
    rendererRef.current = renderer;

    const resize = () => {
      const parent = canvas.parentElement;
      const cssW = parent?.clientWidth || canvas.clientWidth || 960;
      const cssH = Math.round(cssW * (10 / 16));
      renderer.resize(cssW, cssH, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const pose = latestPose.current;
      const meta = pointerMeta.current;
      renderer.drawFrame(
        now,
        pose
          ? {
              handPresent: pose.handPresent,
              landmarks: pose.landmarks,
              tip: pose.tip,
              gesture: pose.gesture,
              color: meta.color,
              name: meta.name,
              leftHand: pose.leftHand,
            }
          : null,
        { drawBackdrop },
      );
      if (now - lastFpsAt.current >= 1000) {
        setFps(framesRef.current);
        framesRef.current = 0;
        lastFpsAt.current = now;
        setGesture(pose ? (GESTURE_LABEL[pose.gesture] ?? 'NONE') : 'NONE');
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    let cancelled = false;

    void (async () => {
      try {
        const session = await createSession({ host_name: 'Dev Host', auto_admit: true });
        if (cancelled) return;
        setCode(session.code);
        setDisplayCode(formatDisplayCode(session.code));
        setJoinUrl(pointerJoinUrl(formatDisplayCode(session.code)));
        setStatus('Authenticating…');

        const signaling = new SignalingClient({
          onReady: () => setStatus('Waiting for pointer…'),
          onSdp: async (sdp, from) => {
            if (sdp.type !== 'offer' || !from) return;
            peerIdRef.current = from;
            setStatus('WebRTC answering…');
            const pc = new RTCPeerConnection({ iceServers: session.ice_servers });
            pcRef.current = pc;

            pc.ondatachannel = (ev) => {
              const ch = ev.channel;
              if (ch.label === 'pose') {
                ch.binaryType = 'arraybuffer';
                ch.onmessage = (msg) => {
                  try {
                    const pose = decodePose(msg.data as ArrayBuffer);
                    latestPose.current = pose;
                    framesRef.current += 1;
                    if (
                      pose.handPresent &&
                      pose.gesture === Gesture.Pinch &&
                      currentStrokeId.current
                    ) {
                      renderer.ink.append(
                        currentStrokeId.current,
                        pose.tip.x,
                        pose.tip.y,
                        performance.now(),
                      );
                    }
                  } catch {
                    /* bad frame */
                  }
                };
              }
              if (ch.label === 'ctrl') {
                ch.onmessage = (msg) => {
                  try {
                    const ctrl = JSON.parse(String(msg.data)) as CtrlPayload;
                    handleCtrl(ctrl, renderer, currentStrokeId);
                    if (ctrl.t === 'hello') {
                      pointerMeta.current = { name: ctrl.name, color: ctrl.color };
                      setStatus(`Live · ${ctrl.name}`);
                    }
                  } catch {
                    /* ignore */
                  }
                };
              }
            };

            pc.onicecandidate = (ev) => {
              if (ev.candidate && peerIdRef.current) {
                signaling.sendIce(ev.candidate.toJSON(), peerIdRef.current);
              }
            };

            await pc.setRemoteDescription(sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signaling.sendSdp(pc.localDescription ?? answer, from);
            setStatus('WebRTC connected');
          },
          onIce: async (candidate, from) => {
            if (!pcRef.current || !from || from === 'host') return;
            try {
              await pcRef.current.addIceCandidate(candidate);
            } catch {
              /* ignore */
            }
          },
          onError: (c) => setStatus(`Error: ${c}`),
        });
        signalingRef.current = signaling;
        await signaling.connect(session.code);
        signaling.authHost(session.host_token);
      } catch (err) {
        if (!cancelled) setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      pcRef.current?.close();
      signalingRef.current?.close();
      rendererRef.current = null;
    };
  }, []);

  async function copyLink() {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setStatus('Join link copied');
    } catch {
      setStatus('Copy failed — select link manually');
    }
  }

  return (
    <main className="page harness">
      <h1 className="brand">Network Host (dev)</h1>
      <p className="lede">
        Local smoke sharer over REST + WS + WebRTC. Open{' '}
        <Link to={code ? `/join/${displayCode}` : '/join'}>
          /join/{displayCode || '…'}
        </Link>{' '}
        in another tab (or paste the join link).
      </p>
      {displayCode ? (
        <p className="panel" style={{ fontFamily: 'ui-monospace, monospace' }}>
          Code: <strong>{displayCode}</strong>
          <br />
          <span style={{ wordBreak: 'break-all' }}>{joinUrl}</span>
        </p>
      ) : null}
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <button className="primary" type="button" onClick={() => void copyLink()} disabled={!joinUrl}>
          Copy join link
        </button>
        <Link className="ghost" to="/dev/pointer" style={{ padding: '0.7rem 1.1rem' }}>
          Harness pointer
        </Link>
      </div>
      <canvas ref={canvasRef} className="stage" />
      <p className="status">
        {status} · {pointerMeta.current.name} · {gesture} · ~{fps} fps
      </p>
    </main>
  );
}

function handleCtrl(
  ctrl: CtrlPayload,
  renderer: OverlayRenderer,
  strokeId: MutableRefObject<string | null>,
): void {
  const now = performance.now();
  if (ctrl.t === 'stroke_start') {
    strokeId.current = ctrl.id;
    renderer.ink.start(ctrl.id, ctrl.x, ctrl.y, now, '#4FC3F7', 'highlight');
  } else if (ctrl.t === 'stroke_end') {
    if (ctrl.kind === 'discard') {
      renderer.ink.discard(ctrl.id);
    } else {
      renderer.ink.end(ctrl.id, ctrl.kind, now);
    }
    if (strokeId.current === ctrl.id) strokeId.current = null;
  } else if (ctrl.t === 'clear') {
    renderer.clearInk(now);
    strokeId.current = null;
  }
}

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#252526';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#cccccc';
  ctx.font = '14px ui-sans-serif, system-ui';
  ctx.fillText('Ghost Hands — network host backdrop', 24, 40);
  ctx.fillStyle = '#858585';
  ctx.font = '12px ui-sans-serif, system-ui';
  ctx.fillText('Pinch to ink · palm clears (from pointer)', 24, 64);
  ctx.fillRect(24, height - 48, width - 48, 2);
}