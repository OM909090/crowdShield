import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldCheck, Check, Loader2 } from "lucide-react";
import { severityMeta, formatEta, timeAgo } from "../utils/riskUi";

/**
 * Renders a live list of predictor alerts (from useCrowdFeed().alerts).
 * Shared by the LiveMap overlay and the Command Center panel.
 *
 * Acknowledgement is OPT-IN via `onAcknowledge`. The backend has always been able
 * to record "an authority has seen this" (PATCH …/alerts/:id/ack) but nothing in
 * the web app ever called it, so an operator had no way to mark an alert as
 * handled and the feed read the same whether or not anybody had looked. Only the
 * authority console passes the handler; the citizen-facing rail stays read-only,
 * because a citizen acknowledging a crush warning would be meaningless.
 *
 * @param {Array}  alerts
 * @param {string} emptyLabel
 * @param {(alertId:string)=>Promise<any>} [onAcknowledge] authority-only handler
 * @param {Set<string>} [acknowledgedIds] ids already acked this session
 */
export default function AlertsFeed({
  alerts = [],
  emptyLabel = "No active alerts — all zones nominal",
  onAcknowledge = null,
  acknowledgedIds = null,
}) {
  // In-flight ids, so a double-click can't fire two PATCHes for one alert.
  const [busy, setBusy] = useState(() => new Set());

  const isAcked = (a) =>
    a.status === "acknowledged" || (acknowledgedIds ? acknowledgedIds.has(a.id) : false);

  const ack = async (id) => {
    if (!onAcknowledge || busy.has(id)) return;
    setBusy((prev) => new Set(prev).add(id));
    try {
      await onAcknowledge(id);
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (!alerts.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-2.5 text-xs text-emerald-200/80">
        <ShieldCheck size={15} />
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {alerts.map((a) => {
          const m = severityMeta(a.severity);
          const eta = formatEta(a.etaCriticalSec);
          const acked = isAcked(a);
          const inFlight = busy.has(a.id);
          return (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${m.badge} ${
                acked ? "opacity-70" : ""
              }`}
            >
              <AlertTriangle size={15} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.zoneName || a.zoneId}</p>
                <p className="text-[11px] opacity-80">
                  {m.label}
                  {eta ? ` · critical in ~${eta}` : ""}
                  {acked ? " · acknowledged" : ""}
                </p>
              </div>

              {onAcknowledge && !acked && (
                <button
                  type="button"
                  onClick={() => ack(a.id)}
                  disabled={inFlight}
                  title="Mark as seen by the control room"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition hover:bg-white/20 disabled:opacity-50"
                >
                  {inFlight ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Ack
                </button>
              )}
              {onAcknowledge && acked && <Check size={14} className="shrink-0 opacity-80" />}

              <span className="shrink-0 text-[10px] opacity-70">{timeAgo(a.receivedAt || a.createdAt)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
