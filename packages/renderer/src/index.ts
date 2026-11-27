export * from './hand.js';
export * from './ink.js';

import type { Landmark2D } from '@ghost-hands/protocol';
import { Gesture } from '@ghost-hands/protocol';
import {
  anchorLandmarksToTip,
  drawGhostHand,
  drawReticle,
  landmarksToPixels,
  mirrorLandmarksAroundTipX,
  scaleLandmarksToHeight,
} from './hand.js';
import { InkLayer } from './ink.js';

/** Hand fade-out duration after handPresent becomes false (ms). */
export const HAND_FADE_MS = 400;

/**
 * One overlay frame for {@link OverlayRenderer.drawFrame}.
 *
 * - `landmarks` — camera-normalized [0,1] hand shape (un-mirrored camera space).
 * - `tip` — display-normalized [0,1] mapped fingertip / pinch midpoint.
 */
export interface OverlayFrame {
  handPresent: boolean;
  /** Camera-normalized [0,1] landmarks for hand shape. */
  landmarks: Landmark2D[];
  /** Display-normalized [0,1] tip position. */
  tip: Landmark2D;
  gesture: Gesture;
  color?: string;
  name?: string;
  leftHand?: boolean;
}

const TIP_TRAIL_MAX = 6;
const DEFAULT_HAND_HEIGHT_PX = 140;

export class OverlayRenderer {
  readonly ink: InkLayer;
  private cssW = 1;
  private cssH = 1;
  private tipTrailPoints: Landmark2D[] = [];
  private lastHandSeenAt = 0;
  private lastHand: OverlayFrame | null = null;
  private handOpacity = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    ink?: InkLayer,
  ) {
    this.ink = ink ?? new InkLayer();
  }

  get tipTrail(): readonly Landmark2D[] {
    return this.tipTrailPoints;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.cssW = Math.max(1, cssWidth);
    this.cssH = Math.max(1, cssHeight);
    this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
  }

  /**
   * Handle open-palm clear. With `now`, starts a 250ms wipe; without, clears immediately.
   */
  clearInk(now?: number): void {
    if (now === undefined) {
      this.ink.clear();
      return;
    }
    this.ink.beginClearWipe(now);
  }

  /**
   * Draw one frame: optional backdrop, ink, ghost hand (anchored + scaled), reticle, prune ink.
   * Returns true if another frame is needed (ink still visible, hand fading, or wipe in progress).
   */
  drawFrame(
    now: number,
    frame: OverlayFrame | null,
    opts?: { drawBackdrop?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void },
  ): boolean {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return false;

    const w = this.cssW;
    const h = this.cssH;

    ctx.clearRect(0, 0, w, h);
    if (opts?.drawBackdrop) {
      opts.drawBackdrop(ctx, w, h);
    }

    this.ink.draw(ctx, now, w, h);

    // Hand presence / 400ms fade
    if (frame?.handPresent && frame.landmarks.length >= 21) {
      this.lastHandSeenAt = now;
      this.lastHand = frame;
      this.handOpacity = 1;
      this.drawHand(ctx, frame, 1, true);
    } else if (this.lastHand && now - this.lastHandSeenAt < HAND_FADE_MS) {
      const elapsed = now - this.lastHandSeenAt;
      this.handOpacity = 1 - elapsed / HAND_FADE_MS;
      this.drawHand(ctx, this.lastHand, this.handOpacity, false);
    } else {
      this.handOpacity = 0;
      this.lastHand = null;
      this.tipTrailPoints = [];
    }

    const inkAlive = this.ink.prune(now);
    const wiping = this.ink.isClearWiping(now);
    const fading = this.handOpacity > 0 && !(frame?.handPresent);
    return inkAlive || wiping || fading;
  }

  private drawHand(
    ctx: CanvasRenderingContext2D,
    frame: OverlayFrame,
    opacity: number,
    trackTrail: boolean,
  ): void {
    const w = this.cssW;
    const h = this.cssH;
    const tipPx = { x: frame.tip.x * w, y: frame.tip.y * h };
    const color = frame.color ?? '#4FC3F7';

    let lmPx = landmarksToPixels(frame.landmarks, w, h);
    lmPx = scaleLandmarksToHeight(lmPx, DEFAULT_HAND_HEIGHT_PX);
    lmPx = anchorLandmarksToTip(lmPx, tipPx, 8);
    if (frame.leftHand) {
      lmPx = mirrorLandmarksAroundTipX(lmPx, tipPx);
    }

    if (trackTrail) {
      this.tipTrailPoints.push({ x: tipPx.x, y: tipPx.y });
      if (this.tipTrailPoints.length > TIP_TRAIL_MAX) {
        this.tipTrailPoints.shift();
      }
    }

    drawGhostHand({
      ctx,
      landmarksPx: lmPx,
      tipPx,
      gesture: frame.gesture,
      style: { color, opacity: 0.35 * opacity, handHeightPx: DEFAULT_HAND_HEIGHT_PX },
      tipTrail: [...this.tipTrailPoints],
      name: frame.name,
    });

    if (frame.gesture === Gesture.Point || frame.gesture === Gesture.Pinch) {
      ctx.save();
      ctx.globalAlpha = opacity;
      drawReticle(ctx, tipPx, { color });
      ctx.restore();
    }
  }
}
