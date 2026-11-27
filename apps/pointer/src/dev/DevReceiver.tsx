import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gesture, type PoseFrame } from '@ghost-hands/protocol';
import { drawGhostHand, landmarksToPixels } from '@ghost-hands/renderer';
import { openHarnessChannel, parseHarnessMessage } from './harnessChannel';

/**
 * Two-tab M0 harness — receiver / sharer side.
 * Draws ghost hand over a faux VS Code screenshot using BroadcastChannel poses.
 */
export function DevReceiver() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const [meta, setMeta] = useState({ name: '—', color: '#4FC3F7', seq: 0, fps: 0 });
  const channel = useMemo(() => openHarnessChannel(), []);
  const framesRef = useRef(0);
  const lastFpsAt = useRef(performance.now());

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const parsed = parseHarnessMessage(ev.data);
      if (parsed.hello) {
        setMeta((m) => ({ ...m, name: parsed.hello!.name, color: parsed.hello!.color }));
      }
      if (parsed.pose) {
        renderPose(canvasRef.current, parsed.pose, meta.color, trailRef.current);
        framesRef.current += 1;
        setMeta((m) => ({ ...m, seq: parsed.pose!.seq }));
        const now = performance.now();
        if (now - lastFpsAt.current >= 1000) {
          setMeta((m) => ({ ...m, fps: framesRef.current }));
          framesRef.current = 0;
          lastFpsAt.current = now;
        }
      }
    };
    channel.addEventListener('message', onMessage);
    drawBackdrop(canvasRef.current);
    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
    };
  }, [channel, meta.color]);

  return (
    <main className="page harness">
      <h1 className="brand">Dev Receiver</h1>
      <p className="lede">
        Open <Link to="/dev/pointer">/dev/pointer</Link> in another tab and start streaming. No
        Tauri or backend required.
      </p>
      <canvas ref={canvasRef} className="stage" width={960} height={600} />
      <p className="status">
        pointer={meta.name} · color={meta.color} · seq={meta.seq} · ~{meta.fps} fps
      </p>
    </main>
  );
}

function drawBackdrop(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, width, height);
  // faux activity bar + sidebar
  ctx.fillStyle = '#333333';
  ctx.fillRect(0, 0, 48, height);
  ctx.fillStyle = '#252526';
  ctx.fillRect(48, 0, 220, height);
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(268, 0, width - 268, height);
  // code lines
  ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
  const lines = [
    'function check(user) {',
    '  if (user == null) {          // ← underline me',
    '    return fallback();',
    '  }',
    '  return user.profile;',
    '}',
  ];
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 1 ? '#ce9178' : '#d4d4d4';
    ctx.fillText(line, 292, 72 + i * 22);
  });
  ctx.fillStyle = '#858585';
  ctx.fillText('utils.ts — Ghost Hands harness backdrop', 292, height - 24);
}

function renderPose(
  canvas: HTMLCanvasElement | null,
  pose: PoseFrame,
  color: string,
  trail: Array<{ x: number; y: number }>,
) {
  if (!canvas || !pose.handPresent) return;
  drawBackdrop(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Map tip (display space) + landmarks (camera space) into canvas pixels.
  // For the harness we draw landmarks in camera space over the stage, and tip laser in display space.
  const lmPx = landmarksToPixels(pose.landmarks, canvas.width, canvas.height);
  const tipPx = { x: pose.tip.x * canvas.width, y: pose.tip.y * canvas.height };
  trail.push(tipPx);
  if (trail.length > 6) trail.shift();

  drawGhostHand({
    ctx,
    landmarksPx: lmPx,
    tipPx,
    gesture: pose.gesture ?? Gesture.Point,
    style: { color, opacity: 0.45 },
    tipTrail: [...trail],
    name: 'Harness',
  });
}
