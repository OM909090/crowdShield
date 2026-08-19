import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, GitMerge, TrendingUp, Navigation, Gauge, CircleDot } from "lucide-react";
import { densityMeta, formatCount, formatGrowth, timeAgo } from "../utils/riskUi";

/**
 * TrackedCrowds — the read-out beside the map for the crowd objects the server
 * tracks (K3, K7…), shared by the citizen live map and the Command Center so the
 * two never describe the same crowd differently.
 *
 * The precursor notice at the top is the reason this panel exists. Two bodies of
 * people converging on the same chokepoint is the classic crush geometry, and
 * density alone cannot see it coming — only two tracked objects on a closing
 * course can. When that is happening it must be impossible to miss.
 *
 * Every field is either a measurement or an admission (ARCHITECTURE §17): speed
 * that was never reported says "not measured", density with no reading and growth
 * with no baseline show an em dash. Nothing is defaulted to zero.
 */

/** Rows worth showing. Below this a "cluster" is a handful of people walking past. */
const MAX_ROWS = 6;

/** The two kinds that mean "this is about to get worse", newest first. */
const PRECURSOR_KINDS = new Set(["converging", "merge"]);

function precursorText(e) {
  if (e.kind === "converging") {
    const ids = (e.clusterIds || []).join(" + ");
    const gap = Number.isFinite(e.gapM) ? `${e.gapM} m apart` : "closing";
    const people = Number.isFinite(e.combinedPersonsEst) ? `${formatCount(e.combinedPersonsEst)} people combined` : null;
    return {
      title: `${ids} converging`,
      detail: [gap, people, e.bothDense ? "both packed" : null].filter(Boolean).join(" · "),
      // Two already-packed bodies closing is materially worse than two loose ones.
      tone: e.bothDense
        ? "border-red-400/30 bg-red-500/15 text-red-100"
        : "border-amber-400/25 bg-amber-500/10 text-amber-100",
    };
  }
  return {
    title: `${e.absorbedId} merged into ${e.clusterId}`,
    detail: [
      Number.isFinite(e.personsEst) ? `now ${formatCount(e.personsEst)} people` : null,
      Number.isFinite(e.absorbedPersonsEst) ? `absorbed ${formatCount(e.absorbedPersonsEst)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    tone: "border-red-400/30 bg-red-500/15 text-red-100",
  };
}

export default function TrackedCrowds({ clusters = [], clusterEvents = [], className = "" }) {
  // Biggest first. `sig` (>= 200 people) or `crowd` (packed) is the server's own
  // judgement of what is worth reporting movements of; anything below that is
  // already visible as individual dots on the map.
  const rows = useMemo(
    () =>
      clusters
        .filter((k) => k?.sig || k?.crowd)
        .slice()
        .sort((a, b) => (b.n || 0) - (a.n || 0))
        .slice(0, MAX_ROWS),
    [clusters]
  );

  const precursors = useMemo(
    () => clusterEvents.filter((e) => PRECURSOR_KINDS.has(e.kind)).slice(0, 2),
    [clusterEvents]
  );

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/70">Tracked Crowds</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
            <Users size={14} className="shrink-0 text-cyan-300" aria-hidden="true" />
            {rows.length ? `${rows.length} merged on the map` : "None packed together"}
          </p>
        </div>
        {rows.length > 0 && (
          <span className="shrink-0 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-200">
            {formatCount(rows.reduce((sum, k) => sum + (k.n || 0), 0))}
          </span>
        )}
      </div>

      {/* Crush precursor. Loud on purpose. */}
      <AnimatePresence initial={false}>
        {precursors.map((e) => {
          const p = precursorText(e);
          return (
            <motion.div
              key={e.key}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              role="status"
              className={`mb-2 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${p.tone}`}
            >
              <GitMerge size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{p.title}</p>
                {p.detail && <p className="mt-0.5 text-[11px] leading-4 opacity-85">{p.detail}</p>}
              </div>
              <span className="shrink-0 text-[10px] opacity-70">{timeAgo(e.receivedAt)}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {rows.length === 0 ? (
        <p className="text-[11px] leading-5 text-slate-500">
          {clusters.length === 0
            ? "Nothing tracked yet — waiting for phones to report."
            : "People are spread out, so every dot on the map is one person. Bubbles appear once a group packs together."}
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((k) => {
              const meta = densityMeta(k.lvl);
              const growth = formatGrowth(k.g);
              return (
                <motion.li
                  key={k.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28 }}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] font-bold text-cyan-200">
                      {k.id}
                    </span>
                    <span className="truncate text-sm font-semibold text-white">
                      {formatCount(k.n)} <span className="text-[11px] font-normal text-slate-400">people</span>
                    </span>
                    {/* Band in words as well as colour, so the state does not
                        depend on telling amber from orange. */}
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${meta.badge}`}
                    >
                      <CircleDot size={9} style={{ color: meta.color }} aria-hidden="true" />
                      {k.lvl ? meta.label : "No reading"}
                    </span>
                  </div>

                  <dl className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1">
                      <Gauge size={11} className="text-slate-500" aria-hidden="true" />
                      <dt className="sr-only">Density</dt>
                      {/* No density reading is an em dash, never 0.0. */}
                      <dd>{Number.isFinite(k.d) ? `${k.d} p/m²` : "— p/m²"}</dd>
                    </div>
                    <div className="flex items-center gap-1">
                      <Navigation size={11} className="text-slate-500" aria-hidden="true" />
                      <dt className="sr-only">Movement</dt>
                      <dd>
                        {Number.isFinite(k.s)
                          ? `${k.s} m/s${k.hc ? ` ${k.hc}` : ""}${Number.isFinite(k.h) ? ` (${k.h}°)` : ""}`
                          : "not measured"}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp size={11} className="text-slate-500" aria-hidden="true" />
                      <dt className="sr-only">Growth</dt>
                      <dd className={growth && k.g > 0 ? "text-amber-300" : undefined}>{growth || "—"}</dd>
                    </div>
                  </dl>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
