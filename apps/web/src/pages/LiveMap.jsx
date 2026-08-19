import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPinned, Radar, Users, Smartphone, ShieldAlert, ArrowLeft, Play, Square, Gauge, Timer, Bell, Bot, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { useAuth } from "../context/AuthContext";
import { useCrowdFeed } from "../hooks/useCrowdFeed";
import LiveCrowdMap from "../components/map/LiveCrowdMap";
import AlertsFeed from "../components/AlertsFeed";
import TrackedCrowds from "../components/TrackedCrowds";
import { riskMeta, severityMeta, formatEta, timeAgo } from "../utils/riskUi";
import { deriveAgentOverlay, actionLabel, actionTarget, actionTone } from "../utils/agentOverlay";

const DEFAULT_CENTER = [20.2961, 85.8245];

const STATUS_BADGE = {
  live: { dot: "bg-emerald-300", ring: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200", label: "Live feed" },
  connecting: { dot: "bg-amber-300", ring: "border-amber-400/20 bg-amber-500/10 text-amber-200", label: "Connecting…" },
  disconnected: { dot: "bg-red-400", ring: "border-red-400/20 bg-red-500/10 text-red-200", label: "Disconnected" },
};

export default function LiveMap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState(null);
  const [venue, setVenue] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [simStatus, setSimStatus] = useState(null);
  const [simCount, setSimCount] = useState(3000);
  const [simRamp, setSimRamp] = useState(30);
  const [simBusy, setSimBusy] = useState(false);

  const { frame, clusters, clusterEvents, alerts, agentActions, status } = useCrowdFeed(id);
  const isAuthority = user?.role === "authority";
  const seenAlerts = useRef(new Set());
  const seenActions = useRef(new Set());

  // Directives the authority has dismissed stay dismissed (the feed itself is
  // shared, so we filter by arrival time rather than mutating it).
  const [directivesClearedAt, setDirectivesClearedAt] = useState(0);

  // Toast each freshly-arrived escalation (once).
  useEffect(() => {
    for (const a of alerts) {
      if (seenAlerts.current.has(a.id)) continue;
      seenAlerts.current.add(a.id);
      const m = severityMeta(a.severity);
      const eta = formatEta(a.etaCriticalSec);
      toast(`${m.label.toUpperCase()} · ${a.zoneName || a.zoneId}${eta ? ` · critical in ~${eta}` : ""}`, {
        icon: a.severity === "critical" ? "🔴" : a.severity === "high" ? "🟠" : "🟡",
      });
    }
  }, [alerts]);

  // Toast each freshly-arrived AI directive (once). Operational detail, so it
  // stays on the authority side — citizens only see the overlay on the map.
  useEffect(() => {
    for (const a of agentActions) {
      const key = `${a.proposalId}:${a.type}:${a.receivedAt}`;
      if (seenActions.current.has(key)) continue;
      seenActions.current.add(key); // marked either way, so a role change can't backfill toasts
      if (!isAuthority) continue;
      const target = actionTarget(a);
      toast(`AI · ${actionLabel(a.type)}${target ? ` · ${target}` : ""}`, { icon: "🤖" });
    }
  }, [agentActions, isAuthority]);

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
        setVenue(venueRes.data.venue);
        setMarkers(markersRes.data.markers);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load map");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Authority: reflect the simulator ramp while it's running.
  useEffect(() => {
    if (!isAuthority) return undefined;
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await api.get(`/events/${id}/sim/status`);
        if (!cancelled) setSimStatus(res.data.status);
      } catch {
        /* ignore */
      }
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id, isAuthority]);

  const startSim = useCallback(async () => {
    setSimBusy(true);
    try {
      const res = await api.post(`/events/${id}/sim/start`, { count: Number(simCount), rampSeconds: Number(simRamp) });
      setSimStatus(res.data.status);
      toast.success("Simulation started");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not start simulation");
    } finally {
      setSimBusy(false);
    }
  }, [id, simCount, simRamp]);

  const stopSim = useCallback(async () => {
    setSimBusy(true);
    try {
      const res = await api.post(`/events/${id}/sim/stop`);
      setSimStatus(res.data.status);
      toast.success("Simulation stopped");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not stop simulation");
    } finally {
      setSimBusy(false);
    }
  }, [id]);

  const center = event?.location?.coordinates?.coordinates
    ? [event.location.coordinates.coordinates[1], event.location.coordinates.coordinates[0]]
    : DEFAULT_CENTER;

  // What the AI decided, turned into map geometry (shared with the Command Center).
  const { highlightZones, agentRoutes } = useMemo(() => deriveAgentOverlay(agentActions, venue), [agentActions, venue]);
  const directives = useMemo(
    () => agentActions.filter((a) => (a.receivedAt || 0) > directivesClearedAt),
    [agentActions, directivesClearedAt]
  );

  const worst = useMemo(
    () => (frame?.zones || []).reduce((a, z) => ((z.risk ?? z.density ?? -1) > (a?.risk ?? a?.density ?? -1) ? z : a), null),
    [frame]
  );
  const worstMeta = worst?.riskLevel ? riskMeta(worst.riskLevel) : null;
  const etaStr = formatEta(worst?.forecast?.etaCriticalSec);

  const metrics = [
    { label: "Estimated crowd", value: frame ? frame.totals.personsEst.toLocaleString() : "—", icon: Users },
    { label: "App users", value: frame ? frame.totals.sampledDevices.toLocaleString() : "—", icon: Smartphone },
    {
      label: "Highest risk",
      value: worstMeta ? worstMeta.label : "—",
      icon: ShieldAlert,
      color: worstMeta?.color,
      sub: worst ? `${worst.name} · ${worst.density} p/m²` : null,
    },
    { label: "Time to critical", value: etaStr || "—", icon: Timer, color: etaStr ? worstMeta?.color : undefined },
  ];

  const badge = STATUS_BADGE[status] || STATUS_BADGE.connecting;
  const running = simStatus?.running;

  if (loading) {
    return (
      <div className="flex min-h-[85vh] items-center justify-center text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <Radar className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[85vh] overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative space-y-6">
        <button onClick={() => navigate("/events")} className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300">
          <ArrowLeft size={15} /> Back to events
        </button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <MapPinned className="h-4 w-4" /> Real-time venue intelligence
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">{event?.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Live crowd movement across {event?.location?.venueName}, aggregated from anonymized GPS into density and flow.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                  <div className="mb-2 flex items-center gap-2 text-cyan-300">
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{item.label}</span>
                  </div>
                  <p className="truncate text-lg font-bold" style={{ color: item.color || "#fff" }}>{item.value}</p>
                  {item.sub && <p className="truncate text-[11px] text-slate-400">{item.sub}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Authority simulation controls */}
        {isAuthority && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              <Gauge size={14} className="text-cyan-300" /> Crowd simulation
            </span>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Agents
              <input type="number" min="10" max="40000" value={simCount} onChange={(e) => setSimCount(e.target.value)} className="w-24 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-white outline-none focus:border-cyan-400/50" />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Ramp (s)
              <input type="number" min="0" max="600" value={simRamp} onChange={(e) => setSimRamp(e.target.value)} className="w-20 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-white outline-none focus:border-cyan-400/50" />
            </label>
            {!running ? (
              <button onClick={startSim} disabled={simBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-3.5 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">
                <Play size={13} /> Start
              </button>
            ) : (
              <button onClick={stopSim} disabled={simBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20">
                <Square size={13} /> Stop
              </button>
            )}
            {simStatus && (
              <span className="text-xs text-slate-400">
                {running ? `${simStatus.active?.toLocaleString()} / ${simStatus.target?.toLocaleString()} active` : "idle"}
                {running && !simStatus.routable && <span className="ml-2 text-amber-300">(no venue graph — draw gates/corridors for routed flow)</span>}
              </span>
            )}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20 backdrop-blur-xl"
        >
          <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                <Radar className="h-5 w-5 text-cyan-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Live Crowd Layer</p>
                <p className="text-xs text-slate-400">GPS → H3 density · flow · heatmap</p>
              </div>
            </div>
            <div className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${badge.ring}`}>
              <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
              {badge.label}
            </div>
          </div>

          <div className="relative h-[62vh] min-h-[520px] lg:h-[700px]">
            <LiveCrowdMap
              center={center}
              venue={{ name: event?.location?.venueName, address: event?.location?.address }}
              aor={venue?.aor?.polygon || []}
              zones={venue?.zones || []}
              liveZones={frame?.zones || []}
              nodes={venue?.nodes || []}
              edges={venue?.edges || []}
              cells={frame?.cells || []}
              dots={frame?.dots || []}
              clusters={clusters}
              clusterEvents={clusterEvents}
              markers={markers}
              highlightZones={highlightZones}
              agentRoutes={agentRoutes}
            />

            {/* Right rail: early-warning alerts, then what the AI decided.
                One scrollable column so the two panels can never collide. */}
            <div className="absolute right-4 top-4 z-[500] flex max-h-[calc(100%-2rem)] w-64 max-w-[72%] flex-col gap-3 overflow-y-auto">
              {/* Tracked crowds first: a converging pair is the earliest warning
                  there is — it lands before any zone has escalated. The opaque
                  wrapper sits behind the panel's own translucent surface so it
                  stays readable over the map without fighting its classes. */}
              <div className="shrink-0 overflow-hidden rounded-2xl bg-slate-950/85">
                <TrackedCrowds clusters={clusters} clusterEvents={clusterEvents} />
              </div>

              <div className="shrink-0 rounded-2xl border border-white/10 bg-slate-950/85 p-3 backdrop-blur-xl">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Bell size={13} className="text-amber-300" /> Early-warning alerts
                  </p>
                  {alerts.length > 0 && (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-200">{alerts.length}</span>
                  )}
                </div>
                <div className="max-h-[260px] overflow-y-auto">
                  <AlertsFeed alerts={alerts} />
                </div>
              </div>

              {isAuthority && directives.length > 0 && (
                <div className="shrink-0 rounded-2xl border border-white/10 bg-slate-950/85 p-3 backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Bot size={13} className="text-cyan-300" /> AI directives
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
                        {directives.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDirectivesClearedAt(Date.now())}
                        aria-label="Dismiss AI directives"
                        title="Dismiss AI directives"
                        className="rounded-md p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                  <ul className="max-h-[240px] space-y-2 overflow-y-auto">
                    {directives.map((a) => {
                      const tone = actionTone(a);
                      const target = actionTarget(a);
                      return (
                        <li
                          key={`${a.proposalId}-${a.type}-${a.receivedAt}`}
                          className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-white">{actionLabel(a.type)}</p>
                            <span className="shrink-0 text-[10px] text-slate-500">{timeAgo(a.receivedAt)}</span>
                          </div>
                          {target && <p className="mt-0.5 truncate text-[11px] text-slate-400">{target}</p>}
                          <span
                            className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${tone.tone}`}
                          >
                            {tone.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="pointer-events-none absolute bottom-4 left-4 z-[500] rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 text-xs backdrop-blur-xl">
              <p className="mb-2 font-semibold text-white">Movement pace</p>
              <div className="space-y-1.5 text-slate-300">
                <Legend color="#22d3ee" label="Moving freely" />
                <Legend color="#f59e0b" label="Slowing" />
                <Legend color="#ef4444" label="Stalled (watch)" />
              </div>
              <p className="mb-2 mt-3 font-semibold text-white">Zone risk</p>
              <div className="space-y-1.5 text-slate-300">
                <Legend color="#22c55e" label="Normal" />
                <Legend color="#f59e0b" label="Elevated" />
                <Legend color="#ef4444" label="Critical" />
              </div>
              {/* Says what a bubble IS, so nobody reads one as a giant person. */}
              <p className="mb-1 mt-3 font-semibold text-white">Merged crowds</p>
              <p className="max-w-[13rem] leading-4 text-slate-400">
                One bubble = one packed crowd, sized to the ground it covers and labelled with its head count. Grey means
                its density is unknown.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </div>
  );
}
