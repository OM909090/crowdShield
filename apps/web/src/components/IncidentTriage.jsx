import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { Siren, Check, CheckCheck, Loader2, MapPin, RefreshCw, Inbox } from "lucide-react";
import api from "../utils/axios";
import { getSocket } from "../utils/socket";
import { timeAgo } from "../utils/riskUi";

/**
 * IncidentTriage — the authority's SOS / incident queue.
 *
 * The whole reporting half of this already worked: a citizen in trouble could
 * raise an SOS, the server stored it and pushed `incident:new` to the event room.
 * Nothing on the authority side ever listened. Someone pressing the panic button
 * was writing to a queue no human being could see, which is the worst possible
 * failure for a safety feature — it looks like help was summoned when nobody was
 * told.
 *
 * This is that missing surface: live queue, acknowledge (a human has seen it),
 * resolve (it has been handled), and the coordinates so it can be found on the
 * ground. `onIncidents` hands the geolocated ones up to the map.
 */

const CATEGORY_META = {
  sos: { emoji: "🆘", label: "SOS", tone: "border-red-400/40 bg-red-500/15 text-red-100", urgent: true },
  medical: { emoji: "⛑️", label: "Medical", tone: "border-pink-400/30 bg-pink-500/10 text-pink-100", urgent: true },
  hazard: { emoji: "⚠️", label: "Hazard", tone: "border-amber-400/30 bg-amber-500/10 text-amber-100" },
  blocked: { emoji: "⛔", label: "Blocked", tone: "border-orange-400/30 bg-orange-500/10 text-orange-100" },
  lost: { emoji: "🧭", label: "Lost person", tone: "border-cyan-400/30 bg-cyan-500/10 text-cyan-100" },
  other: { emoji: "📍", label: "Other", tone: "border-white/15 bg-white/5 text-slate-200" },
};
export const categoryMeta = (c) => CATEGORY_META[c] || CATEGORY_META.other;

const REPORTER_LABEL = { citizen: "citizen", marshal: "marshal", system: "system" };

const idOf = (i) => String(i?._id || i?.id || "");

export default function IncidentTriage({ eventId, onIncidents }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(() => new Set());
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        // No status param = the actionable set (open + acknowledged), which is
        // what a triage queue should show by default.
        const res = await api.get(`/events/${eventId}/incidents`, {
          params: showResolved ? { status: "resolved" } : undefined,
        });
        setIncidents(res.data?.incidents || []);
      } catch (err) {
        // 403 here means the account isn't a verified authority — the panel says
        // so rather than silently showing an empty, reassuring queue.
        if (err.response?.status !== 403) {
          setIncidents([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [eventId, showResolved]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live arrivals. A queue that only refreshes on a poll would show an SOS up to
  // a poll-interval late, and that interval is exactly when it matters.
  useEffect(() => {
    if (showResolved) return undefined;
    const socket = getSocket();
    const onNew = (i) => {
      if (!i) return;
      setIncidents((prev) => (prev.some((x) => idOf(x) === idOf(i)) ? prev : [i, ...prev]));
      const meta = categoryMeta(i.category);
      toast(`${meta.emoji} ${meta.label} reported${i.note ? ` — ${String(i.note).slice(0, 60)}` : ""}`, {
        icon: meta.urgent ? "🚨" : undefined,
        duration: meta.urgent ? 8000 : 5000,
      });
    };
    socket.on("incident:new", onNew);
    return () => socket.off("incident:new", onNew);
  }, [showResolved]);

  // Hand the geolocated ones to the map so the operator can see WHERE help is
  // being called for, not just that it was.
  useEffect(() => {
    if (!onIncidents) return;
    onIncidents(
      incidents
        .filter((i) => Number.isFinite(i?.geo?.lat) && Number.isFinite(i?.geo?.lng))
        .map((i) => ({
          id: idOf(i),
          at: [i.geo.lat, i.geo.lng],
          category: i.category,
          status: i.status,
          note: i.note || "",
          createdAt: i.createdAt,
        }))
    );
  }, [incidents, onIncidents]);

  const act = async (incident, action) => {
    const id = idOf(incident);
    if (busy.has(id)) return;
    setBusy((prev) => new Set(prev).add(id));
    try {
      const res = await api.patch(`/events/${eventId}/incidents/${id}/${action}`);
      const updated = res.data?.incident;
      setIncidents((prev) =>
        showResolved || action !== "resolve"
          ? prev.map((x) => (idOf(x) === id ? updated || x : x))
          : // Resolved items leave the active queue, which is the point of resolving.
            prev.filter((x) => idOf(x) !== id)
      );
      toast.success(action === "ack" ? "Incident acknowledged" : "Incident resolved");
    } catch (err) {
      toast.error(err.response?.data?.message || `Couldn't ${action} the incident`);
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const openCount = useMemo(() => incidents.filter((i) => i.status === "open").length, [incidents]);
  const urgentOpen = useMemo(
    () => incidents.filter((i) => i.status === "open" && categoryMeta(i.category).urgent).length,
    [incidents]
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">People calling for help</p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-bold">
            <Siren className={`h-5 w-5 ${urgentOpen > 0 ? "animate-pulse text-red-400" : "text-slate-400"}`} />
            SOS &amp; incidents
            {openCount > 0 && (
              <span className="rounded-full bg-red-500/25 px-2 py-0.5 text-xs font-bold text-red-100">
                {openCount} open
              </span>
            )}
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
              showResolved
                ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:text-white"
            }`}
          >
            {showResolved ? "Showing resolved" : "Show resolved"}
          </button>
          <button
            type="button"
            onClick={() => load({ silent: true })}
            title="Refresh"
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 transition hover:text-white"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the queue…
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-3 text-xs text-emerald-200/80">
          <Inbox size={15} />
          {showResolved ? "Nothing resolved yet." : "Nobody has reported an incident — the queue is clear."}
        </div>
      ) : (
        <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {incidents.map((i) => {
              const id = idOf(i);
              const meta = categoryMeta(i.category);
              const inFlight = busy.has(id);
              const hasGeo = Number.isFinite(i?.geo?.lat) && Number.isFinite(i?.geo?.lng);
              return (
                <motion.div
                  key={id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`rounded-xl border px-3 py-2.5 ${meta.tone} ${
                    i.status === "open" && meta.urgent ? "ring-1 ring-red-400/50" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
                    <span>{meta.emoji}</span>
                    <span>{meta.label}</span>
                    <span className="rounded-full border border-white/20 px-1.5 py-0.5 opacity-80">
                      {REPORTER_LABEL[i.reporterType] || "citizen"}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 ${
                        i.status === "open"
                          ? "bg-red-500/30 text-red-50"
                          : i.status === "acknowledged"
                            ? "bg-amber-500/25 text-amber-50"
                            : "bg-emerald-500/25 text-emerald-50"
                      }`}
                    >
                      {i.status}
                    </span>
                    <span className="ml-auto opacity-70">{timeAgo(i.createdAt)}</span>
                  </div>

                  {i.note && <p className="mt-1.5 text-sm leading-5">{i.note}</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {hasGeo ? (
                      <span className="inline-flex items-center gap-1 text-[11px] opacity-80">
                        <MapPin size={11} />
                        {i.geo.lat.toFixed(5)}, {i.geo.lng.toFixed(5)} · pinned on the map
                      </span>
                    ) : (
                      <span className="text-[11px] opacity-60">No location shared</span>
                    )}

                    <span className="ml-auto flex items-center gap-1.5">
                      {i.status === "open" && (
                        <button
                          type="button"
                          onClick={() => act(i, "ack")}
                          disabled={inFlight}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition hover:bg-white/20 disabled:opacity-50"
                        >
                          {inFlight ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                          Acknowledge
                        </button>
                      )}
                      {i.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={() => act(i, "resolve")}
                          disabled={inFlight}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-100 transition hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          {inFlight ? <Loader2 size={11} className="animate-spin" /> : <CheckCheck size={11} />}
                          Resolve
                        </button>
                      )}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
