import { describe, it, expect } from 'vitest';
import { extentToBounds, resolveProjection } from '../src/lib/api/extent';

describe('resolveProjection', () => {
  it('maps geographic wkids', () => {
    expect(resolveProjection({ wkid: 4326 })).toEqual({ kind: 'geographic' });
    expect(resolveProjection({ wkid: 4269 })).toEqual({ kind: 'geographic' });
  });

  it('maps web mercator wkids', () => {
    expect(resolveProjection({ wkid: 3857 })).toEqual({ kind: 'webmercator' });
    expect(resolveProjection({ wkid: 102100, latestWkid: 3857 })).toEqual({ kind: 'webmercator' });
  });

  it('maps known Albers wkids with parameters', () => {
    const conus = resolveProjection({ wkid: 102039 });
    expect(conus?.kind).toBe('albers');
    if (conus?.kind === 'albers') {
      expect(conus.params.centralMeridian).toBe(-96);
      expect(conus.params.standardParallel1).toBe(29.5);
    }
  });

  it('parses Albers parameters from WKT', () => {
    const wkt =
      'PROJCS["Albers_Conical_Equal_Area",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
      'SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],' +
      'UNIT["Degree",0.0174532925199433]],PROJECTION["Albers"],' +
      'PARAMETER["false_easting",0.0],PARAMETER["false_northing",0.0],' +
      'PARAMETER["central_meridian",-154.0],PARAMETER["standard_parallel_1",55.0],' +
      'PARAMETER["standard_parallel_2",65.0],PARAMETER["latitude_of_origin",50.0],UNIT["Meter",1.0]]';
    const projection = resolveProjection({ wkt });
    expect(projection?.kind).toBe('albers');
    if (projection?.kind === 'albers') {
      expect(projection.params).toEqual({
        centralMeridian: -154,
        standardParallel1: 55,
        standardParallel2: 65,
        latitudeOfOrigin: 50,
      });
    }
  });

  it('returns null for unsupported references', () => {
    expect(resolveProjection({ wkid: 32633 })).toBeNull();
    expect(resolveProjection(undefined)).toBeNull();
    expect(resolveProjection({})).toBeNull();
  });
});

describe('extentToBounds', () => {
  it('passes through geographic extents with padding', () => {
    const bounds = extentToBounds({
      xmin: -125,
      ymin: 24,
      xmax: -66,
      ymax: 50,
      spatialReference: { wkid: 4326 },
    });
    expect(bounds).not.toBeNull();
    const [w, s, e, n] = bounds!;
    expect(w).toBeLessThan(-125);
    expect(w).toBeGreaterThan(-128);
    expect(s).toBeLessThan(24);
    expect(e).toBeGreaterThan(-66);
    expect(n).toBeGreaterThan(50);
  });

  it('inverse-projects web mercator extents', () => {
    // x = -10018754.17 is exactly -90 degrees longitude
    const bounds = extentToBounds({
      xmin: -10018754.171394622,
      ymin: 0,
      xmax: 0,
      ymax: 4865942.279503176, // ~40 degrees north
      spatialReference: { wkid: 3857 },
    });
    expect(bounds).not.toBeNull();
    // Padding is 3% of the span (2.7 degrees of longitude, 1.2 of latitude)
    const [w, s, e, n] = bounds!;
    expect(w).toBeCloseTo(-92.7, 1);
    expect(s).toBeCloseTo(-1.2, 1);
    expect(e).toBeCloseTo(2.7, 1);
    expect(n).toBeCloseTo(41.2, 1);
  });

  it('inverse-projects the PADUS CONUS Albers extent to plausible bounds', () => {
    // Real PADUS fullExtent (covers CONUS, AK, HI, and territories)
    const bounds = extentToBounds({
      xmin: -11816077.7136,
      ymin: -262699.1307,
      xmax: 3420079.9032,
      ymax: 7786809.3745,
      spatialReference: { wkid: 102039 },
    });
    expect(bounds).not.toBeNull();
    const [w, s, e, n] = bounds!;
    expect(w).toBeGreaterThanOrEqual(-180);
    expect(e).toBeLessThanOrEqual(180);
    // The projected envelope corners reach south of the data (the
    // extent covers American Samoa); the point of bounds is to exclude
    // far-away tiles, so generous coverage is fine.
    expect(s).toBeGreaterThan(-60);
    expect(n).toBeLessThan(85.06);
    expect(n).toBeGreaterThan(60); // includes Alaska
    expect(w).toBeLessThan(-150); // reaches the Aleutians
  });

  it('keeps the CONUS Albers origin near (-96, 23)', () => {
    const bounds = extentToBounds({
      xmin: -1000,
      ymin: -1000,
      xmax: 1000,
      ymax: 1000,
      spatialReference: { wkid: 102039 },
    });
    expect(bounds).not.toBeNull();
    const [w, s, e, n] = bounds!;
    expect((w + e) / 2).toBeCloseTo(-96, 1);
    expect((s + n) / 2).toBeCloseTo(23, 1);
  });

  it('returns null for unsupported or invalid extents', () => {
    expect(extentToBounds(undefined)).toBeNull();
    expect(extentToBounds(null)).toBeNull();
    expect(
      extentToBounds({ xmin: 0, ymin: 0, xmax: 1, ymax: 1, spatialReference: { wkid: 32633 } })
    ).toBeNull();
    expect(
      extentToBounds({ xmin: 10, ymin: 0, xmax: 0, ymax: 1, spatialReference: { wkid: 4326 } })
    ).toBeNull();
    expect(
      extentToBounds({ xmin: NaN, ymin: 0, xmax: 1, ymax: 1, spatialReference: { wkid: 4326 } })
    ).toBeNull();
  });
});
