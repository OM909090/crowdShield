/**
 * Shared risk/alert presentation helpers so the map, HUD, and alert panels all
 * speak the same colour + wording as the Tier 1 predictor (backend LEVELS).
 */

export const RISK_LEVELS = ["NORMAL", "WATCH", "ELEVATED", "HIGH", "CRITICAL"];

export const RISK_META = {
  NORMAL: { color: "#22c55e", label: "Normal", badge: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" },
  WATCH: { color: "#eab308", label: "Watch", badge: "border-yellow-400/25 bg-yellow-500/10 text-yellow-200" },
  ELEVATED: { color: "#f59e0b", label: "Elevated", badge: "border-amber-400/25 bg-amber-500/10 text-amber-200" },
  HIGH: { color: "#f97316", label: "High", badge: "border-orange-400/25 bg-orange-500/10 text-orange-200" },
  CRITICAL: { color: "#ef4444", label: "Critical", badge: "border-red-400/30 bg-red-500/15 text-red-200" },
};

export const riskMeta = (level) => RISK_META[level] || RISK_META.NORMAL;
export const riskRank = (level) => RISK_LEVELS.indexOf(level);

/**
 * Fruin level-of-service bands — the exact vocabulary the backend emits
 * (`densityLevel()` in utils/geo.js: free|comfortable|constrained|dense|
 * critical|dangerous), on both cells and tracked clusters.
 *
 * Deliberately mapped onto the SAME five colours the risk scale above uses
 * rather than a second palette. A cluster reporting "dense" sitting inside a
 * zone the predictor calls HIGH must not look like the two disagree about how
 * bad the ground is — one palette, one meaning.
 */
export const DENSITY_META = {
  free: { color: RISK_META.NORMAL.color, label: "Free flow", badge: RISK_META.NORMAL.badge },
  comfortable: { color: RISK_META.WATCH.color, label: "Comfortable", badge: RISK_META.WATCH.badge },
  constrained: { color: RISK_META.ELEVATED.color, label: "Constrained", badge: RISK_META.ELEVATED.badge },
  dense: { color: RISK_META.HIGH.color, label: "Dense", badge: RISK_META.HIGH.badge },
  critical: { color: RISK_META.CRITICAL.color, label: "Critical", badge: RISK_META.CRITICAL.badge },
  // The one band above the risk scale's ceiling: 5+ p/m² is where crush injuries
  // happen, and it has to read as worse than CRITICAL rather than identical.
  dangerous: { color: "#b91c1c", label: "Dangerous", badge: "border-red-500/40 bg-red-600/25 text-red-50" },
};

/**
 * Density not known — no cells, or an area we cannot measure.
 *
 * Grey, never green (ARCHITECTURE §17). A crowd nobody has measured painted in
 * the "safe" colour is precisely the fabrication that rule exists to prevent:
 * absent data must look absent.
 */
export const NO_DENSITY_META = {
  color: "#94a3b8",
  label: "Density unknown",
  badge: "border-white/15 bg-white/10 text-slate-300",
};

/** Fruin band → colour/label/badge. Anything missing falls to the grey unknown. */
export const densityMeta = (level) => DENSITY_META[level] || NO_DENSITY_META;

/**
 * Compact head count for tight spaces (canvas bubble labels, chips): 940, 4.3k,
 * 12k, 1.2M. Deliberately lossy — the exact figure is an estimate anyway, and a
 * five-digit number does not fit inside a bubble.
 */
export function formatCount(n) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.round(n);
  const abs = Math.abs(v);
  if (abs < 1000) return String(v);
  if (abs < 10000) {
    const k = v / 1000;
    // 4.3k, but 9k rather than 9.0k.
    const s = k.toFixed(1);
    return `${s.endsWith(".0") ? s.slice(0, -2) : s}k`;
  }
  if (abs < 1000000) return `${Math.round(v / 1000)}k`;
  return `${(v / 1000000).toFixed(1)}M`;
}

/**
 * Growth rate as people per minute. `null` means no baseline yet — shown as an
 * em dash, never as 0, which would claim we measured a crowd holding steady.
 */
export function formatGrowth(perMin) {
  if (!Number.isFinite(perMin)) return null;
  if (perMin === 0) return "0/min";
  return `${perMin > 0 ? "+" : "−"}${formatCount(Math.abs(perMin))}/min`;
}

// Alert severities are the lowercase form of the elevated levels.
const SEVERITY_META = {
  watch: RISK_META.WATCH,
  elevated: RISK_META.ELEVATED,
  high: RISK_META.HIGH,
  critical: RISK_META.CRITICAL,
};
export const severityMeta = (s) => SEVERITY_META[s] || RISK_META.ELEVATED;

/** Human-friendly time-to-critical. */
export function formatEta(sec) {
  if (sec == null || !Number.isFinite(sec)) return null;
  if (sec <= 0) return "now";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Compact relative time for alert timestamps. */
export function timeAgo(ts) {
  if (!ts) return "";
  const d = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (d < 5) return "just now";
  if (d < 60) return `${d}s ago`;
  const m = Math.floor(d / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}
