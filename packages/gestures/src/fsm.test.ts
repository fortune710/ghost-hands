import { describe, expect, it } from 'vitest';
import { Gesture } from '@ghost-hands/protocol';
import { GestureFsm } from './fsm.js';

function sample(
  overrides: Partial<{
    handPresent: boolean;
    isPoint: boolean;
    pinchRatio: number;
    isOpenPalm: boolean;
    tMs: number;
  }>,
) {
  return {
    handPresent: true,
    isPoint: false,
    pinchRatio: 1,
    isOpenPalm: false,
    tMs: 0,
    ...overrides,
  };
}

describe('GestureFsm', () => {
  it('enters POINT after hysteresis frames', () => {
    const fsm = new GestureFsm({ pointEnterFrames: 2 });
    fsm.update(sample({ isPoint: true, tMs: 0 }));
    const second = fsm.update(sample({ isPoint: true, tMs: 33 }));
    expect(second.state).toBe('POINT');
    expect(second.gesture).toBe(Gesture.Point);
  });

  it('emits stroke_start / stroke_end around pinch', () => {
    const fsm = new GestureFsm();
    const enter = fsm.update(sample({ pinchRatio: 0.1, tMs: 0 }));
    expect(enter.strokeStart).toBe(true);
    expect(enter.state).toBe('PINCH');

    const exit = fsm.update(
      sample({ isPoint: true, pinchRatio: 0.5, tMs: 100 }),
    );
    expect(exit.strokeEnd).toBe(true);
  });

  it('returns to NONE after no-hand timeout', () => {
    const fsm = new GestureFsm({ noHandMs: 300, pointEnterFrames: 1 });
    fsm.update(sample({ isPoint: true, tMs: 0 }));
    const gone = fsm.update(
      sample({
        handPresent: false,
        isPoint: false,
        tMs: 350,
      }),
    );
    expect(gone.state).toBe('NONE');
  });

  it('fires palm clear after 500 ms hold and reports Gesture.Palm', () => {
    const fsm = new GestureFsm({ palmHoldMs: 500, pointEnterFrames: 1 });
    // Enter POINT first
    fsm.update(sample({ isPoint: true, tMs: 0 }));
    expect(fsm.current).toBe('POINT');

    // Open palm held — not yet 500 ms
    const early = fsm.update(
      sample({ isOpenPalm: true, isPoint: false, tMs: 100 }),
    );
    expect(early.clear).toBeUndefined();
    expect(early.gesture).not.toBe(Gesture.Palm);

    // Still holding at 400 ms from palm start (t=100 → 500)
    const mid = fsm.update(
      sample({ isOpenPalm: true, isPoint: false, tMs: 500 }),
    );
    expect(mid.clear).toBeUndefined();

    // Fire at ≥ 500 ms hold (palmSince was set at t=100)
    const clear = fsm.update(
      sample({ isOpenPalm: true, isPoint: false, tMs: 600 }),
    );
    expect(clear.clear).toBe(true);
    expect(clear.gesture).toBe(Gesture.Palm);
    // Settled state is not CLEAR
    expect(clear.state).not.toBe('CLEAR');
  });

  it('does not fire clear before 500 ms', () => {
    const fsm = new GestureFsm({ palmHoldMs: 500, pointEnterFrames: 1 });
    fsm.update(sample({ isPoint: true, tMs: 0 }));

    for (const t of [0, 100, 200, 300, 400, 499]) {
      const tr = fsm.update(
        sample({ isOpenPalm: true, isPoint: false, tMs: t }),
      );
      expect(tr.clear).toBeUndefined();
      expect(tr.gesture).not.toBe(Gesture.Palm);
    }
  });

  it('uses pinch Schmitt enter/exit thresholds', () => {
    const fsm = new GestureFsm({ pinchEnter: 0.25, pinchExit: 0.35 });

    // Above enter → no pinch
    const idle = fsm.update(sample({ pinchRatio: 0.3, tMs: 0 }));
    expect(idle.state).not.toBe('PINCH');
    expect(idle.strokeStart).toBeUndefined();

    // Cross enter
    const enter = fsm.update(sample({ pinchRatio: 0.2, tMs: 50 }));
    expect(enter.state).toBe('PINCH');
    expect(enter.strokeStart).toBe(true);

    // Between enter and exit → stay pinching
    const hold = fsm.update(sample({ pinchRatio: 0.3, tMs: 100 }));
    expect(hold.state).toBe('PINCH');
    expect(hold.strokeEnd).toBeUndefined();

    // Cross exit
    const exit = fsm.update(sample({ pinchRatio: 0.4, tMs: 150 }));
    expect(exit.strokeEnd).toBe(true);
    expect(exit.state).not.toBe('PINCH');
  });
});
