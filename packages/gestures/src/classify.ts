/**
 * Landmark classification heuristics (PRD §4.1).
 * Pure TypeScript, no DOM deps.
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

export interface ClassifyOptions {
  /** True when the detected hand is the left hand (affects palm-facing). */
  leftHand?: boolean;
  /** Tip must be this multiple of PIP distance from wrist to count as extended. */
  extendRatio?: number;
}

export interface ClassifyResult {
  isPoint: boolean;
  pinchRatio: number;
  isOpenPalm: boolean;
  tip: { x: number; y: number };
  pinchMidpoint: { x: number; y: number };
  palmSize: number;
}

const EXTEND_RATIO = 1.15;

/** MediaPipe tip / PIP (IP for thumb) indices. */
const FINGERS = [
  { tip: 4, pip: 3 }, // thumb
  { tip: 8, pip: 6 }, // index
  { tip: 12, pip: 10 }, // middle
  { tip: 16, pip: 14 }, // ring
  { tip: 20, pip: 18 }, // pinky
] as const;

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  if (a.z !== undefined && b.z !== undefined) {
    return Math.hypot(dx, dy, a.z - b.z);
  }
  return Math.hypot(dx, dy);
}

function extended(
  landmarks: Landmark[],
  tipIdx: number,
  pipIdx: number,
  wrist: Landmark,
  ratio: number,
): boolean {
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx];
  if (!tip || !pip) return false;
  return dist(tip, wrist) > dist(pip, wrist) * ratio;
}

/**
 * Handedness-aware palm facing from cross(L5−L0, L17−L0).
 * Uses optional z when present; assumes facing if z is unavailable.
 */
export function palmFacing(landmarks: Landmark[], leftHand = false): boolean {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  if (!wrist || !indexMcp || !pinkyMcp) return true;

  const hasZ =
    wrist.z !== undefined && indexMcp.z !== undefined && pinkyMcp.z !== undefined;
  if (!hasZ) return true;

  const ax = indexMcp.x - wrist.x;
  const ay = indexMcp.y - wrist.y;
  const bx = pinkyMcp.x - wrist.x;
  const by = pinkyMcp.y - wrist.y;

  // Image-plane cross (z of 3D cross when using x,y only). Positive → right
  // hand palm facing camera under MediaPipe image coords (x right, y down).
  const normalZ = ax * by - ay * bx;
  const sign = leftHand ? -1 : 1;
  return sign * normalZ > 0;
}

export function classifyLandmarks(
  landmarks: Landmark[],
  opts: ClassifyOptions = {},
): ClassifyResult {
  const ratio = opts.extendRatio ?? EXTEND_RATIO;
  const wrist = landmarks[0] ?? { x: 0, y: 0 };
  const middleMcp = landmarks[9] ?? wrist;
  const palmSize = Math.max(1e-6, dist(wrist, middleMcp));

  const fingers = FINGERS.map((f) =>
    extended(landmarks, f.tip, f.pip, wrist, ratio),
  );
  const [thumbExt, indexExt, middleExt, ringExt, pinkyExt] = fingers;

  const thumbTip = landmarks[4] ?? wrist;
  const indexTip = landmarks[8] ?? wrist;
  const pinchRatio = dist(thumbTip, indexTip) / palmSize;

  const isPoint = Boolean(indexExt && !middleExt && !ringExt && !pinkyExt);
  const allExtended = Boolean(
    thumbExt && indexExt && middleExt && ringExt && pinkyExt,
  );
  const facing = palmFacing(landmarks, opts.leftHand ?? false);
  const isOpenPalm = allExtended && facing;

  return {
    isPoint,
    pinchRatio,
    isOpenPalm,
    tip: { x: indexTip.x, y: indexTip.y },
    pinchMidpoint: {
      x: (thumbTip.x + indexTip.x) / 2,
      y: (thumbTip.y + indexTip.y) / 2,
    },
    palmSize,
  };
}
