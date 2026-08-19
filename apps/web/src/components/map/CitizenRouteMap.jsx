import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MapController, RoutesLayer } from "./mapLayers";
import { riskMeta } from "../../utils/riskUi";

/**
 * CitizenRouteMap — the phone-sized counterpart to LiveCrowdMap.
 *
 * One job: show a person in a crowd the path they've just been told to walk.
 * The route is the hero (thick green line); everything else — the AoR outline,
 * risk-tinted zones, other gates — is deliberately faint context so the line
 * stays readable at arm's length in daylight.
 *
 * Props
 *   center       [lat,lng]  initial viewport centre (required — null renders nothing)
 *   route        [[lat,lng]] the walking path to draw
 *   youAreAt     [lat,lng]  the citizen's own fix
 *   destination  [lat,lng] | { at:[lat,lng], name } where they're headed
 *   gates        venue nodes [{ id, name, type, state, at }] — open gates drawn as dots
 *   aor          [[lat,lng]] area-of-responsibility outline
 *   zones        [{ id, name, polygon }] authored geometry
 *   liveZones    [{ id, riskLevel, risk }] live risk, matched to `zones` by id
 *   height       CSS height for the map box
 *   youAreHereLabel / destinationLabel   translated tooltip copy
 */

const DEFAULT_ZOOM = 16;
const PULSE_STEPS = 8;
const PULSE_MS = 220;

const isLatLng = (p) =>
  Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));

const toLatLng = (p) => [Number(p[0]), Number(p[1])];

/** Accepts a bare [lat,lng] or a { at, name } shape. */
function normalizePlace(place) {
  if (isLatLng(place)) return { at: toLatLng(place), name: null };
  if (place && isLatLng(place.at)) return { at: toLatLng(place.at), name: place.name || null };
  return null;
}

/** ~11 m grid. Snapping the frame anchor keeps GPS jitter from re-fitting the
 *  viewport every second (MapController re-frames whenever `center` changes). */
const snap = (p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];

/**
 * Pulsing "you are here". Kept in its own component so its animation frames
 * re-render one marker instead of every layer on the map.
 */
function YouAreHere({ at, label }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % PULSE_STEPS), PULSE_MS);
    return () => clearInterval(id);
  }, []);

  if (!isLatLng(at)) return null;
  const t = phase / PULSE_STEPS; // 0 → 1 over ~1.8s
  const fade = 1 - t;

  return (
    <>
      {/* Expanding halo */}
      <CircleMarker
        center={at}
        radius={9 + t * 13}
        pathOptions={{
          color: "#22d3ee",
          weight: 1.5,
          opacity: 0.5 * fade,
          fillColor: "#22d3ee",
          fillOpacity: 0.16 * fade,
          interactive: false,
        }}
      />
      {/* Solid core */}
      <CircleMarker
        center={at}
        radius={7}
        pathOptions={{ color: "#083344", weight: 2.5, fillColor: "#22d3ee", fillOpacity: 1 }}
      >
        <Tooltip direction="top" offset={[0, -8]}>
          <span className="text-xs font-semibold">{label || "You are here"}</span>
        </Tooltip>
      </CircleMarker>
    </>
  );
}

export default function CitizenRouteMap({
  center,
  route = [],
  youAreAt,
  destination,
  gates = [],
  aor = [],
  zones = [],
  liveZones = [],
  height = "220px",
  youAreHereLabel,
  destinationLabel,
}) {
  const safeCenter = isLatLng(center) ? toLatLng(center) : null;
  const here = isLatLng(youAreAt) ? toLatLng(youAreAt) : null;
  const dest = normalizePlace(destination);

  const path = useMemo(() => (Array.isArray(route) ? route.filter(isLatLng).map(toLatLng) : []), [route]);

  const safeAor = useMemo(() => (Array.isArray(aor) ? aor.filter(isLatLng).map(toLatLng) : []), [aor]);

  const openGates = useMemo(
    () =>
      (Array.isArray(gates) ? gates : []).filter(
        (g) => g && g.type === "gate" && g.state !== "closed" && isLatLng(g.at)
      ),
    [gates]
  );

  const liveById = useMemo(() => {
    const m = new Map();
    (Array.isArray(liveZones) ? liveZones : []).forEach((z) => {
      if (z?.id) m.set(z.id, z);
    });
    return m;
  }, [liveZones]);

  // Everything the journey touches — the map frames to fit all of it. Built
  // plainly rather than memoized: MapController re-frames off `center` only, so
  // a fresh array here costs nothing and keeps the deps honest.
  const boundsPoints = [...path];
  if (here) boundsPoints.push(here);
  if (dest) boundsPoints.push(dest.at);
  if (!boundsPoints.length && safeCenter) boundsPoints.push(safeCenter);

  // Re-frame when the *journey* changes, not when the GPS fix twitches — the
  // anchor is snapped to ~11 m and prefers the route over the live position.
  const anchor = path[0] || dest?.at || here || safeCenter;
  const frameAnchor = anchor ? snap(anchor) : null;

  if (!safeCenter) return null;

  return (
    <MapContainer
      center={safeCenter}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      scrollWheelZoom={false}
      dragging
      preferCanvas
      className="w-full overflow-hidden rounded-2xl"
      style={{ height, background: "#0b1120" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <MapController center={frameAnchor} boundsPoints={boundsPoints} autoFit />

      {/* Venue outline — faint context only */}
      {safeAor.length >= 3 && (
        <Polygon
          positions={safeAor}
          pathOptions={{
            color: "#22d3ee",
            weight: 1.5,
            dashArray: "6 8",
            fillColor: "#22d3ee",
            fillOpacity: 0.04,
            interactive: false,
          }}
        />
      )}

      {/* Zones tinted by live risk — subtle, so the route stays the loudest thing */}
      {(Array.isArray(zones) ? zones : []).map((z) => {
        if (!(z?.polygon?.length >= 3)) return null;
        const live = liveById.get(z.id);
        if (!live?.riskLevel) return null;
        const color = riskMeta(live.riskLevel).color;
        return (
          <Polygon
            key={z.id}
            positions={z.polygon}
            pathOptions={{
              color,
              weight: 1,
              fillColor: color,
              fillOpacity: 0.12,
              opacity: 0.35,
              interactive: false,
            }}
          />
        );
      })}

      {/* Other open gates — tiny orientation dots */}
      {openGates.map((g) => (
        <CircleMarker
          key={g.id}
          center={toLatLng(g.at)}
          radius={3.5}
          pathOptions={{ color: "#67e8f9", weight: 1, fillColor: "#164e63", fillOpacity: 0.9, interactive: false }}
        />
      ))}

      {/* THE ROUTE — the reason this map exists */}
      {path.length >= 2 && (
        <RoutesLayer routes={[{ id: "citizen-route", positions: path, type: "evacuation", weight: 5 }]} />
      )}

      {/* Where they're going */}
      {dest && (
        <CircleMarker
          center={dest.at}
          radius={9}
          pathOptions={{ color: "#064e3b", weight: 2.5, fillColor: "#34d399", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -10]} permanent>
            <span className="text-xs font-semibold">{dest.name || destinationLabel || "Destination"}</span>
          </Tooltip>
        </CircleMarker>
      )}

      {/* Where they are */}
      {here && <YouAreHere at={here} label={youAreHereLabel} />}
    </MapContainer>
  );
}
