import { describe, expect, it } from 'vitest';
import { Gesture } from '@ghost-hands/protocol';
import { PosePipeline } from './posePipeline';
import { createSyntheticHand } from './syntheticHand';

describe('PosePipeline', () => {
  it('emits POINT frames for a synthetic pointing hand', () => {
    const pipeline = new PosePipeline();
    const hand = createSyntheticHand();
    hand.setMode('point');
    hand.setTarget(0.5, 0.5);

    let sawPoint = false;
    for (let i = 0; i < 12; i++) {
      const sample = hand.sample(i * 33);
      const { frame } = pipeline.update(sample);
      if (frame.gesture === Gesture.Point && frame.handPresent) {
        sawPoint = true;
        expect(frame.landmarks).toHaveLength(21);
        expect(frame.tip.x).toBeGreaterThanOrEqual(0);
        expect(frame.tip.x).toBeLessThanOrEqual(1);
      }
    }
    expect(sawPoint).toBe(true);
  });

  it('emits stroke_start / stroke_end around a pinch', () => {
    const pipeline = new PosePipeline();
    const hand = createSyntheticHand();
    hand.setTarget(0.4, 0.4);

    hand.setMode('point');
    for (let i = 0; i < 8; i++) pipeline.update(hand.sample(i * 33));

    // One-Euro smoother needs several frames after the mode switch before
    // pinch_ratio drops below the Schmitt enter threshold.
    hand.setMode('pinch');
    const events: string[] = [];
    for (let i = 0; i < 24; i++) {
      const t = 300 + i * 40;
      hand.setTarget(0.4 + i * 0.02, 0.4);
      const result = pipeline.update(hand.sample(t));
      for (const e of result.events) events.push(e.t);
    }

    hand.setMode('point');
    for (let i = 0; i < 12; i++) {
      const result = pipeline.update(hand.sample(1400 + i * 40));
      for (const e of result.events) events.push(e.t);
    }

    expect(events).toContain('stroke_start');
    expect(events).toContain('stroke_end');
  });

  it('emits clear after sustained open palm', () => {
    const pipeline = new PosePipeline();
    const hand = createSyntheticHand();
    hand.setMode('palm');
    hand.setTarget(0.5, 0.5);

    let cleared = false;
    for (let i = 0; i < 30; i++) {
      const { events } = pipeline.update(hand.sample(i * 40));
      if (events.some((e) => e.t === 'clear')) cleared = true;
    }
    expect(cleared).toBe(true);
  });
});
