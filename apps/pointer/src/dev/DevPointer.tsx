import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gesture, type PoseFrame, zeroLandmarks } from '@ghost-hands/protocol';
import { HAND_CONNECTIONS } from '@ghost-hands/renderer';
import { mapToDisplay, zoneFromTwoPoints } from '@ghost-hands/gestures';
import { openHarnessChannel, publishCtrl, publishPose } from './harnessChannel';
import { createHandTracker, type TrackerSource } from '../tracking/handTracker';
import { PosePipeline } from '../tracking/posePipeline';
import { loadMapping, loadZone, saveZone } from '../tracking/calibrationStore';
import type { SyntheticMode } from '../tracking/syntheticHand';

type InputMode = 'camera' | 'synthetic' | 'mouse';

const GESTURE_LABEL: Record<number, string> = {
  [Gesture.None]: 'NONE',
  [Gesture.Point]: 'POINT',
  [Gesture.Pinch]: 'PINCH',
  [Gesture.Palm]: 'CLEAR',
  [Gesture.Fist]: 'FIST',
};

/**
 * Two-tab M1 harness — pointer side.
 * Camera / Synthetic / Mouse → PosePipeline → BroadcastChannel pose + ctrl.
 */
export function DevPointer() {
  const [live, setLive] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('synthetic');
  const [synthMode, setSynthMode] = useState<SyntheticMode>('point');
  const [fps, setFps] = useState(0);
  const [source, setSource] = useState<TrackerSource>('synthetic');
  const [gestureLabel, setGestureLabel] = useState('NONE');
  const [calibMsg, setCalibMsg] = useState<string | null>(null);
  const [hideHand, setHideHand] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tipRef = useRef({ x: 0.5, y: 0.5 });
  const seqRef = useRef(0);
  const pipelineRef = useRef<PosePipeline | null>(null);
  const trackerRef = useRef<ReturnType<typeof createHandTracker> | null>(null);
  const hideHandRef = useRef(false);
  const channel = useMemo(() => openHarnessChannel(), []);

  useEffect(() => {
    hideHandRef.current = hideHand;
  }, [hideHand]);

  useEffect(() => {
    return () => channel.close();
  }, [channel]);

  // Hotkeys: C clear, Space hide hand
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setHideHand((v) => !v);
      }
      if (e.key === 'c' || e.key === 'C') {
        publishCtrl(channel, { t: 'clear', scope: 'mine' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channel]);

  useEffect(() => {
    if (!live) {
      trackerRef.current?.stop();
      trackerRef.current = null;
      return;
    }

    pipelineRef.current = new PosePipeline({ mapping: loadMapping() });
    channel.postMessage({ kind: 'hello', name: 'Harness', color: '#4FC3F7' });

    if (inputMode === 'mouse') {
      const started = performance.now();
      let frames = 0;
      let lastFpsAt = started;
      const id = window.setInterval(() => {
        const t = performance.now() - started;
        const cam = tipRef.current;
        const tip = mapToDisplay(cam, loadZone());
        const landmarks = zeroLandmarks().map((_, i) => {
          const a = (i / 21) * Math.PI * 2;
          return {
            x: Math.min(1, Math.max(0, cam.x + Math.cos(a) * 0.04)),
            y: Math.min(1, Math.max(0, cam.y + Math.sin(a) * 0.04)),
          };
        });
        landmarks[8] = { ...cam };

        const frame: PoseFrame = {
          version: 1,
          handPresent: !hideHandRef.current,
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
        drawPreview(canvasRef.current, cam, null, 'POINT');
      }, 1000 / 30);
      setSource('synthetic');
      setGestureLabel('POINT');
      return () => window.clearInterval(id);
    }

    const tracker = createHandTracker({
      video: videoRef.current ?? undefined,
      previewCanvas: canvasRef.current ?? undefined,
      preferSynthetic: inputMode === 'synthetic',
    });
    trackerRef.current = tracker;
    tracker.setSyntheticMode(synthMode);
    tracker.onFrame((sample, meta) => {
      setSource(meta.source);
      setFps(meta.fps);
      const pipeline = pipelineRef.current;
      if (!pipeline) return;

      let result = pipeline.update(sample);
      if (hideHandRef.current) {
        result = {
          frame: { ...result.frame, handPresent: false, landmarks: zeroLandmarks() },
          events: result.events,
        };
      }
      publishPose(channel, result.frame);
      for (const ev of result.events) publishCtrl(channel, ev);
      setGestureLabel(GESTURE_LABEL[result.frame.gesture] ?? 'NONE');
      const camTip = result.frame.landmarks[8] ?? result.frame.tip;
      tipRef.current = camTip;
      drawPreview(
        canvasRef.current,
        camTip,
        result.frame.handPresent ? result.frame.landmarks : null,
        GESTURE_LABEL[result.frame.gesture] ?? 'NONE',
      );
    });
    void tracker.start();

    return () => {
      tracker.stop();
      trackerRef.current = null;
    };
  }, [live, inputMode, channel, synthMode]);

  useEffect(() => {
    trackerRef.current?.setSyntheticMode(synthMode);
  }, [synthMode]);

  const startCalibrate = () => {
    setCalibMsg('Point at top-left of the stage and hold steady…');
    const points: Array<{ x: number; y: number }> = [];
    let holdStart: number | null = null;
    let last = { x: tipRef.current.x, y: tipRef.current.y };
    const started = performance.now();

    const tick = () => {
      const now = performance.now();
      if (now - started > 5000 && points.length < 2) {
        setCalibMsg('Calibration timed out — using auto zone.');
        return;
      }
      const tip = tipRef.current;
      const moved = Math.hypot(tip.x - last.x, tip.y - last.y);
      if (moved < 0.01) {
        if (holdStart === null) holdStart = now;
        if (now - holdStart >= 1000) {
          points.push({ ...tip });
          holdStart = null;
          if (points.length === 1) {
            setCalibMsg('Hold bottom-right…');
          } else {
            const zone = zoneFromTwoPoints(points[0]!, points[1]!);
            if (zone) {
              saveZone(zone);
              pipelineRef.current?.setMapping({ kind: 'zone', zone });
              setCalibMsg(
                `Saved zone ${zone.x0.toFixed(2)}–${zone.x1.toFixed(2)}.`,
              );
            } else {
              setCalibMsg('Zone invalid — kept previous.');
            }
            return;
          }
        }
      } else {
        holdStart = null;
        last = { ...tip };
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return (
    <main className="page harness">
      <h1 className="brand">Dev Pointer</h1>
      <p className="lede">
        Stream pose + stroke ctrl over BroadcastChannel to{' '}
        <Link to="/dev/receiver">/dev/receiver</Link>. Default Synthetic works without a webcam.
      </p>
      <div className="banner">
        Your video stays on this device. Only hand positions are sent.
      </div>

      <div className="mode-row">
        {(['synthetic', 'camera', 'mouse'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={inputMode === m ? 'primary' : 'ghost'}
            disabled={live}
            onClick={() => setInputMode(m)}
          >
            {m === 'synthetic' ? 'Synthetic' : m === 'camera' ? 'Camera' : 'Mouse'}
          </button>
        ))}
      </div>

      {inputMode === 'synthetic' && (
        <div className="mode-row">
          {(['point', 'pinch', 'palm', 'none'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={synthMode === m ? 'primary' : 'ghost'}
              onClick={() => setSynthMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="preview-wrap">
        <video
          ref={videoRef}
          className={`preview-video ${inputMode === 'camera' && source === 'camera' ? 'show' : ''}`}
          playsInline
          muted
          autoPlay
        />
        <canvas
          ref={canvasRef}
          className="stage preview-canvas"
          width={960}
          height={600}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            tipRef.current = {
              x: (e.clientX - rect.left) / rect.width,
              y: (e.clientY - rect.top) / rect.height,
            };
            if (!live) drawPreview(e.currentTarget, tipRef.current, null, '—');
          }}
        />
        <span className={`gesture-badge gesture-${gestureLabel.toLowerCase()}`}>
          {gestureLabel}
        </span>
      </div>

      <div className="row">
        <button className="primary" type="button" onClick={() => setLive((v) => !v)}>
          {live ? 'Stop' : 'Start streaming'}
        </button>
        <button className="ghost" type="button" onClick={startCalibrate} disabled={!live}>
          Calibrate (5s)
        </button>
        <Link className="ghost" to="/calibrate" style={{ textDecoration: 'none' }}>
          Full calibrate
        </Link>
        <Link className="ghost" to="/join">
          Exit
        </Link>
      </div>
      <p className="status">
        {live
          ? `live · ${source} · ~${fps} fps · ${gestureLabel}${hideHand ? ' · hand hidden' : ''}`
          : 'idle · Space hide hand · C clear'}
      </p>
      {calibMsg && <p className="status">{calibMsg}</p>}
    </main>
  );
}

function drawPreview(
  canvas: HTMLCanvasElement | null,
  tip: { x: number; y: number },
  landmarks: Array<{ x: number; y: number }> | null,
  gesture: string,
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#15202b';
  ctx.fillRect(0, 0, width, height);

  const zone = loadZone();
  ctx.strokeStyle = '#2a5a78';
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(
    zone.x0 * width,
    zone.y0 * height,
    (zone.x1 - zone.x0) * width,
    (zone.y1 - zone.y0) * height,
  );
  ctx.setLineDash([]);

  if (landmarks && landmarks.length >= 21) {
    ctx.strokeStyle = '#4FC3F7';
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = landmarks[a]!;
      const pb = landmarks[b]!;
      ctx.beginPath();
      ctx.moveTo(pa.x * width, pa.y * height);
      ctx.lineTo(pb.x * width, pb.y * height);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8eef4';
    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * width, lm.y * height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#4FC3F7';
  ctx.beginPath();
  ctx.arc(tip.x * width, tip.y * height, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8eef4';
  ctx.font = '13px ui-sans-serif, system-ui';
  ctx.fillText(gesture, tip.x * width + 12, tip.y * height + 4);
}
