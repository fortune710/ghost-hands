/**
 * Ghost hand Canvas2D scaffold (PRD §7.3).
 * Full bone capsules / glow polish in M1–M3; M0 draws a readable skeleton + tip laser.
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
  /** Landmarks already in canvas pixel space. */
  landmarksPx: Landmark2D[];
  tipPx: Landmark2D;
  gesture: Gesture;
  style?: Partial<GhostHandStyle>;
  /** Optional name label under wrist. */
  name?: string;
  /** Recent tip positions for laser trail. */
  tipTrail?: Landmark2D[];
}

export function drawGhostHand(args: DrawGhostHandArgs): void {
  const { ctx, landmarksPx, tipPx, gesture, name, tipTrail } = args;
  if (landmarksPx.length < 21) return;

  const style = { ...DEFAULT_STYLE, ...args.style };
  ctx.save();
  ctx.globalAlpha = style.opacity;
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarksPx[a];
    const pb = landmarksPx[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  for (const lm of landmarksPx) {
    ctx.beginPath();
    ctx.arc(lm.x, lm.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  if (gesture === Gesture.Point || gesture === Gesture.Pinch) {
    if (tipTrail && tipTrail.length > 1) {
      ctx.strokeStyle = style.color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tipTrail[0]!.x, tipTrail[0]!.y);
      for (let i = 1; i < tipTrail.length; i++) {
        ctx.lineTo(tipTrail[i]!.x, tipTrail[i]!.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(tipPx.x, tipPx.y, style.laserRadiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(tipPx.x, tipPx.y, style.laserRadiusPx * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  if (name) {
    const wrist = landmarksPx[0]!;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = style.color;
    ctx.globalAlpha = 0.9;
    ctx.fillText(name, wrist.x - 10, wrist.y + 18);
  }

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
