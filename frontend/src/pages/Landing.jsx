import { useMemo } from "react";
import {
  ShieldCheck,
  Map,
  BrainCircuit,
  Users,
  Bell,
  Activity,
  Radar,
  ArrowRight,
  ShieldAlert,
  Waves,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";

const features = [
  {
    icon: Users,
    title: "Crowd Density Monitoring",
    desc: "Real-time estimation of crowd concentration, movement pressure, and flow shifts.",
  },
  {
    icon: BrainCircuit,
    title: "AI Risk Prediction",
    desc: "Forecast crowd crush, surge, and stampede risk before dangerous escalation.",
  },
  {
    icon: Map,
    title: "Smart Evacuation Routes",
    desc: "Recommend the safest exits and dynamically optimize crowd movement paths.",
  },
  {
    icon: Bell,
    title: "Instant Alerts",
    desc: "Notify authorities and citizens with critical, location-aware danger updates.",
  },
];

const stats = [
  ["99%", "Prediction Accuracy"],
  ["Real Time", "Monitoring"],
  ["24/7", "Protection"],
  ["AI", "Powered"],
];

const floatingVariants = {
  animate: {
    y: [0, -12, 0],
    rotate: [0, 2, 0, -2, 0],
    transition: {
      duration: 7,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 1) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.12,
      duration: 0.55,
      ease: "easeOut",
    },
  }),
};

const navButton =
  "px-4 sm:px-5 py-2.5 rounded-xl transition-all duration-300 font-medium";

export default function Landing() {
  const orbDots = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        delay: Math.random() * 3,
        size: Math.random() > 0.5 ? "w-1.5 h-1.5" : "w-1 h-1",
      })),
    []
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_26%),radial-gradient(circle_at_bottom,_rgba(14,165,233,0.1),_transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <nav className="flex items-center justify-between py-6 sm:py-7 border-b border-white/10">
          <NavLink to="/" className="group flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
              <ShieldCheck className="h-6 w-6 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
                CrowdHelp
              </h1>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
                AI Crowd Safety System
              </p>
            </div>
          </NavLink>

          <div className="flex items-center gap-2 sm:gap-3">
            <NavLink
              to="/login"
              className={`${navButton} border border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-white/25`}
            >
              Login
            </NavLink>

            <NavLink
              to="/signup"
              className={`${navButton} bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-lg shadow-cyan-500/20 hover:scale-[1.03]`}
            >
              Get Started
            </NavLink>

            <NavLink
              to="/dashboard"
              className={`${navButton} hidden sm:inline-flex border border-cyan-400/25 bg-cyan-400/5 text-cyan-300 hover:bg-cyan-400/10`}
            >
              Dashboard
            </NavLink>
          </div>
        </nav>

        <section className="grid items-center gap-12 py-14 md:grid-cols-2 md:py-20 lg:py-24">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="relative z-10"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200 backdrop-blur-xl">
              <Sparkles className="h-4 w-4" />
              Predict risk before it becomes chaos
            </div>

            <h2 className="max-w-2xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              AI-Powered
              <br />
              <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
                Crowd Safety
              </span>
              <br />
              Prediction System
            </h2>

            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Detect abnormal density build-up, predict crowd crush risk,
              identify bottlenecks, and recommend evacuation actions in real
              time before incidents escalate.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <NavLink to="/crowd">
                <motion.button
                  whileHover={{ scale: 1.04, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-7 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition"
                >
                  Start Monitoring
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </motion.button>
              </NavLink>

              <NavLink to="/dashboard">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-7 py-3.5 font-semibold text-white backdrop-blur-xl transition hover:bg-white/10 hover:border-white/25"
                >
                  Explore Dashboard
                </motion.button>
              </NavLink>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-2 gap-4">
              {[
                { icon: Radar, label: "Live risk heatmaps" },
                { icon: Activity, label: "Dynamic congestion tracking" },
                { icon: ShieldAlert, label: "Emergency response guidance" },
                { icon: Waves, label: "Multilingual public alerts" },
              ].map((item, index) => (
                <motion.div
                  key={item.label}
                  custom={index}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl"
                >
                  <item.icon className="mb-3 h-5 w-5 text-cyan-300" />
                  <p className="text-sm text-slate-300">{item.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92, rotateX: 10 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative mx-auto w-full max-w-[560px]"
          >
            <div className="absolute -left-8 top-10 h-24 w-24 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="absolute -right-10 bottom-8 h-28 w-28 rounded-full bg-blue-500/20 blur-3xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.12),_transparent_35%)]" />

              <div className="relative grid gap-4">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                      Live Venue Status
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      Crowd Pressure Index
                    </p>
                  </div>
                  <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                    Monitoring
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-[1.35fr_0.65fr]">
                  <div className="relative flex min-h-[320px] items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.92))]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_50%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(255,255,255,0.02)_36%,transparent_37%)] bg-[size:28px_28px] opacity-30" />

                    {orbDots.map((dot) => (
                      <motion.span
                        key={dot.id}
                        variants={floatingVariants}
                        animate="animate"
                        className={`absolute ${dot.size} rounded-full bg-cyan-200/80 shadow-[0_0_12px_rgba(34,211,238,0.8)]`}
                        style={{ top: dot.top, left: dot.left }}
                      />
                    ))}

                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                      className="absolute h-56 w-56 rounded-full border border-cyan-400/30"
                    />
                    <motion.div
                      animate={{ rotate: -360 }}
                      transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
                      className="absolute h-40 w-40 rounded-full border border-blue-400/20"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                      className="relative z-10 flex h-32 w-32 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 shadow-[0_0_60px_rgba(34,211,238,0.18)]"
                    >
                      <ShieldCheck className="h-14 w-14 text-cyan-300" />
                    </motion.div>

                    <div className="absolute left-4 top-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-xs text-red-200 backdrop-blur-xl">
                      <p className="font-semibold">High Risk Zone</p>
                      <p className="mt-1 text-red-100/80">Density rising fast</p>
                    </div>

                    <div className="absolute bottom-4 left-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200 backdrop-blur-xl">
                      <p className="font-semibold">Safe Route</p>
                      <p className="mt-1 text-emerald-100/80">Recommended evacuation path</p>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {[
                      { label: "Density", value: "82%", tone: "text-amber-300" },
                      { label: "Crush Risk", value: "High", tone: "text-red-300" },
                      { label: "Flow Rate", value: "Stable", tone: "text-emerald-300" },
                      { label: "Alerts", value: "3 Active", tone: "text-cyan-300" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                          {item.label}
                        </p>
                        <p className={`mt-2 text-2xl font-bold ${item.tone}`}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section className="py-6 sm:py-10">
          <div className="mb-10 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">
                Core Capabilities
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Intelligent Crowd Management
              </h2>
            </div>
            <div className="hidden md:block max-w-md text-right text-sm text-slate-400">
              Real-time analytics, route intelligence, and automated interventions
              designed for low-cost deployment and high reliability.
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {features.map((item, index) => (
              <motion.div
                key={item.title}
                custom={index}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.25 }}
                whileHover={{ y: -10, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 220, damping: 18 }}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl transition hover:border-cyan-400/30"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_35%)] opacity-0 transition duration-500 group-hover:opacity-100" />
                <div className="relative">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10 text-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.12)]">
                    <item.icon size={28} />
                  </div>
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 leading-7 text-slate-300">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(([value, label], index) => (
            <motion.div
              key={label}
              custom={index}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center backdrop-blur-xl"
            >
              <h3 className="text-4xl font-black text-cyan-300">{value}</h3>
              <p className="mt-3 text-sm uppercase tracking-[0.28em] text-slate-400">
                {label}
              </p>
            </motion.div>
          ))}
        </section>
      </div>
    </div>
  );
}