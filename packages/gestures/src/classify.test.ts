import { describe, expect, it } from 'vitest';
import { classifyLandmarks, type Landmark } from './classify.js';

/** Build 21 landmarks from sparse overrides; unset → wrist-ish defaults. */
function hand(overrides: Partial<Record<number, Landmark>>): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 21 }, () => ({
    x: 0.5,
    y: 0.7,
  }));
  // Wrist
  landmarks[0] = { x: 0.5, y: 0.8 };
  // Middle MCP — defines palm size
  landmarks[9] = { x: 0.5, y: 0.55 };
  // Index / pinky MCP for palm facing (right hand, facing camera)
  landmarks[5] = { x: 0.4, y: 0.6 }; // index MCP left of wrist
  landmarks[17] = { x: 0.6, y: 0.6 }; // pinky MCP right of wrist

  for (const [k, v] of Object.entries(overrides)) {
    landmarks[Number(k)] = v!;
  }
  return landmarks;
}

/** Curl a finger: tip closer to wrist than PIP * 1.15. */
function curl(
  wrist: Landmark,
  pip: Landmark,
): { pip: Landmark; tip: Landmark } {
  // PIP away from wrist; tip between wrist and PIP (curled)
  return {
    pip,
    tip: {
      x: wrist.x + (pip.x - wrist.x) * 0.5,
      y: wrist.y + (pip.y - wrist.y) * 0.5,
    },
  };
}

/** Extend a finger: tip farther from wrist than PIP * 1.15. */
function extend(
  wrist: Landmark,
  direction: { x: number; y: number },
  pipDist = 0.15,
): { pip: Landmark; tip: Landmark } {
  const len = Math.hypot(direction.x, direction.y) || 1;
  const ux = direction.x / len;
  const uy = direction.y / len;
  return {
    pip: { x: wrist.x + ux * pipDist, y: wrist.y + uy * pipDist },
    tip: { x: wrist.x + ux * pipDist * 2.0, y: wrist.y + uy * pipDist * 2.0 },
  };
}

describe('classifyLandmarks', () => {
  it('detects a pointing hand (index extended, others curled)', () => {
    const wrist = { x: 0.5, y: 0.8 };
    const index = extend(wrist, { x: 0, y: -1 });
    const middle = curl(wrist, { x: 0.5, y: 0.65 });
    const ring = curl(wrist, { x: 0.55, y: 0.65 });
    const pinky = curl(wrist, { x: 0.6, y: 0.65 });
    const thumb = curl(wrist, { x: 0.4, y: 0.7 });

    const lm = hand({
      3: thumb.pip,
      4: thumb.tip,
      6: index.pip,
      8: index.tip,
      10: middle.pip,
      12: middle.tip,
      14: ring.pip,
      16: ring.tip,
      18: pinky.pip,
      20: pinky.tip,
    });

    const r = classifyLandmarks(lm);
    expect(r.isPoint).toBe(true);
    expect(r.isOpenPalm).toBe(false);
    expect(r.tip.x).toBeCloseTo(index.tip.x, 5);
    expect(r.tip.y).toBeCloseTo(index.tip.y, 5);
    expect(r.palmSize).toBeGreaterThan(0);
  });

  it('reports pinch ratio and midpoint for a pinch hand', () => {
    const wrist = { x: 0.5, y: 0.8 };
    // Thumb tip and index tip nearly touching
    const thumbTip = { x: 0.48, y: 0.5 };
    const indexTip = { x: 0.52, y: 0.5 };
    const lm = hand({
      3: { x: 0.45, y: 0.6 },
      4: thumbTip,
      6: { x: 0.5, y: 0.6 },
      8: indexTip,
      10: { x: 0.5, y: 0.65 },
      12: { x: 0.5, y: 0.62 },
      14: { x: 0.55, y: 0.65 },
      16: { x: 0.55, y: 0.62 },
      18: { x: 0.6, y: 0.65 },
      20: { x: 0.6, y: 0.62 },
    });

    const r = classifyLandmarks(lm);
    expect(r.pinchRatio).toBeLessThan(0.3);
    expect(r.pinchMidpoint.x).toBeCloseTo(0.5, 5);
    expect(r.pinchMidpoint.y).toBeCloseTo(0.5, 5);
    expect(r.palmSize).toBeCloseTo(Math.hypot(0, 0.8 - 0.55), 5);
  });

  it('detects open palm when all fingers extended and palm facing', () => {
    const wrist = { x: 0.5, y: 0.8 };
    const thumb = extend(wrist, { x: -1, y: -0.3 });
    const index = extend(wrist, { x: -0.2, y: -1 });
    const middle = extend(wrist, { x: 0, y: -1 });
    const ring = extend(wrist, { x: 0.2, y: -1 });
    const pinky = extend(wrist, { x: 0.4, y: -1 });

    const lm = hand({
      3: thumb.pip,
      4: thumb.tip,
      6: index.pip,
      8: index.tip,
      10: middle.pip,
      12: middle.tip,
      14: ring.pip,
      16: ring.tip,
      18: pinky.pip,
      20: pinky.tip,
      // Facing: L5 left, L17 right of wrist → positive cross for right hand
      5: { x: 0.4, y: 0.6, z: 0 },
      17: { x: 0.6, y: 0.6, z: 0 },
      0: { x: 0.5, y: 0.8, z: 0 },
    });

    const r = classifyLandmarks(lm, { leftHand: false });
    expect(r.isOpenPalm).toBe(true);
    expect(r.isPoint).toBe(false);
  });

  it('treats a fist / all-curled hand as neither point nor open palm', () => {
    const wrist = { x: 0.5, y: 0.8 };
    const thumb = curl(wrist, { x: 0.4, y: 0.7 });
    const index = curl(wrist, { x: 0.45, y: 0.65 });
    const middle = curl(wrist, { x: 0.5, y: 0.65 });
    const ring = curl(wrist, { x: 0.55, y: 0.65 });
    const pinky = curl(wrist, { x: 0.6, y: 0.65 });

    const lm = hand({
      3: thumb.pip,
      4: thumb.tip,
      6: index.pip,
      8: index.tip,
      10: middle.pip,
      12: middle.tip,
      14: ring.pip,
      16: ring.tip,
      18: pinky.pip,
      20: pinky.tip,
    });

    const r = classifyLandmarks(lm);
    expect(r.isPoint).toBe(false);
    expect(r.isOpenPalm).toBe(false);
  });

  it('assumes palm facing when z is unavailable', () => {
    const wrist = { x: 0.5, y: 0.8 };
    const thumb = extend(wrist, { x: -1, y: -0.3 });
    const index = extend(wrist, { x: -0.2, y: -1 });
    const middle = extend(wrist, { x: 0, y: -1 });
    const ring = extend(wrist, { x: 0.2, y: -1 });
    const pinky = extend(wrist, { x: 0.4, y: -1 });

    const lm = hand({
      3: thumb.pip,
      4: thumb.tip,
      6: index.pip,
      8: index.tip,
      10: middle.pip,
      12: middle.tip,
      14: ring.pip,
      16: ring.tip,
      18: pinky.pip,
      20: pinky.tip,
      // No z on any landmark
    });

    expect(classifyLandmarks(lm).isOpenPalm).toBe(true);
  });
});
