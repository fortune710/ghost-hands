import { describe, expect, it } from 'vitest';
import { Gesture } from '@ghost-hands/protocol';
import { GestureFsm } from './fsm.js';

describe('GestureFsm', () => {
  it('enters POINT after hysteresis frames', () => {
    const fsm = new GestureFsm({ pointEnterFrames: 2 });
    fsm.update({
      handPresent: true,
      isPoint: true,
      pinchRatio: 1,
      isOpenPalm: false,
      tMs: 0,
    });
    const second = fsm.update({
      handPresent: true,
      isPoint: true,
      pinchRatio: 1,
      isOpenPalm: false,
      tMs: 33,
    });
    expect(second.state).toBe('POINT');
    expect(second.gesture).toBe(Gesture.Point);
  });

  it('emits stroke_start / stroke_end around pinch', () => {
    const fsm = new GestureFsm();
    const enter = fsm.update({
      handPresent: true,
      isPoint: false,
      pinchRatio: 0.1,
      isOpenPalm: false,
      tMs: 0,
    });
    expect(enter.strokeStart).toBe(true);
    expect(enter.state).toBe('PINCH');

    const exit = fsm.update({
      handPresent: true,
      isPoint: true,
      pinchRatio: 0.5,
      isOpenPalm: false,
      tMs: 100,
    });
    expect(exit.strokeEnd).toBe(true);
  });

  it('returns to NONE after no-hand timeout', () => {
    const fsm = new GestureFsm({ noHandMs: 300, pointEnterFrames: 1 });
    fsm.update({
      handPresent: true,
      isPoint: true,
      pinchRatio: 1,
      isOpenPalm: false,
      tMs: 0,
    });
    const gone = fsm.update({
      handPresent: false,
      isPoint: false,
      pinchRatio: 1,
      isOpenPalm: false,
      tMs: 350,
    });
    expect(gone.state).toBe('NONE');
  });
});
