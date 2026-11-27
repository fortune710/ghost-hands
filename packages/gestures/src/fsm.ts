/**
 * Gesture FSM scaffold (PRD §4.1).
 * Full MediaPipe landmark heuristics land in M1; M0 provides the state machine API.
 */

import { Gesture } from '@ghost-hands/protocol';

export type GestureState = 'NONE' | 'POINT' | 'PINCH' | 'CLEAR';

export interface GestureSample {
  /** Whether a hand is currently detected. */
  handPresent: boolean;
  /** Index extended; middle/ring/pinky curled. */
  isPoint: boolean;
  /** pinch_ratio < enter / > exit Schmitt trigger. */
  pinchRatio: number;
  /** All five fingers extended + palm facing. */
  isOpenPalm: boolean;
  /** Frame timestamp in ms (monotonic). */
  tMs: number;
}

export interface GestureTransition {
  state: GestureState;
  gesture: Gesture;
  /** Emitted once when entering PINCH. */
  strokeStart?: boolean;
  /** Emitted once when leaving PINCH. */
  strokeEnd?: boolean;
  /** Emitted once when open-palm clear fires. */
  clear?: boolean;
}

export interface GestureFsmOptions {
  pinchEnter: number;
  pinchExit: number;
  pointEnterFrames: number;
  pointExitFrames: number;
  noHandMs: number;
  palmHoldMs: number;
}

const DEFAULTS: GestureFsmOptions = {
  pinchEnter: 0.25,
  pinchExit: 0.35,
  pointEnterFrames: 4,
  pointExitFrames: 4,
  noHandMs: 300,
  palmHoldMs: 500,
};

export class GestureFsm {
  private state: GestureState = 'NONE';
  private pointFrames = 0;
  private nonPointFrames = 0;
  private lastHandMs: number | null = null;
  private palmSinceMs: number | null = null;
  private readonly opts: GestureFsmOptions;

  constructor(opts: Partial<GestureFsmOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  get current(): GestureState {
    return this.state;
  }

  reset(): void {
    this.state = 'NONE';
    this.pointFrames = 0;
    this.nonPointFrames = 0;
    this.lastHandMs = null;
    this.palmSinceMs = null;
  }

  update(sample: GestureSample): GestureTransition {
    let strokeStart = false;
    let strokeEnd = false;
    let clear = false;

    if (sample.handPresent) {
      this.lastHandMs = sample.tMs;
    } else if (
      this.lastHandMs !== null &&
      sample.tMs - this.lastHandMs >= this.opts.noHandMs &&
      this.state !== 'NONE'
    ) {
      if (this.state === 'PINCH') strokeEnd = true;
      this.state = 'NONE';
      this.pointFrames = 0;
      this.nonPointFrames = 0;
      this.palmSinceMs = null;
      return { state: this.state, gesture: Gesture.None, strokeEnd };
    }

    if (!sample.handPresent) {
      return { state: this.state, gesture: this.toWire() };
    }

    // Pinch Schmitt
    if (this.state === 'PINCH') {
      if (sample.pinchRatio > this.opts.pinchExit) {
        strokeEnd = true;
        this.state = sample.isPoint ? 'POINT' : 'NONE';
      }
    } else if (sample.pinchRatio < this.opts.pinchEnter) {
      strokeStart = true;
      this.state = 'PINCH';
      this.pointFrames = 0;
      this.nonPointFrames = 0;
      this.palmSinceMs = null;
    }

    // Point enter/exit hysteresis (when not pinching)
    if (this.state !== 'PINCH') {
      if (sample.isPoint) {
        this.pointFrames += 1;
        this.nonPointFrames = 0;
        if (this.pointFrames >= this.opts.pointEnterFrames) {
          this.state = 'POINT';
        }
      } else {
        this.nonPointFrames += 1;
        this.pointFrames = 0;
        if (this.state === 'POINT' && this.nonPointFrames >= this.opts.pointExitFrames) {
          this.state = 'NONE';
        }
      }
    }

    // Open palm clear (hold ≥ 500 ms) from POINT
    if (sample.isOpenPalm && (this.state === 'POINT' || this.state === 'NONE')) {
      if (this.palmSinceMs === null) this.palmSinceMs = sample.tMs;
      if (sample.tMs - this.palmSinceMs >= this.opts.palmHoldMs) {
        clear = true;
        this.state = 'CLEAR';
        this.palmSinceMs = null;
        // CLEAR is an event state; immediately settle back
        this.state = sample.isPoint ? 'POINT' : 'NONE';
      }
    } else {
      this.palmSinceMs = null;
    }

    return {
      state: this.state,
      gesture: this.toWire(),
      strokeStart: strokeStart || undefined,
      strokeEnd: strokeEnd || undefined,
      clear: clear || undefined,
    };
  }

  private toWire(): Gesture {
    switch (this.state) {
      case 'POINT':
        return Gesture.Point;
      case 'PINCH':
        return Gesture.Pinch;
      case 'CLEAR':
        return Gesture.Palm;
      default:
        return Gesture.None;
    }
  }
}
