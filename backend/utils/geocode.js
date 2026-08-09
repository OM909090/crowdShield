const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Geocodes a free-text address into { lat, lng } using OpenStreetMap's free
 * Nominatim API — no API key, no cost. Returns null on any failure so
 * callers can fall back gracefully instead of throwing.
 *
 * Nominatim's usage policy asks for a descriptive User-Agent and no more
 * than ~1 request/second of sustained traffic. We only ever call this once
 * per event (the result gets persisted to Event.location.coordinates), so
 * normal usage stays well within that. For higher volume or stricter
 * reliability later, swap this for a paid provider (Google/Mapbox geocoding)
 * — callers don't need to change since this returns the same {lat,lng} shape.
 *
 * Requires Node 18+ for the built-in global `fetch`.
 */
export const geocodeAddress = async (query) => {
  if (!query || !query.trim()) return null;

  try {
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "CrowdHelp-Hackathon-App/1.0 (crowd safety demo project)",
      },
    });

    if (!res.ok) return null;

    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
};
