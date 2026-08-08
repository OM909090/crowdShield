import { useMemo } from "react";
import { Bot, Mic, Send, User, Sparkles, ArrowUpRight, Volume2, BrainCircuit } from "lucide-react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";

const messages = [
  {
    sender: "user",
    text: "What is happening near Gate A?",
  },
  {
    sender: "ai",
    text: `Crowd density near Gate A has increased by 45%.

Recommended actions:

• Open Gate B
• Deploy security team
• Broadcast safety message`,
  },
];

export default function AIAssistant() {
  const { register, handleSubmit, reset, watch } = useForm({
    defaultValues: { message: "" },
  });

  const messageValue = watch("message");

  const sendMessage = (data) => {
    console.log(data.message);
    reset();
  };

  const quickPrompts = useMemo(
    () => [
      "What is the safest exit right now?",
      "Where is the bottleneck forming?",
      "Should we open or close any gate?",
      "Generate a public safety announcement.",
    ],
    []
  );

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Multilingual incident assistant
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              AI Command Assistant
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Ask about crowd conditions, routes, bottlenecks, announcements, and response actions in real time.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Mode", "Live"],
              ["Language", "Multilingual"],
              ["Latency", "Low"],
              ["Assist", "24/7"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl sm:p-8">
            <div className="mb-8 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                <Bot size={30} className="text-cyan-300" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">CrowdHelp AI</h2>
                <p className="text-sm text-slate-400">Ask about crowd situations</p>
              </div>
            </div>

            <div className="space-y-5 max-h-[520px] overflow-y-auto pr-2">
              {messages.map((msg, index) => {
                const isUser = msg.sender === "user";
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.06 }}
                    className={`flex gap-3 rounded-3xl border p-4 ${
                      isUser
                        ? "border-cyan-400/15 bg-cyan-500/10"
                        : "border-emerald-400/15 bg-emerald-500/10"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        isUser ? "bg-cyan-400/15 text-cyan-300" : "bg-emerald-400/15 text-emerald-300"
                      }`}
                    >
                      {isUser ? <User size={18} /> : <Bot size={18} />}
                    </div>

                    <div className="min-w-0">
                      <span className="mb-2 block text-sm font-semibold text-white">
                        {isUser ? "User" : "AI"}
                      </span>
                      <p className="whitespace-pre-line text-sm leading-7 text-slate-200 sm:text-base">
                        {msg.text}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:bg-cyan-400/10 hover:text-cyan-200"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit(sendMessage)} className="mt-6 flex gap-3">
              <div className="relative flex-1">
                <BrainCircuit className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  {...register("message")}
                  placeholder="Ask AI assistant..."
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-11 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950"
                />
              </div>

              <motion.button
                type="submit"
                disabled={!messageValue}
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <Send size={18} />
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-white transition hover:bg-white/10"
                aria-label="Voice input"
              >
                <Mic size={18} />
              </motion.button>
            </form>
          </div>

          <div className="space-y-5">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
              <div className="mb-5 flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-cyan-300" />
                <h3 className="text-lg font-bold">Suggested prompts</h3>
              </div>

              <div className="space-y-3">
                {quickPrompts.map((prompt, index) => (
                  <motion.div
                    key={prompt}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.05 }}
                    className="rounded-2xl border border-white/8 bg-slate-950/40 p-4 text-sm leading-6 text-slate-300 transition hover:border-cyan-400/15 hover:bg-slate-950/60"
                  >
                    {prompt}
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
              <div className="mb-4 flex items-center gap-2">
                <Volume2 className="h-5 w-5 text-emerald-300" />
                <h3 className="text-lg font-bold">Voice-ready control</h3>
              </div>
              <p className="text-sm leading-7 text-slate-400">
                Integrate speech-to-text later for hands-free command center use during emergencies.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}