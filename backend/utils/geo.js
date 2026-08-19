/**
 * Geometry + pedestrian-physics helpers.
 *
 * This is the single place where spatial math and crowd-capacity constants
 * live. The Venue Graph (E0) uses it to derive lengths, areas and capacities;
 * the Tier 1 predictor (E2) will use the same constants so that "critical"
 * means the same thing everywhere in the system.
 *
 * Coordinates are always [lat, lng] pairs (matching Leaflet), never GeoJSON
 * [lng, lat] — the map layer and the authority editor both speak Leaflet.
 */

export const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * Published pedestrian planning figures. These are what make the capacity
 * numbers defensible rather than invented.
 */
export const PEDESTRIAN = {
  /** Optimal pedestrian flow per metre of usable walkway width (persons/m/s).
   *  Field studies put this at ~1.2-1.4; 1.3 is the working value. */
  FLOW_PER_M_PER_S: 1.3,

  /** Free-flow walking speed on level ground (m/s). */
  FREE_WALK_SPEED_MPS: 1.34,

  /** Fruin-style level-of-service bands, in persons per square metre. */
  DENSITY: {
    COMFORTABLE: 1.5,
    CONSTRAINED: 2.0,
    DENSE: 3.0,
    CRITICAL: 4.0,
    DANGEROUS: 5.0,
  },

  /** Planning density used to size a zone's safe holding capacity (persons/m²). */
  SAFE_DENSITY_P_PER_M2: 2.0,
};

/* ------------------------------------------------------------------ *
 * Distance / bearing
 * ------------------------------------------------------------------ */

/** Great-circle distance in metres between [lat,lng] a and b. */
export function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length in metres of a polyline of [lat,lng] points. */
export function pathLengthMeters(path = []) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += haversineMeters(path[i - 1], path[i]);
  return total;
}

/** Initial bearing in degrees (0-360, 0 = north) from a to b. */
export function bearingDeg(a, b) {
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/* ------------------------------------------------------------------ *
 * Polygons
 * ------------------------------------------------------------------ */

/**
 * Area of a polygon ring in square metres, using the spherical-excess
 * formula (Chamberlain & Duquette). Accurate well beyond venue scale and
 * indifferent to winding order.
 */
export function polygonAreaM2(ring = []) {
  if (ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lat1, lon1] = ring[i];
    const [lat2, lon2] = ring[(i + 1) % ring.length];
    sum += (toRad(lon2 - lon1)) * (Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/**
 * Ray-casting point-in-polygon test. Planar approximation, which is exact
 * enough at the scale of a venue (a few kilometres).
 */
export function pointInPolygon(point, ring = []) {
  if (!point || ring.length < 3) return false;
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    const intersects =
      lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Arithmetic centroid of a ring or point list — good enough for labels/anchors. */
export function centroid(points = []) {
  if (!points.length) return null;
  const sum = points.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

/**
 * Shortest distance in metres from a point to a polyline. Used to decide
 * whether a citizen is "on" a corridor and to snap drawn geometry.
 */
export function distanceToPathMeters(point, path = []) {
  if (!path.length) return Infinity;
  if (path.length === 1) return haversineMeters(point, path[0]);

  // Project into a local metre-space around the point; at venue scale the
  // distortion is negligible and the maths stays simple.
  const [lat0] = point;
  const mPerDegLat = 111132.92;
  const mPerDegLng = 111412.84 * Math.cos(toRad(lat0));
  const toXY = ([lat, lng]) => [lng * mPerDegLng, lat * mPerDegLat];

  const p = toXY(point);
  let best = Infinity;

  for (let i = 1; i < path.length; i += 1) {
    const a = toXY(path[i - 1]);
    const b = toXY(path[i]);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t * dx;
    const cy = a[1] + t * dy;
    best = Math.min(best, Math.hypot(p[0] - cx, p[1] - cy));
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Capacity model
 * ------------------------------------------------------------------ */

/** Persons per minute a corridor of the given usable width can carry. */
export function corridorCapacityPerMin(widthM = 0) {
  return Math.round(Math.max(0, widthM) * PEDESTRIAN.FLOW_PER_M_PER_S * 60);
}

/** Persons per minute a gate of the given clear width can pass. */
export const gateThroughputPerMin = corridorCapacityPerMin;

/** Safe holding capacity (persons) for an area at planning density. */
export function zoneCapacity(areaM2 = 0) {
  return Math.round(Math.max(0, areaM2) * PEDESTRIAN.SAFE_DENSITY_P_PER_M2);
}

/** Classify a density (persons/m²) into a level-of-service band. */
export function densityLevel(density = 0) {
  const D = PEDESTRIAN.DENSITY;
  if (density >= D.DANGEROUS) return "dangerous";
  if (density >= D.CRITICAL) return "critical";
  if (density >= D.DENSE) return "dense";
  if (density >= D.CONSTRAINED) return "constrained";
  if (density >= D.COMFORTABLE) return "comfortable";
  return "free";
}
