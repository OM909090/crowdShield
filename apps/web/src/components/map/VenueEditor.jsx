import { useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Polygon, Polyline, Marker, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "../../venueMap.css";
import { MapController, ClickCapture, MarkersLayer, VenuePin } from "./mapLayers";
import CoverageDrawLayer from "./CoverageDrawLayer";
import { nodeIcon, aorStyle, zoneStyle, edgeStyle, draftLineStyle, nodeMeta } from "./venueNodes";

const DEFAULT_ZOOM = 16;

/**
 * VenueEditor — the interactive authoring surface for the Venue Graph.
 *
 * Purely presentational: it renders the graph + any in-progress draft geometry
 * and emits pointer events. All editing state/logic lives in the page so the
 * map stays a predictable function of props.
 *
 * Interactivity is mode-aware: while drawing (aor/zone/node/coverage) the
 * existing shapes are made non-interactive so clicks fall through to the map as
 * new vertices — or, in `coverage` mode, so nothing intercepts the freehand
 * stroke; in `edge` mode nodes stay clickable so they can be picked as corridor
 * endpoints; in `select` mode everything is clickable for editing.
 */
export default function VenueEditor({
  center,
  venue,
  aor = [],
  zones = [],
  nodes = [],
  edges = [],
  markers = [],
  mode = "select",
  draft = [],
  edgeDraft = null,
  selection = null,
  onMapClick,
  onNodeClick,
  onEdgeClick,
  onZoneClick,
  onDeleteMarker,
  onCoverageComplete,
  onCoverageProgress,
  onReady,
}) {
  const mapRef = useRef(null);
  const handleMap = useCallback(
    (map) => {
      mapRef.current = map;
      onReady?.(map);
    },
    [onReady]
  );

  // `coverage` is the freehand pen; like the vertex-click drawing modes it wants
  // a crosshair and non-interactive geometry underneath it.
  const drawing = mode === "aor" || mode === "zone" || mode === "coverage";
  const nodesInteractive = mode === "select" || mode === "edge";
  const pathsInteractive = mode === "select";

  const boundsPoints = useMemo(() => {
    const pts = [];
    if (center) pts.push(center);
    aor.forEach((p) => pts.push(p));
    nodes.forEach((n) => pts.push(n.at));
    return pts;
  }, [center, aor, nodes]);

  const nodeById = useMemo(() => {
    const m = new Map();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  // In-progress corridor: node start + waypoints.
  const edgeDraftPath = useMemo(() => {
    if (!edgeDraft?.fromId) return [];
    const from = nodeById.get(edgeDraft.fromId);
    if (!from) return [];
    return [from.at, ...(edgeDraft.waypoints || [])];
  }, [edgeDraft, nodeById]);

  const isSel = (kind, id) => selection?.kind === kind && selection?.id === id;

  if (!center) return null;

  return (
    <MapContainer
      center={center}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      preferCanvas
      className="h-full w-full"
      style={{ background: "#0b1120", cursor: drawing || mode === "node" ? "crosshair" : "" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      <MapController center={center} boundsPoints={boundsPoints} autoFit onMap={handleMap} />
      <ClickCapture onMapClick={onMapClick} />

      {/* Area of Responsibility — the monitored coverage area. Lifted to a solid,
          filled outline while it is the thing being edited (coverage/aor modes);
          a quiet dashed reference everywhere else. */}
      {aor.length >= 3 && (
        <Polygon
          positions={aor}
          pathOptions={
            mode === "coverage" || mode === "aor"
              ? { ...aorStyle, weight: 3, dashArray: undefined, fillOpacity: 0.14, interactive: false }
              : { ...aorStyle, interactive: false }
          }
        />
      )}

      {/* Zones */}
      {zones.map((z) =>
        z.polygon?.length >= 3 ? (
          <Polygon
            key={z.id}
            positions={z.polygon}
            pathOptions={{ ...zoneStyle(z.type, isSel("zone", z.id)), interactive: pathsInteractive }}
            eventHandlers={{ click: () => onZoneClick?.(z.id) }}
          >
            <Tooltip direction="center" opacity={0.9}>{z.name || z.id}</Tooltip>
          </Polygon>
        ) : null
      )}

      {/* Corridors (edges) */}
      {edges.map((e) =>
        e.path?.length >= 2 ? (
          <Polyline
            key={e.id}
            positions={e.path}
            pathOptions={{ ...edgeStyle(e, isSel("edge", e.id)), interactive: pathsInteractive }}
            eventHandlers={{ click: () => onEdgeClick?.(e.id) }}
          >
            <Tooltip sticky>{`${e.id}: ${e.from}\u2192${e.to} \u00b7 ${e.widthM || "?"}m`}</Tooltip>
          </Polyline>
        ) : null
      )}

      {/* Nodes */}
      {nodes.map((n) => (
        <Marker
          key={n.id}
          position={n.at}
          icon={nodeIcon(n.type, n.state, isSel("node", n.id))}
          interactive={nodesInteractive}
          eventHandlers={{ click: () => onNodeClick?.(n.id) }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {`${nodeMeta(n.type).label}: ${n.name || n.id}`}
          </Tooltip>
        </Marker>
      ))}

      {/* Annotation markers (legacy free-form pins) */}
      <MarkersLayer
        markers={markers}
        editable={mode === "annotation"}
        onDeleteMarker={onDeleteMarker}
      />

      {/* ---- In-progress draft geometry ---- */}
      {draft.length >= 2 && (
        <Polyline positions={mode === "aor" || mode === "zone" ? [...draft, draft[0]] : draft} pathOptions={draftLineStyle} />
      )}
      {draft.length >= 3 && (mode === "aor" || mode === "zone") && (
        <Polygon positions={draft} pathOptions={{ color: "#22d3ee", weight: 0, fillColor: "#22d3ee", fillOpacity: 0.12, interactive: false }} />
      )}
      {draft.map((p, i) => (
        <CircleMarker
          key={`d${i}`}
          center={p}
          radius={5}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#22d3ee", fillOpacity: 1, className: "cs-vertex", interactive: false }}
        />
      ))}

      {/* Freehand coverage pen. Mounted only while armed: it takes over the
          map's drag/zoom handlers and restores them when it unmounts. */}
      {mode === "coverage" && (
        <CoverageDrawLayer onComplete={onCoverageComplete} onProgress={onCoverageProgress} />
      )}

      {/* In-progress corridor */}
      {edgeDraftPath.length >= 2 && <Polyline positions={edgeDraftPath} pathOptions={draftLineStyle} />}
      {(edgeDraft?.waypoints || []).map((p, i) => (
        <CircleMarker
          key={`ew${i}`}
          center={p}
          radius={4}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#f59e0b", fillOpacity: 1, interactive: false }}
        />
      ))}

      <VenuePin center={center} venue={venue} />
    </MapContainer>
  );
}
