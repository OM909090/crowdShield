import {
  ShieldAlert,
  Users,
  DoorOpen,
  Megaphone,
  ArrowRightLeft,
  Sparkles,
  Zap,
  Route,
  Volume2,
  Radar,
} from "lucide-react";
import { motion } from "framer-motion";
import { generateRecommendations } from "../utils/recommendationEngine";

const icons = {
  GATE: DoorOpen,
  SECURITY: ShieldAlert,
  CROWD: Users,
  FLOW: ArrowRightLeft,
  ALERT: Megaphone,
  BARRIER: ShieldAlert,
};

const priorityStyles = {
  HIGH: "bg-red-500/10 text-red-300 border-red-400/20",
  MEDIUM: "bg-amber-500/10 text-amber-300 border-amber-400/20",
  LOW: "bg-emerald-500/10 text-emerald-300 border-emerald-400/20",
};

const priorityGlow = {
  HIGH: "from-red-500/20 to-orange-500/10",
  MEDIUM: "from-amber-500/20 to-yellow-500/10",
  LOW: "from-emerald-500/20 to-cyan-500/10",
};

export default function Recommendations() {
  const actions = generateRecommendations({
    riskLevel: "HIGH",
    density: 85,
    bottleneck: true,
    crowdIncrease: 70,
    directionConflict: true,
  });

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Sparkles className="h-4 w-4" />
              AI-powered intervention engine
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              AI Recommendations
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Actionable interventions generated from crowd pressure, bottleneck detection, and movement anomalies.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Mode", "Critical"],
              ["Actions", `${actions.length}`],
              ["Broadcast", "Multilingual"],
              ["Response", "Immediate"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {actions.map((item, index) => {
            const Icon = icons[item.type] || ShieldAlert;

            return (
              <motion.div
                key={`${item.type}-${index}`}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.08 }}
                whileHover={{ y: -8, scale: 1.01 }}
                className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl transition hover:border-cyan-400/20"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${priorityGlow[item.priority] || priorityGlow.MEDIUM} opacity-0 transition duration-500 group-hover:opacity-100`} />
                <div className="relative">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10 text-cyan-300">
                      <Icon size={28} />
                    </div>

                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityStyles[item.priority] || priorityStyles.MEDIUM}`}>
                      Priority: {item.priority}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-400">
                    <Radar className="h-3.5 w-3.5 text-cyan-300" />
                    {item.type}
                  </div>

                  <p className="mt-4 text-lg font-semibold leading-7 text-white">
                    {item.message}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {item.type === "GATE" && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
                        <DoorOpen className="h-3.5 w-3.5" />
                        Gate control
                      </div>
                    )}
                    {item.type === "ALERT" && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
                        <Volume2 className="h-3.5 w-3.5" />
                        Public announcement
                      </div>
                    )}
                    {item.type === "FLOW" && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200">
                        <Route className="h-3.5 w-3.5" />
                        Redirect movement
                      </div>
                    )}
                    {item.type === "SECURITY" && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200">
                        <Zap className="h-3.5 w-3.5" />
                        Deploy response team
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mt-8 rounded-[2rem] border border-red-400/20 bg-red-500/10 p-6 backdrop-blur-xl"
        >
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-red-300" />
            <h2 className="text-xl font-bold text-red-200">Command Summary</h2>
          </div>
          <p className="max-w-4xl text-sm leading-7 text-slate-200 sm:text-base">
            Recommended actions prioritize bottleneck reduction, evacuation routing, crowd redistribution, and multilingual alert broadcasting to prevent escalation.
          </p>
        </motion.div>
      </div>
    </div>
  );
}