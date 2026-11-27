/**
 * Fading ink (PRD §4.2 / §7.3).
 * Hold 3s / fade 1.5s / max 2000 pts / 50 strokes / min 12px.
 */

export interface InkPoint {
  x: number;
  y: number;
  t: number;
}

export type InkKind = 'free' | 'arrow' | 'highlight';

export interface InkStroke {
  id: string;
  points: InkPoint[];
  kind: InkKind;
  color: string;
  createdAt: number;
  endedAt?: number;
}

export interface InkRendererOptions {
  /** Fully visible duration (ms). */
  holdMs: number;
  /** Fade-to-zero duration (ms). */
  fadeMs: number;
  maxPoints: number;
  maxStrokes: number;
  minStrokePx: number;
}

const DEFAULTS: InkRendererOptions = {
  holdMs: 3000,
  fadeMs: 1500,
  maxPoints: 2000,
  maxStrokes: 50,
  minStrokePx: 12,
};

/** Duration of the open-palm radial clear wipe (ms). */
export const CLEAR_WIPE_MS = 250;

export class InkLayer {
  private strokes: InkStroke[] = [];
  private readonly opts: InkRendererOptions;
  /** When set, strokes fade out over CLEAR_WIPE_MS then empty. */
  private clearWipeStartedAt: number | null = null;

  constructor(opts: Partial<InkRendererOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  get all(): readonly InkStroke[] {
    return this.strokes;
  }

  start(id: string, x: number, y: number, t: number, color: string, kind: InkKind = 'highlight'): void {
    this.strokes.push({
      id,
      points: [{ x, y, t }],
      kind,
      color,
      createdAt: t,
    });
    this.trim();
  }

  append(id: string, x: number, y: number, t: number): void {
    const stroke = this.strokes.find((s) => s.id === id && s.endedAt === undefined);
    if (!stroke) return;
    if (stroke.points.length >= this.opts.maxPoints) return;
    stroke.points.push({ x, y, t });
  }

  end(id: string, kind: InkKind, t: number): void {
    const stroke = this.strokes.find((s) => s.id === id && s.endedAt === undefined);
    if (!stroke) return;
    stroke.endedAt = t;
    stroke.kind = kind;
    const len = pathLength(stroke.points);
    if (len < this.opts.minStrokePx) {
      this.strokes = this.strokes.filter((s) => s.id !== id);
    }
  }

  /** Immediate clear — strokes emptied now. */
  clear(): void {
    this.strokes = [];
    this.clearWipeStartedAt = null;
  }

  /**
   * Begin a 250ms clear wipe. Strokes remain until wipe completes, then empty.
   * `clearWipeAlpha(now)` goes 1 → 0 over CLEAR_WIPE_MS.
   */
  beginClearWipe(now: number): void {
    if (this.strokes.length === 0) {
      this.clearWipeStartedAt = null;
      return;
    }
    this.clearWipeStartedAt = now;
  }

  /** Alias for beginClearWipe — optional fade the renderer can drive. */
  startClearAnimation(now: number): void {
    this.beginClearWipe(now);
  }

  /**
   * Alpha multiplier during an active clear wipe (1 at start → 0 at 250ms).
   * Returns 1 when no wipe is active.
   */
  clearWipeAlpha(now: number): number {
    if (this.clearWipeStartedAt === null) return 1;
    const t = (now - this.clearWipeStartedAt) / CLEAR_WIPE_MS;
    if (t >= 1) return 0;
    if (t <= 0) return 1;
    return 1 - t;
  }

  /** True while a wipe is in progress (strokes not yet emptied). */
  isClearWiping(now: number): boolean {
    if (this.clearWipeStartedAt === null) return false;
    return now - this.clearWipeStartedAt < CLEAR_WIPE_MS;
  }

  /** Finish wipe if elapsed; drop fully faded strokes. Returns whether anything remains. */
  prune(now: number): boolean {
    if (this.clearWipeStartedAt !== null && now - this.clearWipeStartedAt >= CLEAR_WIPE_MS) {
      this.strokes = [];
      this.clearWipeStartedAt = null;
      return false;
    }

    const life = this.opts.holdMs + this.opts.fadeMs;
    this.strokes = this.strokes.filter((s) => {
      const end = s.endedAt ?? now;
      return now - end < life;
    });
    return this.strokes.length > 0;
  }

  alphaFor(stroke: InkStroke, now: number): number {
    const end = stroke.endedAt ?? now;
    const age = now - end;
    if (age <= this.opts.holdMs) return 1;
    const fadeAge = age - this.opts.holdMs;
    if (fadeAge >= this.opts.fadeMs) return 0;
    return 1 - fadeAge / this.opts.fadeMs;
  }

  draw(ctx: CanvasRenderingContext2D, now: number, width: number, height: number): void {
    const wipe = this.clearWipeAlpha(now);
    if (wipe <= 0) {
      if (this.clearWipeStartedAt !== null) {
        this.strokes = [];
        this.clearWipeStartedAt = null;
      }
      return;
    }

    for (const stroke of this.strokes) {
      const alpha = this.alphaFor(stroke, now) * wipe;
      if (alpha <= 0 || stroke.points.length === 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha * (stroke.kind === 'highlight' ? 0.4 : 0.85);
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.kind === 'highlight' ? 14 : 4;

      const pts = stroke.points.map((p) => ({ x: p.x * width, y: p.y * height }));

      // Ended arrows redraw as a clean straight line from first → last point
      if (stroke.kind === 'arrow' && stroke.endedAt !== undefined && pts.length >= 2) {
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        drawArrowHead(ctx, first.x, first.y, last.x, last.y, 14);
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i]!.x, pts[i]!.y);
        }
        ctx.stroke();

        if (stroke.kind === 'arrow' && pts.length >= 2) {
          const a = pts[pts.length - 2]!;
          const b = pts[pts.length - 1]!;
          drawArrowHead(ctx, a.x, a.y, b.x, b.y, 14);
        }
      }
      ctx.restore();
    }
  }

  private trim(): void {
    while (this.strokes.length > this.opts.maxStrokes) {
      this.strokes.shift();
    }
  }
}

/**
 * Path length in pixel space for normalized [0,1] points on a `width`×`height` canvas.
 */
export function pathLengthPx(points: InkPoint[], width: number, height: number): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = (b.x - a.x) * width;
    const dy = (b.y - a.y) * height;
    len += Math.hypot(dx, dy);
  }
  return len;
}

/** Normalized-space length scaled as if canvas were 1000×1000 (used for minStrokePx). */
function pathLength(points: InkPoint[]): number {
  return pathLengthPx(points, 1000, 1000);
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  size: number,
): void {
  const angle = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - size * Math.cos(angle - Math.PI / 6), y1 - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x1 - size * Math.cos(angle + Math.PI / 6), y1 - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}
