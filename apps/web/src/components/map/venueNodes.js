import L from "leaflet";

/**
 * Visual + structural metadata for the Venue Graph editor.
 * Mirrors the backend enums in models/Venue.js so what the authority draws
 * maps 1:1 to what the server stores and the router later consumes.
 */

// Node types — prefix must match backend NODE_PREFIX in venue.controller.js so
// client-generated ids survive the round-trip unchanged.
export const NODE_TYPE_META = {
  gate: { label: "Gate", emoji: "\u{1F6AA}", color: "#22d3ee", prefix: "G" },
  junction: { label: "Junction", emoji: "\u2795", color: "#94a3b8", prefix: "J" },
  poi: { label: "Point of Interest", emoji: "\u{1F4CD}", color: "#a78bfa", prefix: "P" },
  medical: { label: "Medical", emoji: "\u2695\uFE0F", color: "#ec4899", prefix: "M" },
  exit: { label: "Exit", emoji: "\u{1F3C3}", color: "#38bdf8", prefix: "X" },
  parking: { label: "Parking", emoji: "\u{1F17F}\uFE0F", color: "#f59e0b", prefix: "K" },
  holding: { label: "Holding Area", emoji: "\u23F8\uFE0F", color: "#64748b", prefix: "H" },
};

export const NODE_TYPES = Object.keys(NODE_TYPE_META);
export const NODE_STATES = ["open", "closed", "exit_only", "entry_only"];

export const ZONE_TYPE_META = {
  general: { label: "General", color: "#38bdf8" },
  gate_plaza: { label: "Gate Plaza", color: "#22d3ee" },
  corridor: { label: "Corridor", color: "#818cf8" },
  viewing: { label: "Viewing Area", color: "#a78bfa" },
  holding: { label: "Holding", color: "#f59e0b" },
  restricted: { label: "Restricted", color: "#ef4444" },
};

export const ZONE_TYPES = Object.keys(ZONE_TYPE_META);
export const EDGE_DIRECTIONS = ["bi", "oneway_forward", "oneway_reverse"];
export const EDGE_STATES = ["open", "blocked"];

export const nodeMeta = (type) => NODE_TYPE_META[type] || NODE_TYPE_META.poi;
export const zoneMeta = (type) => ZONE_TYPE_META[type] || ZONE_TYPE_META.general;

/* ------------------------------------------------------------------ *
 * Cached node icons. Keyed by type+state+selected so we build each
 * variant once. A closed node gets a red ring; the selected one glows.
 * ------------------------------------------------------------------ */
const nodeIconCache = new Map();

export function nodeIcon(type, state = "open", selected = false) {
  const key = `${type}:${state}:${selected ? 1 : 0}`;
  if (nodeIconCache.has(key)) return nodeIconCache.get(key);

  const meta = nodeMeta(type);
  const ring = state === "closed" ? "#ef4444" : selected ? "#ffffff" : "rgba(255,255,255,0.85)";
  const dim = state === "closed" ? "opacity:0.55;" : "";
  const glow = selected ? "box-shadow:0 0 0 3px rgba(34,211,238,0.5),0 0 16px rgba(34,211,238,0.6);" : "";
  const badge =
    state === "exit_only"
      ? '<span class="cs-node__badge">out</span>'
      : state === "entry_only"
        ? '<span class="cs-node__badge">in</span>'
        : "";

  const icon = L.divIcon({
    className: "cs-marker",
    html: `<div class="cs-node" style="--cs:${meta.color};border-color:${ring};${dim}${glow}">${meta.emoji}${badge}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
  nodeIconCache.set(key, icon);
  return icon;
}

/* ------------------------------------------------------------------ *
 * Leaflet pathOptions for the graph geometry.
 * ------------------------------------------------------------------ */
export const aorStyle = {
  color: "#22d3ee",
  weight: 2,
  dashArray: "6 8",
  fillColor: "#22d3ee",
  fillOpacity: 0.05,
};

export const aorDraftStyle = { color: "#22d3ee", weight: 2, dashArray: "4 6", fillOpacity: 0 };

export function zoneStyle(type, selected = false) {
  const color = zoneMeta(type).color;
  return {
    color,
    weight: selected ? 3 : 1.5,
    fillColor: color,
    fillOpacity: selected ? 0.28 : 0.16,
  };
}

export function edgeStyle(edge, selected = false) {
  const blocked = edge.state === "blocked";
  const oneway = edge.direction && edge.direction !== "bi";
  return {
    color: blocked ? "#ef4444" : selected ? "#ffffff" : oneway ? "#f59e0b" : "#22d3ee",
    weight: selected ? 6 : 4,
    opacity: blocked ? 0.7 : 0.9,
    dashArray: blocked ? "4 8" : oneway ? "10 8" : undefined,
  };
}

export const draftLineStyle = { color: "#22d3ee", weight: 3, dashArray: "6 8", opacity: 0.9 };

/* ------------------------------------------------------------------ *
 * Client-side short id generator. Matches the backend scheme so ids are
 * stable across save/reload and edges can reference nodes before saving.
 * ------------------------------------------------------------------ */
export function nextId(prefix, existingIds) {
  const used = existingIds instanceof Set ? existingIds : new Set(existingIds || []);
  let n = 1;
  let candidate = `${prefix}${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${prefix}${n}`;
  }
  return candidate;
}

export const nextNodeId = (type, nodes = []) =>
  nextId(nodeMeta(type).prefix, new Set(nodes.map((n) => n.id)));

export const nextZoneId = (zones = []) => nextId("Z", new Set(zones.map((z) => z.id)));
export const nextEdgeId = (edges = []) => nextId("E", new Set(edges.map((e) => e.id)));
