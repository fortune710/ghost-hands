/**
 * Ghost hand Canvas2D (PRD §7.3).
 * Bones as rounded capsules with soft glow; index tip laser + reticle.
 */

import type { Landmark2D } from '@ghost-hands/protocol';
import { Gesture } from '@ghost-hands/protocol';

/** MediaPipe hand connections (landmark index pairs). */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];

/** Palm / mid-hand connections — drawn thicker. */
const PALM_CONNECTIONS = new Set([
  '0-5',
  '0-9',
  '0-13',
  '0-17',
  '5-9',
  '9-13',
  '13-17',
]);

function connectionKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export interface GhostHandStyle {
  color: string;
  opacity: number;
  handHeightPx: number;
  laserRadiusPx: number;
}

const DEFAULT_STYLE: GhostHandStyle = {
  color: '#4FC3F7',
  opacity: 0.35,
  handHeightPx: 140,
  laserRadiusPx: 10,
};

export interface DrawGhostHandArgs {
  ctx: CanvasRenderingContext2D;
  /** Landmarks already in canvas pixel space (anchored + scaled). */
  landmarksPx: Landmark2D[];
  tipPx: Landmark2D;
  gesture: Gesture;
  style?: Partial<GhostHandStyle>;
  /** Optional name label under wrist. */
  name?: string;
  /** Recent tip positions for laser trail (up to 6 samples). */
  tipTrail?: Landmark2D[];
}

export interface ReticleStyle {
  color?: string;
  radiusPx?: number;
  coreRadiusPx?: number;
}

/** Mix hex color toward white by `amount` in [0,1]. */
function lightenHex(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${((1 << 24) | (mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).slice(1)}`;
}

function palmSizePx(landmarksPx: Landmark2D[]): number {
  const a = landmarksPx[5];
  const b = landmarksPx[17];
  if (a && b) {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 1) return d;
  }
  const wrist = landmarksPx[0];
  const mid = landmarksPx[9];
  if (wrist && mid) {
    const d = Math.hypot(wrist.x - mid.x, wrist.y - mid.y);
    if (d > 1) return d;
  }
  return 40;
}

export function drawGhostHand(args: DrawGhostHandArgs): void {
  const { ctx, landmarksPx, tipPx, gesture, name, tipTrail } = args;
  if (landmarksPx.length < 21) return;

  const style = { ...DEFAULT_STYLE, ...args.style };
  const palm = palmSizePx(landmarksPx);
  const scale = palm / Math.max(1, style.handHeightPx);
  const baseWidth = Math.max(2.5, 10 * scale);
  const palmWidth = baseWidth * 1.55;
  const fingerWidth = baseWidth * 0.75;
  const outlineColor = lightenHex(style.color, 0.45);

  ctx.save();

  // Soft outer glow pass
  ctx.globalAlpha = style.opacity * 0.35;
  ctx.strokeStyle = style.color;
  ctx.shadowColor = style.color;
  ctx.shadowBlur = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarksPx[a];
    const pb = landmarksPx[b];
    if (!pa || !pb) continue;
    const palmBone = PALM_CONNECTIONS.has(connectionKey(a, b));
    ctx.lineWidth = (palmBone ? palmWidth : fingerWidth) + 4;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Lighter 1.5px outline
  ctx.globalAlpha = Math.min(1, style.opacity + 0.25);
  ctx.strokeStyle = outlineColor;
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarksPx[a];
    const pb = landmarksPx[b];
    if (!pa || !pb) continue;
    const palmBone = PALM_CONNECTIONS.has(connectionKey(a, b));
    ctx.lineWidth = (palmBone ? palmWidth : fingerWidth) + 1.5;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // 35% opacity fill in pointer color (rounded capsules)
  ctx.globalAlpha = style.opacity;
  ctx.strokeStyle = style.color;
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarksPx[a];
    const pb = landmarksPx[b];
    if (!pa || !pb) continue;
    const palmBone = PALM_CONNECTIONS.has(connectionKey(a, b));
    ctx.lineWidth = palmBone ? palmWidth : fingerWidth;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  // Joint dots (fill)
  ctx.fillStyle = style.color;
  for (const lm of landmarksPx) {
    ctx.beginPath();
    ctx.arc(lm.x, lm.y, Math.max(2, baseWidth * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }

  // Index tip laser: 10px bright dot + trail while POINT/PINCH
  if (gesture === Gesture.Point || gesture === Gesture.Pinch) {
    if (tipTrail && tipTrail.length > 1) {
      ctx.strokeStyle = style.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < tipTrail.length; i++) {
        const prev = tipTrail[i - 1]!;
        const cur = tipTrail[i]!;
        ctx.globalAlpha = (i / tipTrail.length) * 0.55;
        ctx.lineWidth = 2 + (i / tipTrail.length) * 2;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(tipPx.x, tipPx.y, style.laserRadiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(tipPx.x, tipPx.y, style.laserRadiusPx * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // Name label 12px under wrist
  if (name) {
    const wrist = landmarksPx[0]!;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = style.color;
    ctx.globalAlpha = 0.9;
    ctx.textAlign = 'center';
    ctx.fillText(name, wrist.x, wrist.y + 18);
  }

  ctx.restore();
}

/**
 * Active pointer reticle (bright ring + core) at the mapped tip in display space.
 */
export function drawReticle(
  ctx: CanvasRenderingContext2D,
  tipPx: Landmark2D,
  style?: ReticleStyle,
): void {
  const color = style?.color ?? '#FFFFFF';
  const radius = style?.radiusPx ?? 14;
  const core = style?.coreRadiusPx ?? Math.max(2, radius * 0.3);

  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(tipPx.x, tipPx.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tipPx.x, tipPx.y, core, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Convert normalized [0,1] landmarks to canvas pixels. */
export function landmarksToPixels(
  landmarks: Landmark2D[],
  width: number,
  height: number,
): Landmark2D[] {
  return landmarks.map((lm) => ({ x: lm.x * width, y: lm.y * height }));
}

/**
 * Translate all landmarks so landmark `tipIndex` (default 8 = index tip)
 * sits exactly at `tipPx` (PRD: hand anchored so L8 at mapped tip).
 */
export function anchorLandmarksToTip(
  landmarksPx: Landmark2D[],
  tipPx: Landmark2D,
  tipIndex = 8,
): Landmark2D[] {
  const tip = landmarksPx[tipIndex];
  if (!tip) return landmarksPx.map((p) => ({ x: p.x, y: p.y }));
  const dx = tipPx.x - tip.x;
  const dy = tipPx.y - tip.y;
  return landmarksPx.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * Scale landmarks around the wrist (L0) so the hand bounding-box height
 * is approximately `targetHeightPx` (~140px per PRD).
 */
export function scaleLandmarksToHeight(
  landmarksPx: Landmark2D[],
  targetHeightPx: number,
): Landmark2D[] {
  if (landmarksPx.length === 0) return [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of landmarksPx) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const height = maxY - minY;
  if (height < 1e-6) return landmarksPx.map((p) => ({ x: p.x, y: p.y }));

  const scale = targetHeightPx / height;
  const wrist = landmarksPx[0] ?? { x: 0, y: 0 };
  return landmarksPx.map((p) => ({
    x: wrist.x + (p.x - wrist.x) * scale,
    y: wrist.y + (p.y - wrist.y) * scale,
  }));
}

/** Mirror landmarks horizontally around tip x (for leftHand). */
export function mirrorLandmarksAroundTipX(
  landmarksPx: Landmark2D[],
  tipPx: Landmark2D,
): Landmark2D[] {
  return landmarksPx.map((p) => ({
    x: tipPx.x - (p.x - tipPx.x),
    y: p.y,
  }));
}
