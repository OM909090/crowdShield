/**
 * agentOverlay — turns the raw `agent:action` stream (from useCrowdFeed) into
 * geometry the map can draw, plus the wording the HUD uses to describe it.
 *
 * The server already resolves geometry for advisory actions (`waypoints` for a
 * route, `polygon` for a zone highlight), so this is mostly selection, de-duping
 * and labelling. When geometry is missing we fall back to the authored venue
 * graph so the authority still sees *where* the AI is pointing.
 */

const MAX_HIGHLIGHTS = 4; // most recent flagged zones worth outlining at once
const MAX_ROUTES = 3; // more than this and the map turns into spaghetti

const HIGHLIGHT_TYPES = new Set(["highlight_zone", "set_camera"]);

/** Is this a usable [[lat,lng], …] ring? */
const isPolygon = (p) => Array.isArray(p) && p.length >= 3;
/** Is this a usable [lat,lng] pair? */
const isLatLng = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));

/**
 * Derive the AI overlay layers for a venue map.
 *
 * @param {Array<Object>} agentActions  newest-first flat actions from useCrowdFeed
 * @param {Object|null}   venue         authored venue graph (zones/nodes) for fallbacks
 * @returns {{
 *   highlightZones: Array<{ zoneId: string, zoneName?: string, polygon?: Array<[number,number]> }>,
 *   agentRoutes: Array<{ id: string, positions: Array<[number,number]>, label: string, type: string }>
 * }}
 */
export function deriveAgentOverlay(agentActions = [], venue = null) {
  const zones = venue?.zones || [];
  const nodes = venue?.nodes || [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const highlightZones = [];
  const seenZones = new Set();
  const agentRoutes = [];
  const seenRoutes = new Set();

  for (const a of Array.isArray(agentActions) ? agentActions : []) {
    if (!a?.type) continue;

    if (HIGHLIGHT_TYPES.has(a.type) && a.zoneId) {
      if (seenZones.has(a.zoneId) || highlightZones.length >= MAX_HIGHLIGHTS) continue;
      seenZones.add(a.zoneId);
      const zone = zoneById.get(a.zoneId);
      highlightZones.push({
        zoneId: a.zoneId,
        zoneName: a.zoneName || zone?.name || a.zoneId,
        polygon: isPolygon(a.polygon) ? a.polygon : isPolygon(zone?.polygon) ? zone.polygon : undefined,
      });
      continue;
    }

    if (a.type === "draw_route" && a.fromNodeId && a.toNodeId) {
      const id = `${a.proposalId || "agent"}${a.fromNodeId}${a.toNodeId}`;
      if (seenRoutes.has(id) || agentRoutes.length >= MAX_ROUTES) continue;

      // Server-resolved corridor path first; a straight from→to line only as a
      // last resort so the direction is still legible.
      let positions = Array.isArray(a.waypoints) ? a.waypoints.filter(isLatLng) : [];
      if (positions.length < 2) {
        const from = nodeById.get(a.fromNodeId)?.at;
        const to = nodeById.get(a.toNodeId)?.at;
        positions = isLatLng(from) && isLatLng(to) ? [from, to] : [];
      }
      if (positions.length < 2) continue;

      seenRoutes.add(id);
      const eta = Number(a.etaSec);
      agentRoutes.push({
        id,
        positions,
        label: `AI route: ${a.fromNodeId} -> ${a.toNodeId}${Number.isFinite(eta) && eta > 0 ? ` (~${Math.round(eta / 60)} min)` : ""}`,
        type: "evacuation",
      });
    }
  }

  return { highlightZones, agentRoutes };
}

/* ------------------------------------------------------------------ *
 * Presentation helpers for the "AI directives" HUD.
 * ------------------------------------------------------------------ */

const ACTION_LABELS = {
  highlight_zone: "Flagged zone",
  set_camera: "Camera on zone",
  draw_route: "Routed crowd",
  set_routing_policy: "Corridor direction",
  open_gate: "Opened gate",
  close_gate: "Closed gate",
  deploy_units: "Deployed units",
  broadcast_alert: "Broadcast to crowd",
};

/** Humanised name for an action type (falls back to de-snake-casing). */
export function actionLabel(type) {
  return ACTION_LABELS[type] || String(type || "action").replace(/_/g, " ");
}

/** Short description of what the action was aimed at. */
export function actionTarget(a) {
  if (!a) return "";
  switch (a.type) {
    case "highlight_zone":
    case "set_camera":
      return a.zoneName || a.zoneId || "";
    case "draw_route":
      return a.fromNodeId && a.toNodeId ? `${a.fromNodeId} → ${a.toNodeId}` : "";
    case "set_routing_policy":
      return [a.edgeId, a.direction].filter(Boolean).join(" · ");
    case "open_gate":
    case "close_gate":
      return a.gateId || "";
    case "deploy_units":
      return [a.count && `${a.count} units`, a.from && a.to && `${a.from} → ${a.to}`].filter(Boolean).join(" · ");
    case "broadcast_alert":
      return a.message || "";
    default:
      return a.zoneName || a.zoneId || a.gateId || "";
  }
}

/**
 * Badge wording + tone for an action's class/status:
 * advisory → slate/cyan, consequential once executed → emerald, otherwise amber.
 */
export function actionTone(a) {
  if (a?.klass === "consequential") {
    return a?.status === "executed"
      ? { label: "executed", tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" }
      : { label: "approved", tone: "border-amber-400/25 bg-amber-500/10 text-amber-200" };
  }
  return { label: "advisory", tone: "border-cyan-400/25 bg-cyan-500/10 text-cyan-200" };
}

export default deriveAgentOverlay;
