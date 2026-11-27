import { describe, expect, it } from 'vitest';
import {
  Gesture,
  POSE_BYTE_LENGTH,
  decodePose,
  encodePose,
  zeroLandmarks,
  type PoseFrame,
} from './pose.js';

function sampleFrame(overrides: Partial<PoseFrame> = {}): PoseFrame {
  const landmarks = zeroLandmarks().map((_, i) => ({
    x: (i + 1) / 22,
    y: (21 - i) / 22,
  }));
  return {
    version: 1,
    handPresent: true,
    leftHand: false,
    gesture: Gesture.Point,
    seq: 42,
    tCaptureMs: 1_234_567,
    tip: { x: 0.5, y: 0.25 },
    landmarks,
    ...overrides,
  };
}

describe('pose codec', () => {
  it('encodes exactly 96 bytes', () => {
    const bytes = encodePose(sampleFrame());
    expect(bytes.byteLength).toBe(POSE_BYTE_LENGTH);
  });

  it('round-trips a live frame', () => {
    const original = sampleFrame({ leftHand: true, gesture: Gesture.Pinch, seq: 65535 });
    const decoded = decodePose(encodePose(original));
    expect(decoded.version).toBe(1);
    expect(decoded.handPresent).toBe(true);
    expect(decoded.leftHand).toBe(true);
    expect(decoded.gesture).toBe(Gesture.Pinch);
    expect(decoded.seq).toBe(65535);
    expect(decoded.tCaptureMs).toBe(1_234_567);
    expect(decoded.tip.x).toBeCloseTo(0.5, 4);
    expect(decoded.tip.y).toBeCloseTo(0.25, 4);
    expect(decoded.landmarks).toHaveLength(21);
    expect(decoded.landmarks[0]!.x).toBeCloseTo(1 / 22, 4);
  });

  it('rejects wrong length', () => {
    expect(() => decodePose(new Uint8Array(95))).toThrow(/invalid pose length/);
  });

  it('matches golden vector for empty hand heartbeat', () => {
    const frame = sampleFrame({
      handPresent: false,
      gesture: Gesture.None,
      tip: { x: 0, y: 0 },
      landmarks: zeroLandmarks(),
      seq: 1,
      tCaptureMs: 0,
    });
    const bytes = encodePose(frame);
    // version=1, flags=0, seq=1, t=0, tip=0, landmarks=0
    expect([...bytes.slice(0, 12)]).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(bytes.every((b, i) => (i < 2 ? true : b === bytes[i]))).toBe(true);
    expect(bytes.slice(12).every((b) => b === 0)).toBe(true);
  });

  it('clamps out-of-range tip and landmark coordinates to [0,1]', () => {
    const landmarks = zeroLandmarks();
    landmarks[0] = { x: -0.5, y: 1.5 };
    landmarks[8] = { x: 2, y: -1 };
    const decoded = decodePose(
      encodePose(
        sampleFrame({
          tip: { x: -0.25, y: 1.25 },
          landmarks,
        }),
      ),
    );
    expect(decoded.tip.x).toBe(0);
    expect(decoded.tip.y).toBe(1);
    expect(decoded.landmarks[0]!.x).toBe(0);
    expect(decoded.landmarks[0]!.y).toBe(1);
    expect(decoded.landmarks[8]!.x).toBe(1);
    expect(decoded.landmarks[8]!.y).toBe(0);
  });

  it('round-trips all gesture flag values', () => {
    for (const gesture of [Gesture.None, Gesture.Point, Gesture.Pinch, Gesture.Palm, Gesture.Fist]) {
      const decoded = decodePose(encodePose(sampleFrame({ gesture })));
      expect(decoded.gesture).toBe(gesture);
    }
  });

  it('rejects unknown pose version', () => {
    const bytes = encodePose(sampleFrame());
    bytes[0] = 99;
    expect(() => decodePose(bytes)).toThrow(/unknown pose version/);
  });

  it('rejects wrong landmark count on encode', () => {
    const frame = sampleFrame();
    frame.landmarks = frame.landmarks.slice(0, 10);
    expect(() => encodePose(frame)).toThrow(/expected 21 landmarks/);
  });
});
