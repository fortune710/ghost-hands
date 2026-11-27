import type { HandSample, Landmark3 } from './landmarks';

export type SyntheticMode = 'point' | 'pinch' | 'palm' | 'none';

export interface SyntheticHand {
  setTarget(x: number, y: number): void;
  setMode(mode: SyntheticMode): void;
  getMode(): SyntheticMode;
  sample(tMs: number): HandSample;
}

interface Vec2 {
  x: number;
  y: number;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function extendFinger(
  wrist: Vec2,
  mcp: Vec2,
  dir: Vec2,
  length: number,
): { mcp: Landmark3; pip: Landmark3; dip: Landmark3; tip: Landmark3 } {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const pipDist = length * 0.45;
  const dipDist = length * 0.72;
  const tipDist = length;
  return {
    mcp: { x: mcp.x, y: mcp.y, z: 0 },
    pip: { x: mcp.x + ux * pipDist, y: mcp.y + uy * pipDist, z: 0 },
    dip: { x: mcp.x + ux * dipDist, y: mcp.y + uy * dipDist, z: 0 },
    tip: { x: mcp.x + ux * tipDist, y: mcp.y + uy * tipDist, z: 0 },
  };
}

function curlFinger(
  wrist: Vec2,
  mcp: Vec2,
  dir: Vec2,
  length: number,
): { mcp: Landmark3; pip: Landmark3; dip: Landmark3; tip: Landmark3 } {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const pip = {
    x: mcp.x + ux * length * 0.35,
    y: mcp.y + uy * length * 0.35,
    z: 0,
  };
  // Tip closer to wrist than PIP * 1.15 → not extended
  const tip = {
    x: wrist.x + (pip.x - wrist.x) * 0.55,
    y: wrist.y + (pip.y - wrist.y) * 0.55,
    z: 0,
  };
  const dip = {
    x: (pip.x + tip.x) / 2,
    y: (pip.y + tip.y) / 2,
    z: 0,
  };
  return { mcp: { x: mcp.x, y: mcp.y, z: 0 }, pip, dip, tip };
}

/**
 * Build 21 MediaPipe-like landmarks for a right hand centered near `tipTarget`.
 * Geometry is tuned so `classifyLandmarks` recognizes point / pinch / palm.
 */
export function buildSyntheticLandmarks(
  tipTarget: Vec2,
  mode: SyntheticMode,
): Landmark3[] {
  const landmarks: Landmark3[] = Array.from({ length: 21 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));

  if (mode === 'none') return landmarks;

  // Wrist sits below the tip; palm faces camera (index MCP left of pinky for right hand).
  const wrist: Vec2 = {
    x: clamp01(tipTarget.x + 0.02),
    y: clamp01(tipTarget.y + 0.22),
  };
  landmarks[0] = { x: wrist.x, y: wrist.y, z: 0 };

  const palmUp = { x: 0, y: -1 };
  const indexMcp: Vec2 = { x: wrist.x - 0.04, y: wrist.y - 0.08 };
  const middleMcp: Vec2 = { x: wrist.x, y: wrist.y - 0.09 };
  const ringMcp: Vec2 = { x: wrist.x + 0.035, y: wrist.y - 0.08 };
  const pinkyMcp: Vec2 = { x: wrist.x + 0.065, y: wrist.y - 0.07 };
  const thumbCmc: Vec2 = { x: wrist.x - 0.05, y: wrist.y - 0.02 };

  landmarks[5] = { x: indexMcp.x, y: indexMcp.y, z: 0 };
  landmarks[9] = { x: middleMcp.x, y: middleMcp.y, z: 0 };
  landmarks[13] = { x: ringMcp.x, y: ringMcp.y, z: 0 };
  landmarks[17] = { x: pinkyMcp.x, y: pinkyMcp.y, z: 0 };
  landmarks[1] = { x: thumbCmc.x, y: thumbCmc.y, z: 0 };

  const fingerLen = 0.16;
  const thumbLen = 0.12;

  if (mode === 'palm') {
    const thumb = extendFinger(wrist, thumbCmc, { x: -0.7, y: -0.7 }, thumbLen);
    const index = extendFinger(wrist, indexMcp, palmUp, fingerLen);
    const middle = extendFinger(wrist, middleMcp, palmUp, fingerLen * 1.05);
    const ring = extendFinger(wrist, ringMcp, palmUp, fingerLen * 0.95);
    const pinky = extendFinger(wrist, pinkyMcp, palmUp, fingerLen * 0.85);
    placeFinger(landmarks, 1, thumb);
    placeFinger(landmarks, 5, index);
    placeFinger(landmarks, 9, middle);
    placeFinger(landmarks, 13, ring);
    placeFinger(landmarks, 17, pinky);
  } else if (mode === 'pinch') {
    // Index tip near target; thumb tip close → low pinchRatio
    const index = extendFinger(wrist, indexMcp, palmUp, fingerLen * 0.85);
    // Force tip to target
    index.tip = { x: tipTarget.x, y: tipTarget.y, z: 0 };
    index.dip = {
      x: index.pip.x + (index.tip.x - index.pip.x) * 0.6,
      y: index.pip.y + (index.tip.y - index.pip.y) * 0.6,
      z: 0,
    };
    const thumbTip = {
      x: tipTarget.x - 0.012,
      y: tipTarget.y + 0.008,
      z: 0,
    };
    landmarks[2] = {
      x: thumbCmc.x - 0.03,
      y: thumbCmc.y - 0.04,
      z: 0,
    };
    landmarks[3] = {
      x: (landmarks[2]!.x + thumbTip.x) / 2,
      y: (landmarks[2]!.y + thumbTip.y) / 2,
      z: 0,
    };
    landmarks[4] = thumbTip;
    placeFinger(landmarks, 5, index);
    const middle = curlFinger(wrist, middleMcp, palmUp, fingerLen);
    const ring = curlFinger(wrist, ringMcp, palmUp, fingerLen);
    const pinky = curlFinger(wrist, pinkyMcp, palmUp, fingerLen);
    placeFinger(landmarks, 9, middle);
    placeFinger(landmarks, 13, ring);
    placeFinger(landmarks, 17, pinky);
  } else {
    // point — index extended to tipTarget; others curled
    const indexDir = {
      x: tipTarget.x - indexMcp.x,
      y: tipTarget.y - indexMcp.y,
    };
    const indexLen = Math.max(0.12, Math.hypot(indexDir.x, indexDir.y));
    const index = extendFinger(wrist, indexMcp, indexDir, indexLen);
    index.tip = { x: tipTarget.x, y: tipTarget.y, z: 0 };
    placeFinger(landmarks, 5, index);

    const thumb = curlFinger(wrist, thumbCmc, { x: -0.6, y: -0.5 }, thumbLen);
    placeFinger(landmarks, 1, thumb);

    const middle = curlFinger(wrist, middleMcp, palmUp, fingerLen);
    const ring = curlFinger(wrist, ringMcp, palmUp, fingerLen);
    const pinky = curlFinger(wrist, pinkyMcp, palmUp, fingerLen);
    placeFinger(landmarks, 9, middle);
    placeFinger(landmarks, 13, ring);
    placeFinger(landmarks, 17, pinky);
  }

  // Clamp all
  for (const lm of landmarks) {
    lm.x = clamp01(lm.x);
    lm.y = clamp01(lm.y);
  }
  return landmarks;
}

function placeFinger(
  landmarks: Landmark3[],
  base: number,
  finger: { mcp: Landmark3; pip: Landmark3; dip: Landmark3; tip: Landmark3 },
): void {
  // thumb base=1 → 1 CMC already set, 2/3/4; fingers base=5/9/13/17 → mcp/pip/dip/tip
  if (base === 1) {
    landmarks[1] = finger.mcp;
    landmarks[2] = finger.pip;
    landmarks[3] = finger.dip;
    landmarks[4] = finger.tip;
  } else {
    landmarks[base] = finger.mcp;
    landmarks[base + 1] = finger.pip;
    landmarks[base + 2] = finger.dip;
    landmarks[base + 3] = finger.tip;
  }
}

export function createSyntheticHand(
  initial: { x?: number; y?: number; mode?: SyntheticMode } = {},
): SyntheticHand {
  let target = {
    x: clamp01(initial.x ?? 0.5),
    y: clamp01(initial.y ?? 0.5),
  };
  let mode: SyntheticMode = initial.mode ?? 'point';

  return {
    setTarget(x: number, y: number) {
      target = { x: clamp01(x), y: clamp01(y) };
    },
    setMode(next: SyntheticMode) {
      mode = next;
    },
    getMode() {
      return mode;
    },
    sample(tMs: number): HandSample {
      if (mode === 'none') {
        return {
          landmarks: buildSyntheticLandmarks(target, 'none'),
          leftHand: false,
          confidence: 0,
          tMs,
        };
      }
      return {
        landmarks: buildSyntheticLandmarks(target, mode),
        leftHand: false,
        confidence: 0.99,
        tMs,
      };
    },
  };
}
