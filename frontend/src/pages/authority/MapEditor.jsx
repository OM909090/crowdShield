import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { MapPinned, Radar, ArrowLeft, X, Check, Trash2, Info } from "lucide-react";
import api from "../../utils/axios";
import VenueMap, { MARKER_TYPES } from "../../components/VenueMap";

// Fallback center used only when an event has no saved coordinates yet.
const DEFAULT_CENTER = [20.2961, 85.8245]; // Bhubaneswar, Odisha

export default function MapEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingPoint, setPendingPoint] = useState(null); // { lat, lng }
  const [pendingType, setPendingType] = useState(MARKER_TYPES[0].value);
  const [pendingLabel, setPendingLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [eventRes, markersRes] = await Promise.all([
          api.get(`/events/${id}`),
          api.get(`/events/${id}/markers`),
        ]);
        setEvent(eventRes.data.event);
        setMarkers(markersRes.data.markers);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load map data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const center = event?.location?.coordinates?.coordinates
    ? [event.location.coordinates.coordinates[1], event.location.coordinates.coordinates[0]]
    : DEFAULT_CENTER;

  const handleMapClick = (latlng) => {
    setPendingPoint(latlng);
    setPendingType(MARKER_TYPES[0].value);
    setPendingLabel("");
  };

  const confirmMarker = async () => {
    if (!pendingPoint) return;
    try {
      setSaving(true);
      const res = await api.post(`/events/${id}/markers`, {
        type: pendingType,
        label: pendingLabel || undefined,
        lat: pendingPoint.lat,
        lng: pendingPoint.lng,
      });
      setMarkers((prev) => [...prev, res.data.marker]);
      toast.success("Marker added");
      setPendingPoint(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not add marker");
    } finally {
      setSaving(false);
    }
  };

  const deleteMarker = async (markerId) => {
    try {
      await api.delete(`/events/${id}/markers/${markerId}`);
      setMarkers((prev) => prev.filter((m) => m._id !== markerId));
      toast.success("Marker removed");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not remove marker");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <Radar className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8 lg:px-10">
        <button
          onClick={() => navigate("/authority/events")}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft size={15} />
          Back to your events
        </button>

        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <MapPinned className="h-4 w-4" />
              Venue Map Editor
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">{event?.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Click anywhere on the map to mark barricades, blocked paths, safe zones, or gates —
              things routing guidance can't see from the base map alone.
            </p>
          </div>

          {!event?.location?.coordinates?.coordinates && (
            <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              <Info size={14} className="shrink-0" />
              No saved coordinates for this event — showing an approximate default location.
            </div>
          )}
        </motion.div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2">
          {MARKER_TYPES.map((t) => (
            <span
              key={t.value}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              {t.value}
            </span>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20"
        >
          <div className="h-[60vh] min-h-[500px] lg:h-[650px]">
            <VenueMap
              center={center}
              venue={{ name: event?.location?.venueName, address: event?.location?.address }}
              markers={markers}
              editable
              onMapClick={handleMapClick}
              onDeleteMarker={deleteMarker}
            />
          </div>
        </motion.div>

        {markers.length > 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Placed markers ({markers.length})</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {markers.map((m) => (
                <div
                  key={m._id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs"
                >
                  <span className="text-slate-300">
                    {m.type}
                    {m.label ? ` — ${m.label}` : ""}
                  </span>
                  <button onClick={() => deleteMarker(m._id)} className="shrink-0 text-slate-500 hover:text-red-300">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Pending marker placement panel */}
      <AnimatePresence>
        {pendingPoint && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed inset-x-0 bottom-6 z-[1000] mx-auto w-[92%] max-w-lg rounded-3xl border border-cyan-400/20 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Add marker</p>
              <button onClick={() => setPendingPoint(null)} className="text-slate-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="mb-3 grid grid-cols-4 gap-2">
              {MARKER_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setPendingType(t.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-medium transition ${
                    pendingType === t.value
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                      : "border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  <span className="text-base">{t.emoji}</span>
                  {t.value}
                </button>
              ))}
            </div>

            <input
              value={pendingLabel}
              onChange={(e) => setPendingLabel(e.target.value)}
              placeholder="Optional label (e.g. 'Steel barricade, 20m')"
              className="mb-3 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/50"
            />

            <button
              onClick={confirmMarker}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition disabled:opacity-60"
            >
              <Check size={15} />
              {saving ? "Saving..." : "Place marker"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
