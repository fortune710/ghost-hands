/**
 * One-Euro Filter — adaptive low-pass for landmark smoothing (PRD §6.2).
 * Pure TypeScript, no DOM deps.
 */

export interface OneEuroParams {
  minCutoff: number;
  beta: number;
  dCutoff: number;
}

const DEFAULTS: OneEuroParams = {
  minCutoff: 1.0,
  beta: 0.007,
  dCutoff: 1.0,
};

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

  constructor(params: Partial<OneEuroParams> = {}) {
    const merged = { ...DEFAULTS, ...params };
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
    this.filters = Array.from({ length: 21 }, () => new OneEuroFilter2D(params));
  }

  smooth(
    tSeconds: number,
    landmarks: Array<{ x: number; y: number }>,
  ): Array<{ x: number; y: number }> {
    return landmarks.map((lm, i) => this.filters[i]!.filter(tSeconds, lm));
  }

  reset(): void {
    for (const f of this.filters) f.reset();
  }
}
