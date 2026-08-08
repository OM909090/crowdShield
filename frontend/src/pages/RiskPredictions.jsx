import { AlertTriangle, BrainCircuit, TrendingUp, ShieldAlert, Activity, Sparkles, Gauge } from "lucide-react";
import { motion } from "framer-motion";
import { predictRisk } from "../utils/riskEngine";

const riskInput = {
  density: 85,
  speed: 0.4,
  crowdIncrease: 65,
  directionConflict: true,
  bottleneck: true,
};

const analysisPoints = [
  {
    icon: "🔴",
    text: "Crowd density is above safe limit",
  },
  {
    icon: "⚠",
    text: "Crowd movement speed is decreasing",
  },
  {
    icon: "⚠",
    text: "Opposite crowd directions detected",
  },
  {
    icon: "🚨",
    text: "Bottleneck detected near Gate A",
  },
];

const cards = [
  {
    title: "AI Confidence",
    key: "score",
    icon: BrainCircuit,
    color: "text-cyan-300",
    bg: "from-cyan-400/20 to-blue-500/10",
  },
  {
    title: "Current Risk",
    key: "level",
    icon: AlertTriangle,
    color: "text-red-300",
    bg: "from-red-500/20 to-orange-500/10",
  },
];

export default function RiskPrediction() {
  const result = predictRisk(riskInput);

  const riskTone =
    result?.level === "High"
      ? "text-red-300 border-red-400/20 bg-red-500/10"
      : result?.level === "Medium"
      ? "text-amber-300 border-amber-400/20 bg-amber-500/10"
      : "text-emerald-300 border-emerald-400/20 bg-emerald-500/10";

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.15),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Live AI prediction engine
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              AI Risk Prediction
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Risk scored from density, movement speed, crowd surge, direction conflicts, and bottleneck signals.
            </p>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 ${riskTone}`}>
            <ShieldAlert className="h-4 w-4" />
            <span className="text-sm font-semibold">Live risk status: {result?.level}</span>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.key}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                whileHover={{ y: -8, scale: 1.01 }}
                className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl transition hover:border-cyan-400/25"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${card.bg} opacity-0 transition duration-500 group-hover:opacity-100`} />
                <div className="relative">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/50">
                    <Icon size={30} className={card.color} />
                  </div>

                  <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
                    {card.title}
                  </p>

                  <div className="mt-4 flex items-end gap-3">
                    <p className={`text-4xl font-black ${card.color}`}>
                      {result?.[card.key]}
                      {card.key === "score" && "%"}
                    </p>
                    {card.key === "score" && (
                      <div className="mb-1 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                        Confidence
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            whileHover={{ y: -8, scale: 1.01 }}
            className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl transition hover:border-emerald-400/25"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/10 to-cyan-400/5 opacity-0 transition duration-500 hover:opacity-100" />
            <div className="relative">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-500/10">
                <TrendingUp size={30} className="text-emerald-300" />
              </div>

              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
                Prediction
              </p>

              <p className="mt-4 text-2xl font-semibold leading-snug text-white sm:text-3xl">
                Possible crowd crush within 5 minutes
              </p>

              <div className="mt-5 flex items-center gap-2 text-sm text-slate-400">
                <Activity className="h-4 w-4 text-emerald-300" />
                Escalation detected in the next time window
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-8 overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-6 sm:p-8 backdrop-blur-xl"
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">
                AI Analysis
              </p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                What the model detected
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-slate-300">
              <Gauge className="h-4 w-4 text-cyan-300" />
              Real-time inference
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {analysisPoints.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
                whileHover={{ x: 4 }}
                className="flex items-start gap-4 rounded-2xl border border-white/8 bg-slate-950/40 p-4 transition hover:border-cyan-400/20 hover:bg-slate-950/60"
              >
                <span className="mt-0.5 text-lg">{item.icon}</span>
                <span className="text-sm leading-6 text-slate-300 sm:text-base">
                  {item.text}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}