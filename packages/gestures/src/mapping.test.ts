import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVE_ZONE, mapToDisplay, zoneFromTwoPoints } from './mapping.js';

describe('active zone mapping', () => {
  it('maps zone center to display center', () => {
    const p = mapToDisplay({ x: 0.5, y: 0.5 }, DEFAULT_ACTIVE_ZONE);
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(p.y).toBeCloseTo(0.5, 5);
  });

  it('maps zone corners to display corners', () => {
    const tl = mapToDisplay({ x: 0.15, y: 0.15 });
    const br = mapToDisplay({ x: 0.85, y: 0.85 });
    expect(tl.x).toBeCloseTo(0, 5);
    expect(tl.y).toBeCloseTo(0, 5);
    expect(br.x).toBeCloseTo(1, 5);
    expect(br.y).toBeCloseTo(1, 5);
  });

  it('clamps outside the zone', () => {
    const p = mapToDisplay({ x: 0, y: 1 });
    expect(p.x).toBe(0);
    expect(p.y).toBe(1);
  });

  it('rejects tiny calibration zones', () => {
    expect(zoneFromTwoPoints({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 })).toBeNull();
  });
});
