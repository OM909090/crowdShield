import { motion } from "framer-motion";
import { MapPinned, Radar, Activity, Wifi, ShieldAlert } from "lucide-react";
import CrowdMap from "../components/CrowdMap";

const metrics = [
  { label: "Active zones", value: "12", icon: Radar },
  { label: "Risk hotspots", value: "03", icon: ShieldAlert },
  { label: "Live feeds", value: "24/7", icon: Wifi },
  { label: "Movement pace", value: "Stable", icon: Activity },
];

export default function LiveMap() {
  return (
    <div className="relative min-h-[85vh] overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <MapPinned className="h-4 w-4" />
              Real-time venue intelligence
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Live Crowd Monitoring Map
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Track density buildup, bottlenecks, and risk zones across the venue in real time.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl"
                >
                  <div className="mb-2 flex items-center gap-2 text-cyan-300">
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                      {item.label}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-white">{item.value}</p>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20 backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_35%)]" />

          <div className="relative border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                  <Radar className="h-5 w-5 text-cyan-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Live Monitoring Layer</p>
                  <p className="text-xs text-slate-400">
                    Heatmaps, movement trails, and alert overlays
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
                System online
              </div>
            </div>
          </div>

          <div className="h-[60vh] min-h-[500px] lg:h-[700px]">
            <CrowdMap />
          </div>
        </motion.div>
      </div>
    </div>
  );
}