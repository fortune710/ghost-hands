/**
 * Active-zone mapping + 4-point homography (PRD §4.3 / §6.4).
 * Pure TypeScript, no DOM deps.
 */

export interface ActiveZone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Point2D {
  x: number;
  y: number;
}

/** Row-major 3×3 homography matrix. */
export type Homography = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type TipMapping =
  | { kind: 'zone'; zone: ActiveZone }
  | { kind: 'homography'; H: Homography };

/** Default auto-mapping zone: center ~70% (0.15..0.85 on each axis). */
export const DEFAULT_ACTIVE_ZONE: ActiveZone = {
  x0: 0.15,
  y0: 0.15,
  x1: 0.85,
  y1: 0.85,
};

export function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Map a normalized camera-space point through zone Z into display space [0,1]. */
export function mapToDisplay(
  point: Point2D,
  zone: ActiveZone = DEFAULT_ACTIVE_ZONE,
): Point2D {
  const w = zone.x1 - zone.x0;
  const h = zone.y1 - zone.y0;
  if (w <= 0 || h <= 0) {
    return { x: clamp01(point.x), y: clamp01(point.y) };
  }
  return {
    x: clamp01((point.x - zone.x0) / w),
    y: clamp01((point.y - zone.y0) / h),
  };
}

/** Sanity-check a calibrated zone (PRD §4.3). */
export function isValidZone(zone: ActiveZone): boolean {
  const w = zone.x1 - zone.x0;
  const h = zone.y1 - zone.y0;
  return w >= 0.2 && w <= 1.0 && h >= 0.2 && h <= 1.0;
}

/** Axis-aligned zone from 2 calibration points (top-left + bottom-right). */
export function zoneFromTwoPoints(tl: Point2D, br: Point2D): ActiveZone | null {
  const zone: ActiveZone = {
    x0: Math.min(tl.x, br.x),
    y0: Math.min(tl.y, br.y),
    x1: Math.max(tl.x, br.x),
    y1: Math.max(tl.y, br.y),
  };
  return isValidZone(zone) ? zone : null;
}

/**
 * Axis-aligned bounding zone from four calibration corners
 * (tl, tr, br, bl), sanity-checked via isValidZone.
 */
export function zoneFromFourCorners(
  tl: Point2D,
  tr: Point2D,
  br: Point2D,
  bl: Point2D,
): ActiveZone | null {
  const xs = [tl.x, tr.x, br.x, bl.x];
  const ys = [tl.y, tr.y, br.y, bl.y];
  const zone: ActiveZone = {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
  return isValidZone(zone) ? zone : null;
}

const UNIT_SQUARE: readonly [Point2D, Point2D, Point2D, Point2D] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Solve 8×8 linear system Ax = b via Gaussian elimination with partial pivoting. */
function solveLinear8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(M[pivot]![col]!) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }
    const diag = M[col]![col]!;
    for (let c = col; c <= n; c++) M[col]![c]! /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }

  return M.map((row) => row[n]!);
}

/**
 * Direct Linear Transform (DLT) homography from 4 point correspondences.
 * src = camera-space corners, dst = display corners (default unit square).
 */
export function homographyFromFourCorners(
  srcCorners: readonly [Point2D, Point2D, Point2D, Point2D],
  dstCorners: readonly [Point2D, Point2D, Point2D, Point2D] = UNIT_SQUARE,
): Homography | null {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const s = srcCorners[i]!;
    const d = dstCorners[i]!;
    // x' = (h0 x + h1 y + h2) / (h6 x + h7 y + 1)
    // y' = (h3 x + h4 y + h5) / (h6 x + h7 y + 1)
    A.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    b.push(d.x);
    A.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    b.push(d.y);
  }

  const h = solveLinear8(A, b);
  if (!h) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

/** Apply homography H to a point (no clamp). */
export function applyHomography(H: Homography, point: Point2D): Point2D {
  const w = H[6] * point.x + H[7] * point.y + H[8];
  if (Math.abs(w) < 1e-12) return { x: point.x, y: point.y };
  return {
    x: (H[0] * point.x + H[1] * point.y + H[2]) / w,
    y: (H[3] * point.x + H[4] * point.y + H[5]) / w,
  };
}

/** Apply homography and clamp result to [0,1]. */
export function mapWithHomography(point: Point2D, H: Homography): Point2D {
  const p = applyHomography(H, point);
  return { x: clamp01(p.x), y: clamp01(p.y) };
}

/** Map a tip through either an active zone or a homography. */
export function mapTip(point: Point2D, mapping: TipMapping): Point2D {
  if (mapping.kind === 'zone') {
    return mapToDisplay(point, mapping.zone);
  }
  return mapWithHomography(point, mapping.H);
}
