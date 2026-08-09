import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BrainCircuit,
  CalendarClock,
  Clock3,
  Gauge,
  MapPin,
  MapPinned,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import toast from "react-hot-toast";
import api from "../../utils/axios";

const POLL_INTERVAL_MS = 5000;
const colors = { crowd: "#22d3ee", risk: "#fb7185" };

const RISK_TONE = {
  Low: "text-emerald-300",
  Moderate: "text-amber-300",
  High: "text-red-300",
};

export default function Analytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [data, setData] = useState(null); // { kpis, trend, zoneLoad, riskSplit, incidents }
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await api.get(`/events/${id}/analytics`);
      setData(res.data);
    } catch {
      // background poll failures stay silent
    }
  }, [id]);

  useEffect(() => {
    let interval;
    const init = async () => {
      try {
        setLoading(true);
        const [eventRes] = await Promise.all([api.get(`/events/${id}`), fetchAnalytics()]);
        setEvent(eventRes.data.event);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    };
    init();
    interval = setInterval(fetchAnalytics, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, fetchAnalytics]);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <Radar className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  const { kpis, trend, zoneLoad, riskSplit, incidents } = data;

  const kpiCards = [
    { title: "Total Crowd", value: kpis.totalCrowd.toLocaleString("en-IN"), icon: Users, tone: "text-cyan-300" },
    { title: "Risk Level", value: kpis.riskLevel, icon: AlertTriangle, tone: RISK_TONE[kpis.riskLevel] },
    { title: "Avg Speed", value: kpis.avgSpeed, icon: Gauge, tone: "text-emerald-300" },
    { title: "Active Hotspots", value: String(kpis.activeHotspots).padStart(2, "0"), icon: MapPinned, tone: "text-amber-300" },
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
              <Sparkles className="h-4 w-4" />
              <motion.span
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              />
              Live operational analytics
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">Analytics Dashboard</h1>
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
              ["Update", "5s"],
              ["Venue", event?.location?.venueName?.slice(0, 14) || "—"],
              ["Markers", `${kpis.markersPlaced} placed`],
              ["Mode", "Live"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.06 }}
                whileHover={{ y: -8, scale: 1.01 }}
                className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl transition hover:border-cyan-400/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10">
                    <Icon size={24} className={item.tone} />
                  </div>
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-300">
                    Live
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
              </motion.div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <motion.div whileHover={{ scale: 1.01 }} className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Crowd Trend</p>
                  <h2 className="mt-2 text-xl font-bold sm:text-2xl">Crowd growth vs risk trend</h2>
                </div>
                <ArrowUpRight className="h-5 w-5 text-slate-400" />
              </div>

              <div className="h-[320px] w-full">
                {trend.length < 2 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Gathering live readings — this chart fills in as data comes through.
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
                      />
                      <Line type="monotone" dataKey="people" stroke={colors.crowd} strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="risk" stroke={colors.risk} strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>

            <div className="grid gap-6 md:grid-cols-2">
              <motion.div whileHover={{ y: -6 }} className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
                <div className="mb-5 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-300" />
                  <h3 className="text-lg font-bold">Zone Load</h3>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={zoneLoad}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(226,232,240,0.6)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="rgba(226,232,240,0.6)" />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(2,6,23,0.92)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 16,
                          color: "#fff",
                        }}
                      />
                      <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#22d3ee" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              <motion.div whileHover={{ y: -6 }} className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
                <div className="mb-5 flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-cyan-300" />
                  <h3 className="text-lg font-bold">Risk Split</h3>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={riskSplit} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95} paddingAngle={4}>
                        {riskSplit.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "rgba(2,6,23,0.92)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 16,
                          color: "#fff",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {riskSplit.map((item) => (
                    <div
                      key={item.name}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-slate-300"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name} zones ({item.value})
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>

          <div className="space-y-6">
            <motion.div whileHover={{ y: -6 }} className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
              <div className="mb-5 flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-cyan-300" />
                <h3 className="text-lg font-bold">Recent Incidents</h3>
              </div>

              {incidents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-6 text-center text-sm text-slate-500">
                  No incidents logged yet — this fills in automatically when a zone crosses the critical threshold.
                </div>
              ) : (
                <motion.div layout className="space-y-4">
                  <AnimatePresence>
                    {incidents.map((item, index) => (
                      <motion.div
                        key={item.time + item.title}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: index * 0.05 }}
                        className="rounded-2xl border border-white/8 bg-slate-950/40 p-4"
                      >
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{item.time}</p>
                        <h4 className="mt-2 font-semibold text-white">{item.title}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{item.desc}</p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </motion.div>

            <motion.div
              layout
              transition={{ duration: 0.4 }}
              className={`rounded-[2rem] border p-6 backdrop-blur-xl ${
                kpis.riskLevel === "High" ? "border-red-400/20 bg-red-500/10" : "border-emerald-400/20 bg-emerald-500/10"
              }`}
            >
              <div className="mb-4 flex items-center gap-2">
                {kpis.riskLevel === "High" ? (
                  <ShieldAlert className="h-5 w-5 text-red-300" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-emerald-300" />
                )}
                <h3 className={`text-lg font-bold ${kpis.riskLevel === "High" ? "text-red-100" : "text-emerald-100"}`}>
                  {kpis.riskLevel === "High" ? "Operational Warning" : "Operational Status"}
                </h3>
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={kpis.riskLevel + zoneLoad[0]?.name}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm leading-7 text-slate-200"
                >
                  {kpis.riskLevel === "High"
                    ? `${zoneLoad[0]?.name} is the highest-risk zone. Crowd density is increasing faster than the safe threshold.`
                    : "All zones are tracking within safe thresholds. No escalation detected."}
                </motion.p>
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
