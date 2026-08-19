import { DoorClosed, DoorOpen } from "lucide-react";

/**
 * A key for the live map.
 *
 * The map paints a lot at once — zones tinted by predicted risk, gate pins that
 * flip colour when closed, a glowing crowd bubble, a cyan AI route, a pink
 * AI-flagged outline. Without a legend an operator has to guess what each colour
 * means, and on a safety surface a guess is a failure. Kept compact and
 * `pointer-events-none` so it never steals a click from the map underneath.
 */
export default function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[500] w-[11.5rem] rounded-2xl border border-white/10 bg-slate-950/85 px-3 py-2.5 text-[11px] leading-tight text-slate-200 shadow-lg backdrop-blur-xl">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400">Legend</p>

      {/* Predicted risk, as a gradient so it reads as a scale, not five loose dots. */}
      <div className="mb-2">
        <div
          className="h-2 w-full rounded-full"
          style={{ background: "linear-gradient(90deg,#22c55e,#f59e0b,#f97316,#ef4444)" }}
        />
        <div className="mt-1 flex justify-between text-[9px] text-slate-400">
          <span>Normal</span>
          <span>Critical</span>
        </div>
        <p className="text-[9px] text-slate-500">zone predicted risk</p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <DoorOpen size={12} className="flex-shrink-0 text-cyan-300" />
          <span>Gate open</span>
          <DoorClosed size={12} className="ml-auto flex-shrink-0 text-red-300" />
          <span>closed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: "#38bdf8" }} />
          <span>Live person</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: "rgba(245,158,11,0.5)", border: "1px solid #f59e0b" }} />
          <span>Tracked crowd</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 flex-shrink-0 border-t-2 border-dashed" style={{ borderColor: "#22d3ee" }} />
          <span>AI route</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-[3px] border border-dashed" style={{ borderColor: "#f472b6" }} />
          <span>AI-flagged zone</span>
        </div>
      </div>
    </div>
  );
}
