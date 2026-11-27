import { describe, expect, it } from 'vitest';
import { InkLayer } from './ink.js';

describe('InkLayer', () => {
  it('discards strokes shorter than minimum length', () => {
    const ink = new InkLayer({ minStrokePx: 12 });
    ink.start('s1', 0.1, 0.1, 0, '#4FC3F7');
    ink.append('s1', 0.101, 0.101, 10);
    ink.end('s1', 'free', 20);
    expect(ink.all).toHaveLength(0);
  });

  it('fades after hold window', () => {
    const ink = new InkLayer({ holdMs: 1000, fadeMs: 500, minStrokePx: 0 });
    ink.start('s1', 0, 0, 0, '#fff');
    ink.append('s1', 0.5, 0.5, 10);
    ink.end('s1', 'free', 20);
    // endedAt=20 → still fully visible at t=500; mid-fade at hold+fade/2
    expect(ink.alphaFor(ink.all[0]!, 500)).toBe(1);
    expect(ink.alphaFor(ink.all[0]!, 20 + 1000 + 250)).toBeCloseTo(0.5, 2);
    expect(ink.alphaFor(ink.all[0]!, 20 + 1000 + 500)).toBe(0);

  });

  it('prunes fully faded strokes', () => {
    const ink = new InkLayer({ holdMs: 100, fadeMs: 100, minStrokePx: 0 });
    ink.start('s1', 0, 0, 0, '#fff');
    ink.append('s1', 1, 1, 1);
    ink.end('s1', 'free', 2);
    expect(ink.prune(500)).toBe(false);
    expect(ink.all).toHaveLength(0);
  });
});
