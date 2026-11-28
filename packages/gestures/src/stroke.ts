/**
 * Stroke end classification / arrow snap (PRD §4.2).
 * Pure TypeScript, no DOM deps.
 */

export interface StrokePoint {
  x: number;
  y: number;
  /** Timestamp in ms (monotonic). */
  t: number;
}

export interface StrokeClassifyOptions {
  /** Display width in px for length checks (default 1920). */
  displayWidth?: number;
  /** Display height in px for length checks (default 1080). */
  displayHeight?: number;
  /** Optional uniform scale override: px = normalized * pxScale. */
  pxScale?: number;
  /** Max path/chord ratio for arrow snap (default 1.3). */
  arrowPathRatio?: number;
  /** Max stroke duration for arrow snap in ms (default 600). */
  arrowMaxMs?: number;
  /** Min straight-line distance in px for arrow snap (default 40). */
  arrowMinChordPx?: number;
  /** Discard strokes shorter than this path length in px (default 12). */
  minStrokePx?: number;
}

export type StrokeKind = 'arrow' | 'free' | 'discard';

const DEFAULT_W = 1920;
const DEFAULT_H = 1080;

function toPx(
  p: { x: number; y: number },
  w: number,
  h: number,
): { x: number; y: number } {
  return { x: p.x * w, y: p.y * h };
}

/**
 * Classify a finished stroke as arrow / free / discard (PRD §4.2).
 *
 * - `discard` if path length < minStrokePx
 * - `arrow` if path_length < 1.3 × chord AND duration < 600 ms AND chord ≥ 40 px
 * - `free` otherwise
 */
export function classifyStrokeEnd(
  points: StrokePoint[],
  opts: StrokeClassifyOptions = {},
): StrokeKind {
  if (points.length < 2) return 'discard';

  const w = opts.pxScale ?? opts.displayWidth ?? DEFAULT_W;
  const h = opts.pxScale ?? opts.displayHeight ?? DEFAULT_H;
  const arrowPathRatio = opts.arrowPathRatio ?? 1.3;
  const arrowMaxMs = opts.arrowMaxMs ?? 600;
  const arrowMinChordPx = opts.arrowMinChordPx ?? 40;
  const minStrokePx = opts.minStrokePx ?? 12;

  const px = points.map((p) => toPx(p, w, h));
  let pathLength = 0;
  for (let i = 1; i < px.length; i++) {
    const a = px[i - 1]!;
    const b = px[i]!;
    pathLength += Math.hypot(b.x - a.x, b.y - a.y);
  }

  if (pathLength < minStrokePx) return 'discard';

  const first = px[0]!;
  const last = px[px.length - 1]!;
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  const duration = points[points.length - 1]!.t - points[0]!.t;

  if (
    pathLength < arrowPathRatio * chord &&
    duration < arrowMaxMs &&
    chord >= arrowMinChordPx
  ) {
    return 'arrow';
  }

  return 'free';
}
