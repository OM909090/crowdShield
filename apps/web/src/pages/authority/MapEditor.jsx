import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  MapPinned, Radar, ArrowLeft, X, Check, Trash2, Info, Save, Undo2,
  MousePointer2, Shield, Shapes, MapPin, Spline, Flag, PenTool, Eraser,
} from "lucide-react";
import api from "../../utils/axios";
import { formatArea } from "../../utils/geoClient";
import { MARKER_TYPES } from "../../components/map/mapIcons";
import VenueEditor from "../../components/map/VenueEditor";
import {
  NODE_TYPE_META, NODE_TYPES, NODE_STATES, ZONE_TYPE_META, ZONE_TYPES,
  EDGE_DIRECTIONS, EDGE_STATES, nodeMeta,
  nextNodeId, nextZoneId, nextEdgeId,
} from "../../components/map/venueNodes";

const DEFAULT_CENTER = [20.2961, 85.8245];

const MODES = [
  { id: "select", label: "Select", icon: MousePointer2, hint: "Click a node, corridor, or zone to edit it." },
  { id: "coverage", label: "Coverage", icon: PenTool, hint: "Hold and drag to trace the area you want monitored." },
  { id: "aor", label: "Area", icon: Shield, hint: "Click to trace the guarded area (AoR). Finish to close it." },
  { id: "zone", label: "Zones", icon: Shapes, hint: "Click to trace a zone polygon, then Finish to name it." },
  { id: "node", label: "Points", icon: MapPin, hint: "Pick a type, then click the map to drop gates, POIs, exits…" },
  { id: "edge", label: "Corridors", icon: Spline, hint: "Click a start node, add bend points on the map, click an end node." },
  { id: "annotation", label: "Markers", icon: Flag, hint: "Click to drop free-form annotation pins." },
];

const DIRECTION_LABEL = { bi: "Two-way", oneway_forward: "One-way (→)", oneway_reverse: "One-way (←)" };

/**
 * Freehand pen state. `live*` track the stroke under the pointer; `ring` holds a
 * finished, simplified polygon waiting to be applied. Every figure here is
 * computed from the points the authority actually drew — there is no placeholder
 * value to fall back on (docs/ARCHITECTURE.md §17), so an untouched pen shows
 * nothing rather than a zero.
 */
const EMPTY_PEN = { drawing: false, livePoints: 0, liveAreaM2: 0, ring: null, ringAreaM2: 0 };

const DEST_DEFAULT = ["poi", "medical", "exit"];
const DEFAULT_WIDTH = { gate: 5, exit: 6, junction: 0, poi: 0, medical: 0, parking: 0, holding: 0 };

export default function MapEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // The Venue Graph (aor kept as a flat [lat,lng][] for editing convenience).
  const [graph, setGraph] = useState({
    aor: [], zones: [], nodes: [], edges: [], bufferMeters: 1500, calibration: { participationRate: 0.1 },
  });
  const [stats, setStats] = useState(null);
  const [markers, setMarkers] = useState([]);

  const [mode, setMode] = useState("select");
  const [nodeType, setNodeType] = useState("gate");
  const [draft, setDraft] = useState([]); // aor/zone vertices
  const [edgeDraft, setEdgeDraft] = useState(null); // { fromId, waypoints[] }
  const [edgeOpts, setEdgeOpts] = useState({ widthM: 5, direction: "bi" });
  const [selection, setSelection] = useState(null); // { kind, id }
  const [zoneForm, setZoneForm] = useState(null); // { name, type } when finishing a zone
  const [pen, setPen] = useState(EMPTY_PEN); // freehand coverage pen

  // Annotation markers (legacy free-form pins) — immediate save, as before.
  const [pendingPoint, setPendingPoint] = useState(null);
  const [pendingType, setPendingType] = useState(MARKER_TYPES[0].value);
  const [pendingLabel, setPendingLabel] = useState("");

  const hydrateFromVenue = useCallback((venue) => {
    setGraph({
      aor: venue?.aor?.polygon || [],
      zones: venue?.zones || [],
      nodes: venue?.nodes || [],
      edges: venue?.edges || [],
      bufferMeters: venue?.bufferMeters ?? 1500,
      calibration: venue?.calibration || { participationRate: 0.1 },
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [eventRes, venueRes, markersRes] = await Promise.all([
          api.get(`/events/${id}`),
          api.get(`/events/${id}/venue`),
          api.get(`/events/${id}/markers`),
        ]);
        setEvent(eventRes.data.event);
        hydrateFromVenue(venueRes.data.venue);
        setStats(venueRes.data.stats);
        setMarkers(markersRes.data.markers);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load map data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, hydrateFromVenue]);

  const center = event?.location?.coordinates?.coordinates
    ? [event.location.coordinates.coordinates[1], event.location.coordinates.coordinates[0]]
    : DEFAULT_CENTER;

  const markDirty = () => setDirty(true);

  const switchMode = (next) => {
    setMode(next);
    setDraft([]);
    setEdgeDraft(null);
    setZoneForm(null);
    setPendingPoint(null);
    setPen(EMPTY_PEN);
    if (next !== "select") setSelection(null);
  };

  /* ------------------------- map interactions ------------------------- */
  const handleMapClick = (latlng) => {
    const pt = [latlng.lat, latlng.lng];
    // In coverage mode the pen layer owns the whole gesture (pointerdown →
    // pointerup); the trailing click Leaflet synthesises must not add a vertex.
    if (mode === "coverage") return;
    if (mode === "aor" || mode === "zone") {
      setDraft((d) => [...d, pt]);
    } else if (mode === "node") {
      const newId = nextNodeId(nodeType, graph.nodes);
      const meta = nodeMeta(nodeType);
      const count = graph.nodes.filter((n) => n.type === nodeType).length + 1;
      const node = {
        id: newId, type: nodeType, name: `${meta.label} ${count}`, at: pt,
        widthM: DEFAULT_WIDTH[nodeType] || 0, state: "open",
        isDestination: DEST_DEFAULT.includes(nodeType),
      };
      setGraph((g) => ({ ...g, nodes: [...g.nodes, node] }));
      setSelection({ kind: "node", id: newId });
      markDirty();
    } else if (mode === "edge" && edgeDraft?.fromId) {
      setEdgeDraft((e) => ({ ...e, waypoints: [...e.waypoints, pt] }));
    } else if (mode === "annotation") {
      setPendingPoint(latlng);
      setPendingType(MARKER_TYPES[0].value);
      setPendingLabel("");
    } else if (mode === "select") {
      setSelection(null);
    }
  };

  const handleNodeClick = (nodeId) => {
    if (mode === "select") {
      setSelection({ kind: "node", id: nodeId });
    } else if (mode === "edge") {
      if (!edgeDraft?.fromId) {
        setEdgeDraft({ fromId: nodeId, waypoints: [] });
      } else if (edgeDraft.fromId === nodeId) {
        toast.error("A corridor must end at a different node");
      } else {
        const from = graph.nodes.find((n) => n.id === edgeDraft.fromId);
        const to = graph.nodes.find((n) => n.id === nodeId);
        const newId = nextEdgeId(graph.edges);
        const edge = {
          id: newId, from: edgeDraft.fromId, to: nodeId,
          path: [from.at, ...edgeDraft.waypoints, to.at],
          widthM: edgeOpts.widthM, direction: edgeOpts.direction, state: "open",
        };
        setGraph((g) => ({ ...g, edges: [...g.edges, edge] }));
        setEdgeDraft(null);
        setSelection({ kind: "edge", id: newId });
        markDirty();
      }
    }
  };

  const handleEdgeClick = (edgeId) => mode === "select" && setSelection({ kind: "edge", id: edgeId });
  const handleZoneClick = (zoneId) => mode === "select" && setSelection({ kind: "zone", id: zoneId });

  /* ------------------------- draft completion ------------------------- */
  const finishAor = () => {
    if (draft.length < 3) return toast.error("Trace at least 3 points");
    setGraph((g) => ({ ...g, aor: draft }));
    setDraft([]);
    markDirty();
    toast.success("Area of Responsibility set");
    setMode("select");
  };

  const openZoneForm = () => {
    if (draft.length < 3) return toast.error("Trace at least 3 points");
    setZoneForm({ name: "", type: "general" });
  };

  const confirmZone = () => {
    const newId = nextZoneId(graph.zones);
    const zone = { id: newId, name: zoneForm.name || `Zone ${graph.zones.length + 1}`, type: zoneForm.type, polygon: draft };
    setGraph((g) => ({ ...g, zones: [...g.zones, zone] }));
    setDraft([]);
    setZoneForm(null);
    setSelection({ kind: "zone", id: newId });
    markDirty();
  };

  const undoVertex = () => {
    if (mode === "edge" && edgeDraft?.waypoints?.length) {
      setEdgeDraft((e) => ({ ...e, waypoints: e.waypoints.slice(0, -1) }));
    } else {
      setDraft((d) => d.slice(0, -1));
    }
  };

  /* ------------------------- graph mutations ------------------------- */
  const updateNode = (nodeId, patch) => {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }));
    markDirty();
  };
  const updateEdge = (edgeId, patch) => {
    setGraph((g) => ({ ...g, edges: g.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)) }));
    markDirty();
  };
  const updateZone = (zoneId, patch) => {
    setGraph((g) => ({ ...g, zones: g.zones.map((z) => (z.id === zoneId ? { ...z, ...patch } : z)) }));
    markDirty();
  };
  const deleteSelected = () => {
    if (!selection) return;
    if (selection.kind === "node") {
      setGraph((g) => ({
        ...g,
        nodes: g.nodes.filter((n) => n.id !== selection.id),
        edges: g.edges.filter((e) => e.from !== selection.id && e.to !== selection.id),
      }));
    } else if (selection.kind === "edge") {
      setGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== selection.id) }));
    } else if (selection.kind === "zone") {
      setGraph((g) => ({ ...g, zones: g.zones.filter((z) => z.id !== selection.id) }));
    }
    setSelection(null);
    markDirty();
  };
  const clearAor = () => {
    setGraph((g) => ({ ...g, aor: [] }));
    markDirty();
  };

  /* ------------------------- coverage pen ------------------------- */
  // Stable identities: CoverageDrawLayer keeps its pointer listeners for the life
  // of the map, and a changing callback would otherwise churn its effect.
  const handleCoverageProgress = useCallback(({ points, areaM2, drawing }) => {
    setPen((p) => {
      // A stroke too short to bound an area (a tap, a flick) reports zero on
      // release. It must not blank the readout for a ring we are still holding —
      // fall back to that ring's real figures instead of showing a stale count.
      if (!drawing && points === 0) {
        return p.ring
          ? { ...p, drawing: false, livePoints: p.ring.length, liveAreaM2: p.ringAreaM2 }
          : { ...EMPTY_PEN };
      }
      return { ...p, drawing, livePoints: points, liveAreaM2: areaM2 };
    });
  }, []);

  const handleCoverageComplete = useCallback((ring, { areaM2 }) => {
    setPen({
      drawing: false,
      livePoints: ring.length,
      liveAreaM2: areaM2,
      ring,
      ringAreaM2: areaM2,
    });
  }, []);

  const redrawCoverage = () => setPen(EMPTY_PEN);

  /* ------------------------- save ------------------------- */
  // `override` lets a caller save a graph it has only just computed, without
  // waiting a render for setGraph to land (the coverage pen does this). Callers
  // must invoke it as saveGraph() — never as a bare onClick handler, or the click
  // event would arrive as the override.
  const saveGraph = async (override) => {
    const next = override || graph;
    try {
      setSaving(true);
      const payload = {
        aor: { polygon: next.aor },
        zones: next.zones,
        nodes: next.nodes,
        edges: next.edges,
        bufferMeters: next.bufferMeters,
        calibration: next.calibration,
      };
      const res = await api.put(`/events/${id}/venue`, payload);
      hydrateFromVenue(res.data.venue); // pick up server-derived areas/capacities/ids
      setStats(res.data.stats);
      setDirty(false);
      setSelection(null);
      toast.success("Venue graph saved");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not save venue graph");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Commit a traced ring as the Area of Responsibility. It goes into the same
   * `aor` state the vertex-click mode writes, and through the same
   * PUT /events/:id/venue — the server re-derives `aor.areaM2`, so the figure the
   * panel shows afterwards is the server's, not the preview's.
   */
  const applyCoverage = async () => {
    if (!pen.ring || pen.ring.length < 3) return;
    const next = { ...graph, aor: pen.ring };
    setGraph(next);
    markDirty();
    // Clear the preview so the panel stops showing a client-side estimate next to
    // the server's measurement of the same polygon.
    setPen(EMPTY_PEN);
    await saveGraph(next);
  };

  /* ------------------------- annotations ------------------------- */
  const confirmMarker = async () => {
    if (!pendingPoint) return;
    try {
      const res = await api.post(`/events/${id}/markers`, {
        type: pendingType, label: pendingLabel || undefined, lat: pendingPoint.lat, lng: pendingPoint.lng,
      });
      setMarkers((prev) => [...prev, res.data.marker]);
      toast.success("Marker added");
      setPendingPoint(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not add marker");
    }
  };
  const deleteMarker = async (markerId) => {
    try {
      await api.delete(`/events/${id}/markers/${markerId}`);
      setMarkers((prev) => prev.filter((m) => m._id !== markerId));
      toast.success("Marker removed");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not remove marker");
    }
  };

  const selectedNode = useMemo(
    () => (selection?.kind === "node" ? graph.nodes.find((n) => n.id === selection.id) : null),
    [selection, graph.nodes]
  );
  const selectedEdge = useMemo(
    () => (selection?.kind === "edge" ? graph.edges.find((e) => e.id === selection.id) : null),
    [selection, graph.edges]
  );
  const selectedZone = useMemo(
    () => (selection?.kind === "zone" ? graph.zones.find((z) => z.id === selection.id) : null),
    [selection, graph.zones]
  );

  const activeMode = MODES.find((m) => m.id === mode);
  const drawing = mode === "aor" || mode === "zone";
  // Only true once real samples exist, so an untouched pen reads "—" not "0".
  const penHasTrace = pen.livePoints > 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <Radar className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl space-y-5 px-5 py-8 sm:px-8 lg:px-10">
        <button
          onClick={() => navigate("/authority/events")}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft size={15} /> Back to your events
        </button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <MapPinned className="h-4 w-4" /> Venue Graph Editor
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{event?.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Define the guarded area, zones, gates and corridors. This is the ground truth the
              prediction engine and AI agent route people through — the AI can never send anyone
              through a closed gate or a corridor you didn't draw.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {stats && (
              <div className="hidden gap-3 text-center sm:flex">
                {[
                  ["Zones", stats.zones, "text-lg", null],
                  ["Nodes", stats.nodes, "text-lg", null],
                  ["Corridors", stats.edges, "text-lg", null],
                  // Server-derived from the saved AoR polygon. No saved area is
                  // shown as an em dash, never as 0 m².
                  [
                    "Coverage",
                    stats.aorAreaM2 > 0 ? formatArea(stats.aorAreaM2) : "—",
                    "text-sm",
                    stats.aorAreaM2 > 0
                      ? "Monitored area as of the last save, derived by the server from the coverage polygon"
                      : "No coverage area saved yet",
                  ],
                ].map(([k, v, size, title]) => (
                  <div
                    key={k}
                    title={title || undefined}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2"
                  >
                    <p className={`${size} font-bold text-white`}>{v}</p>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{k}</p>
                  </div>
                ))}
              </div>
            )}
            <motion.button
              onClick={() => saveGraph()}
              disabled={saving || !dirty}
              whileHover={{ scale: dirty ? 1.03 : 1 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={16} /> {saving ? "Saving…" : dirty ? "Save graph" : "Saved"}
            </motion.button>
          </div>
        </div>

        {!event?.location?.coordinates?.coordinates && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <Info size={14} className="shrink-0" /> No saved coordinates for this event — showing an approximate default location.
          </div>
        )}

        {/* Mode toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => switchMode(m.id)}
                // aria-pressed carries the active state for screen readers and
                // high-contrast users; the gradient alone is colour-only.
                aria-pressed={active}
                title={m.hint}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  active ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <Icon size={15} aria-hidden="true" /> {m.label}
              </button>
            );
          })}
        </div>

        {/* Contextual control bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
          <span className="text-xs text-slate-400">{activeMode?.hint}</span>

          {mode === "node" && (
            <div className="flex flex-wrap gap-1.5">
              {NODE_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setNodeType(t)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                    nodeType === t ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <span>{NODE_TYPE_META[t].emoji}</span> {NODE_TYPE_META[t].label}
                </button>
              ))}
            </div>
          )}

          {mode === "edge" && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                Width
                <input
                  type="number" min="1" max="50" value={edgeOpts.widthM}
                  onChange={(e) => setEdgeOpts((o) => ({ ...o, widthM: Number(e.target.value) }))}
                  className="w-16 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-white outline-none focus:border-cyan-400/50"
                />
                m
              </label>
              <select
                value={edgeOpts.direction}
                onChange={(e) => setEdgeOpts((o) => ({ ...o, direction: e.target.value }))}
                className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-400/50"
              >
                {EDGE_DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
              </select>
              {edgeDraft?.fromId && (
                <span className="rounded-lg bg-amber-400/10 px-2 py-1 text-xs text-amber-200">
                  from {edgeDraft.fromId} — click end node
                </span>
              )}
            </div>
          )}

          {(drawing || (mode === "edge" && edgeDraft)) && (
            <div className="ml-auto flex items-center gap-2">
              <button onClick={undoVertex} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
                <Undo2 size={13} /> Undo point
              </button>
              {mode === "aor" && (
                <button onClick={finishAor} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/25">
                  <Check size={13} /> Finish area
                </button>
              )}
              {mode === "zone" && (
                <button onClick={openZoneForm} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400/15 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-400/25">
                  <Check size={13} /> Finish zone
                </button>
              )}
              <button onClick={() => { setDraft([]); setEdgeDraft(null); }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
                <X size={13} /> Cancel
              </button>
            </div>
          )}

          {mode === "aor" && graph.aor.length >= 3 && !draft.length && (
            <button onClick={clearAor} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-400/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10">
              <Trash2 size={13} /> Clear area
            </button>
          )}
        </div>

        {/* Map + floating property panel */}
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20">
          <div className="h-[62vh] min-h-[520px] lg:h-[680px]">
            <VenueEditor
              center={center}
              venue={{ name: event?.location?.venueName, address: event?.location?.address }}
              aor={graph.aor}
              zones={graph.zones}
              nodes={graph.nodes}
              edges={graph.edges}
              markers={markers}
              mode={mode}
              draft={draft}
              edgeDraft={edgeDraft}
              selection={selection}
              onMapClick={handleMapClick}
              onNodeClick={handleNodeClick}
              onEdgeClick={handleEdgeClick}
              onZoneClick={handleZoneClick}
              onDeleteMarker={deleteMarker}
              onCoverageComplete={handleCoverageComplete}
              onCoverageProgress={handleCoverageProgress}
            />
          </div>

          {/* Coverage pen readout. Bottom-left: Leaflet's zoom control owns the
              top-left corner and the attribution the bottom-right. */}
          <AnimatePresence>
            {mode === "coverage" && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="absolute bottom-4 left-4 z-[600] w-[19rem] rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center gap-2">
                  <PenTool size={13} className="text-cyan-300" aria-hidden="true" />
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">Coverage</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Hold and drag to trace the area you want monitored.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Points</p>
                    <p className="text-sm font-semibold text-white">
                      {penHasTrace ? pen.livePoints.toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Area</p>
                    <p className="text-sm font-semibold text-white">
                      {pen.liveAreaM2 > 0 ? formatArea(pen.liveAreaM2) : "—"}
                    </p>
                  </div>
                </div>

                {/* State is spelled out, not just tinted. */}
                <p className="mt-2.5 text-[11px] leading-4 text-slate-400">
                  {pen.drawing
                    ? "Tracing… release to close the ring."
                    : pen.ring
                      ? `Traced ${pen.ring.length} corners — ready to save.`
                      : graph.aor.length >= 3
                        ? "A coverage area is already set. Draw again to replace it."
                        : "Waiting for your first stroke."}
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={redrawCoverage}
                    disabled={pen.drawing || (!pen.ring && !pen.livePoints)}
                    aria-label="Discard the traced outline and draw again"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Eraser size={13} aria-hidden="true" /> Redraw
                  </button>
                  <button
                    type="button"
                    onClick={applyCoverage}
                    disabled={saving || !pen.ring}
                    aria-label="Save the traced outline as the monitored coverage area"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-3 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Check size={13} aria-hidden="true" /> {saving ? "Saving…" : "Save coverage"}
                  </button>
                </div>

                {/* Only claim a measured area when the saved polygon is the one on
                    screen. While dirty, stats.aorAreaM2 still describes the
                    previous save, so state the corner count and say so. */}
                {graph.aor.length >= 3 && (
                  <p className="mt-3 border-t border-white/10 pt-2.5 text-[11px] leading-4 text-slate-500">
                    {!dirty && stats?.aorAreaM2 > 0 ? (
                      <>
                        Saved coverage:{" "}
                        <span className="text-slate-300">{formatArea(stats.aorAreaM2)}</span> across{" "}
                        {graph.aor.length} corners, measured by the server.
                      </>
                    ) : (
                      <>
                        Unsaved outline of{" "}
                        <span className="text-slate-300">{graph.aor.length} corners</span> — save to
                        have the server measure it.
                      </>
                    )}
                  </p>
                )}

                {graph.aor.length >= 3 && !pen.ring && !pen.drawing && (
                  <button
                    type="button"
                    onClick={clearAor}
                    aria-label="Clear the saved coverage area"
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-red-300/90 transition hover:text-red-200"
                  >
                    <Trash2 size={12} aria-hidden="true" /> Clear coverage area
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Property panel */}
          <AnimatePresence>
            {selection && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute right-4 top-4 z-[600] w-72 rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">
                    {selection.kind === "node" && `${nodeMeta(selectedNode?.type).label} · ${selection.id}`}
                    {selection.kind === "edge" && `Corridor · ${selection.id}`}
                    {selection.kind === "zone" && `Zone · ${selection.id}`}
                  </p>
                  <button onClick={() => setSelection(null)} className="text-slate-500 hover:text-white"><X size={15} /></button>
                </div>

                {selectedNode && (
                  <div className="space-y-3 text-sm">
                    <Field label="Name">
                      <input value={selectedNode.name || ""} onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="State">
                      <select value={selectedNode.state} onChange={(e) => updateNode(selectedNode.id, { state: e.target.value })} className={inputCls}>
                        {NODE_STATES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </Field>
                    {(selectedNode.type === "gate" || selectedNode.type === "exit") && (
                      <Field label="Clear width (m)">
                        <input type="number" min="0" max="50" value={selectedNode.widthM || 0} onChange={(e) => updateNode(selectedNode.id, { widthM: Number(e.target.value) })} className={inputCls} />
                      </Field>
                    )}
                    <label className="flex items-center justify-between text-xs text-slate-300">
                      Citizen destination
                      <input type="checkbox" checked={!!selectedNode.isDestination} onChange={(e) => updateNode(selectedNode.id, { isDestination: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
                    </label>
                    {selectedNode.throughputPerMin > 0 && (
                      <p className="text-[11px] text-slate-500">~{selectedNode.throughputPerMin} persons/min throughput</p>
                    )}
                  </div>
                )}

                {selectedEdge && (
                  <div className="space-y-3 text-sm">
                    <p className="text-xs text-slate-400">{selectedEdge.from} → {selectedEdge.to}{selectedEdge.lengthM ? ` · ${selectedEdge.lengthM} m` : ""}</p>
                    <Field label="Width (m)">
                      <input type="number" min="1" max="50" value={selectedEdge.widthM || 0} onChange={(e) => updateEdge(selectedEdge.id, { widthM: Number(e.target.value) })} className={inputCls} />
                    </Field>
                    <Field label="Direction">
                      <select value={selectedEdge.direction} onChange={(e) => updateEdge(selectedEdge.id, { direction: e.target.value })} className={inputCls}>
                        {EDGE_DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
                      </select>
                    </Field>
                    <Field label="State">
                      <select value={selectedEdge.state} onChange={(e) => updateEdge(selectedEdge.id, { state: e.target.value })} className={inputCls}>
                        {EDGE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                    {selectedEdge.capacityPerMin > 0 && <p className="text-[11px] text-slate-500">~{selectedEdge.capacityPerMin} persons/min capacity</p>}
                  </div>
                )}

                {selectedZone && (
                  <div className="space-y-3 text-sm">
                    <Field label="Name">
                      <input value={selectedZone.name || ""} onChange={(e) => updateZone(selectedZone.id, { name: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Type">
                      <select value={selectedZone.type} onChange={(e) => updateZone(selectedZone.id, { type: e.target.value })} className={inputCls}>
                        {ZONE_TYPES.map((t) => <option key={t} value={t}>{ZONE_TYPE_META[t].label}</option>)}
                      </select>
                    </Field>
                    {selectedZone.areaM2 > 0 && (
                      <p className="text-[11px] text-slate-500">{selectedZone.areaM2.toLocaleString()} m² · safe capacity ~{selectedZone.capacity?.toLocaleString()}</p>
                    )}
                  </div>
                )}

                <button onClick={deleteSelected} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/20">
                  <Trash2 size={13} /> Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Zone naming modal */}
      <AnimatePresence>
        {zoneForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-5">
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-xl">
              <p className="mb-4 text-sm font-semibold text-white">Name this zone</p>
              <input autoFocus value={zoneForm.name} onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Singhadwara Approach" className={`${inputCls} mb-3`} />
              <select value={zoneForm.type} onChange={(e) => setZoneForm((f) => ({ ...f, type: e.target.value }))} className={`${inputCls} mb-4`}>
                {ZONE_TYPES.map((t) => <option key={t} value={t}>{ZONE_TYPE_META[t].label}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={() => setZoneForm(null)} className="flex-1 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
                <button onClick={confirmZone} className="flex-1 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-3 py-2.5 text-sm font-semibold text-slate-950">Add zone</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Annotation placement panel */}
      <AnimatePresence>
        {pendingPoint && (
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
            className="fixed inset-x-0 bottom-6 z-[1000] mx-auto w-[92%] max-w-lg rounded-3xl border border-cyan-400/20 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Add annotation marker</p>
              <button onClick={() => setPendingPoint(null)} className="text-slate-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="mb-3 grid grid-cols-4 gap-2">
              {MARKER_TYPES.map((t) => (
                <button
                  key={t.value} onClick={() => setPendingType(t.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-medium transition ${
                    pendingType === t.value ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <span className="text-base">{t.emoji}</span> {t.value}
                </button>
              ))}
            </div>
            <input value={pendingLabel} onChange={(e) => setPendingLabel(e.target.value)} placeholder="Optional label" className={`${inputCls} mb-3`} />
            <button onClick={confirmMarker} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950">
              <Check size={15} /> Place marker
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/50";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
