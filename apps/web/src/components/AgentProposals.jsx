import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, ShieldCheck, Check, X, Play, Loader2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { getSocket } from "../utils/socket";
import { severityMeta, timeAgo } from "../utils/riskUi";

/**
 * Authority Command Center panel for the autonomous AI agent.
 *
 * - GETs the event's proposals on mount and renders them as cards.
 * - Advisory actions are badged "auto" (muted); consequential actions are
 *   badged "needs approval" (amber) and gate the Approve / Reject controls.
 * - "Run agent now" manually triggers a proposal for the demo.
 * - Subscribes to the shared socket's `agent:proposal` for live pushes.
 *
 * Props: { eventId }
 */

const STATUS_TONE = {
  proposed: "border-cyan-400/25 bg-cyan-500/10 text-cyan-200",
  approved: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
  rejected: "border-red-400/25 bg-red-500/10 text-red-200",
  executed: "border-violet-400/25 bg-violet-500/10 text-violet-200",
};
const statusTone = (s) => STATUS_TONE[s] || "border-white/10 bg-white/5 text-slate-300";

const hasConsequential = (p) => (p.actions || []).some((a) => a?.klass === "consequential");

export default function AgentProposals({ eventId }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [trackedId, setTrackedId] = useState(eventId);

  // Reset the panel when the event changes — the same "adjust state during
  // render" pattern useCrowdFeed uses (keeps setState out of the effect body).
  if (eventId !== trackedId) {
    setTrackedId(eventId);
    setProposals([]);
    setBusyId(null);
    setLoading(true);
  }

  // Refetch helper (used after a run or a failed optimistic update). Does not
  // toggle the loading skeleton so live updates don't flicker the panel.
  const fetchProposals = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await api.get(`/events/${eventId}/agent/proposals`);
      setProposals(res.data?.proposals || []);
    } catch {
      /* keep the last-good list — header actions stay usable */
    }
  }, [eventId]);

  // Initial (and per-event) load. `loading` starts true and is re-armed above
  // on event change; the async continuation flips it off after the fetch.
  useEffect(() => {
    let alive = true;
    (async () => {
      await fetchProposals();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fetchProposals]);

  // Live pushes: join the event room and listen for agent proposals.
  // Mirrors the subscribe/off pattern in useCrowdFeed; we only remove our own
  // listener on unmount (never emit "unsubscribe") so we don't tear down the
  // crowd feed that shares this single socket connection.
  useEffect(() => {
    if (!eventId) return undefined;
    const socket = getSocket();

    const join = () => socket.emit("subscribe", { eventId });
    const onProposal = (p) => {
      if (!p) return;
      if (p.eventId && String(p.eventId) !== String(eventId)) return; // other event
      setProposals((prev) => {
        if (p._id && prev.some((x) => x._id === p._id)) {
          return prev.map((x) => (x._id === p._id ? p : x)); // update in place
        }
        return [p, ...prev]; // prepend newest
      });
      toast("New AI recommendation", { icon: "🤖" });
    };

    socket.on("connect", join);
    socket.on("agent:proposal", onProposal);
    if (socket.connected) join();

    return () => {
      socket.off("connect", join);
      socket.off("agent:proposal", onProposal);
    };
  }, [eventId]);

  const runAgent = async () => {
    if (!eventId || running) return;
    setRunning(true);
    try {
      const res = await api.post(`/events/${eventId}/agent/run`);
      toast.success(res.data?.message || "Agent run complete");
      await fetchProposals(); // socket may also push; refetch keeps us honest
    } catch (err) {
      toast.error(err.response?.data?.message || "Agent run failed");
    } finally {
      setRunning(false);
    }
  };

  const decide = async (proposal, decision) => {
    const pid = proposal._id;
    if (!pid || busyId) return;
    const nextStatus = decision === "approve" ? "approved" : "rejected";
    setBusyId(pid);
    // Optimistic status flip.
    setProposals((prev) => prev.map((p) => (p._id === pid ? { ...p, status: nextStatus } : p)));
    try {
      const res = await api.patch(`/events/${eventId}/agent/proposals/${pid}/${decision}`);
      const updated = res.data?.proposal;
      if (updated) {
        setProposals((prev) => prev.map((p) => (p._id === pid ? updated : p)));
      }
      toast.success(decision === "approve" ? "Proposal approved" : "Proposal rejected");
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't update the proposal");
      fetchProposals(); // reconcile with the server on failure
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
            <Bot size={20} className="text-cyan-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">AI Agent</p>
            <h2 className="mt-1 text-xl font-bold text-white">Autonomous proposals</h2>
          </div>
        </div>
        <button
          onClick={runAgent}
          disabled={running || !eventId}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          Run agent now
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 size={16} className="animate-spin text-cyan-300" />
          Loading recommendations…
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] py-10 text-center">
          <ShieldCheck size={22} className="text-emerald-300/80" />
          <p className="text-sm font-medium text-slate-300">No AI recommendations yet</p>
          <p className="max-w-xs text-xs leading-5 text-slate-500">
            The agent will post proposals here as conditions change — or run it now.
          </p>
        </div>
      ) : (
        <motion.div layout className="space-y-3">
          <AnimatePresence initial={false}>
            {proposals.map((p) => {
              const sev = severityMeta(String(p.severity || "").toLowerCase());
              const showControls = p.status === "proposed" && hasConsequential(p);
              const isBusy = busyId === p._id;
              return (
                <motion.div
                  key={p._id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  {/* Row: severity + status + time */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* A pass whose reply we couldn't read has no severity read —
                        showing "LOW" there would look like an all-clear. */}
                    {p.parseFailed ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                        <AlertTriangle size={11} />
                        Unreadable reply
                      </span>
                    ) : (
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${sev.badge}`}
                      >
                        {sev.label}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      {p.createdAt && (
                        <span className="text-[10px] text-slate-500">{timeAgo(p.createdAt)}</span>
                      )}
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${statusTone(
                          p.status
                        )}`}
                      >
                        {p.status || "proposed"}
                      </span>
                    </div>
                  </div>

                  {/* Reasoning */}
                  {p.reasoning && (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{p.reasoning}</p>
                  )}

                  {/* Actions as chips */}
                  {(p.actions || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.actions.map((a, i) => {
                        const consequential = a?.klass === "consequential";
                        return (
                          <span
                            key={`${p._id}-${a?.type || "action"}-${i}`}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                              consequential
                                ? "border-amber-400/25 bg-amber-500/10 text-amber-200"
                                : "border-white/10 bg-white/5 text-slate-300"
                            }`}
                          >
                            <span className="font-medium">{a?.type || "action"}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                                consequential ? "bg-amber-400/20 text-amber-100" : "bg-white/10 text-slate-400"
                              }`}
                            >
                              {consequential ? "needs approval" : "auto"}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Approve / Reject — only for proposed items with consequential actions */}
                  {showControls && (
                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => decide(p, "approve")}
                        disabled={isBusy}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        Approve
                      </button>
                      <button
                        onClick={() => decide(p, "reject")}
                        disabled={isBusy}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X size={15} />
                        Reject
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
