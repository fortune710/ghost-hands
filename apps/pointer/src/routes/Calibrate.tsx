import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_ACTIVE_ZONE,
  zoneFromFourCorners,
  zoneFromTwoPoints,
  type ActiveZone,
} from '@ghost-hands/gestures';
import { createSyntheticHand } from '../tracking/syntheticHand';
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
  const cornersRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const synth = createSyntheticHand({ mode: 'point' });
    let raf = 0;
    let mouse: { x: number; y: number } | null = null;

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    canvas.addEventListener('mousemove', onMove);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = performance.now();
      if (mouse) synth.setTarget(mouse.x, mouse.y);
      else {
        synth.setTarget(0.5 + 0.2 * Math.sin(t / 900), 0.5 + 0.15 * Math.cos(t / 700));
      }
      const sample = synth.sample(t);
      const tip = sample.landmarks[8] ?? { x: 0.5, y: 0.5 };
      tipRef.current = { x: tip.x, y: tip.y };
      drawCalib(canvas, tipRef.current, zone, step);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', onMove);
    };
  }, [zone, step]);

  const holdCorner = (label: string, next: () => void) => {
    setMsg(`Hold steady at ${label} for 1s…`);
    const startTip = { ...tipRef.current };
    let holdStart: number | null = null;
    const started = performance.now();

    const tick = () => {
      const now = performance.now();
      if (now - started > 8000) {
        setStep('reject');
        setMsg('Timed out — try again.');
        return;
      }
      const tip = tipRef.current;
      const moved = Math.hypot(tip.x - startTip.x, tip.y - startTip.y);
      if (moved < 0.01) {
        if (holdStart === null) holdStart = now;
        if (now - holdStart >= 1000) {
          cornersRef.current.push({ ...tip });
          next();
          return;
        }
      } else {
        holdStart = null;
        startTip.x = tip.x;
        startTip.y = tip.y;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const start2Point = () => {
    cornersRef.current = [];
    setStep('tl');
    setMsg('Point at the top-left corner of your screen area.');
    holdCorner('top-left', () => {
      setStep('br');
      setMsg('Point at the bottom-right corner.');
      holdCorner('bottom-right', () => {
        const [tl, br] = cornersRef.current;
        const z = tl && br ? zoneFromTwoPoints(tl, br) : null;
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
    cornersRef.current = [];
    const order: Array<{ step: Step; label: string }> = [
      { step: 'tl', label: 'top-left' },
      { step: 'tr', label: 'top-right' },
      { step: 'br', label: 'bottom-right' },
      { step: 'bl', label: 'bottom-left' },
    ];
    const run = (i: number) => {
      if (i >= order.length) {
        const [tl, tr, br, bl] = cornersRef.current;
        // AABB from four corners (homography available via gestures package for M4)
        const z =
          tl && tr && br && bl ? zoneFromFourCorners(tl, tr, br, bl) : null;
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
