import {
  NO_DATA_META,
  RISK_META,
  isElevated,
  riskMeta,
  riskRank,
  type RiskLevel,
} from "@crowdshield/config";
import type { CrowdFrame, Fix, SnapshotZone } from "@crowdshield/types";

/**
 * Turn a live frame into the one thing the Home screen leads with.
 *
 * The important case is the third one. When nothing is reporting, the honest
 * answer is "unknown" — not "all clear". A phone showing green because no data
 * arrived is the single most dangerous bug this app could have, so the state is
 * modelled explicitly rather than falling out of a default.
 */

export type SituationKind = "clear" | "elevated" | "unmeasured";

export interface Situation {
  readonly kind: SituationKind;
  /** Colour for the card, badge and headline. Grey when unmeasured. */
  readonly color: string;
  /** Short badge word: Normal / High / Not measured. */
  readonly levelLabel: string;
  /** The worst zone we can see, when there is one. */
  readonly zone: SnapshotZone | null;
  readonly riskLevel: RiskLevel | null;
  /** Estimated people in the monitored area, or null when nothing is reporting. */
  readonly personsEst: number | null;
  /** Density where the person is standing, when we can attribute them to a zone. */
  readonly yourDensity: number | null;
  readonly hasFrame: boolean;
}

/** Which drawn zone contains the point, if any. */
function zoneContaining(frame: CrowdFrame, fix: Fix | null): SnapshotZone | null {
  if (!fix) return null;
  // The frame carries measurements, not geometry, so attribution to a zone needs
  // the venue polygon — the caller passes that in via `yourZone` when it has it.
  // Falling back to the worst zone would misreport someone standing somewhere calm.
  return null;
}

export function readSituation(
  frame: CrowdFrame | null,
  options: { readonly fix?: Fix | null; readonly yourZone?: SnapshotZone | null } = {}
): Situation {
  const zones = frame?.zones ?? [];
  const reporting = (frame?.totals.sampledDevices ?? 0) > 0;

  // Worst zone by risk, falling back to density when the predictor has not run.
  const worst =
    zones.reduce<SnapshotZone | null>((acc, zone) => {
      if (!acc) return zone;
      const better =
        riskRank(zone.riskLevel ?? null) > riskRank(acc.riskLevel ?? null) ||
        (zone.riskLevel === acc.riskLevel && zone.density > acc.density);
      return better ? zone : acc;
    }, null) ?? null;

  const yourZone = options.yourZone ?? zoneContaining(frame as CrowdFrame, options.fix ?? null);

  // No frame at all, or a frame in which nobody is sharing: unknown, not clear.
  if (!frame || !reporting) {
    return {
      kind: "unmeasured",
      color: NO_DATA_META.color,
      levelLabel: NO_DATA_META.label,
      zone: null,
      riskLevel: null,
      personsEst: null,
      yourDensity: null,
      hasFrame: frame !== null,
    };
  }

  const level = (worst?.riskLevel ?? null) as RiskLevel | null;
  const elevated = isElevated(level);

  return {
    kind: elevated ? "elevated" : "clear",
    color: level ? riskMeta(level).color : RISK_META.NORMAL.color,
    levelLabel: level ? riskMeta(level).label : RISK_META.NORMAL.label,
    zone: worst,
    riskLevel: level,
    personsEst: frame.totals.personsEst,
    yourDensity: yourZone?.density ?? null,
    hasFrame: true,
  };
}

/** People count for display. Indian grouping, matching the web client. */
export const formatPeople = (n: number | null): string =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-IN");

/** Seconds → "4 min" / "40s". Mirrors the web's formatEta. */
export function formatEta(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  if (seconds <= 0) return "now";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

/** Metres → "598 m" / "1.2 km". */
export function formatDistance(metres: number | null | undefined): string | null {
  if (metres == null || !Number.isFinite(metres)) return null;
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * Epoch ms → "now" / "8s" / "3m". How long ago the last frame arrived, on the
 * device's own clock. Used for the Home "updated" readout so it stays honest —
 * and keeps counting up — when the feed falls quiet, instead of a fixed "now".
 */
export function formatAgo(atMs: number | null | undefined): string | null {
  if (atMs == null || !Number.isFinite(atMs)) return null;
  const sec = Math.max(0, Math.round((Date.now() - atMs) / 1000));
  if (sec < 5) return "now";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h`;
}
