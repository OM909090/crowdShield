import { memo, useEffect, useRef } from "react";
import { Marker, Popup, Polyline, LayerGroup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Trash2 } from "lucide-react";
import { markerIcon, venueIcon } from "./mapIcons";

/* ------------------------------------------------------------------ *
 * MapController — no DOM output. Publishes the Leaflet instance up to
 * the parent and keeps the viewport framed on the venue + its data.
 * It re-frames only when `center` changes (event load), never on every
 * marker edit, so placing markers in the editor doesn't yank the view.
 * ------------------------------------------------------------------ */
export function MapController({ center, boundsPoints = [], autoFit = true, onMap }) {
  const map = useMap();

  useEffect(() => {
    if (onMap) onMap(map);
  }, [map, onMap]);

  const centerKey = center ? `${center[0]},${center[1]}` : "";
  useEffect(() => {
    if (!map || !center) return;
    if (autoFit && boundsPoints.length >= 2) {
      map.fitBounds(boundsPoints, { padding: [50, 50], maxZoom: 17, animate: true });
    } else {
      map.setView(center, map.getZoom(), { animate: true });
    }
    // Intentionally keyed on centerKey only (not boundsPoints) to avoid
    // re-framing while an authority is adding markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, centerKey]);

  return null;
}

export function ClickCapture({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick?.(e.latlng);
    },
  });
  return null;
}

/* ---- Venue pin (kept above every other layer) ---- */
export const VenuePin = memo(function VenuePin({ center, venue }) {
  if (!center) return null;
  return (
    <Marker position={center} icon={venueIcon()} zIndexOffset={1000}>
      <Popup className="venue-map-popup">
        <div className="min-w-[180px] text-sm">
          <p className="font-semibold text-white">{venue?.name || "Venue"}</p>
          {venue?.address && <p className="mt-1 text-xs text-slate-400">{venue.address}</p>}
        </div>
      </Popup>
    </Marker>
  );
});

/* ---- Annotation markers (barricades, gates, safe zones, ...) ---- */
export const MarkersLayer = memo(function MarkersLayer({ markers = [], editable = false, onDeleteMarker }) {
  return (
    <LayerGroup>
      {markers.map((m) => (
        <Marker key={m._id ?? `${m.lat},${m.lng}`} position={[m.lat, m.lng]} icon={markerIcon(m.type)}>
          <Popup className="venue-map-popup">
            <div className="min-w-[160px] text-sm">
              <p className="font-semibold text-white">{m.type}</p>
              {m.label && <p className="mt-1 text-slate-300">{m.label}</p>}
              {m.note && <p className="mt-1 text-xs text-slate-400">{m.note}</p>}
              {editable && (
                <button
                  onClick={() => onDeleteMarker?.(m._id)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-red-400 hover:underline"
                >
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
});

/* NOTE: a generic `ZonesLayer` used to live here. It was removed because it
 * rendered `density` as a percentage, while the pipeline measures persons/m²
 * (Fruin scale, roughly 0–5) — a zone at 2.4 p/m² would have read "2.4%". The
 * live zone rendering with the correct units and the NORMAL→CRITICAL risk
 * vocabulary is in LiveCrowdMap. */

/* ---- Crowd-density heatmap (leaflet.heat, loaded Vite-safe) ---- */
export const HeatmapLayer = memo(function HeatmapLayer({ points = [], options }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;
    let cancelled = false;

    (async () => {
      // leaflet.heat is a classic plugin that augments the global L, so make
      // sure L is reachable before importing it under a bundler.
      if (typeof window !== "undefined" && !window.L) window.L = L;
      await import("leaflet.heat");
      if (cancelled) return;

      const data = points.map((p) => [p.lat, p.lng, p.intensity ?? 0.6]);
      if (!layerRef.current) {
        layerRef.current = L.heatLayer(data, {
          radius: 34,
          blur: 24,
          maxZoom: 17,
          minOpacity: 0.25,
          gradient: { 0.3: "#22c55e", 0.6: "#f59e0b", 0.85: "#ef4444" },
          ...options,
        }).addTo(map);
      } else {
        layerRef.current.setLatLngs(data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [map, points, options]);

  // Tear the layer down when the component unmounts.
  useEffect(
    () => () => {
      if (layerRef.current && map) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    },
    [map]
  );

  return null;
});

/* ---- Routes (evacuation paths / one-way pedestrian flow) ---- */
export const RoutesLayer = memo(function RoutesLayer({ routes = [] }) {
  return (
    <LayerGroup>
      {routes.map((r) => (
        <Polyline
          key={r.id}
          positions={r.positions}
          pathOptions={{
            color: r.color || (r.type === "evacuation" ? "#22c55e" : "#22d3ee"),
            weight: r.weight || 4,
            opacity: 0.9,
            dashArray: r.type === "oneway" ? "8 10" : undefined,
          }}
        >
          {r.label && (
            <Popup className="venue-map-popup">
              <span className="text-sm text-white">{r.label}</span>
            </Popup>
          )}
        </Polyline>
      ))}
    </LayerGroup>
  );
});
