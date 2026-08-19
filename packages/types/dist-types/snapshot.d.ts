import type { AlertSeverity, DensityBand, NodeState, NodeType, RiskLevel, ZoneType } from "@crowdshield/config";
import type { LatLng } from "./geo";
/**
 * The Situation Snapshot — one derived read model of the live crowd.
 *
 * It never contains an individual's coordinates, only aggregates. That is a
 * design constraint, not an omission: the privacy promise made to citizens is
 * that the system sees density hexagons rather than people, and this type is
 * where that promise is kept.
 *
 * A recurring rule across every field below: a quantity we could not measure is
 * `null`, never `0`. Zero is a claim ("we looked, there was nobody"); null is the
 * truth ("we have no reading"). Clients must render the two differently.
 */
export interface Totals {
    /** Devices actually reporting inside the boundary. */
    readonly sampledDevices: number;
    /** Estimated real population = sampledDevices / participationRate. */
    readonly personsEst: number;
    readonly participationRate: number;
    readonly occupiedCells: number;
    /** False when no boundary has been drawn, so nothing is being filtered. */
    readonly coverageDefined: boolean;
    /** Devices excluded for falling outside the boundary — an arriving surge. */
    readonly outsideCoverage: number;
    readonly outsideEst: number;
}
/** One H3 hexagon of aggregated crowd. */
export interface Cell {
    readonly h3: string;
    readonly center: LatLng;
    /** Raw reporting devices in this cell. */
    readonly count: number;
    readonly personsEst: number;
    readonly density: number;
    readonly level: DensityBand;
    readonly status: string;
    readonly speedSamples: number;
    readonly dirSamples: number;
    /** null when no device in the cell reported motion. */
    readonly meanSpeed: number | null;
    readonly speedVar: number | null;
    /** 0..1 — how aligned the movement is. High coherence + low speed is a crush signature. */
    readonly dirCoherence: number | null;
    readonly flowBearing: number | null;
}
/** A zone the authority drew, decorated with live measurement and Tier 1 risk. */
export interface SnapshotZone {
    readonly id: string;
    readonly name: string;
    readonly type: ZoneType;
    readonly areaM2: number;
    readonly capacity: number;
    readonly sampleCount: number;
    readonly personsEst: number;
    readonly density: number;
    readonly level: DensityBand;
    readonly status: string;
    /** Occupancy against safe capacity, or null when capacity is unknown. */
    readonly loadPct: number | null;
    readonly speedSamples: number;
    readonly dirSamples: number;
    readonly meanSpeed: number | null;
    readonly speedVar: number | null;
    readonly dirCoherence: number | null;
    readonly flowBearing: number | null;
    readonly risk?: number;
    readonly riskLevel?: RiskLevel;
    readonly riskFactors?: Readonly<Record<string, number>>;
    readonly forecast?: {
        readonly etaCriticalSec: number | null;
    };
    readonly stateSince?: string;
    readonly etaCriticalSec?: number | null;
}
/**
 * A tracked body of people, followed across ticks so it has an identity.
 *
 * This is what makes "the crowd on Kutcheri Road is growing by 800 a minute"
 * expressible — twenty named objects to reason about instead of tens of
 * thousands of points.
 */
export interface Cluster {
    readonly id: string;
    readonly centroid: LatLng;
    readonly radiusM: number;
    readonly areaM2: number;
    readonly personsEst: number;
    readonly density: number | null;
    readonly level: DensityBand | null;
    readonly meanSpeed?: number | null;
    readonly headingCompass?: string | null;
    /** People per minute. null until there is a baseline to compare against. */
    readonly growthPerMin?: number | null;
    readonly firstSeenAt?: string;
    /** Dense enough to be called a crowd rather than a scattering. */
    readonly isCrowd: boolean;
    /** Big enough to be worth an operator's attention. */
    readonly isSignificant: boolean;
}
export interface ActiveAlert {
    readonly id: string;
    readonly zoneId: string;
    readonly zoneName: string;
    readonly severity: AlertSeverity;
    readonly risk: number;
    /** Seconds until the zone is predicted to hit critical. null when unknown. */
    readonly etaCriticalSec: number | null;
    readonly status: string;
    readonly createdAt: string;
}
/** Gate/corridor state travels with the snapshot so every client sees one reality. */
export interface SnapshotNode {
    readonly id: string;
    readonly name?: string;
    readonly type: NodeType;
    readonly state: NodeState;
    readonly throughputPerMin?: number;
    readonly at: LatLng;
}
export interface Snapshot {
    readonly eventId: string;
    readonly generatedAt: string;
    readonly totals: Totals;
    /** Worst-first: by risk when present, else by density. */
    readonly zones: readonly SnapshotZone[];
    readonly hotspots: readonly Cell[];
    readonly cells: readonly Cell[];
    /** Biggest first. */
    readonly clusters: readonly Cluster[];
    readonly activeAlerts: readonly ActiveAlert[];
    readonly nodes: readonly SnapshotNode[];
    /** False when no venue has been set up — nothing can be assessed or routed. */
    readonly hasVenue: boolean;
}
/** The per-second frame pushed over the socket. Same shape, plus cluster events. */
export interface CrowdFrame extends Snapshot {
    readonly clusterEvents?: readonly ClusterEvent[];
}
export interface ClusterEvent {
    readonly kind: "appeared" | "dispersed" | "merged" | "converging";
    readonly clusterId?: string;
    readonly personsEst?: number;
    readonly absorbedPersonsEst?: number;
    readonly combinedPersonsEst?: number;
    readonly at?: LatLng;
}
