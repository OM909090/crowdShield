import { useEffect, useRef, useState } from "react";
import { Polygon, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { polygonAreaM2, simplifyPath } from "../../utils/geoClient";

/**
 * CoverageDrawLayer — the freehand "pen" for the Area of Responsibility.
 *
 * Mounted as a react-leaflet child while the editor is in `coverage` mode. The
 * authority holds and drags one stroke; on release the ring is closed,
 * simplified and handed up through `onComplete`. Nothing is persisted here — the
 * page writes the ring into its `aor` state and the existing
 * `PUT /events/:id/venue` derives the authoritative area.
 *
 * Pointer (not mouse) events throughout, so a trackpad, a stylus and a finger
 * all behave the same, and the gesture survives the pointer leaving the map.
 */

/**
 * Minimum screen travel between two accepted samples. Below ~2px the samples
 * are indistinguishable to the eye but still cost a vertex, so this is the first
 * (cheap, resolution-independent) filter; RDP is the second, geographic one.
 */
const MIN_SAMPLE_PX = 2;

/**
 * RDP tolerance in metres.
 *
 * Chosen at street width, not pixel width. The AoR answers one operational
 * question — "is this person inside the area I monitor?" — and a boundary that
 * is accurate to ~4m is well inside the error of both a hand-drawn trace and a
 * phone's GPS fix. It is also the scale the rest of the model works at (a gate
 * defaults to 5m clear width). Smaller than this and we would be preserving
 * hand tremor; much larger and real corners of a boundary start rounding off.
 * At the editor's default zoom 16 one pixel is ~2.2m here, so 4m is roughly two
 * pixels of drawn detail: invisible to the person drawing.
 */
const SIMPLIFY_TOLERANCE_M = 4;

/** A ring needs three distinct corners to bound an area. */
const MIN_RING_POINTS = 3;

/**
 * Upstream progress is throttled: the parent renders a readout panel, and
 * re-rendering the whole editor on every one of ~300 pointermove samples is
 * wasted work. ~12Hz still reads as live. The trace itself is not throttled —
 * it lives in this component's state so the ink follows the pointer.
 */
const PROGRESS_INTERVAL_MS = 80;

/** Leaflet handlers the pen must own for the duration of the stroke. */
const SUPPRESSED_HANDLERS = ["dragging", "boxZoom", "doubleClickZoom"];

const samePoint = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

/* The pen is drawing the AoR, so it borrows the AoR/draft vocabulary from
 * venueNodes.js: cyan-400 ink, the same 0.12 fill used for draft polygons. */
const penInkStyle = {
  color: "#22d3ee",
  weight: 3,
  opacity: 0.95,
  lineCap: "round",
  lineJoin: "round",
  interactive: false,
};

const penFillStyle = {
  color: "#22d3ee",
  weight: 0,
  fillColor: "#22d3ee",
  fillOpacity: 0.12,
  interactive: false,
};

export default function CoverageDrawLayer({
  onComplete,
  onProgress,
  toleranceMeters = SIMPLIFY_TOLERANCE_M,
}) {
  const map = useMap();
  const [trace, setTrace] = useState([]);

  /* Latest props behind a ref. The listener effect below must run exactly once
   * per map: if it depended on the callbacks it would tear itself down and
   * re-attach the moment the parent re-rendered with new closures — which
   * happens on every progress report, i.e. mid-stroke. */
  const latest = useRef({ onComplete, onProgress, toleranceMeters });
  useEffect(() => {
    latest.current = { onComplete, onProgress, toleranceMeters };
  }, [onComplete, onProgress, toleranceMeters]);

  useEffect(() => {
    const container = map.getContainer();

    /* Leaflet must stop competing for the gesture:
     *  - `dragging` would pan the map the instant the pointer moves with the
     *    button held, so no stroke could ever be drawn.
     *  - `boxZoom` hijacks shift+drag into a zoom rectangle.
     *  - `doubleClickZoom` fires when someone taps twice while adjusting.
     * We snapshot each handler's previous state and restore exactly that on
     * cleanup, so we never silently enable something the map had switched off.
     * `disableTextSelection`/`disableImageDrag` are document-level (Leaflet's own
     * Drag handler uses them) and MUST be undone or the whole app loses text
     * selection — hence the unconditional cleanup below. */
    const wasEnabled = {};
    SUPPRESSED_HANDLERS.forEach((name) => {
      const handler = map[name];
      if (!handler) return;
      wasEnabled[name] = handler.enabled();
      handler.disable();
    });
    L.DomUtil.disableTextSelection();
    L.DomUtil.disableImageDrag();

    /* Also a CSS concern: Leaflet only sets `touch-action: none` while its own
     * drag handler is attached, so disabling dragging would hand touch drags
     * back to the browser as page scroll. `.cs-pen-active` pins it (and the
     * crosshair) for as long as the pen is armed. */
    container.classList.add("cs-pen-active");

    /* Gesture state is effect-local, not React state: it changes far faster
     * than a render and must never be read from a stale closure. */
    let samples = [];
    let lastPixel = null;
    let activePointer = null;
    let lastProgressAt = 0;

    const report = (list, drawing) => {
      latest.current.onProgress?.({
        points: list.length,
        areaM2: list.length >= MIN_RING_POINTS ? polygonAreaM2(list) : 0,
        drawing,
      });
    };

    const releaseCapture = (pointerId) => {
      if (pointerId === null) return;
      try {
        if (container.hasPointerCapture?.(pointerId)) container.releasePointerCapture(pointerId);
      } catch {
        /* A pointer can already be gone (device removed, tab switch) — losing
         * capture is exactly the state we wanted anyway. */
      }
    };

    const onPointerDown = (event) => {
      if (activePointer !== null) return; // ignore a second finger mid-stroke
      if (event.button > 0) return; // primary button / contact only
      activePointer = event.pointerId;
      lastPixel = map.mouseEventToContainerPoint(event);
      const start = map.containerPointToLatLng(lastPixel);
      samples = [[start.lat, start.lng]];
      setTrace(samples);
      lastProgressAt = 0;
      report(samples, true);
      /* Capture keeps the stroke alive if the pointer wanders off the map (over
       * a panel, or outside the window) instead of silently truncating it. */
      try {
        container.setPointerCapture?.(event.pointerId);
      } catch {
        /* Without capture we still work — `pointerleave` below ends the stroke. */
      }
      event.preventDefault();
    };

    const onPointerMove = (event) => {
      if (activePointer === null || event.pointerId !== activePointer) return;
      const pixel = map.mouseEventToContainerPoint(event);
      if (lastPixel && pixel.distanceTo(lastPixel) < MIN_SAMPLE_PX) return;
      lastPixel = pixel;
      const latlng = map.containerPointToLatLng(pixel);
      samples = [...samples, [latlng.lat, latlng.lng]];
      setTrace(samples);

      const now = performance.now();
      if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
        lastProgressAt = now;
        report(samples, true);
      }
      event.preventDefault();
    };

    const reset = () => {
      releaseCapture(activePointer);
      activePointer = null;
      lastPixel = null;
      samples = [];
      setTrace([]);
    };

    const finish = (event) => {
      if (activePointer === null) return;
      if (event?.pointerId !== undefined && event.pointerId !== activePointer) return;

      const raw = samples;
      reset();

      if (raw.length < MIN_RING_POINTS) {
        // A tap or a flick: not an area. Discard rather than save a sliver.
        report([], false);
        return;
      }

      /* Close first, then simplify, so the closing edge is judged by the same
       * tolerance as the rest of the stroke (the segment-distance helper handles
       * the zero-length first/last segment this creates). Then drop the repeated
       * vertex: the venue graph stores open rings. */
      const closed = [...raw, raw[0]];
      const simplified = simplifyPath(closed, latest.current.toleranceMeters);
      const ring =
        simplified.length > 1 && samePoint(simplified[0], simplified[simplified.length - 1])
          ? simplified.slice(0, -1)
          : simplified;

      if (ring.length < MIN_RING_POINTS) {
        report([], false);
        return;
      }

      const areaM2 = polygonAreaM2(ring);
      report(ring, false);
      latest.current.onComplete?.(ring, { areaM2, rawPoints: raw.length });
    };

    const abort = () => {
      if (activePointer === null) return;
      reset();
      report([], false);
    };

    const onKeyDown = (event) => {
      // Escape abandons the stroke in progress — keyboard escape hatch for a
      // gesture that otherwise only ends on release.
      if (event.key === "Escape") abort();
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", finish);
    container.addEventListener("pointerleave", finish);
    container.addEventListener("pointercancel", abort);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", finish);
      container.removeEventListener("pointerleave", finish);
      container.removeEventListener("pointercancel", abort);
      window.removeEventListener("keydown", onKeyDown);

      releaseCapture(activePointer);
      activePointer = null;

      // Hand the map back exactly as we found it. Skipping this would leave the
      // editor permanently unpannable after leaving coverage mode.
      SUPPRESSED_HANDLERS.forEach((name) => {
        if (wasEnabled[name] && map[name]) map[name].enable();
      });
      L.DomUtil.enableTextSelection();
      L.DomUtil.enableImageDrag();
      container.classList.remove("cs-pen-active");
    };
  }, [map]);

  if (trace.length < 2) return null;

  return (
    <>
      {/* Fill preview sits under the ink so the stroke stays crisp. */}
      {trace.length >= MIN_RING_POINTS && <Polygon positions={trace} pathOptions={penFillStyle} />}
      <Polyline positions={trace} pathOptions={penInkStyle} />
    </>
  );
}
