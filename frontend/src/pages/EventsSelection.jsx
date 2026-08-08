import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  Search,
  MapPin,
  Users,
  CalendarClock,
  LayoutGrid,
  PartyPopper,
  Trophy,
  Music2,
  Landmark,
  Megaphone,
  Sparkles,
  ArrowRight,
  RadioTower,
} from "lucide-react";
import api from "../utils/axios";

const TYPES = [
  { value: "All", label: "All Events", icon: LayoutGrid },
  { value: "Festival", label: "Festival", icon: PartyPopper },
  { value: "Sports", label: "Sports", icon: Trophy },
  { value: "Concert", label: "Concert", icon: Music2 },
  { value: "Religious Gathering", label: "Religious", icon: Landmark },
  { value: "Political Rally", label: "Rally", icon: Megaphone },
  { value: "Other", label: "Other", icon: Sparkles },
];

const TYPE_ICON = Object.fromEntries(TYPES.map((t) => [t.value, t.icon]));

const STATUS_STYLES = {
  upcoming: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  ongoing: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  completed: "border-slate-500/30 bg-slate-500/10 text-slate-400",
  cancelled: "border-red-400/30 bg-red-500/10 text-red-300",
};

const formatDateRange = (start, end) => {
  const opts = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
  const s = new Date(start).toLocaleString("en-IN", opts);
  const e = new Date(end).toLocaleString("en-IN", opts);
  return `${s} — ${e}`;
};

function EventCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      <div className="h-36 bg-white/5" />
      <div className="space-y-3 p-5">
        <div className="h-4 w-2/3 rounded bg-white/10" />
        <div className="h-3 w-1/2 rounded bg-white/5" />
        <div className="h-3 w-1/3 rounded bg-white/5" />
      </div>
    </div>
  );
}

export default function EventSelection() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState("All");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const res = await api.get("/events");
        setEvents(res.data.events || []);
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to load events");
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesType = activeType === "All" || event.type === activeType;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        event.name?.toLowerCase().includes(q) ||
        event.location?.venueName?.toLowerCase().includes(q) ||
        event.location?.address?.toLowerCase().includes(q);
      return matchesType && matchesQuery;
    });
  }, [events, activeType, query]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
            <RadioTower className="h-4 w-4" />
            Live crowd intelligence, per event
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Choose your event</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Pick the festival, match, or gathering you're attending to see live crowd density, safe
            routes, and alerts for that venue.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by event or venue"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/60 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950"
            />
          </div>

          <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = activeType === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setActiveType(t.value)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition ${
                    active
                      ? "border-cyan-400/40 bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-400/20 hover:text-white"
                  }`}
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </motion.div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <EventCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center"
          >
            <Sparkles className="mb-3 h-8 w-8 text-slate-600" />
            <p className="text-slate-300">No events match your search</p>
            <p className="mt-1 text-sm text-slate-500">Try a different keyword or category.</p>
          </motion.div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {filteredEvents.map((event) => {
                const Icon = TYPE_ICON[event.type] || Sparkles;
                const status = event.liveStatus || event.status || "upcoming";
                return (
                  <motion.div
                    key={event._id}
                    layout
                    variants={{
                      hidden: { opacity: 0, y: 16 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
                    }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    whileHover={{ y: -4 }}
                    className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-lg shadow-black/20 transition-colors hover:border-cyan-400/30"
                  >
                    <div className="relative h-36 overflow-hidden">
                      {event.bannerUrl ? (
                        <img
                          src={event.bannerUrl}
                          alt={event.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/20 via-slate-900 to-blue-500/20">
                          <Icon className="h-10 w-10 text-cyan-300/60" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />

                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/20 bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                        <Icon size={12} />
                        {event.type}
                      </span>

                      <span
                        className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize backdrop-blur ${STATUS_STYLES[status]}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            status === "ongoing" ? "animate-pulse bg-emerald-400" : "bg-current"
                          }`}
                        />
                        {status}
                      </span>
                    </div>

                    <div className="p-5">
                      <h3 className="text-lg font-bold text-white">{event.name}</h3>

                      <div className="mt-3 space-y-1.5 text-sm text-slate-400">
                        <div className="flex items-center gap-2">
                          <CalendarClock size={14} className="shrink-0 text-slate-500" />
                          <span>{formatDateRange(event.startDate, event.endDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className="shrink-0 text-slate-500" />
                          <span className="line-clamp-1">{event.location?.venueName}</span>
                        </div>
                        {event.expectedAttendance ? (
                          <div className="flex items-center gap-2">
                            <Users size={14} className="shrink-0 text-slate-500" />
                            <span>{event.expectedAttendance.toLocaleString("en-IN")} expected</span>
                          </div>
                        ) : null}
                      </div>

                      <motion.button
                        whileHover={{ x: 2 }}
                        onClick={() => navigate(`/events/${event._id}/dashboard`)}
                        className="group/btn mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-cyan-500/10 transition"
                      >
                        View Crowd Dashboard
                        <ArrowRight size={15} className="transition-transform group-hover/btn:translate-x-1" />
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
