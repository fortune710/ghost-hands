import { describe, expect, it } from 'vitest';
import { classifyStrokeEnd, type StrokePoint } from './stroke.js';

/** Build a straight stroke in normalized space. */
function straightStroke(
  start: { x: number; y: number },
  end: { x: number; y: number },
  durationMs: number,
  steps = 10,
): StrokePoint[] {
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push({
      x: start.x + (end.x - start.x) * u,
      y: start.y + (end.y - start.y) * u,
      t: (durationMs * i) / steps,
    });
  }
  return pts;
}

describe('classifyStrokeEnd', () => {
  it('snaps a quick straight stroke to arrow', () => {
    // ~96 px chord at 1920×1080 (0.05 * 1920), duration 400 ms < 600
    const pts = straightStroke({ x: 0.4, y: 0.5 }, { x: 0.45, y: 0.5 }, 400);
    expect(classifyStrokeEnd(pts)).toBe('arrow');
  });

  it('keeps a slow straight stroke as free', () => {
    const pts = straightStroke({ x: 0.4, y: 0.5 }, { x: 0.45, y: 0.5 }, 800);
    expect(classifyStrokeEnd(pts)).toBe('free');
  });

  it('discards a short stroke', () => {
    // Path ~5 px at 1920 width
    const pts = straightStroke({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.5 }, 100);
    expect(classifyStrokeEnd(pts)).toBe('discard');
  });

  it('keeps a wiggly path as free even when quick', () => {
    // Long path relative to chord: zigzag with small net displacement
    const pts: StrokePoint[] = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      pts.push({
        x: 0.4 + u * 0.05 + (i % 2 === 0 ? 0.02 : -0.02),
        y: 0.5 + (i % 2 === 0 ? 0.03 : -0.03),
        t: (500 * i) / steps,
      });
    }
    // Ensure not discarded: path should be well above 12 px
    expect(classifyStrokeEnd(pts)).toBe('free');
  });

  it('respects custom display scale', () => {
    // Tiny normalized delta that is large in px with high scale
    const pts = straightStroke({ x: 0, y: 0 }, { x: 0.05, y: 0 }, 200);
    expect(classifyStrokeEnd(pts, { displayWidth: 1920, displayHeight: 1080 })).toBe(
      'arrow',
    );
    // Same normalized stroke on a tiny display → chord < 40 px → free (or discard)
    const small = classifyStrokeEnd(pts, {
      displayWidth: 100,
      displayHeight: 100,
    });
    expect(small === 'free' || small === 'discard').toBe(true);
  });
});
