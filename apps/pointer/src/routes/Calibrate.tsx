import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_ACTIVE_ZONE,
  zoneFromFourCorners,
  zoneFromTwoPoints,
  type ActiveZone,
} from '@ghost-hands/gestures';
import { createHandTracker } from '../tracking/handTracker';
import { loadZone, resetZone, saveZone } from '../tracking/calibrationStore';

type Step =
  | 'idle'
  | 'tl'
  | 'br'
  | 'tr'
  | 'bl'
  | 'done'
  | 'reject';

/**
 * M1 calibration UI — 2-point default, optional 4-corner AABB.
 * Full sharer-driven calib_target flow lands in M4.
 */
export function Calibrate() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [zone, setZone] = useState<ActiveZone>(() => loadZone());
  const [msg, setMsg] = useState('Ready. Start calibration when your hand is visible.');
  const tipRef = useRef({ x: 0.5, y: 0.5 });
  const handPresentRef = useRef(false);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const cornersRef = useRef<Array<{ x: number; y: number }>>([]);
  const captureGenRef = useRef(0);
  const holdRafRef = useRef(0);
  const zoneRef = useRef(zone);
  const stepRef = useRef(step);
  zoneRef.current = zone;
  stepRef.current = step;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tracker = createHandTracker({
      preferSynthetic: false,
      previewCanvas: canvas,
    });

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    const onLeave = () => {
      mouseRef.current = null;
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    tracker.onFrame((sample) => {
      const mouse = mouseRef.current;
      if (mouse) {
        // Explicit mouse aiming wins while hovering the canvas.
        tipRef.current = { x: mouse.x, y: mouse.y };
        handPresentRef.current = true;
      } else if (sample && sample.confidence > 0 && sample.landmarks[8]) {
        const tip = sample.landmarks[8];
        tipRef.current = { x: tip.x, y: tip.y };
        handPresentRef.current = true;
      } else {
        handPresentRef.current = false;
      }
      drawCalib(canvas, tipRef.current, zoneRef.current, stepRef.current);
    });
    void tracker.start();

    return () => {
      captureGenRef.current += 1;
      if (holdRafRef.current) {
        cancelAnimationFrame(holdRafRef.current);
        holdRafRef.current = 0;
      }
      tracker.stop();
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  const holdCorner = (label: string, next: () => void) => {
    const gen = captureGenRef.current;
    setMsg(`Hold steady at ${label} for 1s…`);
    const startTip = { ...tipRef.current };
    let holdStart: number | null = null;
    const started = performance.now();

    const tick = () => {
      if (gen !== captureGenRef.current) return;
      const now = performance.now();
      if (now - started > 8000) {
        setStep('reject');
        setMsg('Timed out — try again.');
        return;
      }
      if (!handPresentRef.current) {
        holdStart = null;
        holdRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const tip = tipRef.current;
      const moved = Math.hypot(tip.x - startTip.x, tip.y - startTip.y);
      if (moved < 0.01) {
        if (holdStart === null) holdStart = now;
        if (now - holdStart >= 1000) {
          if (gen !== captureGenRef.current) return;
          cornersRef.current.push({ ...tip });
          next();
          return;
        }
      } else {
        holdStart = null;
        startTip.x = tip.x;
        startTip.y = tip.y;
      }
      holdRafRef.current = requestAnimationFrame(tick);
    };
    holdRafRef.current = requestAnimationFrame(tick);
  };

  const start2Point = () => {
    captureGenRef.current += 1;
    if (holdRafRef.current) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = 0;
    }
    cornersRef.current = [];
    setStep('tl');
    setMsg('Point at the top-left corner of your screen area.');
    holdCorner('top-left', () => {
      setStep('br');
      setMsg('Point at the bottom-right corner.');
      holdCorner('bottom-right', () => {
        const gen = captureGenRef.current;
        const [tl, br] = cornersRef.current;
        const z = tl && br ? zoneFromTwoPoints(tl, br) : null;
        if (gen !== captureGenRef.current) return;
        if (!z) {
          setStep('reject');
          setMsg('Zone too small or invalid. Reset and retry.');
          return;
        }
        saveZone(z);
        setZone(z);
        setStep('done');
        setMsg(`Saved 2-point zone ${z.x0.toFixed(2)}–${z.x1.toFixed(2)}.`);
      });
    });
  };

  const start4Corner = () => {
    captureGenRef.current += 1;
    if (holdRafRef.current) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = 0;
    }
    cornersRef.current = [];
    const order: Array<{ step: Step; label: string }> = [
      { step: 'tl', label: 'top-left' },
      { step: 'tr', label: 'top-right' },
      { step: 'br', label: 'bottom-right' },
      { step: 'bl', label: 'bottom-left' },
    ];
    const run = (i: number) => {
      if (i >= order.length) {
        const gen = captureGenRef.current;
        const [tl, tr, br, bl] = cornersRef.current;
        // AABB from four corners (homography available via gestures package for M4)
        const z =
          tl && tr && br && bl ? zoneFromFourCorners(tl, tr, br, bl) : null;
        if (gen !== captureGenRef.current) return;
        if (!z) {
          setStep('reject');
          setMsg('4-corner AABB invalid. Reset and retry.');
          return;
        }
        saveZone(z);
        setZone(z);
        setStep('done');
        setMsg(
          `Saved 4-corner AABB zone ${z.x0.toFixed(2)}–${z.x1.toFixed(2)} (homography deferred to M4).`,
        );
        return;
      }
      const cur = order[i]!;
      setStep(cur.step);
      setMsg(`Point at ${cur.label}.`);
      holdCorner(cur.label, () => run(i + 1));
    };
    run(0);
  };

  return (
    <main className="page">
      <h1 className="brand">Calibrate</h1>
      <p className="lede">
        Optional ~5 s calibration. Default auto-zone is center ~70% (
        {DEFAULT_ACTIVE_ZONE.x0}–{DEFAULT_ACTIVE_ZONE.x1}).
      </p>
      <div className="banner">
        Your video stays on this device. Only hand positions are sent.
      </div>

      <div className="preview-wrap">
        <canvas ref={canvasRef} className="stage preview-canvas" width={640} height={400} />
        <span className="calib-target">{stepLabel(step)}</span>
      </div>

      <div className="panel">
        <p>{msg}</p>
        <label className="check">
          <input
            type="checkbox"
            checked={advanced}
            onChange={(e) => setAdvanced(e.target.checked)}
          />{' '}
          4-corner advanced (AABB; homography in M4)
        </label>
        <div className="row">
          <button
            className="primary"
            type="button"
            onClick={() => (advanced ? start4Corner() : start2Point())}
            disabled={step !== 'idle' && step !== 'done' && step !== 'reject'}
          >
            {advanced ? 'Start 4-corner' : 'Start 2-point'}
          </button>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              captureGenRef.current += 1;
              if (holdRafRef.current) {
                cancelAnimationFrame(holdRafRef.current);
                holdRafRef.current = 0;
              }
              resetZone();
              setZone(loadZone());
              setStep('idle');
              setMsg('Reset to auto-mapping.');
            }}
          >
            Reset to auto
          </button>
          <Link className="ghost" to="/join">
            Back
          </Link>
        </div>
        <p className="status">
          zone {zone.x0.toFixed(2)},{zone.y0.toFixed(2)} → {zone.x1.toFixed(2)},
          {zone.y1.toFixed(2)}
        </p>
      </div>
    </main>
  );
}

function stepLabel(step: Step): string {
  switch (step) {
    case 'tl':
      return 'TL';
    case 'tr':
      return 'TR';
    case 'br':
      return 'BR';
    case 'bl':
      return 'BL';
    case 'done':
      return 'OK';
    case 'reject':
      return '!';
    default:
      return '';
  }
}

function drawCalib(
  canvas: HTMLCanvasElement,
  tip: { x: number; y: number },
  zone: ActiveZone,
  step: Step,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#15202b';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#2a5a78';
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(
    zone.x0 * width,
    zone.y0 * height,
    (zone.x1 - zone.x0) * width,
    (zone.y1 - zone.y0) * height,
  );
  ctx.setLineDash([]);

  // Corner targets
  const corners = [
    { x: 0.12, y: 0.12, label: 'TL', active: step === 'tl' },
    { x: 0.88, y: 0.12, label: 'TR', active: step === 'tr' },
    { x: 0.88, y: 0.88, label: 'BR', active: step === 'br' },
    { x: 0.12, y: 0.88, label: 'BL', active: step === 'bl' },
  ];
  for (const c of corners) {
    ctx.strokeStyle = c.active ? '#4FC3F7' : '#334155';
    ctx.lineWidth = c.active ? 3 : 1;
    ctx.strokeRect(c.x * width - 18, c.y * height - 18, 36, 36);
    ctx.fillStyle = c.active ? '#4FC3F7' : '#9aa7b5';
    ctx.font = '12px ui-sans-serif, system-ui';
    ctx.fillText(c.label, c.x * width - 8, c.y * height + 4);
  }

  ctx.fillStyle = '#4FC3F7';
  ctx.beginPath();
  ctx.arc(tip.x * width, tip.y * height, 8, 0, Math.PI * 2);
  ctx.fill();
}
