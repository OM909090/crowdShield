import { useEffect, useState } from "react";
import { getSocket } from "../utils/socket";
import api from "../utils/axios";

const MAX_ALERTS = 20;
const MAX_AGENT_ACTIONS = 12;
const MAX_BROADCASTS = 10;
const MAX_CLUSTER_EVENTS = 20;
const MAX_ALERTED_AREAS = 12;

/** Stable empty array so derived values keep a steady identity for useMemo deps. */
const NO_CLUSTERS = [];

/**
 * Identity of a cluster event, so the same happening is never listed twice.
 *
 * `converging` is a standing condition the server re-reports every tick while a
 * pair stays close, so appending blindly would flush the one-off merges and
 * appearances out of a 20-slot list within seconds — and those are the entries an
 * operator most needs to still be able to see.
 */
const clusterEventKey = (e) => {
  if (e.kind === "converging") {
    return `converging:${[...(e.clusterIds || [])].map(String).sort().join("+")}`;
  }
  if (e.kind === "merge") return `merge:${e.clusterId}<${e.absorbedId}`;
  return `${e.kind}:${e.clusterId}`;
};

/**
 * Fold a tick's cluster events into the running list: newest first, capped, and
 * de-duped by key (the same treatment `broadcasts` gets below, for the same
 * reason). A repeat refreshes the existing entry in place and keeps `firstAt`, so
 * "K3 and K7 have been closing for 40s" stays recoverable.
 */
function foldClusterEvents(prev, incoming) {
  const now = Date.now();
  let next = prev;
  for (const e of incoming) {
    if (!e?.kind) continue;
    const key = clusterEventKey(e);
    const existing = next.find((x) => x.key === key);
    const entry = {
      ...e,
      key,
      firstAt: existing?.firstAt ?? now,
      receivedAt: now,
      ticks: (existing?.ticks || 0) + 1,
    };
    next = existing ? [entry, ...next.filter((x) => x.key !== key)] : [entry, ...next];
  }
  return next.length > MAX_CLUSTER_EVENTS ? next.slice(0, MAX_CLUSTER_EVENTS) : next;
}

/**
 * Subscribe to an event's live crowd feed.
 * Returns:
 *   frame        — the latest `crowd:tick` (dots, cells, zones+risk, totals)
 *   clusters     — the latest tick's tracked crowd objects (K3, K7…): centroid,
 *                  radius, head count, density/level, speed, heading, growth
 *   clusterEvents— recent merges/convergences/appearances/dispersals (newest
 *                  first, capped, de-duped by key) — the crush precursors
 *   alerts       — escalations, newest first and capped: the alerts already
 *                  standing when this mounted, plus every `alert:new` since
 *   agentActions — recent `agent:action` directives the AI applied/executed
 *                  (newest first, capped) — flat action fields plus
 *                  `{ proposalId, approved, receivedAt }`
 *   broadcasts   — recent `agent:broadcast` announcements (newest first,
 *                  capped, de-duped by id)
 *   status       — "connecting" | "live" | "disconnected"
 *
 * Subscribing tells the server there's a viewer (starts its broadcaster);
 * unsubscribing on unmount lets the server stop it when the last viewer leaves.
 *
 * Note: `agent:proposal` is deliberately NOT handled here — AgentProposals.jsx
 * owns that stream and shares this same socket connection.
 */
export function useCrowdFeed(eventId) {
  const [frame, setFrame] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [agentActions, setAgentActions] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [clusterEvents, setClusterEvents] = useState([]);
  const [status, setStatus] = useState("connecting");
  const [trackedId, setTrackedId] = useState(eventId);
  /**
   * The agent's pulse and the ground it has warned.
   *
   * `agentStatus` answers "is the guardian alive and what is it doing"; without it
   * the operator could only infer the agent's health from whether a proposal
   * happened to show up. `alertedAreas` carries the polygons of every autonomous
   * targeted alert so the map can plant a flag on the exact ground warned.
   */
  const [agentStatus, setAgentStatus] = useState(null);
  const [alertedAreas, setAlertedAreas] = useState([]);

  // Reset the feed when the event changes — the React-sanctioned
  // "adjust state during render" pattern (no setState inside the effect).
  if (eventId !== trackedId) {
    setTrackedId(eventId);
    setAlerts([]);
    setFrame(null);
    setAgentActions([]);
    setBroadcasts([]);
    setClusterEvents([]);
    setAgentStatus(null);
    setAlertedAreas([]);
  }

  useEffect(() => {
    if (!eventId) return undefined;
    const socket = getSocket();

    const subscribe = () => {
      setStatus("live");
      socket.emit("subscribe", { eventId });
    };
    const onDisconnect = () => setStatus("disconnected");
    const onTick = (f) => {
      if (String(f.eventId) !== String(eventId)) return;
      setFrame(f);
      // Clusters themselves ride on the frame (below); only the events need to
      // outlive their tick, because a merge is over in the instant it happens.
      if (f.clusterEvents?.length) {
        setClusterEvents((prev) => foldClusterEvents(prev, f.clusterEvents));
      }
    };
    const onAlert = (a) => {
      setAlerts((prev) => [{ ...a, receivedAt: Date.now() }, ...prev].slice(0, MAX_ALERTS));
    };
    // The server sends `{ proposalId, approved?, action }` where `action` is
    // flat and already carries any geometry it resolved. Flatten it so the map
    // and the directives panel read one object.
    const onAgentAction = (p) => {
      if (!p?.action) return;
      setAgentActions((prev) =>
        [
          { ...p.action, proposalId: p.proposalId, approved: p.approved, receivedAt: Date.now() },
          ...prev,
        ].slice(0, MAX_AGENT_ACTIONS)
      );
    };
    const onBroadcast = (b) => {
      if (!b) return;
      setBroadcasts((prev) => {
        if (b.id && prev.some((x) => x.id === b.id)) return prev; // already have it
        return [b, ...prev].slice(0, MAX_BROADCASTS);
      });
    };

    const onAgentStatus = (s) => {
      if (!s || String(s.eventId) !== String(eventId)) return;
      setAgentStatus({ ...s, receivedAt: Date.now() });
    };
    // The agent just warned real ground, autonomously. Keep the most recent
    // areas so the map can flag them; de-duped by area id, newest wins.
    const onAgentAlerted = (p) => {
      if (!p?.areas?.length) return;
      setAlertedAreas((prev) => {
        const byId = new Map();
        for (const a of p.areas) {
          byId.set(a.id, { ...a, message: p.message, severity: p.severity, at: p.at || Date.now() });
        }
        for (const a of prev) if (!byId.has(a.id)) byId.set(a.id, a);
        return [...byId.values()].sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, MAX_ALERTED_AREAS);
      });
    };

    socket.on("connect", subscribe);
    socket.on("disconnect", onDisconnect);
    socket.on("crowd:tick", onTick);
    socket.on("alert:new", onAlert);
    socket.on("agent:action", onAgentAction);
    socket.on("agent:broadcast", onBroadcast);
    socket.on("agent:status", onAgentStatus);
    socket.on("agent:alerted", onAgentAlerted);
    if (socket.connected) subscribe();

    /**
     * Seed the list with the escalations that are ALREADY standing.
     *
     * `alert:new` only fires on the transition. Someone who opens the command
     * center — or merely refreshes it — half a minute after a zone escalated
     * would otherwise be shown an empty feed reading "all zones nominal" while
     * the risk gauge beside it says 55%. For a safety tool that is the worst
     * possible failure: not a missing number, but a confident all-clear.
     *
     * Read from the snapshot rather than `/alerts`, because that endpoint is
     * verified-authority only and this hook also feeds the citizen map.
     */
    let cancelled = false;
    api
      .get(`/events/${eventId}/snapshot`)
      .then((res) => {
        if (cancelled) return;
        const standing = res.data?.snapshot?.activeAlerts ?? [];
        if (!standing.length) return;
        setAlerts((prev) => {
          const have = new Set(prev.map((a) => a.id));
          const merged = [...prev, ...standing.filter((a) => !have.has(a.id))];
          merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return merged.slice(0, MAX_ALERTS);
        });
      })
      .catch(() => {
        // A failed seed is not worth surfacing: the live push still works, and
        // the panel already distinguishes "no alerts" from "not connected".
      });

    return () => {
      cancelled = true;
      socket.emit("unsubscribe");
      socket.off("connect", subscribe);
      socket.off("disconnect", onDisconnect);
      socket.off("crowd:tick", onTick);
      socket.off("alert:new", onAlert);
      socket.off("agent:action", onAgentAction);
      socket.off("agent:broadcast", onBroadcast);
      socket.off("agent:status", onAgentStatus);
      socket.off("agent:alerted", onAgentAlerted);
    };
  }, [eventId]);

  // Derived from the frame rather than kept in a second state: clusters are
  // per-tick truth, and an independent copy could only ever end up disagreeing
  // with the dots and cells drawn beside them.
  const clusters = frame?.clusters || NO_CLUSTERS;

  return {
    frame,
    clusters,
    clusterEvents,
    alerts,
    agentActions,
    broadcasts,
    agentStatus,
    alertedAreas,
    status,
  };
}
