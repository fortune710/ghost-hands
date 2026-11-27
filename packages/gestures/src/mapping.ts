/**
 * Active-zone mapping (PRD §4.3 / §6.4).
 * Default: center ~70% of camera frame → full display.
 */

export interface ActiveZone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

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
  point: { x: number; y: number },
  zone: ActiveZone = DEFAULT_ACTIVE_ZONE,
): { x: number; y: number } {
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
export function zoneFromTwoPoints(
  tl: { x: number; y: number },
  br: { x: number; y: number },
): ActiveZone | null {
  const zone: ActiveZone = {
    x0: Math.min(tl.x, br.x),
    y0: Math.min(tl.y, br.y),
    x1: Math.max(tl.x, br.x),
    y1: Math.max(tl.y, br.y),
  };
  return isValidZone(zone) ? zone : null;
}
