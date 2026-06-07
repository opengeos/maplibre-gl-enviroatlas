/**
 * Converts ArcGIS service extents to geographic (EPSG:4326) bounds.
 *
 * EnviroAtlas services publish extents in Web Mercator, geographic
 * coordinates, or one of several Albers Equal Area projections (the
 * server's GeometryServer project endpoint is unavailable, so the
 * inverse projection is computed client-side with a spherical
 * approximation, then padded). The resulting bounds are used both to
 * limit raster tile requests (the server times out with a 504 on
 * far-out-of-extent exports) and to zoom the map to newly added layers.
 */

/** Geographic bounds as [west, south, east, north] */
export type LngLatBoundsArray = [number, number, number, number];

/**
 * An ArcGIS extent object (subset).
 */
export interface ArcGISExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: {
    wkid?: number;
    latestWkid?: number;
    wkt?: string;
    wkt2?: string;
  };
}

interface AlbersParams {
  /** Central meridian in degrees */
  centralMeridian: number;
  /** First standard parallel in degrees */
  standardParallel1: number;
  /** Second standard parallel in degrees */
  standardParallel2: number;
  /** Latitude of origin in degrees */
  latitudeOfOrigin: number;
}

type Projection =
  | { kind: 'geographic' }
  | { kind: 'webmercator' }
  | { kind: 'albers'; params: AlbersParams };

const R = 6378137;
const DEG = Math.PI / 180;
const MAX_MERCATOR_LAT = 85.051129;

/** Known Albers wkids used by EnviroAtlas services */
const ALBERS_WKIDS: Record<number, AlbersParams> = {
  // USA Contiguous Albers (USGS / NAD83)
  102039: { centralMeridian: -96, standardParallel1: 29.5, standardParallel2: 45.5, latitudeOfOrigin: 23 },
  5070: { centralMeridian: -96, standardParallel1: 29.5, standardParallel2: 45.5, latitudeOfOrigin: 23 },
  102003: { centralMeridian: -96, standardParallel1: 29.5, standardParallel2: 45.5, latitudeOfOrigin: 37.5 },
  // North America Albers
  102008: { centralMeridian: -96, standardParallel1: 20, standardParallel2: 60, latitudeOfOrigin: 40 },
  // Alaska Albers
  102006: { centralMeridian: -154, standardParallel1: 55, standardParallel2: 65, latitudeOfOrigin: 50 },
  3338: { centralMeridian: -154, standardParallel1: 55, standardParallel2: 65, latitudeOfOrigin: 50 },
  // Hawaii Albers
  102007: { centralMeridian: -157, standardParallel1: 8, standardParallel2: 18, latitudeOfOrigin: 13 },
};

const GEOGRAPHIC_WKIDS = new Set([4326, 4269, 4267]);
const WEBMERCATOR_WKIDS = new Set([3857, 102100, 102113, 900913]);

function parseWktParameter(wkt: string, name: string): number | undefined {
  const match = new RegExp(`PARAMETER\\["${name}"\\s*,\\s*(-?[\\d.]+)`, 'i').exec(wkt);
  return match ? Number(match[1]) : undefined;
}

/**
 * Resolves a supported projection from an ArcGIS spatial reference.
 *
 * @param sr - The spatial reference (wkid and/or WKT)
 * @returns The projection definition or null when unsupported
 */
export function resolveProjection(sr: ArcGISExtent['spatialReference']): Projection | null {
  const wkid = sr?.latestWkid ?? sr?.wkid;
  if (wkid !== undefined) {
    if (GEOGRAPHIC_WKIDS.has(wkid)) return { kind: 'geographic' };
    if (WEBMERCATOR_WKIDS.has(wkid)) return { kind: 'webmercator' };
    const albers = ALBERS_WKIDS[wkid];
    if (albers) return { kind: 'albers', params: albers };
  }

  const wkt = sr?.wkt ?? sr?.wkt2;
  if (wkt) {
    if (/PROJECTION\["(Albers|Albers_Conic_Equal_Area)"\]/i.test(wkt)) {
      const centralMeridian = parseWktParameter(wkt, 'central_meridian');
      const standardParallel1 = parseWktParameter(wkt, 'standard_parallel_1');
      const standardParallel2 = parseWktParameter(wkt, 'standard_parallel_2');
      const latitudeOfOrigin = parseWktParameter(wkt, 'latitude_of_origin') ?? 0;
      if (centralMeridian !== undefined && standardParallel1 !== undefined && standardParallel2 !== undefined) {
        return {
          kind: 'albers',
          params: { centralMeridian, standardParallel1, standardParallel2, latitudeOfOrigin },
        };
      }
    }
    if (/PROJECTION\["Mercator/i.test(wkt)) return { kind: 'webmercator' };
    if (/^GEOGCS|^GEOGCRS/i.test(wkt.trim())) return { kind: 'geographic' };
  }

  return null;
}

/**
 * Inverse-projects a coordinate to [lon, lat] degrees.
 * Spherical formulas (Snyder); accuracy is sufficient for bounds.
 */
function inverseProject(projection: Projection, x: number, y: number): [number, number] {
  switch (projection.kind) {
    case 'geographic':
      return [x, y];

    case 'webmercator': {
      const lon = (x / R) / DEG;
      const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / DEG;
      return [lon, lat];
    }

    case 'albers': {
      const { centralMeridian, standardParallel1, standardParallel2, latitudeOfOrigin } = projection.params;
      const phi1 = standardParallel1 * DEG;
      const phi2 = standardParallel2 * DEG;
      const phi0 = latitudeOfOrigin * DEG;
      const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
      const C = Math.cos(phi1) ** 2 + 2 * n * Math.sin(phi1);
      const rho0 = (R * Math.sqrt(C - 2 * n * Math.sin(phi0))) / n;
      const rho = Math.sign(n) * Math.sqrt(x * x + (rho0 - y) * (rho0 - y));
      const theta = Math.atan2(Math.sign(n) * x, Math.sign(n) * (rho0 - y));
      const rhoN = (rho * n) / R;
      const sinPhi = (C - rhoN * rhoN) / (2 * n);
      const phi = Math.asin(Math.max(-1, Math.min(1, sinPhi)));
      const lon = centralMeridian + theta / n / DEG;
      return [lon, phi / DEG];
    }
  }
}

/**
 * Projects a longitude/latitude to EPSG:3857 meters.
 *
 * @param lon - Longitude in degrees
 * @param lat - Latitude in degrees (clamped to the Mercator range)
 * @returns [x, y] in meters
 */
export function lngLatToMercator(lon: number, lat: number): [number, number] {
  const clampedLat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
  const x = R * lon * DEG;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (clampedLat * DEG) / 2));
  return [x, y];
}

/**
 * Intersects two geographic bounds.
 *
 * @param a - First bounds [west, south, east, north]
 * @param b - Second bounds [west, south, east, north]
 * @returns The intersection, or null when the bounds do not overlap
 */
export function intersectBounds(a: LngLatBoundsArray, b: LngLatBoundsArray): LngLatBoundsArray | null {
  const west = Math.max(a[0], b[0]);
  const south = Math.max(a[1], b[1]);
  const east = Math.min(a[2], b[2]);
  const north = Math.min(a[3], b[3]);
  if (west >= east || south >= north) return null;
  return [west, south, east, north];
}

/**
 * Converts an ArcGIS extent to padded geographic bounds.
 *
 * Edge midpoints are sampled in addition to corners because conic
 * projections bow edges outward in geographic space. The result is
 * padded and clamped to valid Web Mercator latitudes.
 *
 * @param extent - The ArcGIS extent with its spatial reference
 * @returns [west, south, east, north] in degrees, or null when the
 *   spatial reference is unsupported or the extent is invalid
 */
export function extentToBounds(extent: ArcGISExtent | undefined | null): LngLatBoundsArray | null {
  if (!extent) return null;
  const { xmin, ymin, xmax, ymax } = extent;
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite) || xmin >= xmax || ymin >= ymax) {
    return null;
  }

  const projection = resolveProjection(extent.spatialReference);
  if (!projection) return null;

  // Sample each edge so conic edge bowing is captured
  const samplesPerEdge = 8;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= samplesPerEdge; i++) {
    const fx = xmin + ((xmax - xmin) * i) / samplesPerEdge;
    const fy = ymin + ((ymax - ymin) * i) / samplesPerEdge;
    points.push([fx, ymin], [fx, ymax], [xmin, fy], [xmax, fy]);
  }

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [x, y] of points) {
    const [lon, lat] = inverseProject(projection, x, y);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }

  // Pad to absorb the spherical approximation, then clamp
  const padLon = Math.max(0.3, (east - west) * 0.03);
  const padLat = Math.max(0.3, (north - south) * 0.03);
  west = Math.max(-180, west - padLon);
  east = Math.min(180, east + padLon);
  south = Math.max(-MAX_MERCATOR_LAT, south - padLat);
  north = Math.min(MAX_MERCATOR_LAT, north + padLat);

  if (west >= east || south >= north) return null;
  return [west, south, east, north];
}
