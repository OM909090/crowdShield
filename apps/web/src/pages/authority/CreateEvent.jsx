import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  Tag,
  FileText,
  CalendarClock,
  MapPin,
  Users,
  Image as ImageIcon,
  Navigation,
  Sparkles,
  PartyPopper,
  Trophy,
  Music2,
  Landmark,
  Megaphone,
  Plus,
  Trash2,
  CalendarDays,
  ShieldAlert,
  Radar,
  MapPinned,
  BarChart3,
  KeyRound,
} from "lucide-react";
import api from "../../utils/axios";

const TYPES = [
  { value: "Festival", icon: PartyPopper },
  { value: "Sports", icon: Trophy },
  { value: "Concert", icon: Music2 },
  { value: "Religious Gathering", icon: Landmark },
  { value: "Political Rally", icon: Megaphone },
  { value: "Other", icon: Sparkles },
];

const STATUS_STYLES = {
  upcoming: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  ongoing: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  completed: "border-slate-500/30 bg-slate-500/10 text-slate-400",
  cancelled: "border-red-400/30 bg-red-500/10 text-red-300",
};

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950";

export default function CreateEvent() {
  const navigate = useNavigate();
  const [myEvents, setMyEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [coords, setCoords] = useState(null);
  const [me, setMe] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: "",
      type: "Festival",
      description: "",
      startDate: "",
      endDate: "",
      venueName: "",
      address: "",
      expectedAttendance: "",
      bannerUrl: "",
    },
  });

  const selectedType = watch("type");

  const loadMyEvents = async () => {
    try {
      setLoadingEvents(true);
      const res = await api.get("/events/mine");
      setMyEvents(res.data.events || []);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load your events");
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadMyEvents();
    api
      .get("/auth/me")
      .then((res) => setMe(res.data.user))
      .catch(() => {});
  }, []);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        toast.success("Venue coordinates captured");
      },
      () => toast.error("Location permission denied"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onSubmit = async (data) => {
    try {
      const payload = {
        name: data.name,
        type: data.type,
        description: data.description || undefined,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
        expectedAttendance: data.expectedAttendance ? Number(data.expectedAttendance) : undefined,
        bannerUrl: data.bannerUrl || undefined,
        location: {
          venueName: data.venueName,
          address: data.address,
          coordinates: coords || undefined,
        },
      };

      await api.post("/events", payload);
      toast.success("Event created and listed");
      reset();
      setCoords(null);
      loadMyEvents();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not create event");
    }
  };

  const deleteEvent = async (id) => {
    try {
      await api.delete(`/events/${id}`);
      toast.success("Event removed");
      setMyEvents((prev) => prev.filter((e) => e._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not delete event");
    }
  };

  const formatDateRange = (start, end) => {
    const opts = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
    return `${new Date(start).toLocaleString("en-IN", opts)} — ${new Date(end).toLocaleString("en-IN", opts)}`;
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          {/* Right padding keeps this row clear of the fixed account chip, which
              is pinned to the top-right corner across every signed-in page. */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 pr-20 sm:pr-56">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <CalendarDays className="h-4 w-4" />
              Authority Console
            </div>

            {/* The ONLY route into provider setup. An authority lands here after
                signing in and the console has no sidebar, so this is the single
                door — deliberately not duplicated on other pages. */}
            <button
              type="button"
              onClick={() => navigate("/settings/ai-provider")}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
            >
              <KeyRound className="h-4 w-4 text-cyan-300" />
              AI Provider
            </button>
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Create & manage events</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            List an event so citizens can find it, and so the control room can start tracking crowd
            density for that venue once it's live.
          </p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] xl:grid-cols-[0.9fr_1.1fr]">
          {/* Create form */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="h-fit rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 lg:sticky lg:top-8"
          >
            <h2 className="mb-5 text-lg font-bold text-white">New Event</h2>

            {me && me.role === "authority" && !me.isVerifiedAuthority && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-amber-200">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <p className="text-sm leading-6">
                  Your authority account is pending admin verification. You can fill out this form,
                  but publishing is disabled until your account is approved.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Event Name</label>
                <div className="relative">
                  <Tag className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="e.g. Rath Yatra, Bhubaneswar"
                    className={`pl-11 ${inputClass}`}
                    {...register("name", { required: "Event name is required" })}
                  />
                </div>
                {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Event Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPES.map((t) => {
                    const Icon = t.icon;
                    const active = selectedType === t.value;
                    return (
                      <label
                        key={t.value}
                        className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-[11px] font-medium transition ${
                          active
                            ? "border-cyan-400/40 bg-gradient-to-b from-cyan-400 to-blue-500 text-slate-950"
                            : "border-white/10 bg-slate-950/40 text-slate-300 hover:border-cyan-400/20"
                        }`}
                      >
                        <input type="radio" value={t.value} className="sr-only" {...register("type")} />
                        <Icon size={16} />
                        {t.value}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Description</label>
                <div className="relative">
                  <FileText className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
                  <textarea
                    rows={3}
                    placeholder="Brief description, expected crowd behaviour, key gates, etc."
                    className={`resize-none pl-11 ${inputClass}`}
                    {...register("description")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Starts</label>
                  <div className="relative">
                    <CalendarClock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="datetime-local"
                      className={`pl-11 ${inputClass}`}
                      {...register("startDate", { required: "Start date/time is required" })}
                    />
                  </div>
                  {errors.startDate && <p className="mt-1 text-xs text-red-400">{errors.startDate.message}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Ends</label>
                  <div className="relative">
                    <CalendarClock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="datetime-local"
                      className={`pl-11 ${inputClass}`}
                      {...register("endDate", { required: "End date/time is required" })}
                    />
                  </div>
                  {errors.endDate && <p className="mt-1 text-xs text-red-400">{errors.endDate.message}</p>}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Venue Name</label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="e.g. Grand Road"
                    className={`pl-11 ${inputClass}`}
                    {...register("venueName", { required: "Venue name is required" })}
                  />
                </div>
                {errors.venueName && <p className="mt-1 text-xs text-red-400">{errors.venueName.message}</p>}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Address</label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="Full address"
                    className={`pl-11 ${inputClass}`}
                    {...register("address", { required: "Address is required" })}
                  />
                </div>
                {errors.address && <p className="mt-1 text-xs text-red-400">{errors.address.message}</p>}
              </div>

              <motion.button
                type="button"
                onClick={useCurrentLocation}
                whileTap={{ scale: 0.98 }}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm transition ${
                  coords
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15"
                }`}
              >
                <Navigation size={16} />
                {coords ? "✓ Coordinates captured" : "Use current location for venue pin"}
              </motion.button>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Expected Attendance</label>
                  <div className="relative">
                    <Users className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 50000"
                      className={`pl-11 ${inputClass}`}
                      {...register("expectedAttendance")}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Banner URL</label>
                  <div className="relative">
                    <ImageIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input placeholder="Optional image link" className={`pl-11 ${inputClass}`} {...register("bannerUrl")} />
                  </div>
                </div>
              </div>

              <motion.button
                type="submit"
                disabled={isSubmitting || (me?.role === "authority" && !me.isVerifiedAuthority)}
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus size={18} />
                {isSubmitting ? "Publishing..." : "Publish Event"}
              </motion.button>
            </form>
          </motion.div>

          {/* My events list */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <h2 className="mb-4 text-lg font-bold text-white">Your Events ({myEvents.length})</h2>

            {loadingEvents ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
                ))}
              </div>
            ) : myEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center">
                <Sparkles className="mb-3 h-7 w-7 text-slate-600" />
                <p className="text-slate-300">No events published yet</p>
                <p className="mt-1 text-sm text-slate-500">Use the form to list your first event.</p>
              </div>
            ) : (
              <motion.div layout className="space-y-3">
                <AnimatePresence>
                  {myEvents.map((event) => {
                    const status = event.liveStatus || event.status || "upcoming";
                    return (
                      <motion.div
                        key={event._id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-cyan-400/20"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-semibold text-white">{event.name}</h3>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[status]}`}
                            >
                              {status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{event.type}</p>
                          <p className="mt-1.5 text-xs text-slate-500">
                            {formatDateRange(event.startDate, event.endDate)}
                          </p>
                          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <MapPin size={12} />
                            {event.location?.venueName}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                          <button
                            onClick={() => navigate(`/authority/events/${event._id}/command-center`)}
                            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/15"
                          >
                            <Radar size={13} />
                            Command Center
                          </button>
                          <button
                            onClick={() => navigate(`/authority/events/${event._id}/analytics`)}
                            className="flex items-center gap-1.5 rounded-xl border border-violet-400/25 bg-violet-400/10 px-3 py-2 text-xs font-medium text-violet-200 transition hover:bg-violet-400/15"
                          >
                            <BarChart3 size={13} />
                            Analytics
                          </button>
                          <button
                            onClick={() => navigate(`/authority/events/${event._id}/map`)}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-400/20 hover:text-white"
                          >
                            <MapPinned size={13} />
                            Map Editor
                          </button>
                          <button
                            onClick={() => deleteEvent(event._id)}
                            className="flex items-center justify-center rounded-xl border border-white/10 p-2 text-slate-500 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300"
                            aria-label="Delete event"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
