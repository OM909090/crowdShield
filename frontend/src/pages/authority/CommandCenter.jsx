import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Users,
  AlertTriangle,
  Gauge,
  DoorOpen,
  DoorClosed,
  Activity,
  Radar,
  ArrowUpRight,
  ShieldAlert,
  ArrowLeft,
  MapPin,
  CalendarClock,
  CheckCircle2,
  Megaphone,
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

const cardStyle = "rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl";
const POLL_INTERVAL_MS = 5000;

const RISK_STYLES = {
  Low: "text-emerald-300 border-emerald-400/20",
  Moderate: "text-amber-300 border-amber-400/20",
  High: "text-red-300 border-red-400/20",
};

const RECOMMENDATION_STYLES = {
  critical: { tone: "text-red-200 bg-red-500/10 border-red-500/25", icon: ShieldAlert },
  warning: { tone: "text-amber-200 bg-amber-500/10 border-amber-500/25", icon: AlertTriangle },
  action: { tone: "text-sky-200 bg-sky-500/10 border-sky-500/25", icon: DoorOpen },
  deploy: { tone: "text-violet-200 bg-violet-500/10 border-violet-500/25", icon: Users },
  safe: { tone: "text-emerald-200 bg-emerald-500/10 border-emerald-500/25", icon: CheckCircle2 },
};

export default function CommandCenter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await api.get(`/events/${id}/command`);
      setSnapshot(res.data.snapshot);
      setTrend(res.data.trend);
    } catch {
      // background poll failures stay silent — last good reading remains visible
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
        toast.error(err.response?.data?.message || "Failed to load command center");
      } finally {
        setLoading(false);
      }
    };
    init();
    interval = setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, fetchSnapshot]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <Radar className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  const stats = snapshot && [
    { id: 1, title: "Current Crowd", value: snapshot.currentCrowd.toLocaleString("en-IN"), icon: Users, status: snapshot.riskLevel === "High" ? "Elevated" : "Normal" },
    { id: 2, title: "Risk Probability", value: `${snapshot.riskProbability}%`, icon: AlertTriangle, status: snapshot.riskLevel },
    { id: 3, title: "Avg Movement", value: snapshot.avgSpeed, icon: Gauge, status: "Live" },
    { id: 4, title: "Open Gates", value: `${snapshot.openGates}/${snapshot.totalGates}`, icon: DoorOpen, status: snapshot.openGates === snapshot.totalGates ? "All open" : "Restricted" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <button
          onClick={() => navigate("/authority/events")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft size={15} />
          Back to your events
        </button>

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
              ["Mode", "Live"],
              ["Alerts", `${snapshot?.recommendations?.length ?? 0} Active`],
              ["Update", "Every 5s"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

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

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.65fr_0.85fr]">
          <motion.div whileHover={{ scale: 1.005 }} className={`${cardStyle} relative overflow-hidden p-5 sm:p-6`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.08),transparent_40%)]" />
            <div className="relative mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Live Crowd Heat Map</p>
                <h2 className="mt-2 text-xl font-bold sm:text-2xl">Density visualization</h2>
              </div>
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
                  snapshot.riskLevel === "High"
                    ? "border-red-400/20 bg-red-500/10 text-red-200"
                    : "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    snapshot.riskLevel === "High" ? "bg-red-300 shadow-[0_0_10px_rgba(248,113,113,0.9)]" : "bg-emerald-300"
                  }`}
                />
                {snapshot.riskLevel === "High" ? "High density area" : "Density within limits"}
              </div>
            </div>

            <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))]">
              <div className="relative">
                {snapshot.riskLevel === "High" && (
                  <div className="absolute inset-0 animate-ping rounded-full bg-red-500/10" />
                )}
                <div
                  className={`relative flex h-44 w-44 items-center justify-center rounded-full border shadow-[0_0_60px_rgba(34,211,238,0.12)] ${
                    snapshot.riskLevel === "High"
                      ? "border-red-400/30 bg-red-500/15"
                      : "border-cyan-400/30 bg-cyan-400/10"
                  }`}
                >
                  <div className="text-center">
                    <p
                      className={`text-xs uppercase tracking-[0.28em] ${
                        snapshot.riskLevel === "High" ? "text-red-200/80" : "text-cyan-200/80"
                      }`}
                    >
                      {snapshot.riskLevel === "High" ? "Hotspot" : "Status"}
                    </p>
                    <p className={`mt-2 text-lg font-black ${snapshot.riskLevel === "High" ? "text-red-200" : "text-cyan-200"}`}>
                      {snapshot.riskLevel === "High" ? "HIGH DENSITY" : "UNDER CONTROL"}
                    </p>
                  </div>
                </div>

                <div className="absolute -left-8 top-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs text-cyan-200 backdrop-blur-xl">
                  {snapshot.openGates}/{snapshot.totalGates} gates open
                </div>
                <div className="absolute -right-10 bottom-8 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200 backdrop-blur-xl">
                  Avg speed {snapshot.avgSpeed}
                </div>
              </div>
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
          </motion.div>

          <div className={`${cardStyle} p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">AI Recommendations</p>
                <h2 className="mt-2 text-xl font-bold">Action list</h2>
              </div>
              <ArrowUpRight className="h-5 w-5 text-slate-400" />
            </div>

            <motion.div layout className="space-y-4">
              <AnimatePresence>
                {snapshot.recommendations.map((item, index) => {
                  const style = RECOMMENDATION_STYLES[item.type] || RECOMMENDATION_STYLES.safe;
                  const Icon = style.icon;
                  return (
                    <motion.div
                      key={item.text}
                      layout
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35, delay: index * 0.06 }}
                      whileHover={{ x: 5 }}
                      className={`flex items-center gap-3 rounded-2xl border p-4 ${style.tone} transition`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/15">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-medium">{item.text}</p>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <Activity className="h-4 w-4 text-cyan-300" />
                Live response status
              </div>
              <p className="text-sm leading-6 text-slate-400">
                {snapshot.riskLevel === "High"
                  ? "Security units are being routed to the highest-density zone, and alternate flow is being suggested for incoming crowds."
                  : "No active interventions needed. Monitoring continues automatically."}
              </p>
              <button
                onClick={() => toast.success("Announcement queued for broadcast")}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-4 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15"
              >
                <Megaphone size={15} />
                Broadcast public announcement
              </button>
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
    </div>
  );
}
