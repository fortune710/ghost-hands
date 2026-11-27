/** Shared hand-landmark types for pointer-side tracking. */

export interface Landmark3 {
  x: number;
  y: number;
  z?: number;
}

export interface HandSample {
  landmarks: Landmark3[];
  leftHand: boolean;
  confidence: number;
  tMs: number;
}
