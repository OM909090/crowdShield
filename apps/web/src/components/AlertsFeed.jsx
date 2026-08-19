import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { severityMeta, formatEta, timeAgo } from "../utils/riskUi";

/**
 * Renders a live list of predictor alerts (from useCrowdFeed().alerts).
 * Shared by the LiveMap overlay and the Command Center panel.
 */
export default function AlertsFeed({ alerts = [], emptyLabel = "No active alerts — all zones nominal" }) {
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
          return (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${m.badge}`}
            >
              <AlertTriangle size={15} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.zoneName || a.zoneId}</p>
                <p className="text-[11px] opacity-80">
                  {m.label}
                  {eta ? ` · critical in ~${eta}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-[10px] opacity-70">{timeAgo(a.receivedAt || a.createdAt)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
