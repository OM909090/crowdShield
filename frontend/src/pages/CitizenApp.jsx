import {
  MapPin,
  Bell,
  Navigation,
  ShieldCheck,
  Languages,
  PhoneCall,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Route,
  Waves,
  Radar,
  Info,
} from "lucide-react";
import { motion } from "framer-motion";

const alerts = [
  {
    id: 1,
    title: "High Crowd Density",
    desc: "Main Gate area is becoming crowded. Use East Exit.",
    level: "HIGH",
  },
  {
    id: 2,
    title: "Safe Route Available",
    desc: "AI recommends alternate route through Zone B.",
    level: "SAFE",
  },
];

const cardStyle = `
rounded-3xl
border border-white/10
bg-white/[0.05]
p-6
backdrop-blur-xl
transition-all
duration-300
`;

const levelTone = {
  HIGH: "border-red-400/20 bg-red-500/10 text-red-200",
  SAFE: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
};

export default function CitizenApp() {
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl space-y-8 px-5 py-8 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Citizen-facing safety companion
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Citizen Safety App
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Receive live alerts, view safe routes, and request emergency support during crowd incidents.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Mode", "Live"],
              ["Alerts", "2 Active"],
              ["Route", "Optimized"],
              ["Language", "Multilingual"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <motion.div
            whileHover={{ y: -6 }}
            className={`${cardStyle} border-green-400/20 bg-green-500/10`}
          >
            <ShieldCheck size={34} className="text-green-300" />
            <h2 className="mt-4 text-xl font-bold">Current Safety</h2>
            <p className="mt-3 text-3xl font-black text-green-300">SAFE</p>
            <p className="mt-3 text-sm leading-6 text-slate-200/80">
              No immediate threat detected in your current zone.
            </p>
          </motion.div>

          <motion.div whileHover={{ y: -6 }} className={cardStyle}>
            <MapPin size={34} className="text-cyan-300" />
            <h2 className="mt-4 text-xl font-bold">Your Location</h2>
            <p className="mt-3 text-slate-300">
              Zone A
              <br />
              Near Main Entrance
            </p>
          </motion.div>

          <motion.div whileHover={{ y: -6 }} className={cardStyle}>
            <Navigation size={34} className="text-blue-300" />
            <h2 className="mt-4 text-xl font-bold">Recommended Exit</h2>
            <p className="mt-3 text-slate-300">
              East Gate
              <br />
              450 meters away
            </p>
          </motion.div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45 }}
            className={`${cardStyle}`}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">
                  Live Safety Alerts
                </p>
                <h2 className="mt-2 text-2xl font-bold">Current warnings</h2>
              </div>
              <Bell className="h-5 w-5 text-amber-300" />
            </div>

            <div className="space-y-4">
              {alerts.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  whileHover={{ scale: 1.01, x: 4 }}
                  className="flex gap-4 rounded-2xl border border-white/8 bg-slate-950/35 p-5 transition hover:border-cyan-400/15 hover:bg-slate-950/55"
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${
                      levelTone[item.level]
                    }`}
                  >
                    <Bell size={20} className="text-amber-300" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{item.title}</h3>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                          levelTone[item.level]
                        }`}
                      >
                        {item.level}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45 }}
            className={`${cardStyle}`}
          >
            <div className="mb-5 flex items-center gap-2">
              <Route className="h-5 w-5 text-cyan-300" />
              <h2 className="text-2xl font-bold">AI Safe Route</h2>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))] p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">
                    Navigation path
                  </p>
                  <p className="mt-2 text-sm text-slate-400">
                    Suggested low-risk escape sequence
                  </p>
                </div>
                <Radar className="h-5 w-5 text-cyan-300" />
              </div>

              <div className="space-y-4">
                {["You", "Zone B", "East Exit"].map((step, index) => (
                  <div key={step} className="flex items-center gap-4">
                    <div
                      className={`flex h-12 flex-1 items-center justify-center rounded-2xl border text-sm font-semibold ${
                        index === 0
                          ? "border-white/10 bg-white/10 text-white"
                          : index === 1
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                          : "border-cyan-400/20 bg-cyan-500/10 text-cyan-200"
                      }`}
                    >
                      {step}
                    </div>
                    {index < 2 && <ArrowRight className="h-4 w-4 text-slate-400" />}
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-400/15 bg-cyan-400/10 p-4">
                <div className="flex items-start gap-3">
                  <Waves className="mt-0.5 h-5 w-5 text-cyan-300" />
                  <p className="text-sm leading-6 text-slate-200">
                    Keep moving toward the east corridor. Avoid Main Gate congestion and follow the marked direction indicators.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-3 rounded-3xl border border-red-500/30 bg-red-500/15 p-6 text-xl font-bold text-red-100 transition hover:bg-red-500/25"
            aria-label="Emergency SOS"
          >
            <PhoneCall />
            Emergency SOS
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-xl font-bold text-white transition hover:bg-white/10"
            aria-label="Change language"
          >
            <Languages />
            Change Language
          </motion.button>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 text-cyan-300" />
            <div>
              <h3 className="font-semibold text-white">Citizen guidance</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                If you feel unsafe, trigger SOS immediately and follow the recommended exit route shown above.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}