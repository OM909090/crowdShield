import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Navigation, ShieldCheck, Loader2, MapPin, AlertTriangle, Play, Square, Clock } from "lucide-react";
import api from "../../utils/axios";
import CitizenRouteMap from "./CitizenRouteMap";

/**
 * PersonalRoutePanel — the citizen's OWN routing agent, on the website surface.
 *
 * The central agent manages the whole crowd; this one looks after a single
 * person. Given their live GPS fix it asks the server for the safest way to a
 * destination they pick — or straight out of the venue — draws it on the map,
 * and then keeps watching: every few seconds (and whenever they move) it
 * re-asks, and if the crowd-aware router hands back a different path because a
 * street or gate is filling up, it swaps the drawn route and tells them why.
 *
 * It reuses the same crowd-aware endpoints the command centre and mobile app use
 * (/guidance, /exit-route), so a citizen and the control room are never sent
 * down contradictory streets.
 *
 * Location comes from the parent's single shared GPS watch (`coords`); this
 * panel never opens its own, so a browser still counts as exactly one phone.
 */

const POLL_MS = 6000;
const EXIT = "__exit__";

const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;
function metresBetween(a, b) {
  if (!a || !b) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const fmtEta = (sec) => {
  if (!Number.isFinite(sec)) return null;
  const m = Math.max(1, Math.round(sec / 60));
  return `~${m} min`;
};
const fmtDist = (m) => {
  if (!Number.isFinite(m)) return null;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
};

/** Split the server's joined "1. … 2. …" directions into individual steps. */
function toSteps(directions) {
  if (!directions || typeof directions !== "string") return [];
  return directions
    .split(/\s*(?=\d+\.\s)/)
    .map((s) => s.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

export default function PersonalRoutePanel({
  eventId,
  venue,
  center,
  coords,
  liveZones = [],
  sharing,
  onEnableLocation,
}) {
  const [target, setTarget] = useState(EXIT);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);

  // Latest fix behind a ref so the poll loop reads current coordinates without
  // being torn down and rebuilt on every GPS tick.
  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  const lastFetchAt = useRef(null); // { lat, lng } used for the last request
  const sigRef = useRef(null); // route signature, to detect genuine reroutes

  const destinations = useMemo(() => {
    const nodes = venue?.nodes || [];
    return nodes
      .filter((n) => Array.isArray(n.at) && (n.type === "gate" || n.type === "exit" || n.isDestination))
      .map((n) => ({ id: n.id, name: n.name || n.id, type: n.type, at: n.at }));
  }, [venue]);

  const here = coords ? [coords.lat, coords.lng] : null;

  const fetchPlan = useCallback(
    async ({ silent = true } = {}) => {
      const fix = coordsRef.current;
      if (!fix) return;
      if (!silent) setLoading(true);
      try {
        let next = null;

        if (target === EXIT) {
          const res = await api.post(`/events/${eventId}/exit-route`, { lat: fix.lat, lng: fix.lng });
          const exit = res.data?.exit;
          if (!exit) {
            setPlan(null);
            setError(res.data?.message || "No safe exit route available right now.");
            return;
          }
          next = {
            mode: "exit",
            waypoints: exit.waypoints || [],
            directions: exit.directions || "",
            roads: exit.roads || [],
            etaSec: exit.durationSec,
            lengthM: exit.distanceMeters,
            worstDensity: exit.maxRisk,
            measuredFraction: exit.measuredFraction,
            destAt: exit.gateAt || null,
            destName: exit.gateName || "Nearest exit",
            gateId: exit.recommendedGateId || null,
            unsafe: !!exit.unsafe,
            note: exit.reason || null,
          };
        } else {
          const res = await api.post(`/events/${eventId}/guidance`, {
            lat: fix.lat,
            lng: fix.lng,
            heading: fix.heading,
            destinationId: target,
          });
          const g = res.data?.guidance;
          const route = g?.route;
          if (!route?.waypoints?.length) {
            setPlan(null);
            setError(g?.instruction || "No clear route to that point right now.");
            return;
          }
          const destNode = destinations.find((d) => d.id === target);
          next = {
            mode: "destination",
            waypoints: route.waypoints,
            directions: route.directions || "",
            roads: route.roads || [],
            etaSec: route.etaSec,
            lengthM: route.lengthM,
            worstDensity: route.worstDensity,
            measuredFraction: route.measuredFraction,
            destAt: destNode?.at || null,
            destName: destNode?.name || "Destination",
            gateId: target,
            unsafe: false,
            note: g?.instruction || null,
          };
        }

        setError(null);
        lastFetchAt.current = { lat: fix.lat, lng: fix.lng };

        // A reroute is a change in the destination gate or the sequence of named
        // streets — not the constant small shifts in geometry as someone walks.
        const sig = `${next.gateId || ""}|${(next.roads || []).join(">")}`;
        if (sigRef.current && sig !== sigRef.current) {
          const via = next.roads?.[0] || next.destName;
          toast(
            next.mode === "exit"
              ? `Rerouted to ${next.destName} — your previous way out is getting crowded`
              : `Route updated to avoid crowding — now via ${via}`,
            { icon: "\u{1F500}", duration: 6000 }
          );
        }
        sigRef.current = sig;
        setPlan(next);
      } catch (err) {
        setError(err.response?.data?.message || "Could not compute a route right now.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [target, eventId, destinations]
  );

  // Poll while active: an immediate fetch, then every POLL_MS. Re-runs when the
  // target changes so switching destination refreshes at once. sigRef is reset
  // here so the first plan after (re)starting is a baseline, never a "reroute".
  useEffect(() => {
    if (!active) return undefined;
    sigRef.current = null;
    fetchPlan({ silent: false });
    const iv = setInterval(() => fetchPlan({ silent: true }), POLL_MS);
    return () => clearInterval(iv);
  }, [active, fetchPlan]);

  // Re-plan promptly when the citizen actually moves (keeps the start of the
  // route on them, and catches crowding ahead sooner than the 6s poll).
  useEffect(() => {
    if (!active || !coords || !lastFetchAt.current) return;
    if (metresBetween(lastFetchAt.current, coords) >= 18) fetchPlan({ silent: true });
  }, [coords, active, fetchPlan]);

  const start = () => {
    if (!coords) {
      onEnableLocation?.();
      toast("Share your location first so your agent knows where you are.", { icon: "\u{1F4CD}" });
      return;
    }
    setActive(true);
  };
  const stop = () => {
    setActive(false);
    setPlan(null);
    setError(null);
    sigRef.current = null;
    lastFetchAt.current = null;
  };

  const steps = useMemo(() => toSteps(plan?.directions), [plan]);

  const densityChip = (() => {
    if (!plan) return null;
    if (plan.worstDensity == null) {
      return { text: "Not measured", cls: "border-white/10 bg-black/20 text-slate-300" };
    }
    if (plan.worstDensity >= 4) return { text: `${plan.worstDensity} p/m² peak`, cls: "border-red-400/30 bg-red-500/10 text-red-200" };
    if (plan.worstDensity >= 2.5) return { text: `${plan.worstDensity} p/m² peak`, cls: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
    return { text: `${plan.worstDensity} p/m² peak`, cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" };
  })();

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Your personal agent</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold">
            <Navigation className="h-5 w-5 text-cyan-300" />
            Safe route &amp; live rerouting
          </h2>
        </div>
        {active && (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Monitoring your route
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="flex-1 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
        >
          <option value={EXIT}>🚪 Safest way out</option>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.type ? ` (${d.type})` : ""}
            </option>
          ))}
        </select>

        {active ? (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/15"
          >
            <Square size={15} /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-105"
          >
            <Play size={15} /> {coords ? "Guide me" : "Enable location & guide me"}
          </button>
        )}
      </div>

      {!sharing && !coords && (
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
          <MapPin size={13} className="mt-0.5 shrink-0 text-cyan-300" />
          Your agent needs your location to route you. It's used only to guide you and is never shown to others.
        </p>
      )}

      {/* Live route */}
      {active && (
        <div className="mt-5">
          {plan?.waypoints?.length ? (
            <>
              <CitizenRouteMap
                center={plan.destAt || here || center}
                route={plan.waypoints}
                youAreAt={here}
                destination={plan.destAt ? { at: plan.destAt, name: plan.destName } : null}
                gates={venue?.nodes || []}
                aor={venue?.aor?.polygon || []}
                zones={venue?.zones || []}
                liveZones={liveZones}
                height="300px"
                youAreHereLabel="You are here"
                destinationLabel={plan.destName}
              />

              {plan.note && !plan.unsafe && (
                <p className="mt-3 text-sm leading-6 text-slate-200">{plan.note}</p>
              )}

              {/* Summary chips */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-cyan-100">
                  {plan.mode === "exit" ? <ShieldCheck size={13} /> : <MapPin size={13} />}
                  {plan.destName}
                </span>
                {fmtEta(plan.etaSec) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-slate-200">
                    <Clock size={13} /> {fmtEta(plan.etaSec)}
                  </span>
                )}
                {fmtDist(plan.lengthM) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-slate-200">
                    <Navigation size={13} /> {fmtDist(plan.lengthM)}
                  </span>
                )}
                {densityChip && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${densityChip.cls}`}>
                    <AlertTriangle size={13} /> {densityChip.text}
                  </span>
                )}
                {loading && (
                  <span className="inline-flex items-center gap-1.5 text-slate-400">
                    <Loader2 size={13} className="animate-spin" /> updating…
                  </span>
                )}
              </div>

              {/* Turn-by-turn */}
              {steps.length > 0 && (
                <ol className="mt-4 max-h-44 space-y-2 overflow-y-auto pr-1">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-white/8 bg-slate-950/40 px-3 py-2 text-sm text-slate-200">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-[11px] font-bold text-cyan-200">
                        {i + 1}
                      </span>
                      <span className="leading-5">{s}</span>
                    </li>
                  ))}
                </ol>
              )}

              {plan.unsafe && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {plan.note || "Every route out is congested right now — move calmly and follow marshals."}
                </p>
              )}
            </>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Finding your safest route…
            </div>
          ) : (
            <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
              {error || "Waiting for your location to plan a route…"}
            </p>
          )}
        </div>
      )}

      {!active && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Pick a destination or “Safest way out”, then tap Guide me. Your agent draws the route and keeps
          rerouting you if it gets crowded ahead.
        </p>
      )}
    </div>
  );
}
