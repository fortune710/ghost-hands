import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACTIVE_ZONE,
  applyHomography,
  homographyFromFourCorners,
  mapTip,
  mapToDisplay,
  mapWithHomography,
  zoneFromFourCorners,
  zoneFromTwoPoints,
} from './mapping.js';

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

  it('rejects tiny calibration zones (2-point)', () => {
    expect(zoneFromTwoPoints({ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 })).toBeNull();
  });

  it('builds a valid zone from two points', () => {
    const zone = zoneFromTwoPoints({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 });
    expect(zone).not.toBeNull();
    expect(zone!.x0).toBeCloseTo(0.1, 5);
    expect(zone!.x1).toBeCloseTo(0.9, 5);
  });

  it('builds AABB zone from four corners', () => {
    const zone = zoneFromFourCorners(
      { x: 0.2, y: 0.1 },
      { x: 0.9, y: 0.15 },
      { x: 0.85, y: 0.9 },
      { x: 0.15, y: 0.85 },
    );
    expect(zone).not.toBeNull();
    expect(zone!.x0).toBeCloseTo(0.15, 5);
    expect(zone!.y0).toBeCloseTo(0.1, 5);
    expect(zone!.x1).toBeCloseTo(0.9, 5);
    expect(zone!.y1).toBeCloseTo(0.9, 5);
  });

  it('rejects tiny four-corner zones', () => {
    expect(
      zoneFromFourCorners(
        { x: 0.4, y: 0.4 },
        { x: 0.5, y: 0.4 },
        { x: 0.5, y: 0.5 },
        { x: 0.4, y: 0.5 },
      ),
    ).toBeNull();
  });
});

describe('homography mapping', () => {
  it('maps source corners to unit-square destinations', () => {
    const src = [
      { x: 0.2, y: 0.1 },
      { x: 0.8, y: 0.15 },
      { x: 0.75, y: 0.9 },
      { x: 0.25, y: 0.85 },
    ] as const;

    const H = homographyFromFourCorners(src);
    expect(H).not.toBeNull();

    const dst = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];

    for (let i = 0; i < 4; i++) {
      const p = applyHomography(H!, src[i]!);
      expect(p.x).toBeCloseTo(dst[i]!.x, 4);
      expect(p.y).toBeCloseTo(dst[i]!.y, 4);
    }
  });

  it('clamps mapWithHomography to [0,1]', () => {
    // Identity-ish: unit square → unit square
    const H = homographyFromFourCorners(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    );
    expect(H).not.toBeNull();
    const outside = mapWithHomography({ x: -0.5, y: 1.5 }, H!);
    expect(outside.x).toBe(0);
    expect(outside.y).toBe(1);
  });

  it('mapTip routes zone and homography mappings', () => {
    const zoneMapped = mapTip(
      { x: 0.5, y: 0.5 },
      { kind: 'zone', zone: DEFAULT_ACTIVE_ZONE },
    );
    expect(zoneMapped.x).toBeCloseTo(0.5, 5);

    const H = homographyFromFourCorners([
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ]);
    expect(H).not.toBeNull();
    const homoMapped = mapTip({ x: 0.1, y: 0.1 }, { kind: 'homography', H: H! });
    expect(homoMapped.x).toBeCloseTo(0, 4);
    expect(homoMapped.y).toBeCloseTo(0, 4);
  });
});
