/**
 * Thin wrapper over Uber's H3 (h3-js v4). Keeps the rest of the codebase from
 * caring about the exact library API and gives us one place to swap resolution
 * defaults or add caching.
 *
 * All coordinates are [lat, lng] (Leaflet order) to match the map + geo.js.
 */
import { latLngToCell, cellToLatLng, cellToBoundary, cellArea, gridDisk, getResolution } from "h3-js";

export const DEFAULT_ANALYSIS_RES = 11; // ~2,400 m² cells — right scale for persons/m²
export const DEFAULT_ROLLUP_RES = 9;

/** [lat,lng] -> H3 cell id at the given resolution. */
export const toCell = (lat, lng, res = DEFAULT_ANALYSIS_RES) => latLngToCell(lat, lng, res);

/** H3 cell id -> [lat,lng] centre. */
export const cellCenter = (cell) => cellToLatLng(cell);

/** H3 cell id -> polygon ring [[lat,lng], ...]. */
export const cellBoundary = (cell) => cellToBoundary(cell);

/** Cell area in square metres (varies slightly with latitude). */
export const cellAreaM2 = (cell) => cellArea(cell, "m2");

/** self + neighbours within k rings. */
export const neighbors = (cell, k = 1) => gridDisk(cell, k);

export { getResolution };
