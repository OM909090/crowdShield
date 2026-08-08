import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  Clock3,
  Gauge,
  MapPinned,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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

const kpis = [
  {
    title: "Total Crowd",
    value: "18,420",
    change: "+12.4%",
    icon: Users,
    tone: "text-cyan-300",
  },
  {
    title: "Risk Level",
    value: "High",
    change: "Escalating",
    icon: AlertTriangle,
    tone: "text-red-300",
  },
  {
    title: "Avg Speed",
    value: "1.4 m/s",
    change: "-8.2%",
    icon: Gauge,
    tone: "text-emerald-300",
  },
  {
    title: "Active Hotspots",
    value: "04",
    change: "+2 zones",
    icon: MapPinned,
    tone: "text-amber-300",
  },
];

const trendData = [
  { time: "10 AM", crowd: 2000, risk: 12 },
  { time: "11 AM", crowd: 4500, risk: 18 },
  { time: "12 PM", crowd: 8000, risk: 32 },
  { time: "1 PM", crowd: 12000, risk: 51 },
  { time: "2 PM", crowd: 18000, risk: 78 },
  { time: "3 PM", crowd: 18420, risk: 84 },
];

const zoneLoadData = [
  { name: "Gate A", value: 92 },
  { name: "Central Hall", value: 68 },
  { name: "Food Court", value: 55 },
  { name: "Exit Zone", value: 25 },
  { name: "Parking", value: 31 },
];

const riskSplit = [
  { name: "Critical", value: 38, color: "#f87171" },
  { name: "Moderate", value: 34, color: "#fbbf24" },
  { name: "Safe", value: 28, color: "#34d399" },
];

const incidents = [
  {
    time: "03:45 PM",
    title: "North Gate congestion spike",
    desc: "Density exceeded safe threshold and movement slowed sharply.",
  },
  {
    time: "03:52 PM",
    title: "Reverse flow detected",
    desc: "Crowd motion shifted against the main exit direction.",
  },
  {
    time: "03:58 PM",
    title: "Action recommended",
    desc: "Open Gate B and broadcast multilingual evacuation alerts.",
  },
];

const colors = {
  crowd: "#22d3ee",
  risk: "#fb7185",
};

export default function Analytics() {
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Live operational analytics
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Analytics Dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Monitor crowd growth, risk escalation, hotspot concentration, and intervention outcomes from one unified view.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Update", "2s"],
              ["Venue", "Main Hall"],
              ["Alerts", "3 Active"],
              ["Mode", "Live"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item, index) => {
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
                    {item.change}
                  </span>
                </div>

                <p className="mt-5 text-sm uppercase tracking-[0.28em] text-slate-400">
                  {item.title}
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">{item.value}</h2>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <motion.div
              whileHover={{ scale: 1.01 }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl"
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">
                    Crowd Trend
                  </p>
                  <h2 className="mt-2 text-xl font-bold sm:text-2xl">
                    Crowd growth vs risk trend
                  </h2>
                </div>
                <ArrowUpRight className="h-5 w-5 text-slate-400" />
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
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
                    <Line type="monotone" dataKey="crowd" stroke={colors.crowd} strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="risk" stroke={colors.risk} strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <div className="grid gap-6 md:grid-cols-2">
              <motion.div
                whileHover={{ y: -6 }}
                className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl"
              >
                <div className="mb-5 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-cyan-300" />
                  <h3 className="text-lg font-bold">Zone Load</h3>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={zoneLoadData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(226,232,240,0.6)" />
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

              <motion.div
                whileHover={{ y: -6 }}
                className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl"
              >
                <div className="mb-5 flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-cyan-300" />
                  <h3 className="text-lg font-bold">Risk Split</h3>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskSplit}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={4}
                      >
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
                    <div key={item.name} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>

          <div className="space-y-6">
            <motion.div
              whileHover={{ y: -6 }}
              className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl"
            >
              <div className="mb-5 flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-cyan-300" />
                <h3 className="text-lg font-bold">Recent Incidents</h3>
              </div>

              <div className="space-y-4">
                {incidents.map((item, index) => (
                  <motion.div
                    key={item.time}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.05 }}
                    className="rounded-2xl border border-white/8 bg-slate-950/40 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      {item.time}
                    </p>
                    <h4 className="mt-2 font-semibold text-white">{item.title}</h4>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -6 }}
              className="rounded-[2rem] border border-red-400/20 bg-red-500/10 p-6 backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-300" />
                <h3 className="text-lg font-bold text-red-100">Operational Warning</h3>
              </div>
              <p className="text-sm leading-7 text-slate-200">
                Gate A is the highest-risk zone. Crowd density and reverse flow are increasing faster than the safe threshold.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}