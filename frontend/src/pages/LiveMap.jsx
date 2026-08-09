import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPinned, Radar, Activity, Wifi, ShieldAlert, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import api from "../utils/axios";
import VenueMap from "../components/VenueMap";

// Fallback center used only when an event has no saved coordinates yet.
const DEFAULT_CENTER = [20.2961, 85.8245]; // Bhubaneswar, Odisha

export default function LiveMap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(true);

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
        toast.error(err.response?.data?.message || "Failed to load map");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const center = event?.location?.coordinates?.coordinates
    ? [event.location.coordinates.coordinates[1], event.location.coordinates.coordinates[0]]
    : DEFAULT_CENTER;

  const blockages = markers.filter((m) => ["Barricade", "Blocked Path"].includes(m.type)).length;

  const metrics = [
    { label: "Marked zones", value: String(markers.length).padStart(2, "0"), icon: Radar },
    { label: "Blockages flagged", value: String(blockages).padStart(2, "0"), icon: ShieldAlert },
    { label: "Live feeds", value: "24/7", icon: Wifi },
    { label: "Movement pace", value: "Stable", icon: Activity },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[85vh] items-center justify-center text-slate-400">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
          <Radar className="h-8 w-8 text-cyan-400" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[85vh] overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative space-y-6">
        <button
          onClick={() => navigate("/events")}
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft size={15} />
          Back to events
        </button>

        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <MapPinned className="h-4 w-4" />
              Real-time venue intelligence
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">{event?.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Track authority-marked safe zones, barricades, and blocked paths across{" "}
              {event?.location?.venueName} in real time.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur-xl"
                >
                  <div className="mb-2 flex items-center gap-2 text-cyan-300">
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{item.label}</span>
                  </div>
                  <p className="text-lg font-bold text-white">{item.value}</p>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20 backdrop-blur-xl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_35%)]" />

          <div className="relative border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                  <Radar className="h-5 w-5 text-cyan-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Live Monitoring Layer</p>
                  <p className="text-xs text-slate-400">Authority-marked zones and blockages</p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
                System online
              </div>
            </div>
          </div>

          <div className="h-[60vh] min-h-[500px] lg:h-[700px]">
            <VenueMap
              center={center}
              venue={{ name: event?.location?.venueName, address: event?.location?.address }}
              markers={markers}
              editable={false}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
