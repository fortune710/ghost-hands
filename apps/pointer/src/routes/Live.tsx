import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { formatDisplayCode, normalizeCode, Gesture, zeroLandmarks } from '@ghost-hands/protocol';
import { HAND_CONNECTIONS } from '@ghost-hands/renderer';
import { createHandTracker } from '../tracking/handTracker';
import { PosePipeline } from '../tracking/posePipeline';
import { loadMapping } from '../tracking/calibrationStore';

const GESTURE_LABEL: Record<number, string> = {
  [Gesture.None]: 'NONE',
  [Gesture.Point]: 'POINT',
  [Gesture.Pinch]: 'PINCH',
  [Gesture.Palm]: 'CLEAR',
  [Gesture.Fist]: 'FIST',
};

/**
 * Live session — M1 wires HandTracker + PosePipeline + preview.
 * WebRTC offerer lands in M2.
 */
export function Live() {
  const { code: raw } = useParams();
  const location = useLocation();
  const state = location.state as { name?: string; color?: string } | null;
  const displayCode = formatDisplayCode(normalizeCode(raw ?? ''));
  const name = state?.name ?? localStorage.getItem('gh:name') ?? 'Pointer';
  const color = state?.color ?? localStorage.getItem('gh:color') ?? '#4FC3F7';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideRef = useRef(false);
  const [gesture, setGesture] = useState('NONE');
  const [source, setSource] = useState('synthetic');
  const [fps, setFps] = useState(0);
  const [tip, setTip] = useState({ x: 0.5, y: 0.5 });
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const pipeline = new PosePipeline({ mapping: loadMapping() });
    const tracker = createHandTracker({
      video: videoRef.current ?? undefined,
      previewCanvas: canvasRef.current ?? undefined,
      preferSynthetic: true,
    });

    tracker.onFrame((sample, meta) => {
      setSource(meta.source);
      setFps(meta.fps);
      let { frame } = pipeline.update(sample);
      if (hideRef.current) {
        frame = {
          ...frame,
          handPresent: false,
          landmarks: zeroLandmarks(),
        };
      }
      setTip(frame.tip);
      setGesture(GESTURE_LABEL[frame.gesture] ?? 'NONE');
      drawLivePreview(
        canvasRef.current,
        frame.handPresent ? frame.landmarks : null,
        frame.tip,
        GESTURE_LABEL[frame.gesture] ?? 'NONE',
        color,
      );
    });
    void tracker.start();

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        hideRef.current = !hideRef.current;
      }
      if (e.key === 'c' || e.key === 'C') {
        // clear stub — sharer clear arrives via DataChannel in M2
      }
      if (e.key === 'k' || e.key === 'K' || e.key === 'Escape') {
        // K / Esc stubs for future mute / leave
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      tracker.stop();
      window.removeEventListener('keydown', onKey);
    };
  }, [running, color]);

  return (
    <main className="page">
      <h1 className="brand">Ghost Hands</h1>
      <p className="lede">
        {name} · {displayCode} · <span style={{ color }}>●</span> {source} · {gesture}
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
        ~{fps} fps · Space hide hand · C clear (M2) ·{' '}
        <Link to="/calibrate">Calibrate</Link>
      </p>

      <div className="row">
        <button className="primary" type="button" onClick={() => setRunning((v) => !v)}>
          {running ? 'Pause tracking' : 'Resume tracking'}
        </button>
        <Link className="ghost" to="/dev/pointer" style={{ textDecoration: 'none' }}>
          Open harness
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
