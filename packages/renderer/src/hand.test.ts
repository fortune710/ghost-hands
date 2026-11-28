import { describe, expect, it } from 'vitest';
import type { Landmark2D } from '@ghost-hands/protocol';
import {
  anchorLandmarksToTip,
  landmarksToPixels,
  mirrorLandmarksAroundTipX,
  scaleLandmarksToHeight,
} from './hand.js';

function makeLandmarks(): Landmark2D[] {
  // Simple column of 21 points: wrist at (100, 200), tip (L8) at (100, 60)
  const pts: Landmark2D[] = [];
  for (let i = 0; i < 21; i++) {
    pts.push({ x: 100, y: 200 - i * 10 });
  }
  // Ensure L8 is distinct
  pts[8] = { x: 100, y: 60 };
  pts[0] = { x: 100, y: 200 };
  return pts;
}

describe('anchorLandmarksToTip', () => {
  it('moves landmark 8 exactly onto tipPx and preserves relative offsets', () => {
    const lm = makeLandmarks();
    const tipPx = { x: 400, y: 300 };
    const before8 = lm[8]!;
    const before0 = lm[0]!;
    const anchored = anchorLandmarksToTip(lm, tipPx, 8);

    expect(anchored[8]).toEqual({ x: 400, y: 300 });
    expect(anchored[0]!.x - anchored[8]!.x).toBeCloseTo(before0.x - before8.x);
    expect(anchored[0]!.y - anchored[8]!.y).toBeCloseTo(before0.y - before8.y);
  });

  it('does not mutate the input array', () => {
    const lm = makeLandmarks();
    const copy = lm.map((p) => ({ ...p }));
    anchorLandmarksToTip(lm, { x: 0, y: 0 }, 8);
    expect(lm).toEqual(copy);
  });
});

describe('scaleLandmarksToHeight', () => {
  it('scales bounding-box height to target around the wrist', () => {
    const lm = makeLandmarks();
    const scaled = scaleLandmarksToHeight(lm, 140);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of scaled) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    expect(maxY - minY).toBeCloseTo(140, 5);
    // Wrist (L0) stays fixed as the scale pivot
    expect(scaled[0]).toEqual(lm[0]);
  });

  it('returns copies when height is degenerate', () => {
    const flat = Array.from({ length: 21 }, () => ({ x: 50, y: 50 }));
    const scaled = scaleLandmarksToHeight(flat, 140);
    expect(scaled).toEqual(flat);
    expect(scaled).not.toBe(flat);
  });
});

describe('landmarksToPixels', () => {
  it('maps normalized coords into canvas pixels', () => {
    const px = landmarksToPixels(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0.5 },
      ],
      800,
      600,
    );
    expect(px).toEqual([
      { x: 0, y: 0 },
      { x: 800, y: 300 },
    ]);
  });
});

describe('mirrorLandmarksAroundTipX', () => {
  it('reflects x around tip while keeping y', () => {
    const lm = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ];
    const tip = { x: 20, y: 0 };
    const mirrored = mirrorLandmarksAroundTipX(lm, tip);
    expect(mirrored[0]).toEqual({ x: 30, y: 20 });
    expect(mirrored[1]).toEqual({ x: 10, y: 40 });
  });
});
