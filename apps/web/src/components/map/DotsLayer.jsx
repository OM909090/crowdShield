import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

/**
 * DotsLayer — renders thousands of live people-dots on a single <canvas>
 * overlay (one draw call per frame instead of thousands of DOM markers).
 *
 * Smoothness ("Google-Maps feel"): the server ticks ~1/s, but we interpolate
 * each dot from its previous position to the new one across the tick interval
 * via requestAnimationFrame, so motion renders at 60 fps. New dots appear at
 * their target; vanished dots are dropped.
 *
 * Colour encodes speed — slow dots turn amber/red, which is the visual tell of
 * a stalling (potentially dangerous) crowd.
 *
 * For the low thousands this is smooth; a WebGL layer takes over past ~10k
 * (deferred — see ARCHITECTURE §4).
 */
const TICK_MS = 1000;

function speedColor(s) {
  // Speed unknown (device hasn't reported motion yet): neutral grey. Treating
  // "unknown" as 0 would paint it red and imply a stalling crowd.
  if (!Number.isFinite(s)) return "#94a3b8";
  if (s < 0.4) return "#ef4444"; // stalled — watch this
  if (s < 0.9) return "#f59e0b";
  return "#22d3ee";
}

export default function DotsLayer({ dots = [] }) {
  const map = useMap();
  const stateRef = useRef({ anim: new Map(), t0: 0 });
  const drawRef = useRef(() => {});

  // Ingest a new frame: current interpolated target becomes the next start.
  useEffect(() => {
    const st = stateRef.current;
    const next = new Map();
    for (const d of dots) {
      const prev = st.anim.get(d.id);
      next.set(d.id, {
        fromLat: prev ? prev.toLat : d.lat,
        fromLng: prev ? prev.toLng : d.lng,
        toLat: d.lat,
        toLng: d.lng,
        s: Number.isFinite(d.s) ? d.s : null,
      });
    }
    st.anim = next;
    st.t0 = performance.now();
  }, [dots]);

  // Canvas overlay + rAF render loop (set up once per map instance).
  useEffect(() => {
    const container = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "400";
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

    const draw = () => {
      const st = stateRef.current;
      const size = map.getSize();
      ctx.clearRect(0, 0, size.x, size.y);
      const alpha = Math.min(1, (performance.now() - st.t0) / TICK_MS);
      ctx.globalAlpha = 0.85;
      for (const a of st.anim.values()) {
        const lat = a.fromLat + (a.toLat - a.fromLat) * alpha;
        const lng = a.fromLng + (a.toLng - a.fromLng) * alpha;
        const p = map.latLngToContainerPoint([lat, lng]);
        if (p.x < -8 || p.y < -8 || p.x > size.x + 8 || p.y > size.y + 8) continue; // cull offscreen
        ctx.fillStyle = speedColor(a.s);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    drawRef.current = draw;

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
