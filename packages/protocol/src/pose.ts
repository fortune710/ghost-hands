/** Binary pose frame codec — PRD §8.3 (96 bytes, little-endian, no z). */

export const POSE_VERSION = 1;
export const POSE_BYTE_LENGTH = 96;
export const LANDMARK_COUNT = 21;

export enum Gesture {
  None = 0,
  Point = 1,
  Pinch = 2,
  Palm = 3,
  Fist = 4, // reserved
}

export interface Landmark2D {
  x: number;
  y: number;
}

export interface PoseFrame {
  version: number;
  handPresent: boolean;
  leftHand: boolean;
  gesture: Gesture;
  seq: number;
  tCaptureMs: number;
  /** Mapped fingertip / pinch midpoint in display space [0,1]. */
  tip: Landmark2D;
  /** 21 smoothed landmarks in normalized, un-mirrored camera space [0,1]. */
  landmarks: Landmark2D[];
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function quantize(v: number): number {
  return Math.round(clamp01(v) * 65535);
}

function dequantize(v: number): number {
  return v / 65535;
}

export function encodePose(frame: PoseFrame, out?: Uint8Array): Uint8Array {
  const buf = out ?? new Uint8Array(POSE_BYTE_LENGTH);
  if (buf.byteLength < POSE_BYTE_LENGTH) {
    throw new Error(`pose buffer too small: ${buf.byteLength}`);
  }
  if (frame.landmarks.length !== LANDMARK_COUNT) {
    throw new Error(`expected ${LANDMARK_COUNT} landmarks, got ${frame.landmarks.length}`);
  }

  const view = new DataView(buf.buffer, buf.byteOffset, POSE_BYTE_LENGTH);
  view.setUint8(0, POSE_VERSION);

  let flags = 0;
  if (frame.handPresent) flags |= 0b0000_0001;
  if (frame.leftHand) flags |= 0b0000_0010;
  flags |= (frame.gesture & 0b111) << 2;
  view.setUint8(1, flags);

  view.setUint16(2, frame.seq & 0xffff, true);
  view.setUint32(4, frame.tCaptureMs >>> 0, true);
  view.setUint16(8, quantize(frame.tip.x), true);
  view.setUint16(10, quantize(frame.tip.y), true);

  let offset = 12;
  for (const lm of frame.landmarks) {
    view.setUint16(offset, quantize(lm.x), true);
    view.setUint16(offset + 2, quantize(lm.y), true);
    offset += 4;
  }

  return buf;
}

export function decodePose(buf: ArrayBufferView | ArrayBuffer): PoseFrame {
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  if (bytes.byteLength !== POSE_BYTE_LENGTH) {
    throw new Error(`invalid pose length: ${bytes.byteLength}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, POSE_BYTE_LENGTH);
  const version = view.getUint8(0);
  if (version !== POSE_VERSION) {
    throw new Error(`unknown pose version: ${version}`);
  }

  const flags = view.getUint8(1);
  const handPresent = (flags & 0b0000_0001) !== 0;
  const leftHand = (flags & 0b0000_0010) !== 0;
  const gesture = ((flags >> 2) & 0b111) as Gesture;

  const seq = view.getUint16(2, true);
  const tCaptureMs = view.getUint32(4, true);
  const tip = {
    x: dequantize(view.getUint16(8, true)),
    y: dequantize(view.getUint16(10, true)),
  };

  const landmarks: Landmark2D[] = [];
  let offset = 12;
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    landmarks.push({
      x: dequantize(view.getUint16(offset, true)),
      y: dequantize(view.getUint16(offset + 2, true)),
    });
    offset += 4;
  }

  return {
    version,
    handPresent,
    leftHand,
    gesture,
    seq,
    tCaptureMs,
    tip,
    landmarks,
  };
}

/** Empty landmarks (used when hand_present = 0). */
export function zeroLandmarks(): Landmark2D[] {
  return Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: 0 }));
}
