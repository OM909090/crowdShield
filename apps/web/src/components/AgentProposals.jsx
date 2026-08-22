import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, ShieldCheck, Check, X, Play, Loader2, AlertTriangle, Megaphone, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { getSocket } from "../utils/socket";
import { severityMeta, timeAgo } from "../utils/riskUi";

/**
 * "Alerts from agent" — the guardian agent's live decisions, beside the map.
 *
 * Each alert shows the PROOF, not just a sentence: the severity, why it fired,
 * the agent's reading, and the concrete actions split by who they protect —
 * citizens first (the people in danger, who can move in seconds), then the
 * command-side moves the operator authorizes. Advisory actions are already
 * applied; consequential ones ("needs approval") gate the Approve / Reject
 * controls.
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

// The panel scrolls, but keep the list bounded so a long-running event can't
// pile up hundreds of rows (DOM + memory). Newest-first, so this keeps the ones
// that matter.
const MAX_PROPOSALS = 40;

// What each action does, in the operator's words, and who it is aimed at.
const CITIZEN_ACTIONS = new Set(["broadcast_alert", "direct_crowd", "draw_route"]);
const ACTION_VERB = {
  broadcast_alert: "Alert citizens",
  direct_crowd: "Divert crowd",
  draw_route: "Draw route",
  flag_area: "Flag danger area",
  suggest_barricade: "Suggest barricade",
  open_gate: "Open gate",
  close_gate: "Close gate",
  deploy_units: "Deploy units",
  highlight_zone: "Highlight zone",
  set_routing_policy: "Set corridor flow",
  suggest_placement: "Asked authority to place",
};

/** The concrete target/message that proves what the action actually does. */
function actionDetail(a) {
  switch (a.type) {
    case "broadcast_alert":
      return a.message || a.text || "";
    case "direct_crowd":
      return [a.from, a.to].filter(Boolean).join(" → ");
    case "draw_route":
      return [a.fromNodeId || a.from, a.toNodeId || a.to].filter(Boolean).join(" → ");
    case "flag_area":
      return a.clusterId || "";
    case "suggest_barricade":
      return [a.edgeId || a.nodeId, a.reason].filter(Boolean).join(" · ");
    case "open_gate":
    case "close_gate":
      return a.gateId || "";
    case "highlight_zone":
      return a.zoneId || "";
    case "suggest_placement":
      return [String(a.kind || "").replace(/_/g, " "), a.targetName, a.reason].filter(Boolean).join(" · ");
    case "set_routing_policy":
      return [a.edgeId, a.direction].filter(Boolean).join(" · ");
    case "deploy_units":
      return [a.zoneId || a.nodeId, a.count ? `${a.count} units` : ""].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

const TRIGGER_LABEL = {
  crowd_condition: "crowd build-up",
  risk_escalation: "zone escalation",
  manual: "manual run",
  alert: "alert",
};

/** One group of actions (citizens or command), rendered as evidence rows. */
function ActionGroup({ title, icon, items, accent }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {icon}
        {title}
      </p>
      <div className="space-y-1.5">
        {items.map((a, i) => {
          const consequential = a?.klass === "consequential";
          const detail = actionDetail(a);
          return (
            <div
              key={`${a?.type || "action"}-${i}`}
              className={`flex items-start justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${
                consequential ? "border-amber-400/25 bg-amber-500/[0.07]" : `border-white/10 bg-white/[0.03]`
              }`}
            >
              <div className="min-w-0">
                <span className={`text-xs font-semibold ${accent}`}>{ACTION_VERB[a?.type] || a?.type}</span>
                {detail && <span className="ml-1.5 text-xs text-slate-300 break-words">{detail}</span>}
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  consequential ? "bg-amber-400/20 text-amber-100" : "bg-white/10 text-slate-400"
                }`}
              >
                {consequential ? "needs approval" : "applied"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  const fetchProposals = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await api.get(`/events/${eventId}/agent/proposals`);
      setProposals((res.data?.proposals || []).slice(0, MAX_PROPOSALS));
    } catch {
      /* keep the last-good list — header actions stay usable */
    }
  }, [eventId]);

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

  // Live pushes: join the event room and listen for agent proposals. We only
  // remove our own listener on unmount (never emit "unsubscribe") so we don't
  // tear down the crowd feed sharing this single socket connection.
  useEffect(() => {
    if (!eventId) return undefined;
    const socket = getSocket();

    const join = () => socket.emit("subscribe", { eventId });
    const onProposal = (p) => {
      if (!p) return;
      if (p.eventId && String(p.eventId) !== String(eventId)) return;
      setProposals((prev) => {
        if (p._id && prev.some((x) => x._id === p._id)) {
          return prev.map((x) => (x._id === p._id ? p : x));
        }
        // Keep only the most recent alerts. The panel scrolls, but an event that
        // runs for hours would otherwise pile up hundreds of DOM rows and leak
        // memory; the newest are the ones that matter.
        return [p, ...prev].slice(0, MAX_PROPOSALS);
      });
      toast("New alert from the agent", { icon: "🛡" });
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
      await fetchProposals();
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
    setProposals((prev) => prev.map((p) => (p._id === pid ? { ...p, status: nextStatus } : p)));
    try {
      const res = await api.patch(`/events/${eventId}/agent/proposals/${pid}/${decision}`);
      const updated = res.data?.proposal;
      if (updated) setProposals((prev) => prev.map((p) => (p._id === pid ? updated : p)));
      toast.success(decision === "approve" ? "Approved — sending to citizens/units" : "Proposal rejected");
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't update the proposal");
      fetchProposals();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6">
      {/* Header (fixed) */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10">
            <Bot size={20} className="text-cyan-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Guardian agent</p>
            <h2 className="mt-1 text-xl font-bold text-white">Alerts from agent</h2>
          </div>
        </div>
        <button
          onClick={runAgent}
          disabled={running || !eventId}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          Run now
        </button>
      </div>

      {/* Body (scrolls; matched to the map's height by the parent) */}
      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 size={16} className="animate-spin text-cyan-300" />
            Loading alerts…
          </div>
        ) : proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] py-10 text-center">
            <ShieldCheck size={22} className="text-emerald-300/80" />
            <p className="text-sm font-medium text-slate-300">All clear — no alerts</p>
            <p className="max-w-xs text-xs leading-5 text-slate-500">
              The agent watches the live crowd and posts an alert here the moment an area needs attention — with who it
              is telling and what to do.
            </p>
          </div>
        ) : (
          <motion.div layout className="space-y-3">
            <AnimatePresence initial={false}>
              {proposals.map((p) => {
                const sev = severityMeta(String(p.severity || "").toLowerCase());
                const showControls = p.status === "proposed" && hasConsequential(p);
                const isBusy = busyId === p._id;
                const actions = p.actions || [];
                const citizen = actions.filter((a) => CITIZEN_ACTIONS.has(a.type));
                const command = actions.filter((a) => !CITIZEN_ACTIONS.has(a.type));
                const triggerLabel = TRIGGER_LABEL[p.trigger] || (p.trigger ? String(p.trigger) : null);
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
                    {/* severity + why + status + time */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
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
                        {triggerLabel && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
                            {triggerLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.createdAt && <span className="text-[10px] text-slate-500">{timeAgo(p.createdAt)}</span>}
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${statusTone(
                            p.status
                          )}`}
                        >
                          {p.status || "proposed"}
                        </span>
                      </div>
                    </div>

                    {/* The agent's reading — the proof narrative */}
                    {p.reasoning && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{p.reasoning}</p>
                    )}

                    {/* Actions grouped by audience — citizens first */}
                    {actions.length > 0 ? (
                      <>
                        <ActionGroup
                          title="To citizens — alert & divert"
                          icon={<Megaphone size={11} className="text-cyan-300" />}
                          items={citizen}
                          accent="text-cyan-200"
                        />
                        <ActionGroup
                          title="To command"
                          icon={<ShieldAlert size={11} className="text-amber-300" />}
                          items={command}
                          accent="text-slate-200"
                        />
                      </>
                    ) : (
                      !p.parseFailed && (
                        <p className="mt-3 text-xs italic text-slate-500">
                          No action needed — monitoring.
                        </p>
                      )
                    )}

                    {/* Approve / Reject — proposed items with consequential actions */}
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
    </div>
  );
}
