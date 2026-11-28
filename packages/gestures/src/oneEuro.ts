/**
 * One-Euro Filter — adaptive low-pass for landmark smoothing (PRD §6.2).
 * Pure TypeScript, no DOM deps.
 */

export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

/** Landmark defaults (PRD §6.2). */
export const LANDMARK_ONE_EURO: OneEuroParams = {
  minCutoff: 1.0,
  beta: 0.007,
  dCutoff: 1.0,
};

/** Index fingertip (L8) tip filter (PRD §6.2). */
export const TIP_ONE_EURO: OneEuroParams = {
  minCutoff: 1.7,
  beta: 0.02,
  dCutoff: 1.0,
};

/** Default tip dead zone in normalized units while gesture = point. */
export const TIP_DEAD_ZONE = 0.002;

function smoothingFactor(te: number, cutoff: number): number {
  const r = 2 * Math.PI * cutoff * te;
  return r / (r + 1);
}

function expSmooth(a: number, x: number, prev: number): number {
  return a * x + (1 - a) * prev;
}

class OneEuroAxis {
  private initialized = false;
  private xPrev = 0;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(private readonly params: OneEuroParams) {}

  filter(t: number, x: number): number {
    if (!this.initialized) {
      this.initialized = true;
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = t;
      return x;
    }

    const te = Math.max(1e-6, t - this.tPrev);
    const aD = smoothingFactor(te, this.params.dCutoff);
    const dx = (x - this.xPrev) / te;
    const dxHat = expSmooth(aD, dx, this.dxPrev);
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(dxHat);
    const a = smoothingFactor(te, cutoff);
    const xHat = expSmooth(a, x, this.xPrev);

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return xHat;
  }

  reset(): void {
    this.initialized = false;
  }
}

export class OneEuroFilter2D {
  private readonly x: OneEuroAxis;
  private readonly y: OneEuroAxis;
  readonly params: OneEuroParams;

  constructor(params: Partial<OneEuroParams> = {}) {
    const merged = { ...LANDMARK_ONE_EURO, ...params };
    this.params = merged;
    this.x = new OneEuroAxis(merged);
    this.y = new OneEuroAxis(merged);
  }

  filter(tSeconds: number, point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.x.filter(tSeconds, point.x),
      y: this.y.filter(tSeconds, point.y),
    };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
  }
}

/** Filter bank for 21 hand landmarks. */
export class LandmarkSmoother {
  private readonly filters: OneEuroFilter2D[];

  constructor(params: Partial<OneEuroParams> = {}) {
    this.filters = Array.from(
      { length: 21 },
      () => new OneEuroFilter2D({ ...LANDMARK_ONE_EURO, ...params }),
    );
  }

  smooth(
    tSeconds: number,
    landmarks: Array<{ x: number; y: number; z?: number }>,
  ): Array<{ x: number; y: number; z?: number }> {
    return landmarks.map((lm, i) => {
      const filtered = this.filters[i]!.filter(tSeconds, lm);
      return lm.z !== undefined
        ? { x: filtered.x, y: filtered.y, z: lm.z }
        : { x: filtered.x, y: filtered.y };
    });
  }

  reset(): void {
    for (const f of this.filters) f.reset();
  }
}

export interface TipSmootherOptions {
  /** Override tip One-Euro params. */
  params?: Partial<OneEuroParams>;
  /** Dead zone radius in normalized units (default 0.002). */
  deadZone?: number;
}

/**
 * Tip (L8) smoother: tip One-Euro params + optional dead zone while pointing.
 */
export class TipSmoother {
  private readonly euro: OneEuroFilter2D;
  private readonly deadZone: number;
  private lastOutput: { x: number; y: number } | null = null;

  constructor(opts: TipSmootherOptions = {}) {
    this.euro = new OneEuroFilter2D({ ...TIP_ONE_EURO, ...opts.params });
    this.deadZone = opts.deadZone ?? TIP_DEAD_ZONE;
  }

  get params(): OneEuroParams {
    return this.euro.params;
  }

  /**
   * @param enableDeadZone — when true (e.g. gesture = point), hold tip still
   *   if the filtered delta is within the dead zone.
   */
  filter(
    tSeconds: number,
    point: { x: number; y: number },
    enableDeadZone = false,
  ): { x: number; y: number } {
    const smoothed = this.euro.filter(tSeconds, point);

    if (enableDeadZone && this.lastOutput !== null) {
      const dx = smoothed.x - this.lastOutput.x;
      const dy = smoothed.y - this.lastOutput.y;
      if (Math.hypot(dx, dy) < this.deadZone) {
        return { x: this.lastOutput.x, y: this.lastOutput.y };
      }
    }

    this.lastOutput = { x: smoothed.x, y: smoothed.y };
    return this.lastOutput;
  }

  reset(): void {
    this.euro.reset();
    this.lastOutput = null;
  }
}
