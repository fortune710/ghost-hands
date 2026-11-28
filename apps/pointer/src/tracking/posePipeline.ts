import {
  LandmarkSmoother,
  TipSmoother,
  classifyLandmarks,
  GestureFsm,
  classifyStrokeEnd,
  mapTip,
  DEFAULT_ACTIVE_ZONE,
  type ActiveZone,
  type TipMapping,
  type StrokePoint,
} from '@ghost-hands/gestures';
import {
  Gesture,
  POSE_VERSION,
  zeroLandmarks,
  type PoseFrame,
} from '@ghost-hands/protocol';
import type { HandSample } from './landmarks';

export type PipelineCtrlEvent =
  | { t: 'stroke_start'; id: string; x: number; y: number; tool: 'highlight' }
  | { t: 'stroke_end'; id: string; kind: 'arrow' | 'free' | 'discard' }
  | { t: 'clear'; scope: 'mine' };

export interface PosePipelineOptions {
  zone?: ActiveZone;
  mapping?: TipMapping;
  displaySize?: { w: number; h: number };
}

export interface PosePipelineResult {
  frame: PoseFrame;
  events: PipelineCtrlEvent[];
}

let strokeCounter = 0;

function nextStrokeId(): string {
  strokeCounter = (strokeCounter + 1) % 1_000_000;
  return `s${Date.now().toString(36)}_${strokeCounter}`;
}

/**
 * Pointer-side pose pipeline:
 * LandmarkSmoother → classifyLandmarks → GestureFsm → TipSmoother → mapTip → PoseFrame.
 *
 * Sample `tMs` values must share an origin with this pipeline's clock
 * (typically `performance.now() - startedAt` from HandTracker).
 */
export class PosePipeline {
  private readonly landmarkSmoother = new LandmarkSmoother();
  private readonly tipSmoother = new TipSmoother();
  private readonly fsm = new GestureFsm();
  private mapping: TipMapping;
  private displaySize: { w: number; h: number };
  private seq = 0;
  private strokeId: string | null = null;
  private strokePoints: StrokePoint[] = [];
  /** Fixed clock origin — never reset, so absent/present samples stay aligned. */
  private readonly clockOriginMs = performance.now();

  constructor(opts: PosePipelineOptions = {}) {
    this.mapping =
      opts.mapping ??
      ({ kind: 'zone', zone: opts.zone ?? DEFAULT_ACTIVE_ZONE } satisfies TipMapping);
    this.displaySize = opts.displaySize ?? { w: 1920, h: 1080 };
  }

  setMapping(mapping: TipMapping): void {
    this.mapping = mapping;
  }

  setDisplaySize(w: number, h: number): void {
    this.displaySize = { w, h };
  }

  /**
   * If a stroke is active, classify and return a stroke_end event, then clear
   * stroke state. Does not reset smoothers / FSM.
   */
  flushActiveStroke(tMs?: number): PipelineCtrlEvent | null {
    if (!this.strokeId) return null;
    const id = this.strokeId;
    const kind = classifyStrokeEnd(this.strokePoints, {
      displayWidth: this.displaySize.w,
      displayHeight: this.displaySize.h,
    });
    this.strokeId = null;
    this.strokePoints = [];
    void tMs;
    return { t: 'stroke_end', id, kind };
  }

  /**
   * Reset filters / FSM / seq / stroke. Does not emit stroke_end — call
   * {@link flushActiveStroke} first when the active stroke must be published.
   * Clock origin is preserved.
   */
  reset(): void {
    this.landmarkSmoother.reset();
    this.tipSmoother.reset();
    this.fsm.reset();
    this.seq = 0;
    this.strokeId = null;
    this.strokePoints = [];
  }

  /**
   * Process one hand sample (or null / no-hand) → PoseFrame + ctrl events.
   */
  update(sample: HandSample | null): PosePipelineResult {
    const events: PipelineCtrlEvent[] = [];
    // Present samples use tracker tMs; absent samples use the shared clock.
    const tMs = sample?.tMs ?? performance.now() - this.clockOriginMs;
    const tSeconds = tMs / 1000;
    const seq = this.seq++ & 0xffff;

    const hasHand =
      sample !== null &&
      sample.confidence > 0 &&
      sample.landmarks.length >= 21;

    if (!hasHand) {
      const transition = this.fsm.update({
        handPresent: false,
        isPoint: false,
        pinchRatio: 1,
        isOpenPalm: false,
        tMs,
      });
      this.emitStrokeEnd(transition, tMs, events);
      if (transition.clear) events.push({ t: 'clear', scope: 'mine' });

      return {
        frame: {
          version: POSE_VERSION,
          handPresent: false,
          leftHand: false,
          gesture: transition.gesture,
          seq,
          tCaptureMs: Math.floor(tMs),
          tip: { x: 0.5, y: 0.5 },
          landmarks: zeroLandmarks(),
        },
        events,
      };
    }

    // Pass full landmarks (including optional z) into smoother + classifier.
    const raw = sample!.landmarks.slice(0, 21).map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
    }));
    const smoothed = this.landmarkSmoother.smooth(tSeconds, raw);
    const classified = classifyLandmarks(smoothed, { leftHand: sample!.leftHand });

    const transition = this.fsm.update({
      handPresent: true,
      isPoint: classified.isPoint,
      pinchRatio: classified.pinchRatio,
      isOpenPalm: classified.isOpenPalm,
      tMs,
    });

    const usePinchTip = transition.state === 'PINCH' || transition.gesture === Gesture.Pinch;
    const rawTip = usePinchTip ? classified.pinchMidpoint : classified.tip;
    const enableDeadZone = transition.state === 'POINT';
    const filteredTip = this.tipSmoother.filter(tSeconds, rawTip, enableDeadZone);
    const displayTip = mapTip(filteredTip, this.mapping);

    if (transition.strokeStart) {
      const id = nextStrokeId();
      this.strokeId = id;
      this.strokePoints = [{ x: displayTip.x, y: displayTip.y, t: tMs }];
      events.push({
        t: 'stroke_start',
        id,
        x: displayTip.x,
        y: displayTip.y,
        tool: 'highlight',
      });
    } else if (this.strokeId && transition.state === 'PINCH') {
      this.strokePoints.push({ x: displayTip.x, y: displayTip.y, t: tMs });
    }

    this.emitStrokeEnd(transition, tMs, events);
    if (transition.clear) events.push({ t: 'clear', scope: 'mine' });

    return {
      frame: {
        version: POSE_VERSION,
        handPresent: true,
        leftHand: sample!.leftHand,
        gesture: transition.gesture,
        seq,
        tCaptureMs: Math.floor(tMs),
        tip: displayTip,
        landmarks: smoothed,
      },
      events,
    };
  }

  private emitStrokeEnd(
    transition: { strokeEnd?: boolean },
    tMs: number,
    events: PipelineCtrlEvent[],
  ): void {
    if (!transition.strokeEnd || !this.strokeId) return;
    const flushed = this.flushActiveStroke(tMs);
    if (flushed) events.push(flushed);
  }
}
