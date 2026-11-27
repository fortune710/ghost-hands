import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gesture, type PoseFrame, zeroLandmarks } from '@ghost-hands/protocol';
import { DEFAULT_ACTIVE_ZONE, mapToDisplay } from '@ghost-hands/gestures';
import { openHarnessChannel, publishPose } from './harnessChannel';

/**
 * Two-tab M0 harness — pointer side.
 * Mouse position stands in for the index fingertip; BroadcastChannel carries 96 B pose frames.
 */
export function DevPointer() {
  const [live, setLive] = useState(false);
  const [fps, setFps] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef({ x: 0.5, y: 0.5 });
  const seqRef = useRef(0);
  const channel = useMemo(() => openHarnessChannel(), []);

  useEffect(() => {
    return () => channel.close();
  }, [channel]);

  useEffect(() => {
    if (!live) return;
    const started = performance.now();
    let frames = 0;
    let lastFpsAt = started;
    const id = window.setInterval(() => {
      const t = performance.now() - started;
      const cam = tipRef.current;
      const tip = mapToDisplay(cam, DEFAULT_ACTIVE_ZONE);
      const landmarks = zeroLandmarks().map((_, i) => {
        // crude fan around tip for a readable ghost hand in the receiver
        const a = (i / 21) * Math.PI * 2;
        return {
          x: Math.min(1, Math.max(0, cam.x + Math.cos(a) * 0.04)),
          y: Math.min(1, Math.max(0, cam.y + Math.sin(a) * 0.04)),
        };
      });
      landmarks[8] = { ...cam };

      const frame: PoseFrame = {
        version: 1,
        handPresent: true,
        leftHand: false,
        gesture: Gesture.Point,
        seq: seqRef.current++ & 0xffff,
        tCaptureMs: Math.floor(t),
        tip,
        landmarks,
      };
      publishPose(channel, frame);
      frames += 1;
      if (performance.now() - lastFpsAt >= 1000) {
        setFps(frames);
        frames = 0;
        lastFpsAt = performance.now();
      }
      drawPreview(canvasRef.current, cam);
    }, 1000 / 30);

    channel.postMessage({ kind: 'hello', name: 'Harness', color: '#4FC3F7' });
    return () => window.clearInterval(id);
  }, [live, channel]);

  return (
    <main className="page harness">
      <h1 className="brand">Dev Pointer</h1>
      <p className="lede">
        Move the mouse over the stage. Pose frames (96 B) stream over BroadcastChannel to{' '}
        <Link to="/dev/receiver">/dev/receiver</Link>.
      </p>
      <canvas
        ref={canvasRef}
        className="stage"
        width={960}
        height={600}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          tipRef.current = {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
          };
          if (!live) drawPreview(e.currentTarget, tipRef.current);
        }}
      />
      <div className="row">
        <button className="primary" type="button" onClick={() => setLive((v) => !v)}>
          {live ? 'Stop' : 'Start streaming'}
        </button>
        <Link className="ghost" to="/join">
          Exit
        </Link>
      </div>
      <p className="status">
        {live ? `live · ~${fps} fps · zone ${DEFAULT_ACTIVE_ZONE.x0}-${DEFAULT_ACTIVE_ZONE.x1}` : 'idle'}
      </p>
    </main>
  );
}

function drawPreview(canvas: HTMLCanvasElement | null, tip: { x: number; y: number }) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#15202b';
  ctx.fillRect(0, 0, width, height);

  // active zone guide
  ctx.strokeStyle = '#2a5a78';
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(
    DEFAULT_ACTIVE_ZONE.x0 * width,
    DEFAULT_ACTIVE_ZONE.y0 * height,
    (DEFAULT_ACTIVE_ZONE.x1 - DEFAULT_ACTIVE_ZONE.x0) * width,
    (DEFAULT_ACTIVE_ZONE.y1 - DEFAULT_ACTIVE_ZONE.y0) * height,
  );
  ctx.setLineDash([]);

  ctx.fillStyle = '#4FC3F7';
  ctx.beginPath();
  ctx.arc(tip.x * width, tip.y * height, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8eef4';
  ctx.font = '14px ui-sans-serif, system-ui';
  ctx.fillText('index tip (mouse)', tip.x * width + 14, tip.y * height + 4);
}
