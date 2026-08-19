import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { densityMeta, formatCount } from "../../utils/riskUi";
import { bubbleRadiusM, M_PER_DEG_LAT } from "./crowdSplit";

/**
 * ClustersLayer — draws tracked crowds as single merged bubbles on one <canvas>
 * overlay, in the same shape as DotsLayer (one canvas appended to the map
 * container, one rAF loop, interpolation across the 1 Hz tick).
 *
 * This is the other half of the merge: DotsLayer has already been handed only
 * the people who are NOT inside one of these bubbles (see crowdSplit.js), so a
 * bubble genuinely replaces its dots rather than covering them.
 *
 * The transitions are the feature, not decoration. An operator watching this is
 * trying to answer "is that crowd growing, and is it about to touch the other
 * one" — questions you can only read off movement. So:
 *   • centroid, radius and head count all tween between ticks, so a crowd swells
 *     and drifts instead of snapping once a second;
 *   • a new crowd fades up, a dispersed one fades out;
 *   • on a merge the absorbed bubble flies into its survivor and fades, so two
 *     crowds becoming one is something you SEE happen rather than infer from a
 *     number changing.
 *
 * Honesty (ARCHITECTURE §17): colour comes from the shared Fruin vocabulary in
 * utils/riskUi.js, and a cluster with no density reading draws grey, never
 * safe-green. Nothing here invents a figure — the growth pulse is a fixed-period
 * ring whose presence means "growing" and whose speed means nothing.
 */

/** Server tick interval — the window each tween has to cover. */
const TICK_MS = 1000;

/** Entrance fade. Short: a crowd that just formed is news, don't make it wait. */
const APPEAR_MS = 420;

/** Exit fade. Slightly longer than the entrance so a crowd leaving is noticed. */
const LEAVE_MS = 520;

/**
 * Merge flight. Long enough that an operator glancing at the map catches the two
 * bubbles becoming one, short enough that it finishes inside a tick or so and
 * never lags behind the live feed.
 */
const MERGE_MS = 700;

/** Growth-ring period. Constant on purpose — see the note on `growing` below. */
const PULSE_MS = 1400;

/**
 * Growth rate at which a crowd is worth flagging as growing, people per minute.
 * A display threshold, not a physical claim: roughly one person a second joining
 * is the point where the count visibly climbs between glances.
 */
const GROWING_PER_MIN = 60;

/** Screen radii below which text does not fit inside the bubble. */
const LABEL_MIN_R_PX = 16;
const BAND_LABEL_MIN_R_PX = 30;

/** Reference span for the metres→pixels probe. See pixelsPerMetre(). */
const PROBE_M = 100;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (p) => 1 - (1 - p) * (1 - p);
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

export default function ClustersLayer({ clusters = [], clusterEvents = [] }) {
  const map = useMap();
  const stateRef = useRef({
    /** id -> animation entry (mutated in place; never a props object) */
    anim: new Map(),
    /** start of the current tick's tween */
    t0: 0,
    /** merge event keys already turned into an animation, so re-renders don't replay them */
    mergeSeen: new Set(),
    /** absorbedId -> merge event, consumed within one ingest */
    pendingMerge: new Map(),
  });

  // Ingest a tick. Runs at 1 Hz, so this is where anything non-trivial belongs;
  // the rAF loop below only interpolates what this leaves behind.
  useEffect(() => {
    const st = stateRef.current;
    const now = performance.now();
    st.t0 = now;

    // A merge names both parties, which is the only way to know that a bubble
    // vanished *into* another one rather than simply dispersing. Keyed so an
    // unrelated re-render can't replay an animation that already played.
    for (const e of clusterEvents) {
      if (e?.kind !== "merge" || e.absorbedId == null) continue;
      const key = e.key || `merge:${e.clusterId}<${e.absorbedId}`;
      if (st.mergeSeen.has(key)) continue;
      st.mergeSeen.add(key);
      st.pendingMerge.set(String(e.absorbedId), e);
    }
    // Bounded memory over a long shift; ids are never reused so forgetting old
    // keys can't resurrect an animation.
    if (st.mergeSeen.size > 256) st.mergeSeen.clear();

    const live = new Set();
    for (const k of clusters) {
      if (!Array.isArray(k?.c) || !Number.isFinite(k.c[0])) continue;
      const id = String(k.id);
      live.add(id);
      const meta = densityMeta(k.lvl);
      const rM = bubbleRadiusM(k);
      const entry = st.anim.get(id);

      if (entry && entry.phase === "live") {
        // Previous target becomes this tween's start — the same handoff DotsLayer
        // uses. At 1 Hz ticks against a 1 s tween the last tween has just landed,
        // so this is where the bubble actually is on screen.
        entry.fromLat = entry.toLat;
        entry.fromLng = entry.toLng;
        entry.fromR = entry.toR;
        entry.fromN = entry.toN;
        entry.toLat = k.c[0];
        entry.toLng = k.c[1];
        entry.toR = rM;
        entry.toN = k.n;
      } else if (entry) {
        // Was fading out and came back. Pick it up where it is now, not where it
        // was flying to, and let it fade back in.
        entry.phase = "live";
        entry.bornAt = now;
        entry.fromLat = k.c[0];
        entry.fromLng = k.c[1];
        entry.toLat = k.c[0];
        entry.toLng = k.c[1];
        entry.fromR = rM;
        entry.toR = rM;
        entry.fromN = k.n;
        entry.toN = k.n;
      } else {
        st.anim.set(id, {
          id,
          phase: "live",
          bornAt: now,
          leftAt: 0,
          // A brand-new crowd starts at its real position, radius and count. The
          // entrance animates opacity and scale only: tweening the head count up
          // from zero would put a number on screen that was never measured.
          fromLat: k.c[0],
          fromLng: k.c[1],
          toLat: k.c[0],
          toLng: k.c[1],
          fromR: rM,
          toR: rM,
          fromN: k.n,
          toN: k.n,
          color: meta.color,
          band: meta.label,
          growing: false,
          // draw-loop scratch, so the label pass doesn't recompute the body pass
          vis: false,
          sx: 0,
          sy: 0,
          sr: 0,
          alpha: 0,
          n: k.n,
        });
      }

      const cur = st.anim.get(id);
      cur.color = meta.color;
      cur.band = k.lvl ? meta.label : null; // null density → grey + "no reading"
      // Presence of the pulse encodes "this crowd is growing". Its period is
      // fixed and shared, so nobody can misread a rate out of how fast it beats.
      cur.growing = Number.isFinite(k.g) && k.g >= GROWING_PER_MIN;
    }

    for (const [id, a] of st.anim) {
      if (live.has(id)) continue;

      if (a.phase !== "live") {
        const span = a.phase === "absorbing" ? MERGE_MS : LEAVE_MS;
        if (now - a.leftAt > span) st.anim.delete(id);
        continue;
      }

      const merge = st.pendingMerge.get(id);
      a.phase = merge ? "absorbing" : "leaving";
      a.leftAt = now;
      // Freeze the last measured state; nothing new is coming for this id.
      a.fromLat = a.toLat;
      a.fromLng = a.toLng;
      a.fromR = a.toR;
      a.fromN = a.toN;

      if (merge) {
        // Fly into the survivor's *current* centroid — which is why departures
        // are handled after the live upserts above. `event.at` is the fallback
        // for the case where the survivor isn't on screen.
        const survivor = st.anim.get(String(merge.clusterId));
        const at = survivor ? [survivor.toLat, survivor.toLng] : merge.at;
        if (Array.isArray(at) && Number.isFinite(at[0])) {
          a.toLat = at[0];
          a.toLng = at[1];
        }
      }
      st.pendingMerge.delete(id);
    }

    // Anything left is a merge whose absorbed bubble we never had; drop it so it
    // can't hijack an unrelated cluster later.
    st.pendingMerge.clear();
  }, [clusters, clusterEvents]);

  // Canvas overlay + rAF render loop (set up once per map instance).
  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    // Above DotsLayer (400) because a bubble stands in for dots rather than
    // sitting behind them; still below Leaflet's marker pane (600) so gate pins
    // and tooltips stay clickable.
    canvas.style.zIndex = "401";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    let raf;

    const resize = () => {
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /**
     * Metres → screen pixels, measured once per frame.
     *
     * Web Mercator's scale depends only on latitude and zoom, so a single probe
     * at the map centre covers every bubble on screen: across a venue (a few km)
     * the cos(lat) variation is orders of magnitude below one pixel. Projecting
     * each bubble's own radius offset would cost two extra projections per bubble
     * per frame for a difference nobody can see.
     *
     * `map.project()` rather than `latLngToContainerPoint()` because the latter
     * rounds to whole pixels. Rounding is harmless when placing a dot, but this
     * is a *ratio* — a rounded numerator makes every radius jitter as the map
     * moves. The 100 m probe span keeps any residual error negligible too.
     */
    const pixelsPerMetre = () => {
      const c = map.getCenter();
      const a = map.project([c.lat, c.lng]);
      const b = map.project([c.lat + PROBE_M / M_PER_DEG_LAT, c.lng]);
      return Math.abs(b.y - a.y) / PROBE_M;
    };

    const draw = () => {
      const st = stateRef.current;
      const size = map.getSize();
      ctx.clearRect(0, 0, size.x, size.y);
      if (st.anim.size === 0) return;

      const now = performance.now();
      const t = clamp01((now - st.t0) / TICK_MS);
      const pxPerM = pixelsPerMetre();
      // One shared phase for every growing crowd: the ring is a system cue, not
      // a per-crowd measurement.
      const pulse = (now % PULSE_MS) / PULSE_MS;
      let anyLabel = false;

      // Pass 1: bodies. Screen geometry is cached on each entry so the label pass
      // below is pure drawing. No arrays are built and no rgba() strings are
      // composed per frame — alpha rides on ctx.globalAlpha instead. Clusters
      // number in the tens (against thousands of dots), so the one Point object
      // Leaflet allocates per projection here is bounded and inconsequential;
      // the genuinely hot loop is DotsLayer's, and it now receives *fewer* dots
      // because these bubbles absorb them.
      for (const a of st.anim.values()) {
        a.vis = false;
        let lat;
        let lng;
        let rM;
        let n;
        let alpha;
        let scale; // every branch below assigns it

        if (a.phase === "live") {
          lat = a.fromLat + (a.toLat - a.fromLat) * t;
          lng = a.fromLng + (a.toLng - a.fromLng) * t;
          rM = a.fromR + (a.toR - a.fromR) * t;
          n = a.fromN + (a.toN - a.fromN) * t;
          const appear = easeOut(clamp01((now - a.bornAt) / APPEAR_MS));
          alpha = appear;
          scale = 0.72 + 0.28 * appear;
        } else if (a.phase === "absorbing") {
          const p = clamp01((now - a.leftAt) / MERGE_MS);
          const e = easeInOut(p);
          lat = a.fromLat + (a.toLat - a.fromLat) * e;
          lng = a.fromLng + (a.toLng - a.fromLng) * e;
          rM = a.fromR;
          n = a.fromN; // its last measured count, held while it travels
          scale = 1 - 0.65 * e;
          // Fades late (p²) so the flight itself is the visible part.
          alpha = 1 - p * p;
        } else {
          const p = clamp01((now - a.leftAt) / LEAVE_MS);
          lat = a.fromLat;
          lng = a.fromLng;
          rM = a.fromR;
          n = a.fromN;
          // Dissipating: swells slightly as it fades, the opposite read from a
          // merge's inward collapse.
          scale = 1 + 0.12 * p;
          alpha = 1 - easeOut(p);
        }

        if (alpha <= 0.01) continue;

        const sr = rM * pxPerM * scale;
        if (sr < 1) continue;
        const p = map.latLngToContainerPoint([lat, lng]);
        if (p.x + sr < 0 || p.y + sr < 0 || p.x - sr > size.x || p.y - sr > size.y) continue;

        a.vis = true;
        a.sx = p.x;
        a.sy = p.y;
        a.sr = sr;
        a.alpha = alpha;
        a.n = n;

        ctx.fillStyle = a.color;
        ctx.strokeStyle = a.color;

        // Growth ring, outside the body so it reads as expansion.
        if (a.growing && a.phase === "live") {
          ctx.globalAlpha = alpha * 0.5 * (1 - pulse);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, sr * (1 + 0.3 * pulse), 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sr, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.95;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (sr >= LABEL_MIN_R_PX) anyLabel = true;
      }

      ctx.globalAlpha = 1;
      if (!anyLabel) return;

      // Pass 2: labels. Font and the outline colour are set once for the whole
      // pass rather than per bubble — canvas text state changes are the expensive
      // part of drawing text.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(2,6,23,0.9)";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;

      for (const a of st.anim.values()) {
        if (!a.vis || a.sr < LABEL_MIN_R_PX) continue;
        const wide = a.sr >= BAND_LABEL_MIN_R_PX;
        ctx.globalAlpha = a.alpha;

        ctx.font = "700 13px ui-sans-serif, system-ui, -apple-system, sans-serif";
        const count = formatCount(a.n);
        const cy = wide ? a.sy - 6 : a.sy;
        ctx.strokeText(count, a.sx, cy);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(count, a.sx, cy);

        if (!wide) continue;
        // The Fruin band in words as well as colour — the map should still be
        // readable to someone who cannot tell amber from orange.
        ctx.font = "600 10px ui-sans-serif, system-ui, -apple-system, sans-serif";
        const band = a.band || "no density reading";
        ctx.strokeText(band, a.sx, a.sy + 9);
        ctx.fillStyle = a.band ? "#e2e8f0" : "#cbd5e1";
        ctx.fillText(band, a.sx, a.sy + 9);
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };

    resize();
    loop();
    map.on("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      map.off("resize", resize);
      canvas.remove();
    };
  }, [map]);

  return null;
}
