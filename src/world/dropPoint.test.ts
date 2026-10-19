import { describe, expect, it } from 'vitest';
import { bboxLatLon, bboxUv, formatDrop, openUv, openWorld, parseDrop } from './dropPoint';

describe('drop point', () => {
  it('round-trips through the URL', () => {
    expect(parseDrop(`?spawn=${formatDrop([0.25, 0.8])}`)).toEqual([0.25, 0.8]);
  });

  it('rejects junk and out-of-range values', () => {
    expect(parseDrop('?spawn=abc')).toBeNull();
    expect(parseDrop('?spawn=1.5,0.2')).toBeNull();
    expect(parseDrop('')).toBeNull();
  });

  it('maps lat/lon to the preview with north up', () => {
    const bbox = [35, 139, 36, 140] as const;
    expect(bboxUv(bbox, 36, 139)).toEqual([0, 0]);
    const [lat, lon] = bboxLatLon(bbox, bboxUv(bbox, 35.25, 139.75));
    expect(lat).toBeCloseTo(35.25);
    expect(lon).toBeCloseTo(139.75);
  });

  it('maps open-world meters around the origin', () => {
    expect(openUv(0, 0)).toEqual([0.5, 0.5]);
    const [x, z] = openWorld(openUv(1200, -3400));
    expect(x).toBeCloseTo(1200);
    expect(z).toBeCloseTo(-3400);
  });
});
