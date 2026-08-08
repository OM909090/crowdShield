import { FileText, CheckCircle2, Sparkles, AlertTriangle, Clock3, BrainCircuit } from "lucide-react";
import { motion } from "framer-motion";

const incidentReport = {
  summary:
    "At 03:45 PM, crowd density near North Gate exceeded the recommended safety limit.",
  details:
    "AI detected increasing crowd pressure, reduced movement speed, and reverse crowd flow.",
  actions: [
    "Open alternate exit routes.",
    "Deploy additional security staff.",
    "Broadcast multilingual safety alerts.",
  ],
};

const tags = [
  { label: "Auto-generated", icon: Sparkles, tone: "text-cyan-300" },
  { label: "High priority", icon: AlertTriangle, tone: "text-amber-300" },
  { label: "03:45 PM", icon: Clock3, tone: "text-slate-300" },
  { label: "AI inference", icon: BrainCircuit, tone: "text-emerald-300" },
];

export default function IncidentSummary() {
  return (
    <div className="relative min-h-[80vh] overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">
            Generative AI summary
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            AI Incident Report
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
            A concise incident brief generated from live crowd signals, risk spikes, and movement anomalies.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.05] shadow-2xl shadow-cyan-950/20 backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_35%)]" />

          <div className="relative border-b border-white/10 p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                  <FileText className="h-7 w-7 text-cyan-300" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-white">Generated Summary</h2>
                  <p className="mt-1 text-sm text-slate-400">AI-powered incident analysis</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                {tags.map((tag) => {
                  const Icon = tag.icon;
                  return (
                    <div
                      key={tag.label}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300"
                    >
                      <Icon className={`h-3.5 w-3.5 ${tag.tone}`} />
                      {tag.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="relative p-6 sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">
                    Situation brief
                  </p>
                  <p className="mt-3 text-base leading-8 text-slate-200 sm:text-lg">
                    {incidentReport.summary}
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-5">
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">
                    AI observations
                  </p>
                  <p className="mt-3 text-base leading-8 text-slate-200 sm:text-lg">
                    {incidentReport.details}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-5 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  <h3 className="text-lg font-semibold text-white">Recommended Actions</h3>
                </div>

                <ul className="space-y-4">
                  {incidentReport.actions.map((action, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: index * 0.06 }}
                      className="flex items-start gap-3 rounded-2xl border border-white/8 bg-slate-950/35 p-4 transition hover:border-emerald-400/20 hover:bg-slate-950/55"
                    >
                      <CheckCircle2
                        size={20}
                        className="mt-0.5 shrink-0 text-emerald-300"
                      />
                      <span className="text-sm leading-6 text-slate-200 sm:text-base">
                        {action}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}