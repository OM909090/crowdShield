import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  ShieldAlert,
  MapPin,
  Phone,
  UserRound,
  Cake,
  UsersRound,
  Sparkles,
  ArrowRight,
  Building2,
  AlertCircle,
  Mail,
} from "lucide-react";
import { Navigate, useLocation, useNavigate, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { useAuth } from "../context/AuthContext";

const ROLES = [
  { value: "citizen", label: "Citizen", icon: UserRound, description: "Live alerts & safe routes" },
  { value: "authority", label: "Authority", icon: ShieldAlert, description: "Control room access" },
];

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function GoogleSignupComplete() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [requestingLocation, setRequestingLocation] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      mobile: "",
      age: "",
      gender: "",
      emergencyContact: "",
      language: "",
      role: "citizen",
      organizationId: "",
    },
  });

  const role = watch("role");
  const isAuthority = role === "authority";

  // No Google profile in state — someone landed here directly, bounce to normal signup
  if (!state?.email || !state?.googleId) return <Navigate to="/signup" replace />;

  const { name, email, googleId } = state;

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation isn't supported by this browser");
      toast.error("Geolocation is not supported by this browser");
      return;
    }
    setRequestingLocation(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationError("");
        setRequestingLocation(false);
        toast.success("Location access enabled");
      },
      () => {
        setRequestingLocation(false);
        setLocationError("Location access is required to create an account");
        toast.error("Location permission denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const submitHandler = async (data) => {
    if (!location) {
      setLocationError("Please allow location access before continuing");
      toast.error("Location access is required");
      return;
    }
    try {
      const payload = {
        ...data,
        name,
        email,
        googleId,
        organizationId: data.role === "authority" ? data.organizationId : undefined,
        location,
      };
      const res = await api.post("/auth/google/complete", payload);
      setUser(res.data.user);
      toast.success("Account created");
      navigate(data.role === "authority" ? "/authority/events" : "/events", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || "Signup failed");
    }
  };

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950";

  const fieldWrap = "space-y-2";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl"
        animate={{ y: [0, 24, 0], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl"
        animate={{ y: [0, -24, 0], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl sm:p-10"
        >
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
              <Sparkles className="h-4 w-4" />
              Almost there
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Complete your profile</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Signed in with Google as
            </p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-slate-200">
              <Mail size={14} className="text-cyan-400" />
              {email}
            </div>
          </div>

          <form onSubmit={handleSubmit(submitHandler)} className="space-y-5">
            <motion.div variants={itemVariants} initial="hidden" animate="visible" className={fieldWrap}>
              <label className="block text-sm font-medium text-slate-300">I am signing up as</label>
              <div className="relative grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-slate-950/60 p-1.5">
                <motion.div
                  className="absolute inset-y-1.5 left-1.5 w-[calc(50%-6px)] rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/20"
                  animate={{ x: isAuthority ? "calc(100% + 6px)" : 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const active = role === r.value;
                  return (
                    <label
                      key={r.value}
                      className={`relative z-10 flex cursor-pointer flex-col items-center gap-1 rounded-xl px-3 py-3 text-center transition-colors ${
                        active ? "text-slate-950" : "text-slate-300 hover:text-white"
                      }`}
                    >
                      <input type="radio" value={r.value} className="sr-only" {...register("role")} />
                      <Icon size={18} />
                      <span className="text-sm font-semibold">{r.label}</span>
                      <span className={`text-[11px] leading-tight ${active ? "text-slate-900/70" : "text-slate-500"}`}>
                        {r.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </motion.div>

            <motion.div variants={gridVariants} initial="hidden" animate="visible" className="grid gap-5 md:grid-cols-2">
              <motion.div variants={itemVariants} className={fieldWrap}>
                <label className="block text-sm font-medium text-slate-300">Mobile Number</label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="Mobile Number"
                    className={`pl-11 ${inputClass}`}
                    {...register("mobile", {
                      required: "Mobile number is required",
                      pattern: { value: /^[0-9]{10}$/, message: "Invalid mobile number" },
                    })}
                  />
                </div>
                {errors.mobile && <p className="text-sm text-red-400">{errors.mobile.message}</p>}
              </motion.div>

              <motion.div variants={itemVariants} className={fieldWrap}>
                <label className="block text-sm font-medium text-slate-300">Age</label>
                <div className="relative">
                  <Cake className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="Age"
                    type="number"
                    className={`pl-11 ${inputClass}`}
                    {...register("age", {
                      required: "Age is required",
                      valueAsNumber: true,
                      min: { value: 1, message: "Enter a valid age" },
                    })}
                  />
                </div>
                {errors.age && <p className="text-sm text-red-400">{errors.age.message}</p>}
              </motion.div>

              <motion.div variants={itemVariants} className={fieldWrap}>
                <label className="block text-sm font-medium text-slate-300">Gender</label>
                <div className="relative">
                  <UsersRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    className={`pl-11 ${inputClass} appearance-none`}
                    {...register("gender", { required: "Gender is required" })}
                  >
                    <option value="">Select Gender</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
                {errors.gender && <p className="text-sm text-red-400">{errors.gender.message}</p>}
              </motion.div>

              <motion.div variants={itemVariants} className={fieldWrap}>
                <label className="block text-sm font-medium text-slate-300">Emergency Contact</label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    placeholder="Emergency Contact Number"
                    className={`pl-11 ${inputClass}`}
                    {...register("emergencyContact", {
                      required: "Emergency contact required",
                      pattern: { value: /^[0-9]{10}$/, message: "Invalid contact number" },
                    })}
                  />
                </div>
                {errors.emergencyContact && (
                  <p className="text-sm text-red-400">{errors.emergencyContact.message}</p>
                )}
              </motion.div>

              <motion.div variants={itemVariants} className={`${fieldWrap} md:col-span-2`}>
                <label className="block text-sm font-medium text-slate-300">Preferred Language</label>
                <select
                  className={inputClass}
                  {...register("language", { required: "Preferred language required" })}
                >
                  <option value="">Preferred Language</option>
                  <option>English</option>
                  <option>Hindi</option>
                  <option>Odia</option>
                  <option>Other</option>
                </select>
                {errors.language && <p className="text-sm text-red-400">{errors.language.message}</p>}
              </motion.div>

              <AnimatePresence>
                {isAuthority && (
                  <motion.div
                    key="organizationId"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className={`${fieldWrap} overflow-hidden md:col-span-2`}
                  >
                    <label className="block text-sm font-medium text-slate-300">Organization / Badge ID</label>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        placeholder="e.g. ODISHA-POLICE-4521"
                        className={`pl-11 ${inputClass}`}
                        {...register("organizationId", {
                          validate: (value) =>
                            role !== "authority" || !!value || "Organization / Badge ID is required for authority accounts",
                        })}
                      />
                    </div>
                    {errors.organizationId && (
                      <p className="text-sm text-red-400">{errors.organizationId.message}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <div className={fieldWrap}>
              <motion.button
                type="button"
                onClick={requestLocation}
                disabled={requestingLocation}
                whileTap={{ scale: 0.98 }}
                className={`mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  location
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                    : locationError
                    ? "border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/15"
                    : "border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15"
                }`}
              >
                <MapPin size={18} />
                {requestingLocation
                  ? "Requesting location…"
                  : location
                  ? "✓ Location Enabled"
                  : "Allow Location Access (required)"}
              </motion.button>
              {locationError && (
                <p className="flex items-center gap-1.5 text-sm text-red-400">
                  <AlertCircle size={14} /> {locationError}
                </p>
              )}
            </div>

            <motion.button
              type="submit"
              disabled={isSubmitting || !location}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating Account…" : "Finish Signing Up"}
              {!isSubmitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </motion.button>

            <div className="pt-2 text-center">
              <NavLink to="/login" className="text-sm text-slate-400 transition hover:text-cyan-300">
                Already have an account? <span className="text-cyan-300">Login</span>
              </NavLink>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}