import { useMemo, Fragment } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
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

// Agent-drawn danger areas are coloured by the severity the model assigned.
const FLAG_COLOR = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#eab308" };

// Auto danger zones (live dense pockets) share the same severity vocabulary.
const DANGER_COLOR = { critical: "#ef4444", high: "#f97316", elevated: "#f59e0b" };

// Pulsing halo behind a gate that is being pushed past capacity.
const GATE_HALO = {
  overload: L.divIcon({
    html: '<div class="cs-gate-halo cs-gate-halo--overload"></div>',
    className: "",
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  }),
  busy: L.divIcon({
    html: '<div class="cs-gate-halo cs-gate-halo--busy"></div>',
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  }),
};

// A ⚠ pin dropped between two crowds that are closing on each other.
const convergeIcon = L.divIcon({
  html: '<div style="font-size:18px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.8))">⚠️</div>',
  className: "cs-converge-icon",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// A 🚧 pin for a suggested barricade. divIcon (not an image asset) keeps it
// dependency-free and crisp at any zoom.
const barricadeIcon = L.divIcon({
  html: '<div style="font-size:20px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))">🚧</div>',
  className: "cs-barricade-icon",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// "You are here" — the viewer's OWN live position, drawn from their browser GPS
// (not the anonymised crowd dots), so a citizen who shares location can actually
// find themselves on the map. A pulsing cyan pin in the marker pane, above every
// other layer. Inline styles for the visual + Tailwind's animate-ping for the
// halo, so it never depends on a stylesheet that might not have loaded.
const youAreHereIcon = L.divIcon({
  className: "",
  html:
    '<div style="position:relative;display:flex;align-items:center;justify-content:center;width:16px;height:16px">' +
    '<span class="animate-ping" style="position:absolute;width:16px;height:16px;border-radius:9999px;background:#22d3ee;opacity:.55"></span>' +
    '<span style="position:relative;width:12px;height:12px;border-radius:9999px;background:#22d3ee;border:2px solid #083344;box-shadow:0 0 8px rgba(34,211,238,.95)"></span>' +
    "</div>",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const isPoint = (p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));

/**
 * A 📣 flag planted on ground the agent has WARNED.
 *
 * This is the operator's proof of work: without it, an autonomous alert existed
 * only as a line of text in a side panel, and the authority had no way to see
 * that the agent was actively managing the crowd — which areas it told to move,
 * and when. Planted on the very polygon the alert was aimed at.
 */
const alertFlagIcon = L.divIcon({
  className: "",
  html:
    '<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,.8))">' +
    '<div style="font-size:19px;line-height:1">📣</div>' +
    '<div style="margin-top:-2px;width:2px;height:9px;background:#f472b6"></div>' +
    "</div>",
  iconSize: [26, 30],
  iconAnchor: [13, 30],
});

/**
 * Where a person has actually called for help.
 *
 * An SOS is the only signal on this map that comes from a named human being in
 * trouble rather than an aggregate, so it gets its own pin: red and pulsing while
 * nobody has acknowledged it, calmer once the control room has. Density tells you
 * where a crush might form; this tells you where someone already needs reaching.
 */
const INCIDENT_EMOJI = {
  sos: "🆘",
  medical: "⛑️",
  hazard: "⚠️",
  blocked: "⛔",
  lost: "🧭",
  other: "📍",
};
const incidentIconCache = new Map();
function incidentIcon(category, status) {
  const key = `${category}:${status}`;
  if (incidentIconCache.has(key)) return incidentIconCache.get(key);
  const open = status === "open";
  const ring = open ? "#ef4444" : status === "acknowledged" ? "#f59e0b" : "#22c55e";
  const icon = L.divIcon({
    className: "",
    html:
      `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px">` +
      (open
        ? `<span class="animate-ping" style="position:absolute;width:30px;height:30px;border-radius:9999px;background:${ring};opacity:.45"></span>`
        : "") +
      `<span style="position:relative;display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;` +
      `background:rgba(2,6,23,.92);border:2px solid ${ring};box-shadow:0 0 10px ${ring}99;font-size:13px">` +
      `${INCIDENT_EMOJI[category] || INCIDENT_EMOJI.other}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
  incidentIconCache.set(key, icon);
  return icon;
}

/** What the agent is asking the authority to physically place, by kind. */
const PLACEMENT_META = {
  marshals: { emoji: "🧍", label: "Deploy marshals" },
  medical_tent: { emoji: "⛑️", label: "Place medical tent" },
  barricade: { emoji: "🚧", label: "Place barricade" },
  water_point: { emoji: "💧", label: "Place water point" },
  exit_signage: { emoji: "🪧", label: "Place exit signage" },
};
const placementMeta = (kind) => PLACEMENT_META[kind] || { emoji: "📌", label: "Place asset" };

const placementIconCache = new Map();
function placementIcon(kind) {
  if (placementIconCache.has(kind)) return placementIconCache.get(kind);
  const meta = placementMeta(kind);
  const icon = L.divIcon({
    className: "",
    html:
      '<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;' +
      'background:rgba(2,6,23,.9);border:2px dashed #fbbf24;box-shadow:0 0 10px rgba(251,191,36,.5);font-size:15px">' +
      `${meta.emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
  placementIconCache.set(kind, icon);
  return icon;
}

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
 *   youAreAt              the viewer's own [lat,lng] (optional) — "You are here" pin
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
  flaggedAreas = [],
  barricades = [],
  dangerZones = [],
  gateLoads = [],
  youAreAt = null,
  // Ground the agent has actually WARNED (autonomous targeted alerts), and the
  // assets it is asking the authority to place.
  alertedAreas = [],
  placements = [],
  // People who have called for help (SOS / medical / hazard reports).
  incidents = [],
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

  // Crowd groups closing on each other — the crush geometry. The tracker emits
  // the pair ids; we resolve them to live centroids so the line follows the
  // crowds as they move, and re-draws gone once they merge or separate.
  const convergingPairs = useMemo(() => {
    if (!clusterEvents?.length || !clusters?.length) return [];
    const byId = new Map();
    clusters.forEach((k) => {
      if (Array.isArray(k?.c) && Number.isFinite(k.c[0])) byId.set(String(k.id), k.c);
    });
    const out = [];
    for (const e of clusterEvents) {
      if (e?.kind !== "converging" || !Array.isArray(e.clusterIds)) continue;
      const a = byId.get(String(e.clusterIds[0]));
      const b = byId.get(String(e.clusterIds[1]));
      if (!a || !b) continue;
      out.push({
        id: e.clusterIds.join("~"),
        a,
        b,
        mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        gapM: e.gapM,
        bothDense: !!e.bothDense,
      });
    }
    return out;
  }, [clusters, clusterEvents]);

  const gateLoadById = useMemo(() => {
    const m = new Map();
    gateLoads.forEach((g) => m.set(String(g.id), g));
    return m;
  }, [gateLoads]);

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

      {/* Area of Responsibility.
          When no zones have been authored, the boundary IS the zone being scored,
          so it takes on that risk colour — otherwise the operator would see a
          risk percentage in the stats with nothing on the map to point at. */}
      {aor.length >= 3 &&
        (() => {
          const implicit = liveZones.find((z) => z.id === "AOR" || z.implicit);
          const style = implicit?.riskLevel
            ? {
                ...aorStyle,
                color: riskMeta(implicit.riskLevel).color,
                fillColor: riskMeta(implicit.riskLevel).color,
                fillOpacity: 0.06 + 0.18 * (implicit.risk || 0),
                weight: riskRank(implicit.riskLevel) >= riskRank("HIGH") ? 3 : 2,
              }
            : aorStyle;
          return (
            <Polygon positions={aor} pathOptions={{ ...style, interactive: !!implicit }}>
              {implicit && (
                <Tooltip sticky>
                  <span className="text-xs">
                    <b>{implicit.name || "Whole venue"}</b>
                    {` · ${riskMeta(implicit.riskLevel).label} · worst pocket ${implicit.density} p/m²`}
                    {implicit.meanDensity != null ? ` · venue average ${implicit.meanDensity} p/m²` : ""}
                    {implicit.forecast?.etaCriticalSec != null
                      ? ` · critical in ~${formatEta(implicit.forecast.etaCriticalSec)}`
                      : ""}
                  </span>
                </Tooltip>
              )}
            </Polygon>
          );
        })()}

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

      {/* Live danger zones — tight polygons around dense pockets, recomputed
          every tick with no LLM in the loop. Multiple, sized to the actual
          crowd. This is the always-on "danger area" layer. */}
      {dangerZones.map((d) =>
        d.polygon?.length >= 3 ? (
          <Polygon
            key={d.id}
            positions={d.polygon}
            pathOptions={{
              color: DANGER_COLOR[d.severity] || DANGER_COLOR.high,
              weight: 2.5,
              fillColor: DANGER_COLOR[d.severity] || DANGER_COLOR.high,
              fillOpacity: 0.22,
              interactive: false,
            }}
          >
            <Tooltip permanent direction="center" className="cs-ai-tooltip">
              <span className="text-[11px] font-semibold">⚠ ~{(d.personsEst || 0).toLocaleString("en-IN")}</span>
            </Tooltip>
          </Polygon>
        ) : null
      )}

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

      {/* AI-drawn danger areas (flag_area) — risk the agent marked itself where
          no zone was authored. Filled, so it reads as an area, not just an outline. */}
      {flaggedAreas.map((f) =>
        f.polygon?.length >= 3 ? (
          <Polygon
            key={f.id}
            positions={f.polygon}
            pathOptions={{
              color: FLAG_COLOR[f.severity] || FLAG_COLOR.high,
              weight: 3,
              dashArray: "6 6",
              fillColor: FLAG_COLOR[f.severity] || FLAG_COLOR.high,
              fillOpacity: 0.18,
              interactive: false,
            }}
          >
            <Tooltip permanent direction="center" className="cs-ai-tooltip">
              <span className="text-[11px] font-semibold">⚠ {f.label}</span>
            </Tooltip>
          </Polygon>
        ) : null
      )}

      {/* AREAS THE AGENT HAS WARNED. A bright outline plus a 📣 flag on each
          polygon the agent sent a targeted alert to, so the authority can see at
          a glance that the guardian is actively moving people out of danger —
          which ground, what it said, and how long ago. */}
      {alertedAreas.map((a) => (
        <Fragment key={`alerted-${a.id}`}>
          {a.polygon?.length >= 3 && (
            <Polygon
              positions={a.polygon}
              pathOptions={{
                color: "#f472b6",
                weight: 3,
                dashArray: "2 6",
                fillColor: "#f472b6",
                fillOpacity: 0.1,
                interactive: false,
              }}
            />
          )}
          {isPoint(a.center) && (
            <Marker position={a.center} icon={alertFlagIcon} zIndexOffset={900} interactive>
              <Tooltip direction="top" offset={[0, -28]}>
                <span className="text-xs">
                  <b>Agent alerted this area</b>
                  {a.name ? <span className="block text-slate-300">{a.name}</span> : null}
                  {a.message ? <span className="block max-w-[240px]">“{a.message}”</span> : null}
                  {a.ago ? <span className="block text-slate-400">{a.ago}</span> : null}
                </span>
              </Tooltip>
            </Marker>
          )}
        </Fragment>
      ))}

      {/* WHAT THE AGENT WANTS PLACED. A dashed amber pin the operator can act on:
          marshals, a medical tent, water, signage — at a point the server
          resolved from a real crowd/gate/zone, never from model-invented coords. */}
      {placements.map((p) =>
        isPoint(p.at) ? (
          <Marker key={`place-${p.id}`} position={p.at} icon={placementIcon(p.kind)} zIndexOffset={800} interactive>
            <Tooltip direction="top" offset={[0, -18]}>
              <span className="text-xs">
                <b>{placementMeta(p.kind).label}</b>
                {p.targetName ? <span className="block text-slate-300">at {p.targetName}</span> : null}
                {p.reason ? <span className="block max-w-[240px] text-slate-300">{p.reason}</span> : null}
                <span className="mt-0.5 block text-amber-300">AI suggestion — needs you to place it</span>
              </span>
            </Tooltip>
          </Marker>
        ) : null
      )}

      {/* SOS / incident reports — a real person asking for help, at the spot they
          reported from. Pulsing red until the control room acknowledges it. */}
      {incidents.map((i) =>
        isPoint(i.at) ? (
          <Marker
            key={`incident-${i.id}`}
            position={i.at}
            icon={incidentIcon(i.category, i.status)}
            zIndexOffset={1000}
            interactive
          >
            <Tooltip direction="top" offset={[0, -16]}>
              <span className="text-xs">
                <b>
                  {INCIDENT_EMOJI[i.category] || INCIDENT_EMOJI.other} {String(i.category || "report").toUpperCase()}
                </b>
                <span className="block text-slate-300">{i.status}</span>
                {i.note ? <span className="block max-w-[240px]">{i.note}</span> : null}
              </span>
            </Tooltip>
          </Marker>
        ) : null
      )}

      {/* Crowd groups converging — a dashed connector + a ⚠ pin between two
          bodies of people closing on each other, so a crush approaching from any
          side is visible live, not just in the side panel. Red when both are
          already dense. */}
      {convergingPairs.map((c) => (
        <Fragment key={`conv-${c.id}`}>
          <Polyline
            positions={[c.a, c.b]}
            pathOptions={{
              color: c.bothDense ? "#ef4444" : "#f97316",
              weight: 3,
              dashArray: "4 8",
              opacity: 0.9,
              interactive: false,
            }}
          />
          <Marker position={c.mid} icon={convergeIcon} interactive>
            <Tooltip direction="top" offset={[0, -10]}>
              <span className="text-xs">
                <b>Crowds converging</b>
                {Number.isFinite(c.gapM) ? ` · ${c.gapM} m apart` : ""}
                {c.bothDense ? " · both dense" : ""}
              </span>
            </Tooltip>
          </Marker>
        </Fragment>
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

      {/* Gate overload — a pulsing halo behind a gate being pushed past what it
          can pass. Rendered before the node markers so the gate icon sits on top. */}
      {gateLoads.map((g) =>
        (g.level === "overload" || g.level === "busy") && Array.isArray(g.at) ? (
          <Marker key={`gate-halo-${g.id}`} position={g.at} icon={GATE_HALO[g.level]} interactive={false} zIndexOffset={-100} />
        ) : null
      )}

      {/* Graph nodes (gates, POIs…) — non-interactive labels */}
      {nodes.map((n) => {
        const gl = n.type === "gate" ? gateLoadById.get(String(n.id)) : null;
        const overload = gl && (gl.level === "overload" || gl.level === "busy");
        return (
          <Marker key={n.id} position={n.at} icon={nodeIcon(n.type, n.state)} interactive>
            <Tooltip direction="top" offset={[0, -14]}>
              {`${nodeMeta(n.type).label}: ${n.name || n.id}`}
              {overload ? ` · ${gl.level} (~${gl.nearPersons} waiting · ${gl.clearMin} min)` : ""}
            </Tooltip>
          </Marker>
        );
      })}

      {/* Suggested barricades (suggest_barricade) — where the agent recommends a
          physical barrier. A human places it; this just pins the spot + reason. */}
      {barricades.map((b) =>
        Array.isArray(b.at) && b.at.length >= 2 ? (
          <Marker key={b.id} position={b.at} icon={barricadeIcon} interactive>
            <Tooltip direction="top" offset={[0, -12]}>
              <span className="text-xs">
                <b>Suggested barricade</b>
                {b.label ? ` · ${b.label}` : ""}
                {b.reason ? <span className="block text-slate-300">{b.reason}</span> : null}
              </span>
            </Tooltip>
          </Marker>
        ) : null
      )}

      {/* Live people dots (canvas, interpolated) — only those not inside a bubble */}
      <DotsLayer dots={loneDots} />

      {/* Packed crowds as single merged bubbles (canvas, interpolated + merge animation) */}
      <ClustersLayer clusters={bubbles} clusterEvents={clusterEvents} />

      {/* The viewer's own live location (top of everything) */}
      {isPoint(youAreAt) && (
        <Marker position={youAreAt} icon={youAreHereIcon} zIndexOffset={1200} interactive>
          <Tooltip direction="top" offset={[0, -8]} permanent>
            <span className="text-xs font-semibold">You are here</span>
          </Tooltip>
        </Marker>
      )}

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
