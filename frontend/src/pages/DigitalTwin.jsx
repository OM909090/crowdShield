import { useMemo } from "react";
import {
  Building2,
  Users,
  AlertTriangle,
  Sparkles,
  Radar,
  Activity,
  MapPinned,
  ArrowUpRight,
  Layers3,
} from "lucide-react";
import { motion } from "framer-motion";

const zones = [
  {
    id: 1,
    name: "Gate A",
    people: 450,
    risk: "HIGH",
  },
  {
    id: 2,
    name: "Central Hall",
    people: 1200,
    risk: "MEDIUM",
  },
  {
    id: 3,
    name: "Exit Zone",
    people: 200,
    risk: "LOW",
  },
];

const crowdPoints = Array.from({ length: 40 });

const riskStyles = {
  HIGH: {
    badge: "bg-red-500/10 text-red-300 border-red-400/20",
    dot: "bg-red-400",
    bar: "from-red-500 to-orange-400",
  },
  MEDIUM: {
    badge: "bg-amber-500/10 text-amber-300 border-amber-400/20",
    dot: "bg-amber-400",
    bar: "from-amber-500 to-yellow-400",
  },
  LOW: {
    badge: "bg-emerald-500/10 text-emerald-300 border-emerald-400/20",
    dot: "bg-emerald-400",
    bar: "from-emerald-500 to-cyan-400",
  },
};

export default function DigitalTwin() {
  const gridCells = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, i) => ({
        id: i,
        top: `${Math.random() * 90}%`,
        left: `${Math.random() * 90}%`,
      })),
    []
  );

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Sparkles className="h-4 w-4" />
              AI venue replication
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Digital Twin Simulation
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Visualize crowd movement, hotspot formation, and venue pressure using a lightweight digital twin interface.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Venue", "Main Hall"],
              ["Zones", "3 Active"],
              ["Crowd", "1.8k"],
              ["Risk", "Live"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.65fr_0.85fr]">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="relative min-h-[620px] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.97))] shadow-2xl shadow-cyan-950/20"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.08),transparent_42%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px] opacity-25" />

            {gridCells.map((cell) => (
              <span
                key={cell.id}
                className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-cyan-300/40"
                style={{ top: cell.top, left: cell.left }}
              />
            ))}

            <motion.div
              whileHover={{ scale: 1.03 }}
              className="absolute left-8 top-10 rounded-[1.75rem] border border-cyan-400/30 bg-cyan-400/10 px-5 py-4 backdrop-blur-xl"
            >
              <div className="flex items-center gap-3">
                <Building2 className="h-6 w-6 text-cyan-300" />
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
                    Main venue
                  </p>
                  <p className="mt-1 font-semibold text-white">Main Hall</p>
                </div>
              </div>
            </motion.div>

            <div className="absolute right-8 top-8 rounded-[1.75rem] border border-red-400/20 bg-red-500/10 px-5 py-4 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-red-300" />
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-red-200/70">
                    Risk state
                  </p>
                  <p className="mt-1 font-semibold text-red-100">High risk zone</p>
                </div>
              </div>
            </div>

            <div className="absolute bottom-8 left-8 rounded-[1.75rem] border border-white/10 bg-white/[0.05] px-5 py-4 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <Radar className="h-6 w-6 text-cyan-300" />
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Simulation
                  </p>
                  <p className="mt-1 font-semibold text-white">Crowd movement replay</p>
                </div>
              </div>
            </div>

            <div className="absolute right-8 bottom-8 rounded-[1.75rem] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <Layers3 className="h-6 w-6 text-emerald-300" />
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">
                    Layers
                  </p>
                  <p className="mt-1 font-semibold text-emerald-100">Heat, routes, and pressure</p>
                </div>
              </div>
            </div>

            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/30 bg-cyan-400/5">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                className="absolute inset-3 rounded-full border border-cyan-400/20"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
                className="absolute inset-10 rounded-full border border-blue-400/15"
              />
            </div>

            <div className="absolute bottom-28 left-1/2 w-[340px] -translate-x-1/2">
              <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.28em] text-slate-400">
                <span>Crowd simulation</span>
                <span>Live density</span>
              </div>
              <div className="flex flex-wrap gap-2 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
                {crowdPoints.map((_, index) => (
                  <motion.div
                    key={index}
                    animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: index * 0.03,
                    }}
                    className="h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.45)]"
                  />
                ))}
              </div>
            </div>

            <div className="absolute left-8 top-[45%] rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm text-red-200">
              High-risk clustering detected
            </div>
          </motion.div>

          <div className="space-y-5">
            {zones.map((zone, index) => {
              const s = riskStyles[zone.risk];
              return (
                <motion.div
                  key={zone.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08, duration: 0.4 }}
                  whileHover={{ y: -6, scale: 1.01 }}
                  className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl transition hover:border-cyan-400/20"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${s.dot} shadow-[0_0_12px_rgba(34,211,238,0.4)]`} />
                      <h3 className="text-lg font-bold">{zone.name}</h3>
                    </div>
                    <Users size={20} className="text-cyan-300" />
                  </div>

                  <p className="mt-4 text-sm text-slate-400">
                    People detected
                    <span className="ml-2 text-xl font-black text-white">{zone.people}</span>
                  </p>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-sm text-slate-400">
                      <span>Risk level</span>
                      <span>{zone.risk}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${
                          zone.risk === "HIGH"
                            ? "w-[92%] bg-gradient-to-r from-red-500 to-orange-400"
                            : zone.risk === "MEDIUM"
                            ? "w-[62%] bg-gradient-to-r from-amber-500 to-yellow-400"
                            : "w-[24%] bg-gradient-to-r from-emerald-500 to-cyan-400"
                        }`}
                      />
                    </div>
                  </div>

                  <span className={`mt-5 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${s.badge}`}>
                    {zone.risk}
                  </span>
                </motion.div>
              );
            })}

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl"
            >
              <div className="mb-3 flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-cyan-300" />
                <h2 className="text-lg font-bold">Simulation Notes</h2>
              </div>
              <p className="text-sm leading-6 text-slate-400">
                The digital twin highlights how Gate A pressure propagates toward the central corridor and how rerouting reduces crowd compression.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}