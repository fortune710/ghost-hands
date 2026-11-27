import { describe, expect, it } from 'vitest';
import {
  LANDMARK_ONE_EURO,
  OneEuroFilter2D,
  TIP_DEAD_ZONE,
  TIP_ONE_EURO,
  TipSmoother,
} from './oneEuro.js';

function variance(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length;
}

describe('One-Euro tip smoothing', () => {
  it('exports distinct landmark and tip presets', () => {
    expect(LANDMARK_ONE_EURO.minCutoff).toBe(1.0);
    expect(LANDMARK_ONE_EURO.beta).toBe(0.007);
    expect(LANDMARK_ONE_EURO.dCutoff).toBe(1.0);

    expect(TIP_ONE_EURO.minCutoff).toBe(1.7);
    expect(TIP_ONE_EURO.beta).toBe(0.02);
    expect(TIP_ONE_EURO.dCutoff).toBe(1.0);

    expect(TIP_ONE_EURO.minCutoff).not.toBe(LANDMARK_ONE_EURO.minCutoff);
    expect(TIP_ONE_EURO.beta).not.toBe(LANDMARK_ONE_EURO.beta);
  });

  it('reduces variance on a noisy static tip', () => {
    const tip = new TipSmoother();
    const landmark = new OneEuroFilter2D(LANDMARK_ONE_EURO);

    const rawX: number[] = [];
    const tipX: number[] = [];
    const lmX: number[] = [];

    // Deterministic jitter around (0.5, 0.5)
    for (let i = 0; i < 120; i++) {
      const t = i / 60;
      const noise = ((i * 17) % 10) / 1000 - 0.0045; // ~±0.0045
      const p = { x: 0.5 + noise, y: 0.5 - noise };
      rawX.push(p.x);
      tipX.push(tip.filter(t, p).x);
      lmX.push(landmark.filter(t, p).x);
    }

    expect(variance(tipX)).toBeLessThan(variance(rawX));
    expect(variance(lmX)).toBeLessThan(variance(rawX));
  });

  it('tip preset differs from landmark filter response', () => {
    const tip = new TipSmoother();
    const landmark = new OneEuroFilter2D(LANDMARK_ONE_EURO);

    expect(tip.params.minCutoff).toBe(TIP_ONE_EURO.minCutoff);
    expect(tip.params.beta).toBe(TIP_ONE_EURO.beta);

    // Step input: tip (higher minCutoff + beta) tracks differently than landmark.
    tip.filter(0, { x: 0, y: 0 });
    landmark.filter(0, { x: 0, y: 0 });

    const tipOut: number[] = [];
    const lmOut: number[] = [];
    for (let i = 1; i <= 30; i++) {
      const t = i / 60;
      tipOut.push(tip.filter(t, { x: 1, y: 0 }).x);
      lmOut.push(landmark.filter(t, { x: 1, y: 0 }).x);
    }

    // Responses must not be identical sequences.
    expect(tipOut.some((v, i) => Math.abs(v - lmOut[i]!) > 1e-6)).toBe(true);
  });

  it('dead zone holds tip still under small noise while enabled', () => {
    const tip = new TipSmoother({ deadZone: TIP_DEAD_ZONE });

    const base = tip.filter(0, { x: 0.5, y: 0.5 }, true);
    expect(base.x).toBeCloseTo(0.5, 5);

    const held: Array<{ x: number; y: number }> = [];
    for (let i = 1; i <= 40; i++) {
      const t = i / 60;
      // Noise well inside 0.002 dead zone
      const noise = (((i * 3) % 5) - 2) * 0.0002;
      held.push(
        tip.filter(t, { x: 0.5 + noise, y: 0.5 - noise }, true),
      );
    }

    for (const p of held) {
      expect(p.x).toBe(base.x);
      expect(p.y).toBe(base.y);
    }

    // Without dead zone, output should move with noise after reset.
    tip.reset();
    tip.filter(0, { x: 0.5, y: 0.5 }, false);
    const moved = tip.filter(1 / 60, { x: 0.5 + 0.001, y: 0.5 }, false);
    expect(Math.abs(moved.x - 0.5)).toBeGreaterThan(0);
  });
});
