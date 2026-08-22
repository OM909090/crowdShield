import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Users,
  AlertTriangle,
  Gauge,
  DoorOpen,
  DoorClosed,
  Activity,
  Radar,
  ShieldAlert,
  ArrowLeft,
  MapPin,
  CalendarClock,
  Megaphone,
  Bell,
  Bot,
  Send,
  X,
  Loader2,
  Play,
  Square,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import api from "../../utils/axios";
import { useCrowdFeed } from "../../hooks/useCrowdFeed";
import AlertsFeed from "../../components/AlertsFeed";
import IncidentTriage from "../../components/IncidentTriage";
import AgentProposals from "../../components/AgentProposals";
import TrackedCrowds from "../../components/TrackedCrowds";
import LiveCrowdMap from "../../components/map/LiveCrowdMap";
import { severityMeta, riskMeta, formatEta, timeAgo } from "../../utils/riskUi";
import { deriveAgentOverlay } from "../../utils/agentOverlay";

const cardStyle = "rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl";
const POLL_INTERVAL_MS = 5000;
const DEFAULT_CENTER = [20.2961, 85.8245];
const BROADCAST_MAX = 500;

const SEVERITY_OPTIONS = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

const BROADCAST_TONE = {
  info: "border-cyan-400/25 bg-cyan-500/10 text-cyan-200",
  warning: "border-amber-400/25 bg-amber-500/10 text-amber-200",
  critical: "border-red-400/30 bg-red-500/15 text-red-200",
};
const broadcastTone = (s) => BROADCAST_TONE[s] || BROADCAST_TONE.info;

const RISK_STYLES = {
  Low: "text-emerald-300 border-emerald-400/20",
  Moderate: "text-amber-300 border-amber-400/20",
  High: "text-red-300 border-red-400/20",
};

export default function CommandCenter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [venue, setVenue] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Broadcast composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [bcMessage, setBcMessage] = useState("");
  const [bcHindi, setBcHindi] = useState("");
  const [bcOdia, setBcOdia] = useState("");
  const [bcSeverity, setBcSeverity] = useState("info");
  // Zone targeting: empty = public (everyone). Any selected zone ids scope the
  // announcement to people standing inside those polygons.
  const [bcZoneIds, setBcZoneIds] = useState([]);
  const [sending, setSending] = useState(false);
  // Announcements fetched on mount; the socket feed supplies everything after.
  const [seedBroadcasts, setSeedBroadcasts] = useState([]);
  // Annotation markers the authority dropped in the map editor — medical posts,
  // help desks, water points. They were never loaded here, so the command map
  // showed none of them; now they ride onto the same LiveCrowdMap.
  const [markers, setMarkers] = useState([]);
  // Alerts this operator has marked as seen, so the feed reflects it instantly
  // rather than waiting for the next snapshot seed to carry the status back.
  const [ackedAlertIds, setAckedAlertIds] = useState(() => new Set());
  // Geolocated SOS/incident reports, handed up by the triage panel for the map.
  const [incidentPins, setIncidentPins] = useState([]);

  // Crowd simulator (test harness). This is the honest way to exercise the
  // triggering + prediction logic: it drives the SAME GPS→H3→density→risk
  // pipeline a real crowd would, via the authority /sim endpoints, rather than
  // painting fake numbers onto the dashboard. It ramps a synthetic crowd up to a
  // peak over a chosen window, so thresholds (Watch→Elevated→High→Critical) fire
  // in order and you can watch when — and how early the forecaster calls it.
  const [simStatus, setSimStatus] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simPeak, setSimPeak] = useState(8000);
  const [simRampMin, setSimRampMin] = useState(5);

  // Live Tier 1 alerts + what the AI did (also keeps the broadcaster running
  // while the room is open).
  const { frame, clusters, clusterEvents, alerts, agentActions, broadcasts, agentStatus, alertedAreas } =
    useCrowdFeed(id);
  const seenAlerts = useRef(new Set());
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

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await api.get(`/events/${id}/command`);
      setSnapshot(res.data.snapshot);
      setTrend(res.data.trend);
      setLoadError(null);
    } catch (err) {
      // Background poll failures stay silent so a blip never wipes the last good
      // reading. The reason is kept for the empty state below, because "couldn't
      // load" and "your account isn't verified yet" need different actions.
      setLoadError({
        status: err.response?.status ?? null,
        message: err.response?.data?.message || null,
      });
    }
  }, [id]);

  useEffect(() => {
    let interval;
    const init = async () => {
      try {
        setLoading(true);
        const [eventRes, venueRes] = await Promise.all([
          api.get(`/events/${id}`),
          api.get(`/events/${id}/venue`),
          fetchSnapshot(),
        ]);
        setEvent(eventRes.data.event);
        setVenue(venueRes.data.venue); // null for an event with no graph drawn yet
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load command center");
      } finally {
        setLoading(false);
      }
    };
    init();
    interval = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, fetchSnapshot]);

  // Seed the announcement log (the socket feed only carries what arrives live).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/events/${id}/broadcasts`);
        if (alive) setSeedBroadcasts(res.data?.broadcasts || []);
      } catch {
        // non-fatal: the live feed still shows anything sent from now on
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // The authority's dropped annotation markers, so the command map matches the
  // map editor. Read-only here (editing lives in the editor).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get(`/events/${id}/markers`);
        if (alive) setMarkers(res.data?.markers || []);
      } catch {
        // non-fatal: markers are context, not safety-critical here
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Poll the simulator's own state so the control reflects the live ramp (and
  // stays correct if another operator started it, or after a page reload).
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await api.get(`/events/${id}/sim/status`);
        if (alive) setSimStatus(res.data?.status || null);
      } catch {
        // non-fatal: the control just shows its last known state
      }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  // Escape closes the composer.
  useEffect(() => {
    if (!composerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setComposerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composerOpen]);

  const center = event?.location?.coordinates?.coordinates
    ? [event.location.coordinates.coordinates[1], event.location.coordinates.coordinates[0]]
    : DEFAULT_CENTER;

  // Same AI overlay the authority live map draws.
  const { highlightZones, agentRoutes, flaggedAreas, barricades, placements } = useMemo(
    () => deriveAgentOverlay(agentActions, venue),
    [agentActions, venue]
  );

  // Ground the agent warned, with a relative time so the flag on the map reads
  // like an event ("4m ago") rather than a bare timestamp.
  const alertedOnMap = useMemo(
    () => (alertedAreas || []).map((a) => ({ ...a, ago: a.at ? timeAgo(a.at) : "" })),
    [alertedAreas]
  );

  // Live pushes first, then the seeded history — de-duped by id, newest first.
  const announcements = useMemo(() => {
    const byKey = new Map();
    for (const b of [...broadcasts, ...seedBroadcasts]) {
      if (!b) continue;
      const key = b.id || `${b.createdAt}|${b.message}`;
      if (!byKey.has(key)) byKey.set(key, b);
    }
    return [...byKey.values()]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 6);
  }, [broadcasts, seedBroadcasts]);

  /* Targetable areas: the authored zone polygons, decorated with what the live
     pipeline currently says about each one. Sorted worst-first so the zone that
     needs warning is the easiest one to pick. */
  const zoneTargets = useMemo(() => {
    const live = new Map((frame?.zones || []).map((z) => [z.id, z]));
    return (venue?.zones || [])
      .filter((z) => z.polygon?.length >= 3)
      .map((z) => {
        const l = live.get(z.id);
        return {
          id: z.id,
          name: z.name || z.id,
          type: z.type,
          riskLevel: l?.riskLevel || null,
          personsEst: l?.personsEst ?? null,
          etaCriticalSec: l?.forecast?.etaCriticalSec ?? null,
          rank: l?.risk ?? -1,
        };
      })
      .sort((a, b) => b.rank - a.rank);
  }, [venue, frame]);

  /**
   * Record that the control room has seen an alert.
   *
   * The endpoint existed from the start; nothing ever called it, so every alert
   * looked equally unattended and an operator working a long incident had no way
   * to mark what they had already dealt with.
   */
  const acknowledgeAlert = useCallback(
    async (alertId) => {
      try {
        await api.patch(`/events/${id}/alerts/${alertId}/ack`);
        setAckedAlertIds((prev) => new Set(prev).add(alertId));
      } catch (err) {
        toast.error(err.response?.data?.message || "Couldn't acknowledge that alert");
        throw err;
      }
    },
    [id]
  );

  const toggleZoneTarget = useCallback((zoneId) => {
    setBcZoneIds((prev) => (prev.includes(zoneId) ? prev.filter((z) => z !== zoneId) : [...prev, zoneId]));
  }, []);

  const resetComposer = useCallback(() => {
    setBcMessage("");
    setBcHindi("");
    setBcOdia("");
    setBcSeverity("info");
    setBcZoneIds([]);
  }, []);

  const sendAnnouncement = useCallback(async () => {
    const message = bcMessage.trim();
    if (!message) {
      toast.error("Type the announcement first");
      return;
    }
    // Only send a language map when there's actually a translation to carry.
    const messages = { en: message };
    if (bcHindi.trim()) messages.hi = bcHindi.trim();
    if (bcOdia.trim()) messages.or = bcOdia.trim();

    setSending(true);
    try {
      const res = await api.post(`/events/${id}/broadcast`, {
        message,
        messages: Object.keys(messages).length > 1 ? messages : undefined,
        severity: bcSeverity,
        // Omitted entirely when nothing is selected, so the backend stores no
        // targeting and every citizen treats it as public.
        zoneIds: bcZoneIds.length ? bcZoneIds : undefined,
      });
      const created = res.data?.broadcast;
      // The socket echo usually beats this; the id de-dupe keeps it to one row.
      if (created) setSeedBroadcasts((prev) => [created, ...prev]);
      toast.success(
        bcZoneIds.length
          ? `Alert sent to ${bcZoneIds.length} targeted area${bcZoneIds.length === 1 ? "" : "s"}`
          : "Announcement sent to the crowd"
      );
      resetComposer();
      setComposerOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't send the announcement");
    } finally {
      setSending(false);
    }
  }, [id, bcMessage, bcHindi, bcOdia, bcSeverity, bcZoneIds, resetComposer]);

  const simRunning = !!simStatus?.running;

  const startSimulation = useCallback(async () => {
    setSimBusy(true);
    try {
      const res = await api.post(`/events/${id}/sim/start`, {
        // Clamp to the backend's own accepted range so a stray keystroke can't
        // ask for a million agents.
        count: Math.max(100, Math.min(50000, Math.round(Number(simPeak) || 0))),
        rampSeconds: Math.max(0, Math.round((Number(simRampMin) || 0) * 60)),
      });
      setSimStatus(res.data?.status || null);
      const st = res.data?.status;
      toast.success(
        st && st.routable === false
          ? "Simulation started — scattering a synthetic crowd (no venue graph drawn)"
          : "Simulation started — ramping a synthetic crowd through the venue"
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't start the simulation");
    } finally {
      setSimBusy(false);
    }
  }, [id, simPeak, simRampMin]);

  const stopSimulation = useCallback(async () => {
    setSimBusy(true);
    try {
      const res = await api.post(`/events/${id}/sim/stop`);
      setSimStatus(res.data?.status || { running: false });
      toast("Simulation stopped — synthetic crowd cleared");
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't stop the simulation");
    } finally {
      setSimBusy(false);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <Radar className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  // The snapshot poll can fail (or not have landed yet); rather than crash on
  // snapshot.x, say plainly that there's nothing to show.
  if (!snapshot) {
    const pending = loadError?.status === 403;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#050816] px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10">
          <ShieldAlert className="h-6 w-6 text-amber-300" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">
            {pending
              ? loadError.message || "Your authority account is pending verification"
              : "Command Center unavailable"}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
            {pending
              ? "A platform admin has to approve your account before you can open an event's control room. You can still create and edit events in the meantime."
              : loadError?.message || "Couldn't load the live snapshot for this event."}
          </p>
        </div>
        <button
          onClick={() => navigate("/authority/events")}
          className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-slate-300 transition hover:text-white"
        >
          Back to your events
        </button>
      </div>
    );
  }

  const live = snapshot.hasLiveData;
  /**
   * Is risk actually being scored right now?
   *
   * This used to ask "has the operator drawn a zone", because risk only existed
   * per hand-drawn zone. The coverage area is now itself a zone, so the honest
   * question is whether the predictor is returning any zone at all — which it is
   * as soon as a boundary exists. Only a venue with no coverage drawn has nothing
   * to score.
   */
  const riskTracked = (frame?.zones?.length ?? 0) > 0 || (venue?.zones?.length ?? 0) > 0;
  const coverageDrawn = (venue?.aor?.polygon?.length ?? 0) >= 3;
  const stats = [
    {
      id: 1,
      title: "Current Crowd",
      // Zero people is a real reading only when phones are reporting.
      value: live ? snapshot.currentCrowd.toLocaleString("en-IN") : "—",
      icon: Users,
      status: live ? (snapshot.riskLevel === "High" ? "Elevated" : "Normal") : "No readings",
      // Be explicit that this is scaled, not counted.
      note: live
        ? `Estimated from ${snapshot.sampledDevices} reporting phone${snapshot.sampledDevices === 1 ? "" : "s"}${
            snapshot.participationRate ? ` · assumes ${Math.round(snapshot.participationRate * 100)}% use the app` : ""
          }`
        : "Waiting for phones to report",
    },
    {
      id: 2,
      title: "Risk Probability",
      /**
       * Risk is scored PER ZONE. With none drawn there is nothing to score, and
       * printing "0%" next to a green "Low" badge told the operator the venue was
       * safe when the truth was that nothing was being measured at all — with
       * 51,580 people on the map. Unmeasured must look unmeasured (§17).
       */
      value: !riskTracked ? "—" : live ? `${snapshot.riskProbability}%` : "—",
      icon: AlertTriangle,
      status: !riskTracked ? "No coverage drawn" : live ? snapshot.riskLevel : "No readings",
      note: !riskTracked
        ? "Draw the coverage area to start scoring risk"
        : snapshot.worstZone?.name
          ? `Worst area: ${snapshot.worstZone.name}`
          : undefined,
    },
    {
      id: 3,
      title: "Avg Movement",
      // null when nobody's motion was measured — never a confident 0.0 m/s.
      value: snapshot.avgSpeed ?? "—",
      icon: Gauge,
      status: snapshot.avgSpeed ? "Live" : "Not measured",
    },
    {
      id: 4,
      title: "Open Gates",
      value: `${snapshot.openGates}/${snapshot.totalGates}`,
      icon: DoorOpen,
      status: snapshot.openGates === snapshot.totalGates ? "All open" : "Restricted",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate("/authority/events")}
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft size={15} />
            Back to your events
          </button>

          {/* Crowd simulator — a test harness, styled amber + dashed so it never
              reads as a live operational control. It feeds the real pipeline. */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-amber-400/30 bg-amber-500/[0.06] px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">
              <Users size={13} />
              Crowd simulator
              <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] tracking-wide text-amber-200">
                TEST
              </span>
            </span>

            {!simRunning ? (
              <>
                <label className="flex items-center gap-1 text-[11px] text-slate-400">
                  Peak
                  <input
                    type="number"
                    value={simPeak}
                    min={100}
                    max={50000}
                    step={500}
                    onChange={(e) => setSimPeak(e.target.value)}
                    className="w-20 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-white outline-none focus:border-amber-400/50"
                  />
                </label>
                <label className="flex items-center gap-1 text-[11px] text-slate-400">
                  Ramp
                  <input
                    type="number"
                    value={simRampMin}
                    min={0}
                    max={60}
                    step={1}
                    onChange={(e) => setSimRampMin(e.target.value)}
                    className="w-14 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-white outline-none focus:border-amber-400/50"
                  />
                  <span className="text-slate-500">min</span>
                </label>
                <button
                  type="button"
                  onClick={startSimulation}
                  disabled={simBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {simBusy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  Start
                </button>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-xs text-amber-100">
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="h-1.5 w-1.5 rounded-full bg-amber-300"
                  />
                  {(simStatus.active ?? 0).toLocaleString("en-IN")} / {(simStatus.target ?? 0).toLocaleString("en-IN")}
                  <span className="text-amber-200/70">
                    {(simStatus.active ?? 0) < (simStatus.target ?? 0) ? "ramping" : "holding"}
                    {simStatus.routable === false ? " · scattered" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={stopSimulation}
                  disabled={simBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {simBusy ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
                  Stop
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Radar className="h-4 w-4" />
              <motion.span
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              />
              Real-time command operations
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Command Center</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm leading-6 text-slate-400 sm:text-base">
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-cyan-300" />
                {event?.name} · {event?.location?.venueName}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarClock size={15} className="text-cyan-300" />
                {event &&
                  new Date(event.startDate).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Venue", event?.location?.venueName?.slice(0, 14) || "—"],
              // "Live" only when phones are actually reporting.
              ["Feed", live ? "Live" : "No readings"],
              ["Alerts", `${alerts.length} Active`],
              ["Update", "Every 5s"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* The old "risk detection is off" warning is gone: the coverage area is
            now scored as a zone in its own right, so risk, escalation and
            time-to-critical work as soon as a boundary exists. The only case with
            genuinely nothing to measure is a venue with no coverage drawn at all. */}
        {!coverageDrawn && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/15">
                <AlertTriangle size={17} className="text-amber-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-100">No coverage area drawn yet</p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-amber-200/80">
                  Draw the boundary you are responsible for in the Map Editor. Everything else follows from it: the crowd is
                  counted inside it, risk is scored across it, and the agent starts watching. Adding zones around individual
                  chokepoints later makes the warnings more precise, but is not required to begin.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/authority/events/${id}/map`)}
              className="inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25"
            >
              <MapPin size={14} />
              Open Map Editor
            </button>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                whileHover={{ y: -8, scale: 1.01 }}
                className={`${cardStyle} overflow-hidden p-6 transition hover:border-cyan-400/20`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10">
                    <Icon size={24} className="text-cyan-300" />
                  </div>
                  <span
                    className={`rounded-full border bg-white/5 px-3 py-1 text-xs ${
                      RISK_STYLES[item.status] || "text-cyan-300 border-cyan-400/20"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                <p className="mt-5 text-sm uppercase tracking-[0.28em] text-slate-400">{item.title}</p>
                {item.note && <p className="mt-1 text-[11px] leading-4 text-slate-500">{item.note}</p>}
                <AnimatePresence mode="popLayout">
                  <motion.h2
                    key={item.value}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.3 }}
                    className="mt-2 text-3xl font-black tracking-tight"
                  >
                    {item.value}
                  </motion.h2>
                </AnimatePresence>

                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    animate={{ width: `${snapshot.riskProbability}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* THE GUARDIAN'S PULSE.
            An autonomous safety agent that works silently is indistinguishable
            from one that has crashed. This strip is the operator's evidence that
            it is watching: what it is doing right now, when it last reasoned,
            how many danger pockets it can see, and how much ground it has warned
            on its own authority. */}
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] px-5 py-3.5">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-100">
            <Bot size={16} className="text-cyan-300" />
            Guardian agent
          </span>

          {agentStatus?.phase === "thinking" ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
              <Loader2 size={12} className="animate-spin" />
              Assessing the situation…
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Watching continuously
            </span>
          )}

          <span className="text-xs text-slate-300">
            Last assessment:{" "}
            <span className="font-medium text-white">
              {agentStatus?.lastRunAt ? timeAgo(agentStatus.lastRunAt) : "waiting for the first pass"}
            </span>
            {agentStatus?.severity ? (
              <span className="ml-1 text-slate-400">· judged {agentStatus.severity}</span>
            ) : null}
            {agentStatus?.trigger ? <span className="ml-1 text-slate-500">· {agentStatus.trigger}</span> : null}
          </span>

          <span className="text-xs text-slate-300">
            Danger areas it can see:{" "}
            <span className="font-medium text-white">{agentStatus?.dangerAreas ?? frame?.dangerZones?.length ?? 0}</span>
          </span>

          {alertedOnMap.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-400/25 bg-pink-500/10 px-3 py-1 text-xs font-medium text-pink-200">
              📣 {alertedOnMap.length} area{alertedOnMap.length === 1 ? "" : "s"} warned — flagged on the map
            </span>
          )}
          {placements.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
              📌 {placements.length} placement{placements.length === 1 ? "" : "s"} awaiting you
            </span>
          )}
        </div>

        <div className="mt-6 space-y-6">
          {/* Map + the agent's live alerts, side by side and matched in height. */}
          <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr] xl:items-stretch">
          {/* The map is the screen: full width and tall, so the danger zones,
              routes, groups and gates are readable instead of stacked in a
              cramped panel. The command rail sits below it, spread across the
              width. No hover-scale here: a CSS transform on a Leaflet ancestor
              shifts its hit-testing, and this card holds the real map. */}
          <div className={`${cardStyle} relative overflow-hidden p-5 sm:p-6`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.08),transparent_40%)]" />
            <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Live Crowd Heat Map</p>
                <h2 className="mt-2 text-xl font-bold sm:text-2xl">Density visualization</h2>
              </div>
              {/* Never a green "within limits" for ground nobody is scoring: with
                  no zones drawn, or no live danger pockets measured, say so. */}
              {(() => {
                const dangerCount = frame?.dangerZones?.length ?? 0;
                const badge = !riskTracked && dangerCount === 0
                  ? { cls: "border-white/15 bg-white/10 text-slate-300", dot: "bg-slate-400", text: "No coverage drawn" }
                  : dangerCount > 0
                    ? {
                        cls: "border-red-400/20 bg-red-500/10 text-red-200",
                        dot: "bg-red-300 shadow-[0_0_10px_rgba(248,113,113,0.9)]",
                        text: `${dangerCount} live danger area${dangerCount === 1 ? "" : "s"}`,
                      }
                    : snapshot.riskLevel === "High"
                      ? { cls: "border-red-400/20 bg-red-500/10 text-red-200", dot: "bg-red-300", text: "High density area" }
                      : { cls: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200", dot: "bg-emerald-300", text: "Density within limits" };
                return (
                  <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${badge.cls}`}>
                    <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
                    {badge.text}
                  </div>
                );
              })()}
            </div>

            <div className="relative h-[72vh] min-h-[520px] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))]">
              <LiveCrowdMap
                center={center}
                venue={{ name: event?.location?.venueName, address: event?.location?.address }}
                aor={venue?.aor?.polygon || []}
                zones={venue?.zones || []}
                liveZones={frame?.zones || []}
                dangerZones={frame?.dangerZones || []}
                gateLoads={frame?.gateLoads || []}
                nodes={venue?.nodes || []}
                edges={venue?.edges || []}
                cells={frame?.cells || []}
                dots={frame?.dots || []}
                clusters={clusters}
                clusterEvents={clusterEvents}
                markers={markers}
                highlightZones={highlightZones}
                agentRoutes={agentRoutes}
                flaggedAreas={flaggedAreas}
                barricades={barricades}
                alertedAreas={alertedOnMap}
                placements={placements}
                incidents={incidentPins}
                legend
              />

              {/* Map-specific counts, top-right as a narrow column. Gate count
                  and average speed used to live here too, but they only repeated
                  the stat cards directly above the map — so they are gone, and
                  the top-centre is left clear for the live risk badge the map
                  itself now draws. These two are the map's own context: why dots
                  became bubbles, and what the agent has drawn. */}
              <div className="pointer-events-none absolute right-4 top-4 z-[500] flex max-w-[46%] flex-col items-end gap-2">
                {clusters.some((k) => k.crowd) && (
                  <span className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-400/25 bg-slate-950/85 px-3 py-1.5 text-xs text-amber-200 backdrop-blur-xl">
                    <Users size={13} aria-hidden="true" />
                    {clusters.filter((k) => k.crowd).length} crowd
                    {clusters.filter((k) => k.crowd).length === 1 ? "" : "s"} merged into bubbles
                  </span>
                )}
                {(highlightZones.length > 0 ||
                  agentRoutes.length > 0 ||
                  flaggedAreas.length > 0 ||
                  barricades.length > 0) && (
                  <span className="inline-flex items-center gap-1.5 rounded-2xl border border-pink-400/25 bg-slate-950/85 px-3 py-1.5 text-xs text-pink-200 backdrop-blur-xl">
                    <Bot size={13} />
                    {[
                      (highlightZones.length + flaggedAreas.length) > 0 &&
                        `${highlightZones.length + flaggedAreas.length} area${
                          highlightZones.length + flaggedAreas.length === 1 ? "" : "s"
                        }`,
                      agentRoutes.length > 0 && `${agentRoutes.length} route${agentRoutes.length === 1 ? "" : "s"}`,
                      barricades.length > 0 &&
                        `${barricades.length} barricade${barricades.length === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    flagged by AI
                  </span>
                )}
              </div>

              {!venue && (
                <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[500] rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-2.5 text-center text-xs text-slate-300 backdrop-blur-xl">
                  No venue graph yet — draw gates, corridors and zones to unlock routed flow and AI overlays.
                </div>
              )}
            </div>

            {/* Gate grid */}
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {snapshot.gates.map((gate) => {
                const GateIcon = gate.status === "open" ? DoorOpen : DoorClosed;
                return (
                  <div
                    key={gate.name}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[11px] font-medium ${
                      gate.status === "open"
                        ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                        : "border-red-400/20 bg-red-500/10 text-red-200"
                    }`}
                  >
                    <GateIcon size={16} />
                    {gate.name}
                    <span className="text-[9px] uppercase tracking-wider opacity-70">{gate.status}</span>
                  </div>
                );
              })}
            </div>
          </div>

            {/* Alerts from agent — beside the map, its own scroll, matched to the
                map's height. Bounded on EVERY breakpoint (the old xl:h-auto let
                it grow with the feed and stretch the whole page); the list now
                scrolls inside this fixed box. */}
            <div className="h-[72vh] min-h-[520px]">
              <AgentProposals eventId={id} />
            </div>
          </div>

          <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
          {/* Tracked crowds sit above the alert feed deliberately: two bodies of
              people closing on each other is visible here before any zone has
              escalated, which is the whole point of tracking them as objects. */}
          <TrackedCrowds clusters={clusters} clusterEvents={clusterEvents} />

          {/* Early-warning alerts — live from the Tier 1 predictor */}
          <div className={`${cardStyle} p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Early-Warning Alerts</p>
                <h2 className="mt-2 text-xl font-bold">Predicted escalations</h2>
              </div>
              <Bell className="h-5 w-5 text-amber-300" />
            </div>
            <AlertsFeed alerts={alerts} onAcknowledge={acknowledgeAlert} acknowledgedIds={ackedAlertIds} />
          </div>

          {/* People calling for help. Citizens could always raise an SOS; until now
              nothing in the console listened, so a panic press went into a queue no
              human could see. */}
          <IncidentTriage eventId={id} onIncidents={setIncidentPins} />

          {/* Response + announcements. There is deliberately no separate
              "AI recommendations" list here: recommendations come from the agent
              panel above, where each one is auditable and needs your approval.
              A hardcoded if/else dressed up as AI advice would be a lie. */}
          <div className={`${cardStyle} p-6`}>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <Activity className="h-4 w-4 text-cyan-300" />
                Live response status
              </div>
              {/* Describes only what the system has actually done. */}
              <p className="text-sm leading-6 text-slate-400">
                {!live
                  ? "No phones are reporting for this event yet, so there is nothing to act on. Start the simulator or have citizens open the app to bring the feed up."
                  : alerts.length === 0
                    ? `Monitoring ${snapshot.worstZone ? "all zones" : "the venue"} — no zone has escalated. The predictor runs every second and the agent wakes on a Tier 1 alert.`
                    : `${alerts.length} zone${alerts.length === 1 ? "" : "s"} escalated. ${
                        agentActions.length > 0
                          ? `The agent has proposed ${agentActions.length} action${agentActions.length === 1 ? "" : "s"} — approve them above to execute.`
                          : "Awaiting the agent's assessment; approved actions appear on the map."
                      }`}
              </p>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={composerOpen}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15"
              >
                <Megaphone size={15} />
                Broadcast public announcement
              </button>
            </div>

            {/* What the crowd has actually been told */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm text-slate-300">
                  <Megaphone className="h-4 w-4 text-cyan-300" />
                  Recent announcements
                </p>
                {announcements.length > 0 && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    {announcements.length}
                  </span>
                )}
              </div>
              {announcements.length === 0 ? (
                <p className="text-xs leading-5 text-slate-500">
                  Nothing broadcast yet — anything you or the AI sends to the crowd shows up here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {announcements.map((b) => (
                    <li key={b.id || `${b.createdAt}-${b.message}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${broadcastTone(b.severity)}`}
                        >
                          {b.severity || "info"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300">
                          {b.source === "agent" ? <Bot size={10} /> : <ShieldAlert size={10} />}
                          {b.source || "authority"}
                        </span>
                        <span className="ml-auto text-[10px] text-slate-500">{timeAgo(b.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-slate-200">{b.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={`${cardStyle} mt-8 p-6 sm:p-7`}
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Crowd Trend Analytics</p>
              <h2 className="mt-2 text-xl font-bold sm:text-2xl">Crowd growth prediction</h2>
            </div>
            <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              Forecasting next surge
            </div>
          </div>

          <div className="h-[320px] w-full">
            {trend.length < 2 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Gathering live readings — the trend line fills in as data comes through.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="time" stroke="rgba(226,232,240,0.6)" />
                  <YAxis stroke="rgba(226,232,240,0.6)" />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(2,6,23,0.92)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 16,
                      color: "#fff",
                    }}
                    labelStyle={{ color: "#cbd5e1" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="people"
                    stroke="#22d3ee"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#22d3ee", strokeWidth: 0 }}
                    activeDot={{ r: 7, fill: "#38bdf8" }}
                    isAnimationActive
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* Broadcast composer — the real path to every phone in the venue */}
      <AnimatePresence>
        {composerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
          >
            <button
              type="button"
              aria-label="Close composer"
              onClick={() => setComposerOpen(false)}
              className="absolute inset-0 cursor-default"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="broadcast-title"
              className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/95 p-5 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-6"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
                    <Megaphone size={18} className="text-cyan-300" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Public announcement</p>
                    <h2 id="broadcast-title" className="mt-1 text-lg font-bold text-white">
                      Broadcast to the crowd
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  aria-label="Close composer"
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="bc-message" className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                      Message (English)
                    </label>
                    <span className={`text-[11px] ${bcMessage.length > BROADCAST_MAX - 50 ? "text-amber-300" : "text-slate-500"}`}>
                      {bcMessage.length}/{BROADCAST_MAX}
                    </span>
                  </div>
                  <textarea
                    id="bc-message"
                    rows={4}
                    maxLength={BROADCAST_MAX}
                    value={bcMessage}
                    onChange={(e) => setBcMessage(e.target.value.slice(0, BROADCAST_MAX))}
                    placeholder="Gate 3 is congested. Please use Gate 5 to exit."
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50"
                  />
                </div>

                <div>
                  <label htmlFor="bc-severity" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    Severity
                  </label>
                  <select
                    id="bc-severity"
                    value={bcSeverity}
                    onChange={(e) => setBcSeverity(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/50"
                  >
                    {SEVERITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Who receives it. Nothing selected = everyone. Selecting areas
                    scopes delivery to the people standing inside those polygons,
                    which is what makes a "move out of the north corridor before
                    the crowd arrives" warning land only where it applies. */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                      Target areas
                    </label>
                    {bcZoneIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBcZoneIds([])}
                        className="text-[11px] font-medium text-cyan-300 transition hover:text-cyan-200"
                      >
                        Clear ({bcZoneIds.length})
                      </button>
                    )}
                  </div>

                  {zoneTargets.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5 text-[11px] leading-5 text-slate-500">
                      No zones drawn for this event yet — the announcement will reach everyone. Draw
                      zones in the Venue Graph Editor to enable area-targeted alerts.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {zoneTargets.map((z) => {
                          const active = bcZoneIds.includes(z.id);
                          const meta = z.riskLevel ? riskMeta(z.riskLevel) : null;
                          const eta = formatEta(z.etaCriticalSec);
                          return (
                            <button
                              key={z.id}
                              type="button"
                              onClick={() => toggleZoneTarget(z.id)}
                              aria-pressed={active}
                              title={
                                meta
                                  ? `${meta.label}${z.personsEst != null ? ` · ~${z.personsEst} people` : ""}${eta ? ` · critical in ~${eta}` : ""}`
                                  : "No live data for this zone yet"
                              }
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                active
                                  ? "border-cyan-400/50 bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950"
                                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-400/25 hover:text-white"
                              }`}
                            >
                              {meta && (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: meta.color }}
                                  aria-hidden="true"
                                />
                              )}
                              {z.name}
                              {z.personsEst != null && (
                                <span className={active ? "text-slate-900/70" : "text-slate-500"}>
                                  ~{z.personsEst}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-slate-500">
                        {bcZoneIds.length === 0
                          ? "Nothing selected — this goes to everyone at the event."
                          : `Only people inside ${bcZoneIds.length} selected area${bcZoneIds.length === 1 ? "" : "s"} will be alerted.`}
                      </p>
                    </>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="bc-hindi" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                      Hindi <span className="normal-case tracking-normal text-slate-500">(optional)</span>
                    </label>
                    <textarea
                      id="bc-hindi"
                      rows={2}
                      maxLength={BROADCAST_MAX}
                      value={bcHindi}
                      onChange={(e) => setBcHindi(e.target.value.slice(0, BROADCAST_MAX))}
                      placeholder="हिंदी अनुवाद"
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50"
                    />
                  </div>
                  <div>
                    <label htmlFor="bc-odia" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                      Odia <span className="normal-case tracking-normal text-slate-500">(optional)</span>
                    </label>
                    <textarea
                      id="bc-odia"
                      rows={2}
                      maxLength={BROADCAST_MAX}
                      value={bcOdia}
                      onChange={(e) => setBcOdia(e.target.value.slice(0, BROADCAST_MAX))}
                      placeholder="ଓଡ଼ିଆ ଅନୁବାଦ"
                      className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50"
                    />
                  </div>
                </div>

                <p className="text-[11px] leading-5 text-slate-500">
                  {bcZoneIds.length === 0
                    ? "This reaches every phone in the event room immediately and is recorded in the audit log."
                    : "This is delivered immediately and recorded in the audit log. People outside the selected areas still see it listed under earlier announcements, marked as another area — nothing is hidden."}
                </p>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setComposerOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.08]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={sendAnnouncement}
                    disabled={sending || !bcMessage.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {sending ? "Sending…" : "Send broadcast"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
