import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gesture, type PoseFrame } from '@ghost-hands/protocol';
import { OverlayRenderer } from '@ghost-hands/renderer';
import {
  openHarnessChannel,
  parseHarnessMessage,
  type HarnessCtrlPayload,
} from './harnessChannel';

const GESTURE_LABEL: Record<number, string> = {
  [Gesture.None]: 'NONE',
  [Gesture.Point]: 'POINT',
  [Gesture.Pinch]: 'PINCH',
  [Gesture.Palm]: 'CLEAR',
  [Gesture.Fist]: 'FIST',
};

/**
 * Two-tab M1 harness — receiver / sharer side.
 * OverlayRenderer + ink over a faux VS Code backdrop; handles pose + ctrl.
 */
export function DevReceiver() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<OverlayRenderer | null>(null);
  const latestPose = useRef<PoseFrame | null>(null);
  const pointerMeta = useRef({ name: 'Harness', color: '#4FC3F7' });
  const currentStrokeId = useRef<string | null>(null);
  const rafRef = useRef(0);
  const framesRef = useRef(0);
  const lastFpsAt = useRef(performance.now());
  const [status, setStatus] = useState({
    name: '—',
    color: '#4FC3F7',
    fps: 0,
    gesture: 'NONE',
  });
  const channel = useMemo(() => openHarnessChannel(), []);

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

    const handleCtrl = (ctrl: HarnessCtrlPayload) => {
      const now = performance.now();
      if (ctrl.t === 'stroke_start') {
        currentStrokeId.current = ctrl.id;
        renderer.ink.start(
          ctrl.id,
          ctrl.x,
          ctrl.y,
          now,
          pointerMeta.current.color,
          'highlight',
        );
      } else if (ctrl.t === 'stroke_end') {
        if (ctrl.kind === 'discard') {
          renderer.ink.discard(ctrl.id);
        } else {
          renderer.ink.end(ctrl.id, ctrl.kind, now);
        }
        if (currentStrokeId.current === ctrl.id) currentStrokeId.current = null;
      } else if (ctrl.t === 'clear') {
        renderer.clearInk(now);
        currentStrokeId.current = null;
      }
    };

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

      // Update fps from the render loop so background-tab throttling of
      // setState-on-message does not leave the readout stuck at 0.
      if (now - lastFpsAt.current >= 1000) {
        const g = pose
          ? (GESTURE_LABEL[pose.gesture] ?? 'NONE')
          : 'NONE';
        setStatus((s) => ({
          ...s,
          fps: framesRef.current,
          gesture: g,
          name: meta.name,
          color: meta.color,
        }));
        framesRef.current = 0;
        lastFpsAt.current = now;
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const onMessage = (ev: MessageEvent) => {
      const parsed = parseHarnessMessage(ev.data);
      if (parsed.hello) {
        pointerMeta.current = {
          name: parsed.hello.name,
          color: parsed.hello.color,
        };
      }
      if (parsed.pose) {
        latestPose.current = parsed.pose;
        framesRef.current += 1;
        // Append ink on message so background-tab rAF suspension does not
        // drop pinch stroke points.
        if (
          parsed.pose.handPresent &&
          parsed.pose.gesture === Gesture.Pinch &&
          currentStrokeId.current
        ) {
          renderer.ink.append(
            currentStrokeId.current,
            parsed.pose.tip.x,
            parsed.pose.tip.y,
            performance.now(),
          );
        }
      }
      if (parsed.ctrl) handleCtrl(parsed.ctrl);
    };
    channel.addEventListener('message', onMessage);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      channel.removeEventListener('message', onMessage);
      // Do not close the shared BroadcastChannel — StrictMode remounts would
      // kill the singleton mid-session (see harnessChannel.ts).
      rendererRef.current = null;
    };
  }, [channel]);

  return (
    <main className="page harness">
      <h1 className="brand">Dev Receiver</h1>
      <p className="lede">
        Open <Link to="/dev/pointer">/dev/pointer</Link> in another tab. Pinch to underline
        code on the mock backdrop; open palm clears.
      </p>
      <canvas ref={canvasRef} className="stage" />
      <p className="status">
        pointer={status.name} · {status.gesture} · ~{status.fps} fps
      </p>
    </main>
  );
}

function drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#333333';
  ctx.fillRect(0, 0, 48, height);
  ctx.fillStyle = '#007acc';
  ctx.fillRect(0, 72, 3, 28);

  ctx.fillStyle = '#252526';
  ctx.fillRect(48, 0, 220, height);
  ctx.fillStyle = '#cccccc';
  ctx.font = '11px ui-sans-serif, system-ui';
  ctx.fillText('EXPLORER', 64, 28);
  ctx.font = '12px ui-sans-serif, system-ui';
  const files = ['src/', '  utils.ts', '  index.ts', 'package.json'];
  files.forEach((f, i) => {
    ctx.fillStyle = f.includes('utils') ? '#ffffff' : '#bbbbbb';
    ctx.fillText(f, 64, 56 + i * 20);
  });

  ctx.fillStyle = '#2d2d2d';
  ctx.fillRect(268, 0, width - 268, 36);
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(280, 4, 110, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px ui-sans-serif, system-ui';
  ctx.fillText('utils.ts', 298, 24);

  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(268, 36, width - 268, height - 36);
  ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
  const lines = [
    { n: 1, text: 'function check(user) {', color: '#d4d4d4' },
    { n: 2, text: '  if (user == null) {          // ← underline me', color: '#ce9178' },
    { n: 3, text: '    return fallback();', color: '#d4d4d4' },
    { n: 4, text: '  }', color: '#d4d4d4' },
    { n: 5, text: '  return user.profile;', color: '#d4d4d4' },
    { n: 6, text: '}', color: '#d4d4d4' },
    { n: 7, text: '', color: '#d4d4d4' },
    { n: 8, text: 'export { check };', color: '#c586c0' },
  ];
  lines.forEach((line, i) => {
    const y = 64 + i * 22;
    ctx.fillStyle = '#858585';
    ctx.fillText(String(line.n), 280, y);
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, 312, y);
  });

  ctx.fillStyle = '#007acc';
  ctx.fillRect(0, height - 24, width, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px ui-sans-serif, system-ui';
  ctx.fillText('Ghost Hands harness · utils.ts', 56, height - 8);
}
