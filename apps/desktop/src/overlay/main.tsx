import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { decodePose, Gesture, type PoseFrame } from '@ghost-hands/protocol';
import { OverlayRenderer } from '@ghost-hands/renderer';
import { createAnswerer, type AnswererHandle } from '../lib/answerer';
import { HostSignaling } from '../lib/signaling';
import {
  loadSession,
  openBridge,
  postBridge,
  type DesktopSessionState,
} from '../lib/sessionBridge';

const GESTURE_LABEL: Record<number, string> = {
  [Gesture.None]: 'NONE',
  [Gesture.Point]: 'POINT',
  [Gesture.Pinch]: 'PINCH',
  [Gesture.Palm]: 'CLEAR',
  [Gesture.Fist]: 'FIST',
};

/**
 * Overlay window owns host WS + WebRTC answerer and renders ghost hand + ink.
 * Control window creates the session and forwards approve/deny over the bridge.
 */
function OverlayApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestPose = useRef<PoseFrame | null>(null);
  const pointerMeta = useRef({ name: 'Pointer', color: '#4FC3F7' });
  const strokeId = useRef<string | null>(null);
  const answererRef = useRef<AnswererHandle | null>(null);
  const signalingRef = useRef<HostSignaling | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const autoAdmitRef = useRef(true);
  const [pill, setPill] = useState('Waiting for session…');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new OverlayRenderer(canvas);

    const resize = () => {
      renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
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
      );
    };
    raf = requestAnimationFrame(loop);

    const teardown = () => {
      signalingRef.current?.close();
      signalingRef.current = null;
      answererRef.current?.close();
      answererRef.current = null;
      latestPose.current = null;
    };

    const attachSession = async (session: DesktopSessionState) => {
      teardown();
      autoAdmitRef.current = session.auto_admit;
      setPill(`Waiting for pointer… ${session.display_code}`);
      postBridge({ type: 'status', status: `Waiting for pointer… ${session.display_code}` });

      const signaling = new HostSignaling({
        onReady: () => {
          setPill(`Waiting for pointer… ${session.display_code}`);
        },
        onJoinRequest: (msg) => {
          peerIdRef.current = msg.peer;
          pointerMeta.current = { name: msg.name, color: msg.color };
          if (autoAdmitRef.current) {
            setPill(`${msg.name} is pointing`);
            postBridge({ type: 'pointer', pointer: msg });
            postBridge({ type: 'status', status: `${msg.name} is pointing`, pending: null });
          } else {
            postBridge({
              type: 'status',
              status: `${msg.name} wants to point`,
              pending: msg,
            });
          }
        },
        onSdp: async (sdp, from) => {
          if (sdp.type !== 'offer') return;
          peerIdRef.current = from;
          const answerer = createAnswerer({
            iceServers: session.ice_servers,
            onLocalIce: (candidate) => {
              if (peerIdRef.current) signaling.sendIce(candidate, peerIdRef.current);
            },
            onPose: (buf) => {
              try {
                const pose = decodePose(buf);
                latestPose.current = pose;
                if (pose.handPresent && pose.gesture === Gesture.Pinch && strokeId.current) {
                  renderer.ink.append(strokeId.current, pose.tip.x, pose.tip.y, performance.now());
                }
              } catch {
                /* ignore */
              }
            },
            onCtrl: (raw) => {
              try {
                const ctrl = JSON.parse(raw) as {
                  t: string;
                  name?: string;
                  color?: string;
                  id?: string;
                  x?: number;
                  y?: number;
                  kind?: 'arrow' | 'free' | 'discard';
                };
                const now = performance.now();
                if (ctrl.t === 'hello' && ctrl.name && ctrl.color) {
                  pointerMeta.current = { name: ctrl.name, color: ctrl.color };
                  setPill(`${ctrl.name} is pointing`);
                } else if (
                  ctrl.t === 'stroke_start' &&
                  ctrl.id != null &&
                  ctrl.x != null &&
                  ctrl.y != null
                ) {
                  strokeId.current = ctrl.id;
                  renderer.ink.start(
                    ctrl.id,
                    ctrl.x,
                    ctrl.y,
                    now,
                    pointerMeta.current.color,
                    'highlight',
                  );
                } else if (ctrl.t === 'stroke_end' && ctrl.id) {
                  if (ctrl.kind === 'discard') renderer.ink.discard(ctrl.id);
                  else renderer.ink.end(ctrl.id, ctrl.kind ?? 'free', now);
                  if (strokeId.current === ctrl.id) strokeId.current = null;
                } else if (ctrl.t === 'clear') {
                  renderer.clearInk(now);
                  strokeId.current = null;
                }
              } catch {
                /* ignore */
              }
            },
          });
          answererRef.current = answerer;
          const answer = await answerer.handleOffer(sdp);
          signaling.sendSdp(answer, from);
        },
        onIce: async (candidate) => {
          await answererRef.current?.addIce(candidate);
        },
        onPeerLeft: () => {
          latestPose.current = null;
          setPill(`Waiting for pointer… ${session.display_code}`);
          postBridge({
            type: 'status',
            status: `Waiting for pointer… ${session.display_code}`,
            pending: null,
          });
          postBridge({ type: 'pointer', pointer: null });
        },
        onSessionEnded: () => {
          setPill('Session ended');
          latestPose.current = null;
          answererRef.current?.close();
          answererRef.current = null;
          signalingRef.current?.close();
          signalingRef.current = null;
          postBridge({ type: 'status', status: 'Session ended', pending: null });
        },
      });
      signalingRef.current = signaling;
      await signaling.connect(session.code);
      signaling.auth(session.host_token);
    };

    const existing = loadSession();
    if (existing && existing.status !== 'ended') {
      void attachSession(existing);
    }

    const channel = openBridge((msg) => {
      if (msg.type === 'session') {
        void attachSession(msg.state);
      } else if (msg.type === 'clear' || msg.type === 'end') {
        signalingRef.current?.end();
        teardown();
        setPill('Waiting for session…');
      } else if (msg.type === 'approve') {
        signalingRef.current?.approve(msg.peer);
        postBridge({ type: 'status', status: 'Pointer approved', pending: null });
      } else if (msg.type === 'deny') {
        signalingRef.current?.deny(msg.peer);
        postBridge({ type: 'status', status: 'Pointer denied', pending: null });
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      channel?.close();
      teardown();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          background: 'transparent',
        }}
      />
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          padding: '6px 12px',
          borderRadius: 14,
          background: 'rgba(15,20,25,0.55)',
          color: '#e8eef4',
          font: '12px ui-sans-serif, system-ui',
          pointerEvents: 'none',
        }}
      >
        {pill}
        {latestPose.current ? ` · ${GESTURE_LABEL[latestPose.current.gesture]}` : ''}
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
