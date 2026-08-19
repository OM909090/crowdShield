/**
 * The risk and density vocabulary, shared so a phone and a control room can
 * never disagree about how bad the ground is.
 *
 * Every hex here is copied from the web client's `utils/riskUi.js`, and the band
 * names are exactly what the backend emits (`densityLevel()` in
 * `backend/utils/geo.js`). If one of these drifts, a zone the predictor calls
 * HIGH could render green on a phone — which is the single worst bug this system
 * could ship. Keeping them in one typed module is the cheapest defence.
 */

/** Tier 1 predictor levels, ordered from calm to dangerous. */
export const RISK_LEVELS = ["NORMAL", "WATCH", "ELEVATED", "HIGH", "CRITICAL"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Fruin level-of-service bands, as emitted on cells, roads and clusters. */
export const DENSITY_BANDS = [
  "free",
  "comfortable",
  "constrained",
  "dense",
  "critical",
  "dangerous",
] as const;
export type DensityBand = (typeof DENSITY_BANDS)[number];

/** Alert severities — the lowercase form of the elevated risk levels. */
export const ALERT_SEVERITIES = ["watch", "elevated", "high", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/** Announcement severities (broadcast pipeline). */
export const BROADCAST_SEVERITIES = ["info", "warning", "critical"] as const;
export type BroadcastSeverity = (typeof BROADCAST_SEVERITIES)[number];

export interface LevelMeta {
  /** Fill/stroke colour. Identical across web and mobile. */
  readonly color: string;
  /** Human label for a badge or a sentence. */
  readonly label: string;
}

export const RISK_META: Readonly<Record<RiskLevel, LevelMeta>> = {
  NORMAL: { color: "#22c55e", label: "Normal" },
  WATCH: { color: "#eab308", label: "Watch" },
  ELEVATED: { color: "#f59e0b", label: "Elevated" },
  HIGH: { color: "#f97316", label: "High" },
  CRITICAL: { color: "#ef4444", label: "Critical" },
};

/**
 * Density bands map onto the SAME five colours as the risk scale rather than a
 * second palette, plus one extra step above the ceiling: 5+ people/m² is where
 * crush injuries occur and it has to read as worse than CRITICAL.
 */
export const DENSITY_META: Readonly<Record<DensityBand, LevelMeta>> = {
  free: { color: RISK_META.NORMAL.color, label: "Free flow" },
  comfortable: { color: RISK_META.WATCH.color, label: "Comfortable" },
  constrained: { color: RISK_META.ELEVATED.color, label: "Constrained" },
  dense: { color: RISK_META.HIGH.color, label: "Dense" },
  critical: { color: RISK_META.CRITICAL.color, label: "Critical" },
  dangerous: { color: "#b91c1c", label: "Dangerous" },
};

/**
 * Nothing measured here.
 *
 * Grey, never green. A crowd nobody has measured painted in the "safe" colour is
 * a fabrication, and it is the specific failure the whole "unmeasured" state in
 * the UI exists to prevent. Absent data must look absent.
 */
export const NO_DATA_META: LevelMeta = { color: "#94a3b8", label: "Not measured" };

export const riskMeta = (level: RiskLevel | null | undefined): LevelMeta =>
  (level && RISK_META[level]) || RISK_META.NORMAL;

/** Position on the risk scale; -1 when the level is unknown. */
export const riskRank = (level: RiskLevel | null | undefined): number =>
  level ? RISK_LEVELS.indexOf(level) : -1;

/** Band → meta, falling back to the grey unknown rather than to "safe". */
export const densityMeta = (band: DensityBand | null | undefined): LevelMeta =>
  (band && DENSITY_META[band]) || NO_DATA_META;

export const severityMeta = (severity: AlertSeverity | null | undefined): LevelMeta => {
  switch (severity) {
    case "watch":
      return RISK_META.WATCH;
    case "elevated":
      return RISK_META.ELEVATED;
    case "high":
      return RISK_META.HIGH;
    case "critical":
      return RISK_META.CRITICAL;
    default:
      return RISK_META.ELEVATED;
  }
};

/**
 * Pedestrian density thresholds in people/m², mirroring
 * `PEDESTRIAN.DENSITY` in `backend/utils/geo.js`. Kept here so a client can
 * classify a density it computed locally (e.g. an offline cached reading)
 * without inventing its own cut-offs.
 */
export const DENSITY_THRESHOLDS = {
  COMFORTABLE: 0.5,
  CONSTRAINED: 1.0,
  DENSE: 2.0,
  CRITICAL: 4.0,
  DANGEROUS: 5.0,
} as const;

/** Classify a density into a band. Mirrors the backend's `densityLevel()`. */
export function densityBand(density: number | null | undefined): DensityBand | null {
  if (density == null || !Number.isFinite(density)) return null;
  const d = DENSITY_THRESHOLDS;
  if (density >= d.DANGEROUS) return "dangerous";
  if (density >= d.CRITICAL) return "critical";
  if (density >= d.DENSE) return "dense";
  if (density >= d.CONSTRAINED) return "constrained";
  if (density >= d.COMFORTABLE) return "comfortable";
  return "free";
}

/** True when a level warrants telling the person something has changed. */
export const isElevated = (level: RiskLevel | null | undefined): boolean =>
  riskRank(level) >= riskRank("ELEVATED");
