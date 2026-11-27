import type { HandSample, Landmark3 } from './landmarks';
import { createSyntheticHand, type SyntheticHand, type SyntheticMode } from './syntheticHand';

export type TrackerSource = 'camera' | 'synthetic';

export interface FrameMeta {
  source: TrackerSource;
  fps: number;
  inferMs: number;
}

export type FrameCallback = (sample: HandSample | null, meta: FrameMeta) => void;

export interface HandTrackerOptions {
  video?: HTMLVideoElement;
  preferSynthetic?: boolean;
  /** Preview canvas used for mouse-driven synthetic targeting. */
  previewCanvas?: HTMLCanvasElement;
}

export interface HandTracker {
  start(): Promise<void>;
  stop(): void;
  onFrame(cb: FrameCallback): void;
  setSyntheticMode(mode: SyntheticMode): void;
  getSource(): TrackerSource;
  /** Force synthetic (e.g. user toggled Synthetic mode). */
  useSynthetic(): void;
}

const MODEL_URL = '/models/hand_landmarker.task';
const LOCAL_WASM = '/models/wasm';
const CDN_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';

const MIN_HAND_DETECTION = 0.6;
const MIN_HAND_PRESENCE = 0.6;
const MIN_TRACKING = 0.6;

type HandLandmarkerLike = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => {
    landmarks: Array<Array<{ x: number; y: number; z?: number }>>;
    handednesses?: Array<Array<{ categoryName?: string; score?: number }>>;
  };
  close?: () => void;
};

async function probeModel(): Promise<boolean> {
  try {
    const res = await fetch(MODEL_URL, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function createLandmarker(
  // MediaPipe package types are strict; keep the adapter loose at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FilesetResolver: { forVisionTasks: (path: string) => Promise<any> },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HandLandmarker: { createFromOptions: (fileset: any, opts: any) => Promise<any> },
  wasmPath: string,
  delegate: 'GPU' | 'CPU',
): Promise<HandLandmarkerLike> {
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  return (await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: MIN_HAND_DETECTION,
    minHandPresenceConfidence: MIN_HAND_PRESENCE,
    minTrackingConfidence: MIN_TRACKING,
  })) as HandLandmarkerLike;
}

function figure8(tMs: number): { x: number; y: number } {
  const t = tMs / 1000;
  return {
    x: 0.5 + 0.28 * Math.sin(t * 0.7),
    y: 0.5 + 0.18 * Math.sin(t * 1.4),
  };
}

/**
 * MediaPipe HandLandmarker wrapper with automatic synthetic fallback.
 * Mirrors the preview video only; landmarks are un-mirrored (x' = 1 − x).
 */
export function createHandTracker(opts: HandTrackerOptions = {}): HandTracker {
  let running = false;
  let source: TrackerSource = opts.preferSynthetic ? 'synthetic' : 'camera';
  let landmarker: HandLandmarkerLike | null = null;
  let stream: MediaStream | null = null;
  let raf = 0;
  let cb: FrameCallback | null = null;
  let inferBusy = false;
  let lastFpsAt = performance.now();
  let frames = 0;
  let fps = 0;
  let syntheticMode: SyntheticMode = 'point';
  const synth: SyntheticHand = createSyntheticHand({ mode: 'point' });
  let mouseTarget: { x: number; y: number } | null = null;
  let videoEl = opts.video ?? null;
  let previewCanvas = opts.previewCanvas ?? null;
  let startedAt = 0;
  let onMouseMove: ((e: Event) => void) | null = null;

  const emit = (sample: HandSample | null, inferMs: number) => {
    frames += 1;
    const now = performance.now();
    if (now - lastFpsAt >= 1000) {
      fps = frames;
      frames = 0;
      lastFpsAt = now;
    }
    cb?.(sample, { source, fps, inferMs });
  };

  const attachMouse = () => {
    const target = previewCanvas ?? videoEl;
    if (!target || onMouseMove) return;
    onMouseMove = (e: Event) => {
      const me = e as MouseEvent;
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      mouseTarget = {
        x: (me.clientX - rect.left) / rect.width,
        y: (me.clientY - rect.top) / rect.height,
      };
    };
    target.addEventListener('mousemove', onMouseMove);
  };

  const detachMouse = () => {
    const target = previewCanvas ?? videoEl;
    if (target && onMouseMove) {
      target.removeEventListener('mousemove', onMouseMove);
    }
    onMouseMove = null;
  };

  const tickSynthetic = () => {
    if (!running || source !== 'synthetic') return;
    const tMs = performance.now() - startedAt;
    if (mouseTarget) {
      synth.setTarget(mouseTarget.x, mouseTarget.y);
    } else {
      const p = figure8(tMs);
      synth.setTarget(p.x, p.y);
    }
    synth.setMode(syntheticMode);
    const sample =
      syntheticMode === 'none'
        ? null
        : synth.sample(tMs);
    emit(sample, 0);
    raf = requestAnimationFrame(tickSynthetic);
  };

  const tickCamera = () => {
    if (!running || source !== 'camera' || !videoEl || !landmarker) return;
    raf = requestAnimationFrame(tickCamera);

    if (inferBusy) return;
    if (videoEl.readyState < 2) {
      emit(null, 0);
      return;
    }

    inferBusy = true;
    const t0 = performance.now();
    try {
      const result = landmarker.detectForVideo(videoEl, performance.now());
      const inferMs = performance.now() - t0;
      const lmSet = result.landmarks?.[0];
      if (!lmSet || lmSet.length < 21) {
        emit(null, inferMs);
      } else {
        // Un-mirror landmarks: preview CSS mirrors video; pipeline wants camera space.
        const landmarks: Landmark3[] = lmSet.slice(0, 21).map((lm) => ({
          x: 1 - lm.x,
          y: lm.y,
          z: lm.z,
        }));
        const handed = result.handednesses?.[0]?.[0];
        const leftHand = (handed?.categoryName ?? '').toLowerCase() === 'left';
        const confidence = handed?.score ?? 0.9;
        emit(
          {
            landmarks,
            leftHand,
            confidence,
            tMs: performance.now() - startedAt,
          },
          inferMs,
        );
      }
    } catch {
      emit(null, performance.now() - t0);
    } finally {
      inferBusy = false;
    }
  };

  const startSynthetic = () => {
    source = 'synthetic';
    attachMouse();
    startedAt = performance.now();
    lastFpsAt = startedAt;
    frames = 0;
    tickSynthetic();
  };

  return {
    async start() {
      if (running) return;
      running = true;
      startedAt = performance.now();

      if (opts.preferSynthetic) {
        startSynthetic();
        return;
      }

      const modelOk = await probeModel();
      if (!modelOk) {
        startSynthetic();
        return;
      }

      try {
        const vision = await import('@mediapipe/tasks-vision');
        const { FilesetResolver, HandLandmarker } = vision;

        let created: HandLandmarkerLike | null = null;
        const wasmCandidates = [LOCAL_WASM, CDN_WASM];
        outer: for (const wasm of wasmCandidates) {
          for (const delegate of ['GPU', 'CPU'] as const) {
            try {
              created = await createLandmarker(
                FilesetResolver,
                HandLandmarker,
                wasm,
                delegate,
              );
              break outer;
            } catch {
              created = null;
            }
          }
        }

        if (!created) {
          startSynthetic();
          return;
        }
        landmarker = created;

        if (!videoEl) {
          videoEl = document.createElement('video');
          videoEl.playsInline = true;
          videoEl.muted = true;
          videoEl.autoplay = true;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        videoEl.srcObject = stream;
        await videoEl.play();
        source = 'camera';
        tickCamera();
      } catch {
        // Camera or MediaPipe failed → synthetic
        if (stream) {
          for (const t of stream.getTracks()) t.stop();
          stream = null;
        }
        landmarker?.close?.();
        landmarker = null;
        startSynthetic();
      }
    },

    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      detachMouse();
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
        stream = null;
      }
      if (videoEl) {
        videoEl.srcObject = null;
      }
      landmarker?.close?.();
      landmarker = null;
      inferBusy = false;
    },

    onFrame(next: FrameCallback) {
      cb = next;
    },

    setSyntheticMode(mode: SyntheticMode) {
      syntheticMode = mode;
      synth.setMode(mode);
    },

    getSource() {
      return source;
    },

    useSynthetic() {
      if (!running) {
        source = 'synthetic';
        return;
      }
      cancelAnimationFrame(raf);
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
        stream = null;
      }
      if (videoEl) videoEl.srcObject = null;
      landmarker?.close?.();
      landmarker = null;
      startSynthetic();
    },
  };
}
