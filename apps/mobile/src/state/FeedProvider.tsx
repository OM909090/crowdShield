import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ActiveAlert,
  Broadcast,
  CrowdFrame,
  Ring,
  SnapshotZone,
  Venue,
} from "@crowdshield/types";
import { api } from "../api";
import { useCrowdFeed, type FeedStatus } from "../hooks/useCrowdFeed";
import { useApp } from "./AppProvider";

/**
 * One live feed for the whole app.
 *
 * Home and Map each used to open their OWN socket via `useCrowdFeed`, so every
 * tab switch tore one down and built another — a "connecting" flash, a lost last
 * frame, and the server's per-second broadcaster stopping and starting. Worse,
 * the feed only existed while a feed screen was foregrounded, so an alert or a
 * control-room announcement went unseen on Go / Assistant / More.
 *
 * Lifting it here gives the app a single connection that lives as long as an
 * event is joined, which is what lets a broadcast or a new alert reach the
 * citizen on any tab. It also owns the venue graph (geometry the feed frames do
 * not carry) and derives two things every screen wanted but had to fake:
 *   - `updatedAt`: when the last frame really arrived, so "updated" is honest.
 *   - `yourZone`: which drawn zone the person is standing in, matched to its
 *     live measurements — replacing the old stub that always returned null and
 *     made Home mislabel the venue's worst zone as "where you are".
 */

/** Gate open/close is not pushed on the crowd tick, so re-read the venue now and
 *  then; otherwise a gate the control room just closed keeps showing as open. */
const VENUE_REFRESH_MS = 30_000;

interface Feed {
  readonly frame: CrowdFrame | null;
  readonly alerts: readonly ActiveAlert[];
  readonly broadcasts: readonly Broadcast[];
  readonly status: FeedStatus;
  readonly hasData: boolean;
  readonly venue: Venue | null;
  /** Epoch ms of the last frame received, or null before the first one. */
  readonly updatedAt: number | null;
  /** The zone the user is standing in, with live density/risk, or null. */
  readonly yourZone: SnapshotZone | null;
}

const FeedContext = createContext<Feed | null>(null);

/** Ray-casting point-in-polygon on a `[lat, lng]` ring. */
function inRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [yi, xi] = a;
    const [yj, xj] = b;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function FeedProvider({ children }: { readonly children: ReactNode }) {
  const { event, fix } = useApp();
  const feed = useCrowdFeed(event?._id ?? null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const eventId = event?._id ?? null;

  // Venue for the current event: the geometry the socket frames don't carry
  // (zone polygons for attribution, gate state for the routing screen).
  useEffect(() => {
    if (!eventId) {
      setVenue(null);
      return undefined;
    }
    let cancelled = false;
    const load = () =>
      api.events
        .venue(eventId)
        .then(({ venue: loaded }) => {
          if (!cancelled) setVenue(loaded);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, VENUE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [eventId]);

  // Freshness by arrival time on the client's own clock. The crowd tick has no
  // generatedAt, so this is the only honest "how old is this" the app can show —
  // and it keeps counting up when the feed goes quiet, which is the point.
  useEffect(() => {
    if (feed.frame) setUpdatedAt(Date.now());
  }, [feed.frame]);

  // Reset freshness when leaving the event so a stale "updated" never lingers.
  useEffect(() => {
    if (!eventId) setUpdatedAt(null);
  }, [eventId]);

  const yourZone = useMemo<SnapshotZone | null>(() => {
    const zones = venue?.zones;
    const liveZones = feed.frame?.zones;
    if (!fix || !zones?.length || !liveZones?.length) return null;
    // Smallest containing polygon wins, mirroring the backend's zone assignment
    // (a chokepoint nested inside a broad approach must credit the chokepoint).
    let bestId: string | null = null;
    let bestArea = Infinity;
    for (const zone of zones) {
      if (!zone.polygon || zone.polygon.length < 3) continue;
      if (inRing(fix.lat, fix.lng, zone.polygon)) {
        const area = zone.areaM2 || Infinity;
        if (area < bestArea) {
          bestArea = area;
          bestId = zone.id;
        }
      }
    }
    if (!bestId) return null;
    return liveZones.find((zone) => zone.id === bestId) ?? null;
  }, [fix, venue, feed.frame]);

  const value = useMemo<Feed>(
    () => ({
      frame: feed.frame,
      alerts: feed.alerts,
      broadcasts: feed.broadcasts,
      status: feed.status,
      hasData: feed.hasData,
      venue,
      updatedAt,
      yourZone,
    }),
    [feed.frame, feed.alerts, feed.broadcasts, feed.status, feed.hasData, venue, updatedAt, yourZone]
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed(): Feed {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used inside a FeedProvider");
  return ctx;
}
