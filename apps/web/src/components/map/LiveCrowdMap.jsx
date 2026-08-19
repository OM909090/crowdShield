import { useMemo } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "../../venueMap.css";
import { MapController, VenuePin, HeatmapLayer, MarkersLayer, RoutesLayer } from "./mapLayers";
import DotsLayer from "./DotsLayer";
import ClustersLayer from "./ClustersLayer";
import MapLegend from "./MapLegend";
import { splitCrowd } from "./crowdSplit";
import { nodeIcon, aorStyle, edgeStyle, zoneMeta, nodeMeta } from "./venueNodes";
import { riskMeta, riskRank, formatEta } from "../../utils/riskUi";

const DEFAULT_ZOOM = 16;
const STATUS_COLOR = { Critical: "#ef4444", Moderate: "#f59e0b", Safe: "#22c55e" };

/**
 * LiveCrowdMap — the read-only command view: the authority's venue graph with
 * the live crowd painted on top (heatmap + moving dots), and zones tinted by
 * their live status. Interaction-free by design; the editor is where geometry
 * is drawn.
 *
 * Props:
 *   center, venue         venue coords + pin label
 *   aor                   AoR polygon [[lat,lng]]
 *   zones                 venue zones (with polygon)   — geometry
 *   liveZones             frame.zones (by id)          — status/density
 *   nodes, edges          venue graph
 *   cells                 frame.cells → heatmap
 *   dots                  frame.dots  → live people
 *   clusters              frame.clusters → tracked crowds (merged bubbles)
 *   clusterEvents         merges/convergences, so a merge can be animated
 *   markers               annotation markers (optional)
 *   highlightZones        AI-flagged zones [{ zoneId, zoneName, polygon }] (optional)
 *   agentRoutes           AI-drawn paths [{ id, positions, label, type }] (optional)
 */
export default function LiveCrowdMap({
  center,
  venue,
  aor = [],
  zones = [],
  liveZones = [],
  nodes = [],
  edges = [],
  cells = [],
  dots = [],
  clusters = [],
  clusterEvents = [],
  markers = [],
  highlightZones = [],
  agentRoutes = [],
  // Opt-in: some consumers (the shared LiveMap) already draw their own legend,
  // and two legends stacked in the same corner is worse than none. Off by
  // default so only a caller that lacks one — the command center — turns it on.
  legend = false,
}) {
  const boundsPoints = useMemo(() => {
    const pts = [];
    if (center) pts.push(center);
    aor.forEach((p) => pts.push(p));
    nodes.forEach((n) => pts.push(n.at));
    return pts;
  }, [center, aor, nodes]);

  const liveById = useMemo(() => {
    const m = new Map();
    liveZones.forEach((z) => m.set(z.id, z));
    return m;
  }, [liveZones]);

  // Packed crowds become one labelled bubble; the people inside them stop being
  // drawn as individuals. Computed once here, per tick, and handed to both layers
  // pre-split so neither one gets a vote — the two can't disagree about which
  // people are already covered, and the thousands-of-dots pass stays off the
  // 60 fps render path. The rule itself lives in crowdSplit.js.
  const { bubbles, dots: loneDots } = useMemo(() => splitCrowd(clusters, dots), [clusters, dots]);

  const heatPoints = useMemo(
    () =>
      cells.map((c) => ({
        lat: c.c[0],
        lng: c.c[1],
        intensity: Math.min(1, 0.25 + (c.d || 0) / 2),
      })),
    [cells]
  );

  // AI highlights arrive with the polygon the server resolved; if one is
  // missing, borrow the authored geometry for that zone id.
  const resolvedHighlights = useMemo(() => {
    const byId = new Map(zones.map((z) => [z.id, z]));
    return highlightZones
      .map((h) => {
        const zone = byId.get(h.zoneId);
        const polygon = h.polygon?.length >= 3 ? h.polygon : zone?.polygon;
        return polygon?.length >= 3 ? { ...h, zoneName: h.zoneName || zone?.name || h.zoneId, polygon } : null;
      })
      .filter(Boolean);
  }, [highlightZones, zones]);

  // The single most dangerous zone right now, for the on-map countdown. The
  // right-hand rail already lists alerts, but the operator's eyes are on the map
  // — the time-to-critical belongs where they are looking, not only in a side
  // panel. WATCH is deliberately excluded: it is not yet actionable and a badge
  // for every mild rise would train people to ignore the badge.
  const hotspot = useMemo(() => {
    const ranked = liveZones
      .filter((z) => z.riskLevel && riskRank(z.riskLevel) >= riskRank("ELEVATED"))
      .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));
    return ranked[0] || null;
  }, [liveZones]);

  const hotspotEta = hotspot ? formatEta(hotspot.forecast?.etaCriticalSec) : null;
  const hotspotUrgent =
    hotspot && (hotspot.riskLevel === "HIGH" || hotspot.riskLevel === "CRITICAL");
  const showLegend = legend && (zones.length > 0 || nodes.length > 0);

  if (!center) return null;

  return (
    <div className="relative h-full w-full">
    <MapContainer center={center} zoom={DEFAULT_ZOOM} scrollWheelZoom preferCanvas className="h-full w-full" style={{ background: "#0b1120" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <MapController center={center} boundsPoints={boundsPoints} autoFit />

      {/* Area of Responsibility */}
      {aor.length >= 3 && <Polygon positions={aor} pathOptions={{ ...aorStyle, interactive: false }} />}

      {/* Zones tinted by live RISK level (falls back to density status) */}
      {zones.map((z) => {
        if (!(z.polygon?.length >= 3)) return null;
        const live = liveById.get(z.id);
        const level = live?.riskLevel;
        const color = level
          ? riskMeta(level).color
          : live
            ? STATUS_COLOR[live.status] || zoneMeta(z.type).color
            : zoneMeta(z.type).color;
        const strong = level === "HIGH" || level === "CRITICAL";
        const fillOpacity = live
          ? level
            ? 0.15 + 0.4 * (live.risk || 0)
            : 0.14 + Math.min(0.3, (live.density || 0) / 6)
          : 0.1;
        const eta = formatEta(live?.forecast?.etaCriticalSec);
        return (
          <Polygon
            key={z.id}
            positions={z.polygon}
            pathOptions={{ color, weight: strong ? 3 : 1.5, fillColor: color, fillOpacity, interactive: true }}
          >
            <Tooltip sticky>
              <span className="text-xs">
                <b>{z.name}</b>
                {live
                  ? ` · ${riskMeta(level).label} · ${live.density} p/m² · ~${live.personsEst}${eta ? ` · critical in ~${eta}` : ""}`
                  : " · no data"}
              </span>
            </Tooltip>
          </Polygon>
        );
      })}

      {/* AI-flagged zones — attention outline drawn over the tinted zones */}
      {resolvedHighlights.map((h) => (
        <Polygon
          key={`ai-zone-${h.zoneId}`}
          positions={h.polygon}
          pathOptions={{ color: "#f472b6", weight: 4, dashArray: "10 8", fill: false, interactive: false }}
        >
          {/* Permanent, because a non-interactive path never fires hover — the
              underlying zone keeps its own richer sticky tooltip. */}
          <Tooltip permanent direction="center" className="cs-ai-tooltip">
            <span className="text-[11px] font-semibold">AI flagged · {h.zoneName || h.zoneId}</span>
          </Tooltip>
        </Polygon>
      ))}

      {/* Corridors */}
      {edges.map((e) =>
        e.path?.length >= 2 ? <Polyline key={e.id} positions={e.path} pathOptions={{ ...edgeStyle(e), interactive: false }} /> : null
      )}

      {/* AI-drawn routes — above corridors, below the crowd */}
      {agentRoutes.length > 0 && <RoutesLayer routes={agentRoutes} />}

      {/* Crowd heatmap (below dots) */}
      {heatPoints.length > 0 && <HeatmapLayer points={heatPoints} />}

      {/* Annotation markers (optional context) */}
      <MarkersLayer markers={markers} editable={false} />

      {/* Graph nodes (gates, POIs…) — non-interactive labels */}
      {nodes.map((n) => (
        <Marker key={n.id} position={n.at} icon={nodeIcon(n.type, n.state)} interactive>
          <Tooltip direction="top" offset={[0, -14]}>{`${nodeMeta(n.type).label}: ${n.name || n.id}`}</Tooltip>
        </Marker>
      ))}

      {/* Live people dots (canvas, interpolated) — only those not inside a bubble */}
      <DotsLayer dots={loneDots} />

      {/* Packed crowds as single merged bubbles (canvas, interpolated + merge animation) */}
      <ClustersLayer clusters={bubbles} clusterEvents={clusterEvents} />

      <VenuePin center={center} venue={venue} />
    </MapContainer>

      {/* On-map early warning: the worst zone and its time-to-critical, pinned
          top-centre where the eye already is. Pulses red at HIGH/CRITICAL so the
          most dangerous thing on the map is also the loudest — countering the
          fact that a spread-out crowd bubble can look calm green while the tight
          zone under it is minutes from a crush. */}
      {hotspot && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[600] flex max-w-[92%] -translate-x-1/2 justify-center">
          {/* Solid background and its own high z so a busy overlay above can
              never bleed through and hide the countdown — the number is the
              whole reason the badge exists, so it must never be truncated. */}
          <div
            className={`flex items-center gap-2 rounded-full border bg-slate-950/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-xl ${hotspotUrgent ? "animate-pulse" : ""}`}
            style={{ borderColor: riskMeta(hotspot.riskLevel).color }}
          >
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              {hotspotUrgent && (
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                  style={{ backgroundColor: riskMeta(hotspot.riskLevel).color }}
                />
              )}
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: riskMeta(hotspot.riskLevel).color }}
              />
            </span>
            <span className="truncate">
              {riskMeta(hotspot.riskLevel).label} · {hotspot.name}
              {hotspotEta ? ` · critical in ~${hotspotEta}` : ""}
            </span>
          </div>
        </div>
      )}

      {showLegend && <MapLegend />}
    </div>
  );
}
