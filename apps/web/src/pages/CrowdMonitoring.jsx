import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Users,
  Navigation,
  MapPin,
  AlertTriangle,
  Radar,
  ShieldAlert,
  ArrowUpRight,
  ArrowLeft,
  CalendarClock,
  RadioTower,
  MapPinned,
  Smartphone,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { useCrowdFeed } from "../hooks/useCrowdFeed";
import LiveCrowdMap from "../components/map/LiveCrowdMap";
import { riskMeta, riskRank, formatEta } from "../utils/riskUi";

const DEFAULT_CENTER = [20.2961, 85.8245];
const HOTSPOT_LEVELS = new Set(["ELEVATED", "HIGH", "CRITICAL"]);
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const FEED_BADGE = {
  live: { dot: "bg-emerald-300", ring: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200", label: "Live feed" },
  connecting: { dot: "bg-amber-300", ring: "border-amber-400/20 bg-amber-500/10 text-amber-200", label: "Connecting…" },
  disconnected: { dot: "bg-red-400", ring: "border-red-400/20 bg-red-500/10 text-red-200", label: "Disconnected" },
};

const NO_DATA_BADGE = "border-white/10 bg-black/20 text-slate-400";

const densityText = (z) => (Number.isFinite(z?.density) ? `${z.density} p/m²` : "an unmeasured density");
const peopleText = (n) => (Number.isFinite(n) ? n.toLocaleString("en-IN") : "—");

/**
 * People-weighted circular mean of the per-cell flow bearings (`cells[].b`),
 * expressed as a compass point. Returns null when no cell reports a bearing —
 * the caller renders "—" rather than a guess.
 */
function flowDirection(cells = []) {
  let sin = 0;
  let cos = 0;
  let people = 0;
  for (const c of cells) {
    const n = Number.isFinite(c.n) ? c.n : 0;
    if (!Number.isFinite(c.b) || n <= 0) continue;
    const rad = (c.b * Math.PI) / 180;
    sin += Math.sin(rad) * n;
    cos += Math.cos(rad) * n;
    people += n;
  }
  if (people <= 0) return null;
  const deg = ((Math.atan2(sin / people, cos / people) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/**
 * The REST snapshot carries full-fat cells (`center`/`density`/`level`…) while
 * the socket tick sends the compact form the map reads. Normalise the snapshot
 * into the tick shape so first paint and live frames are interchangeable.
 * The snapshot deliberately carries no individual positions, so `dots` is empty
 * until the socket connects.
 */
function frameFromSnapshot(snap) {
  if (!snap) return null;
  return {
    totals: snap.totals,
    zones: snap.zones || [],
    cells: (snap.cells || []).map((c) => ({
      h3: c.h3,
      c: c.center,
      d: c.density,
      lvl: c.level,
      n: c.personsEst,
      b: c.flowBearing,
    })),
    dots: [],
  };
}

export default function CrowdMonitoring() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [venue, setVenue] = useState(null);
  const [seed, setSeed] = useState(null); // first paint, replaced by the socket
  const [loading, setLoading] = useState(true);

  const { frame, status } = useCrowdFeed(id);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [eventRes, venueRes, snapRes] = await Promise.all([
          api.get(`/events/${id}`),
          api.get(`/events/${id}/venue`),
          api.get(`/events/${id}/snapshot`),
        ]);
        setEvent(eventRes.data.event);
        setVenue(venueRes.data.venue);
        setSeed(frameFromSnapshot(snapRes.data.snapshot));
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load event");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // The socket frame wins the moment it arrives; the snapshot only fills the gap.
  const live = frame || seed;
  const devices = live?.totals?.sampledDevices ?? 0;
  const hasReadings = devices > 0;

  const zones = useMemo(
    () =>
      [...(live?.zones || [])].sort(
        (a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel) || (b.density ?? 0) - (a.density ?? 0)
      ),
    [live]
  );

  const flow = useMemo(() => flowDirection(live?.cells), [live]);
  const hotspots = zones.filter((z) => HOTSPOT_LEVELS.has(z.riskLevel)).length;
  const worstZone = zones[0];
  const worstMeta = worstZone?.riskLevel ? riskMeta(worstZone.riskLevel) : null;
  const isHotspot = worstZone ? HOTSPOT_LEVELS.has(worstZone.riskLevel) : false;
  const worstEta = formatEta(worstZone?.forecast?.etaCriticalSec);

  const center = event?.location?.coordinates?.coordinates
    ? [event.location.coordinates.coordinates[1], event.location.coordinates.coordinates[0]]
    : DEFAULT_CENTER;

  const badge = FEED_BADGE[status] || FEED_BADGE.connecting;

  // One honest sentence about why numbers may be missing — or null when the
  // feed is genuinely delivering readings.
  const notice = (() => {
    if (status === "disconnected") {
      return live
        ? "Live feed disconnected — showing the last frame received."
        : "Live feed disconnected — waiting to reconnect.";
    }
    if (!live) return "Connecting to the live feed — waiting for live readings…";
    if (!hasReadings) return "Waiting for live readings — no phones are reporting for this event yet.";
    return null;
  })();

  // Every clause below is built only from fields the feed actually sent.
  const assessment = (() => {
    if (notice) return notice;
    if (zones.length === 0) {
      return "No zones are authored for this venue, so there is no zone-level assessment yet. The map still shows measured cell density from the reporting phones.";
    }
    if (isHotspot) {
      return `${worstZone.name} is at ${worstMeta.label} risk — ${densityText(worstZone)} across ~${peopleText(
        worstZone.personsEst
      )} people${worstEta ? `, projected critical in ~${worstEta}` : ""}.`;
    }
    const plural = zones.length === 1 ? "zone is" : "zones are";
    if (!worstMeta) {
      return `Risk scoring has not reported for the ${zones.length} monitored ${plural} yet. Highest measured density is ${densityText(
        worstZone
      )} at ${worstZone.name}.`;
    }
    return `All ${zones.length} monitored ${plural} at ${worstMeta.label} risk or below. Highest measured density is ${densityText(
      worstZone
    )} at ${worstZone.name}.`;
  })();

  const metrics = [
    {
      title: "Current Crowd",
      value: hasReadings ? live.totals.personsEst.toLocaleString("en-IN") : "—",
      icon: Users,
      desc: hasReadings ? "Estimated people, scaled from reporting phones" : "No readings yet",
    },
    {
      title: "Flow Direction",
      value: hasReadings && flow ? flow : "—",
      icon: Navigation,
      desc: hasReadings && flow ? "People-weighted mean heading" : "No movement bearings reported",
    },
    {
      title: "Hotspots",
      value: hasReadings ? String(hotspots).padStart(2, "0") : "—",
      icon: AlertTriangle,
      desc: "Zones at elevated risk or above",
    },
  ];

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

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <button
          onClick={() => navigate("/events")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft size={15} />
          Back to events
        </button>

        <div className="mb-6 flex justify-end">
          <button
            onClick={() => navigate(`/events/${id}/map`)}
            className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15"
          >
            <MapPinned size={15} />
            View Venue Map
          </button>
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <RadioTower className="h-4 w-4" />
              <motion.span
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              />
              Live crowd intelligence
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">{event?.name}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400 sm:text-base">
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-cyan-300" />
                {event?.location?.venueName}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Feed</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
                <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
                {badge.label}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Sources</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
                <Smartphone size={14} className="text-cyan-300" />
                {live ? `${devices.toLocaleString("en-IN")} phones reporting` : "—"}
              </p>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 backdrop-blur-xl"
            >
              <Radar className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p>{notice}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.4 }}
                whileHover={{ y: -8, scale: 1.01 }}
                className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl transition hover:border-cyan-400/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10">
                    <Icon size={24} className="text-cyan-300" />
                  </div>
                  {hasReadings ? (
                    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-slate-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Live
                    </span>
                  ) : (
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.28em] ${NO_DATA_BADGE}`}>
                      No data
                    </span>
                  )}
                </div>

                <h3 className="mt-5 text-sm uppercase tracking-[0.28em] text-slate-400">{item.title}</h3>
                <AnimatePresence mode="popLayout">
                  <motion.h2
                    key={item.value}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10, position: "absolute" }}
                    transition={{ duration: 0.3 }}
                    className="mt-2 text-3xl font-black tracking-tight"
                  >
                    {item.value}
                  </motion.h2>
                </AnimatePresence>
                <p className="mt-2 text-sm text-slate-400">{item.desc}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.65fr_0.85fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Crowd Flow Visualization</p>
                <h2 className="mt-2 text-xl font-bold sm:text-2xl">Live crowd map</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${badge.ring}`}>
                  <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
                  {badge.label}
                </span>
                <AnimatePresence>
                  {isHotspot && worstMeta && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${worstMeta.badge}`}
                    >
                      <ShieldAlert className="h-4 w-4" />
                      {worstMeta.label} at {worstZone.name}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="h-[420px] overflow-hidden rounded-[2rem] border border-white/10">
              <LiveCrowdMap
                center={center}
                venue={{ name: event?.location?.venueName, address: event?.location?.address }}
                aor={venue?.aor?.polygon || []}
                zones={venue?.zones || []}
                liveZones={live?.zones || []}
                nodes={venue?.nodes || []}
                edges={venue?.edges || []}
                cells={live?.cells || []}
                dots={live?.dots || []}
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Crowd Zones</p>
                <h2 className="mt-2 text-xl font-bold">Zone status</h2>
              </div>
              <ArrowUpRight className="h-5 w-5 text-slate-400" />
            </div>

            {zones.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
                No zones are authored for this venue yet — draw them in the map editor to get zone-level density and risk.
              </div>
            ) : (
              <motion.div layout className="space-y-4">
                <AnimatePresence>
                  {zones.map((zone, index) => {
                    const meta = zone.riskLevel ? riskMeta(zone.riskLevel) : null;
                    const eta = formatEta(zone.forecast?.etaCriticalSec);
                    return (
                      <motion.div
                        key={zone.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.35 }}
                        whileHover={{ x: 4 }}
                        className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 transition hover:border-cyan-400/15 hover:bg-slate-950/60"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <MapPin size={18} className="shrink-0 text-cyan-300" />
                            <span className="truncate font-medium text-white">{zone.name}</span>
                          </div>
                          <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${meta ? meta.badge : NO_DATA_BADGE}`}>
                            {meta ? meta.label : "No data"}
                          </span>
                        </div>

                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                            <span>Density</span>
                            <span className="text-slate-300">
                              {Number.isFinite(zone.density) ? `${zone.density} p/m²` : "—"}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <motion.div
                              animate={{ width: `${Math.round((zone.risk ?? 0) * 100)}%` }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: meta ? meta.color : "#475569" }}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>
                              {Number.isFinite(zone.personsEst) ? `~${zone.personsEst.toLocaleString("en-IN")} people` : "—"}
                              {Number.isFinite(zone.risk) ? ` · risk ${Math.round(zone.risk * 100)}%` : ""}
                            </span>
                            {eta && <span className="text-amber-300">critical in ~{eta}</span>}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>

        <motion.div
          layout
          transition={{ duration: 0.4 }}
          className={`mt-8 rounded-[2rem] border p-6 backdrop-blur-xl ${
            isHotspot ? "border-red-400/20 bg-red-500/10" : "border-emerald-400/20 bg-emerald-500/10"
          }`}
        >
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className={`h-5 w-5 ${isHotspot ? "text-red-300" : "text-emerald-300"}`} />
            <h2 className={`text-xl font-bold ${isHotspot ? "text-red-200" : "text-emerald-200"}`}>Live assessment</h2>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={assessment}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl text-sm leading-7 text-slate-200 sm:text-base"
            >
              {assessment}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
