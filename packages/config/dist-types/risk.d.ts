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
export declare const RISK_LEVELS: readonly ["NORMAL", "WATCH", "ELEVATED", "HIGH", "CRITICAL"];
export type RiskLevel = (typeof RISK_LEVELS)[number];
/** Fruin level-of-service bands, as emitted on cells, roads and clusters. */
export declare const DENSITY_BANDS: readonly ["free", "comfortable", "constrained", "dense", "critical", "dangerous"];
export type DensityBand = (typeof DENSITY_BANDS)[number];
/** Alert severities — the lowercase form of the elevated risk levels. */
export declare const ALERT_SEVERITIES: readonly ["watch", "elevated", "high", "critical"];
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
/** Announcement severities (broadcast pipeline). */
export declare const BROADCAST_SEVERITIES: readonly ["info", "warning", "critical"];
export type BroadcastSeverity = (typeof BROADCAST_SEVERITIES)[number];
export interface LevelMeta {
    /** Fill/stroke colour. Identical across web and mobile. */
    readonly color: string;
    /** Human label for a badge or a sentence. */
    readonly label: string;
}
export declare const RISK_META: Readonly<Record<RiskLevel, LevelMeta>>;
/**
 * Density bands map onto the SAME five colours as the risk scale rather than a
 * second palette, plus one extra step above the ceiling: 5+ people/m² is where
 * crush injuries occur and it has to read as worse than CRITICAL.
 */
export declare const DENSITY_META: Readonly<Record<DensityBand, LevelMeta>>;
/**
 * Nothing measured here.
 *
 * Grey, never green. A crowd nobody has measured painted in the "safe" colour is
 * a fabrication, and it is the specific failure the whole "unmeasured" state in
 * the UI exists to prevent. Absent data must look absent.
 */
export declare const NO_DATA_META: LevelMeta;
export declare const riskMeta: (level: RiskLevel | null | undefined) => LevelMeta;
/** Position on the risk scale; -1 when the level is unknown. */
export declare const riskRank: (level: RiskLevel | null | undefined) => number;
/** Band → meta, falling back to the grey unknown rather than to "safe". */
export declare const densityMeta: (band: DensityBand | null | undefined) => LevelMeta;
export declare const severityMeta: (severity: AlertSeverity | null | undefined) => LevelMeta;
/**
 * Pedestrian density thresholds in people/m², mirroring
 * `PEDESTRIAN.DENSITY` in `backend/utils/geo.js`. Kept here so a client can
 * classify a density it computed locally (e.g. an offline cached reading)
 * without inventing its own cut-offs.
 */
export declare const DENSITY_THRESHOLDS: {
    readonly COMFORTABLE: 0.5;
    readonly CONSTRAINED: 1;
    readonly DENSE: 2;
    readonly CRITICAL: 4;
    readonly DANGEROUS: 5;
};
/** Classify a density into a band. Mirrors the backend's `densityLevel()`. */
export declare function densityBand(density: number | null | undefined): DensityBand | null;
/** True when a level warrants telling the person something has changed. */
export declare const isElevated: (level: RiskLevel | null | undefined) => boolean;
