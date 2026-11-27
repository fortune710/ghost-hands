import { describe, expect, it } from 'vitest';
import { CLEAR_WIPE_MS, InkLayer, pathLengthPx, type InkKind } from './ink.js';

describe('InkLayer', () => {
  it('keeps stroke through start → append → end when long enough', () => {
    const ink = new InkLayer({ minStrokePx: 12 });
    ink.start('s1', 0.1, 0.1, 0, '#4FC3F7', 'free');
    ink.append('s1', 0.2, 0.1, 10);
    ink.append('s1', 0.3, 0.2, 20);
    ink.end('s1', 'free', 30);
    expect(ink.all).toHaveLength(1);
    expect(ink.all[0]!.endedAt).toBe(30);
    expect(ink.all[0]!.points.length).toBeGreaterThanOrEqual(3);
  });

  it('discards strokes shorter than minimum length', () => {
    const ink = new InkLayer({ minStrokePx: 12 });
    ink.start('s1', 0.1, 0.1, 0, '#4FC3F7');
    ink.append('s1', 0.101, 0.101, 10);
    ink.end('s1', 'free', 20);
    expect(ink.all).toHaveLength(0);
  });

  it('alpha is 1 during hold, linear during fade, 0 after', () => {
    const ink = new InkLayer({ holdMs: 1000, fadeMs: 500, minStrokePx: 0 });
    ink.start('s1', 0, 0, 0, '#fff');
    ink.append('s1', 0.5, 0.5, 10);
    ink.end('s1', 'free', 20);
    const stroke = ink.all[0]!;
    // hold window
    expect(ink.alphaFor(stroke, 20)).toBe(1);
    expect(ink.alphaFor(stroke, 20 + 1000)).toBe(1);
    // mid-fade
    expect(ink.alphaFor(stroke, 20 + 1000 + 250)).toBeCloseTo(0.5, 2);
    // fully faded
    expect(ink.alphaFor(stroke, 20 + 1000 + 500)).toBe(0);
  });

  it('prunes fully faded strokes', () => {
    const ink = new InkLayer({ holdMs: 100, fadeMs: 100, minStrokePx: 0 });
    ink.start('s1', 0, 0, 0, '#fff');
    ink.append('s1', 1, 1, 1);
    ink.end('s1', 'free', 2);
    expect(ink.prune(500)).toBe(false);
    expect(ink.all).toHaveLength(0);
  });

  it('clear() empties strokes immediately (open-palm)', () => {
    const ink = new InkLayer({ minStrokePx: 0 });
    ink.start('s1', 0, 0, 0, '#fff');
    ink.append('s1', 1, 1, 1);
    ink.end('s1', 'free', 2);
    expect(ink.all).toHaveLength(1);
    ink.clear();
    expect(ink.all).toHaveLength(0);
    expect(ink.prune(100)).toBe(false);
  });

  it('beginClearWipe fades alpha then empties on prune', () => {
    const ink = new InkLayer({ minStrokePx: 0 });
    ink.start('s1', 0, 0, 0, '#fff');
    ink.append('s1', 1, 1, 1);
    ink.end('s1', 'free', 2);
    ink.beginClearWipe(100);
    expect(ink.clearWipeAlpha(100)).toBe(1);
    expect(ink.clearWipeAlpha(100 + CLEAR_WIPE_MS / 2)).toBeCloseTo(0.5, 2);
    expect(ink.isClearWiping(100 + CLEAR_WIPE_MS / 2)).toBe(true);
    expect(ink.all).toHaveLength(1);
    expect(ink.prune(100 + CLEAR_WIPE_MS)).toBe(false);
    expect(ink.all).toHaveLength(0);
    expect(ink.clearWipeAlpha(100 + CLEAR_WIPE_MS + 1)).toBe(1);
  });

  it('sets kind to arrow after end', () => {
    const ink = new InkLayer({ minStrokePx: 0 });
    ink.start('arr', 0.1, 0.1, 0, '#f00', 'free');
    ink.append('arr', 0.2, 0.15, 5);
    ink.append('arr', 0.4, 0.3, 10);
    const kind: InkKind = 'arrow';
    ink.end('arr', kind, 20);
    expect(ink.all).toHaveLength(1);
    expect(ink.all[0]!.kind).toBe('arrow');
    expect(ink.all[0]!.endedAt).toBe(20);
  });

  it('caps max strokes at 50', () => {
    const ink = new InkLayer({ maxStrokes: 50, minStrokePx: 0 });
    for (let i = 0; i < 55; i++) {
      ink.start(`s${i}`, 0, 0, i, '#fff');
    }
    expect(ink.all).toHaveLength(50);
  });
});

describe('pathLengthPx', () => {
  it('measures pixel length for normalized points', () => {
    const pts = [
      { x: 0, y: 0, t: 0 },
      { x: 0.5, y: 0, t: 1 },
      { x: 0.5, y: 0.25, t: 2 },
    ];
    expect(pathLengthPx(pts, 200, 100)).toBeCloseTo(100 + 25, 5);
  });
});
