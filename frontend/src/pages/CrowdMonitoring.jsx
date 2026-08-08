import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Users,
  Gauge,
  Navigation,
  MapPin,
  AlertTriangle,
  Activity,
  Radar,
  ShieldAlert,
  ArrowUpRight,
  ArrowLeft,
  CalendarClock,
  RadioTower,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import api from "../utils/axios";

const STATUS_STYLES = {
  Critical: "text-red-200 bg-red-500/10 border-red-400/20",
  Moderate: "text-amber-200 bg-amber-500/10 border-amber-400/20",
  Safe: "text-emerald-200 bg-emerald-500/10 border-emerald-400/20",
};

const BAR_GRADIENT = {
  Critical: "bg-gradient-to-r from-red-500 to-orange-400",
  Moderate: "bg-gradient-to-r from-amber-500 to-yellow-400",
  Safe: "bg-gradient-to-r from-emerald-400 to-cyan-400",
};

const POLL_INTERVAL_MS = 4000;

export default function CrowdMonitoring() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await api.get(`/events/${id}/crowd`);
      setSnapshot(res.data.snapshot);
    } catch {
      // background poll failures stay silent — the last good reading remains on screen
    }
  }, [id]);

  useEffect(() => {
    let interval;

    const init = async () => {
      try {
        setLoading(true);
        const [eventRes] = await Promise.all([api.get(`/events/${id}`), fetchSnapshot()]);
        setEvent(eventRes.data.event);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load event");
      } finally {
        setLoading(false);
      }
    };

    init();
    interval = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, fetchSnapshot]);

  const metrics = snapshot
    ? [
        { title: "Current Crowd", value: snapshot.currentCrowd.toLocaleString("en-IN"), icon: Users, desc: "People detected" },
        { title: "Average Speed", value: snapshot.avgSpeed, icon: Gauge, desc: "Movement speed" },
        { title: "Flow Direction", value: snapshot.flowDirection, icon: Navigation, desc: "Major movement" },
        { title: "Hotspots", value: String(snapshot.hotspotCount).padStart(2, "0"), icon: AlertTriangle, desc: "Critical zones" },
      ]
    : [];

  const criticalZone = snapshot?.zones?.find((z) => z.status === "Critical");

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

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Update", "Every 4s"],
              ["Alerts", `${snapshot?.hotspotCount ?? 0} Active`],
              ["Route", "Optimized"],
              ["Coverage", "Venue-wide"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
                  <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Live
                  </span>
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
          <motion.div
            whileHover={{ scale: 1.005 }}
            className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Crowd Flow Visualization</p>
                <h2 className="mt-2 text-xl font-bold sm:text-2xl">Live crowd flow</h2>
              </div>
              <AnimatePresence>
                {criticalZone && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-200"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Hotspot at {criticalZone.name}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative flex h-[420px] items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))]">
              {/* radar sweep */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute h-72 w-72 rounded-full"
                style={{ background: "conic-gradient(from 0deg, rgba(34,211,238,0.28), transparent 32%)" }}
              />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 m-auto h-72 w-72 rounded-full border border-cyan-400/20"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
                className="absolute inset-6 m-auto h-60 w-60 rounded-full border border-blue-400/15"
              />

              <div className="relative flex h-72 w-72 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/5 shadow-[0_0_60px_rgba(34,211,238,0.12)]">
                <AnimatePresence>
                  {criticalZone && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute -top-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-200 backdrop-blur-xl"
                    >
                      Hotspot
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="absolute right-0 top-12 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200 backdrop-blur-xl">
                  {snapshot?.flowDirection} flow stable
                </div>
                <div className="absolute bottom-8 left-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs text-cyan-200 backdrop-blur-xl">
                  {snapshot?.avgSpeed} avg speed
                </div>

                <div className="text-center">
                  <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                    <Activity size={64} className="mx-auto text-cyan-300" />
                  </motion.div>
                  <p className="mt-4 text-lg font-semibold text-slate-200">Tracking crowd movement</p>
                  <p className="mt-2 text-sm text-slate-400">Density, direction, and pressure mapping</p>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Crowd Zones</p>
                <h2 className="mt-2 text-xl font-bold">Zone status</h2>
              </div>
              <ArrowUpRight className="h-5 w-5 text-slate-400" />
            </div>

            <motion.div layout className="space-y-4">
              <AnimatePresence>
                {snapshot?.zones?.map((zone, index) => (
                  <motion.div
                    key={zone.name}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05, duration: 0.35 }}
                    whileHover={{ x: 4 }}
                    className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 transition hover:border-cyan-400/15 hover:bg-slate-950/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <MapPin size={18} className="text-cyan-300" />
                        <span className="font-medium text-white">{zone.name}</span>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs ${STATUS_STYLES[zone.status]}`}>
                        {zone.status}
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                        <span>Density</span>
                        <span>{zone.density}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          animate={{ width: `${zone.density}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          className={`h-full rounded-full ${BAR_GRADIENT[zone.status]}`}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>

        <motion.div
          layout
          transition={{ duration: 0.4 }}
          className={`mt-8 rounded-[2rem] border p-6 backdrop-blur-xl ${
            criticalZone ? "border-red-400/20 bg-red-500/10" : "border-emerald-400/20 bg-emerald-500/10"
          }`}
        >
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className={`h-5 w-5 ${criticalZone ? "text-red-300" : "text-emerald-300"}`} />
            <h2 className={`text-xl font-bold ${criticalZone ? "text-red-200" : "text-emerald-200"}`}>
              AI Observation
            </h2>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={criticalZone ? criticalZone.name + criticalZone.density : "safe"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl text-sm leading-7 text-slate-200 sm:text-base"
            >
              {criticalZone
                ? `Crowd density near ${criticalZone.name} is elevated at ${criticalZone.density}%. Movement speed is ${snapshot.avgSpeed}. Possible congestion building — consider redirecting inflow.`
                : "All tracked zones are within safe density thresholds. No congestion risk detected at this time."}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
