import {
  Users,
  AlertTriangle,
  Gauge,
  DoorOpen,
  Activity,
  Radar,
  MapPinned,
  ArrowUpRight,
  ShieldAlert,
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
import { motion } from "framer-motion";

const stats = [
  {
    id: 1,
    title: "Current Crowd",
    value: "18,420",
    icon: Users,
    status: "Normal",
    color: "text-emerald-300",
  },
  {
    id: 2,
    title: "Risk Probability",
    value: "18%",
    icon: AlertTriangle,
    status: "Low",
    color: "text-emerald-300",
  },
  {
    id: 3,
    title: "Avg Movement",
    value: "1.4 m/s",
    icon: Gauge,
    status: "Stable",
    color: "text-cyan-300",
  },
  {
    id: 4,
    title: "Open Gates",
    value: "12/15",
    icon: DoorOpen,
    status: "Safe",
    color: "text-emerald-300",
  },
];

const crowdData = [
  { time: "10 AM", people: 2000 },
  { time: "11 AM", people: 4500 },
  { time: "12 PM", people: 8000 },
  { time: "1 PM", people: 12000 },
  { time: "2 PM", people: 18000 },
];

const recommendations = [
  {
    text: "Zone A congestion increasing",
    tone: "text-red-200 bg-red-500/10 border-red-500/25",
    icon: ShieldAlert,
  },
  {
    text: "Open Gate B",
    tone: "text-emerald-200 bg-emerald-500/10 border-emerald-500/25",
    icon: DoorOpen,
  },
  {
    text: "Deploy 5 security personnel",
    tone: "text-sky-200 bg-sky-500/10 border-sky-500/25",
    icon: Users,
  },
];

const cardStyle = "rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl";

export default function Dashboard() {
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Radar className="h-4 w-4" />
              Real-time command operations
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Command Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Monitor live crowd behavior, risk zones, gate status, and recommended interventions from one control room view.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Venue", "North Plaza"],
              ["Mode", "Live"],
              ["Alerts", "3 Active"],
              ["Uptime", "99.98%"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
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
                className={`${cardStyle} p-6 transition hover:border-cyan-400/20`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10">
                    <Icon size={24} className="text-cyan-300" />
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${item.color} border-current/20 bg-white/5`}>
                    {item.status}
                  </span>
                </div>

                <p className="mt-5 text-sm uppercase tracking-[0.28em] text-slate-400">
                  {item.title}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">{item.value}</h2>

                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.65fr_0.85fr]">
          <motion.div
            whileHover={{ scale: 1.01 }}
            className={`${cardStyle} relative overflow-hidden p-5 sm:p-6`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.08),transparent_40%)]" />
            <div className="relative mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">
                  Live Crowd Heat Map
                </p>
                <h2 className="mt-2 text-xl font-bold sm:text-2xl">
                  Density visualization
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                <span className="h-2 w-2 rounded-full bg-red-300 shadow-[0_0_10px_rgba(248,113,113,0.9)]" />
                High density area
              </div>
            </div>

            <div className="flex min-h-[360px] items-center justify-center rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))]">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-red-500/10" />
                <div className="relative flex h-44 w-44 items-center justify-center rounded-full border border-red-400/30 bg-red-500/15 shadow-[0_0_60px_rgba(239,68,68,0.12)]">
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.28em] text-red-200/80">
                      Hotspot
                    </p>
                    <p className="mt-2 text-lg font-black text-red-200">
                      HIGH DENSITY
                    </p>
                  </div>
                </div>

                <div className="absolute -left-8 top-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs text-cyan-200 backdrop-blur-xl">
                  Gate A pressure rising
                </div>
                <div className="absolute -right-10 bottom-8 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200 backdrop-blur-xl">
                  Safe route: East exit
                </div>
              </div>
            </div>
          </motion.div>

          <div className={`${cardStyle} p-6`}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">
                  AI Recommendations
                </p>
                <h2 className="mt-2 text-xl font-bold">Action list</h2>
              </div>
              <ArrowUpRight className="h-5 w-5 text-slate-400" />
            </div>

            <div className="space-y-4">
              {recommendations.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.06 }}
                    whileHover={{ x: 5 }}
                    className={`flex items-center gap-3 rounded-2xl border p-4 ${item.tone} transition`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/15">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium">{item.text}</p>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <Activity className="h-4 w-4 text-cyan-300" />
                Live response status
              </div>
              <p className="text-sm leading-6 text-slate-400">
                Security units have been routed to Gate A, and alternate flow has been suggested for incoming crowds.
              </p>
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className={`${cardStyle} mt-8 p-6 sm:p-7`}
        >
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">
                Crowd Trend Analytics
              </p>
              <h2 className="mt-2 text-xl font-bold sm:text-2xl">
                Crowd growth prediction
              </h2>
            </div>
            <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              Forecasting next surge
            </div>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={crowdData}>
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
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}