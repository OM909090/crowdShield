import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Phone,
  Mail,
  UserRound,
  Cake,
  UsersRound,
  LockKeyhole,
  Sparkles,
  ArrowRight,
  Building2,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { useAuth } from "../context/AuthContext";

const ROLES = [
  {
    value: "citizen",
    label: "Citizen",
    icon: UserRound,
    description: "Live alerts & safe routes",
  },
  {
    value: "authority",
    label: "Authority",
    icon: ShieldAlert,
    description: "Control room access",
  },
];

// Shared motion presets
const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function Signup() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [location, setLocation] = useState(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      name: "",
      mobile: "",
      email: "",
      age: "",
      gender: "",
      emergencyContact: "",
      language: "",
      password: "",
      role: "citizen",
      organizationId: "",
    },
  });

  const role = watch("role");
  const isAuthority = role === "authority";

  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setLocation(coordinates);
        toast.success("Location access enabled");
      },
      () => {
        toast.error("Location permission denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const submitHandler = async (data) => {
    try {
      const payload = {
        ...data,
        organizationId: data.role === "authority" ? data.organizationId : undefined,
        location,
      };

      const res = await api.post("/auth/signup", payload);
      setUser(res.data.user); // signup issues a session too — log straight in
      toast.success("Account created successfully");
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

      {/* Ambient floating glows */}
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

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl lg:grid-cols-[0.95fr_1.05fr]"
        >
          <div className="relative hidden overflow-hidden p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_42%)]" />
            <div className="relative z-10">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
                <Sparkles className="h-4 w-4" />
                Create your CrowdHelp account
              </div>

              <h1 className="max-w-md text-4xl font-black leading-tight tracking-tight">
                Join the next-generation
                <span className="block bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
                  crowd safety platform
                </span>
              </h1>

              <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
                Sign up to access real-time crowd intelligence, alerts, and AI-driven evacuation recommendations for high-risk events.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-4">
              {[
                ["Real-time insights", "Live density and bottleneck tracking"],
                ["Secure auth", "Password hashing + JWT cookies"],
                ["Location aware", "Optional geolocation for incident response"],
                ["Authority ready", "Built for dashboard operations"],
              ].map(([title, desc]) => (
                <motion.div
                  key={title}
                  whileHover={{ y: -3 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:border-cyan-400/20"
                >
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <div className="mx-auto w-full max-w-2xl">
              <div className="mb-8 text-center">
                <div className="mb-4 flex justify-center lg:hidden">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                    <ShieldCheck size={30} className="text-cyan-300" />
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={role}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">
                      {isAuthority ? "Authority Access" : "New Account"}
                    </p>
                    <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                      {isAuthority ? "Register as Control Room Authority" : "Create CrowdHelp Account"}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {isAuthority
                        ? "You'll get access to live dashboards, risk zones and crowd control tools."
                        : "Fill in your details to get started."}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <motion.form
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                onSubmit={handleSubmit(submitHandler)}
                className="space-y-5"
              >
                {/* Role selector */}
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
                    <label className="block text-sm font-medium text-slate-300">Name</label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        placeholder="Full Name"
                        className={`pl-11 ${inputClass}`}
                        {...register("name", {
                          required: "Name is required",
                        })}
                      />
                    </div>
                    {errors.name && <p className="text-sm text-red-400">{errors.name.message}</p>}
                  </motion.div>

                  <motion.div variants={itemVariants} className={fieldWrap}>
                    <label className="block text-sm font-medium text-slate-300">Mobile Number</label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        placeholder="Mobile Number"
                        className={`pl-11 ${inputClass}`}
                        {...register("mobile", {
                          required: "Mobile number is required",
                          pattern: {
                            value: /^[0-9]{10}$/,
                            message: "Invalid mobile number",
                          },
                        })}
                      />
                    </div>
                    {errors.mobile && <p className="text-sm text-red-400">{errors.mobile.message}</p>}
                  </motion.div>

                  <motion.div variants={itemVariants} className={fieldWrap}>
                    <label className="block text-sm font-medium text-slate-300">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        placeholder="Email"
                        className={`pl-11 ${inputClass}`}
                        {...register("email", {
                          required: "Email is required",
                        })}
                      />
                    </div>
                    {errors.email && <p className="text-sm text-red-400">{errors.email.message}</p>}
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
                        {...register("gender", {
                          required: "Gender is required",
                        })}
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
                          pattern: {
                            value: /^[0-9]{10}$/,
                            message: "Invalid contact number",
                          },
                        })}
                      />
                    </div>
                    {errors.emergencyContact && (
                      <p className="text-sm text-red-400">{errors.emergencyContact.message}</p>
                    )}
                  </motion.div>

                  <motion.div variants={itemVariants} className={fieldWrap}>
                    <label className="block text-sm font-medium text-slate-300">Preferred Language</label>
                    <select
                      className={inputClass}
                      {...register("language", {
                        required: "Preferred language required",
                      })}
                    >
                      <option value="">Preferred Language</option>
                      <option>English</option>
                      <option>Hindi</option>
                      <option>Odia</option>
                      <option>Other</option>
                    </select>
                    {errors.language && <p className="text-sm text-red-400">{errors.language.message}</p>}
                  </motion.div>

                  <motion.div variants={itemVariants} className={`${fieldWrap} md:col-span-2`}>
                    <label className="block text-sm font-medium text-slate-300">Password</label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        className={`pl-11 pr-12 ${inputClass}`}
                        {...register("password", {
                          required: "Password required",
                          minLength: {
                            value: 6,
                            message: "Minimum 6 characters",
                          },
                        })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.password && <p className="text-sm text-red-400">{errors.password.message}</p>}
                  </motion.div>

                  {/* Authority-only field, animates in/out */}
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
                        <p className="text-xs leading-5 text-slate-500">
                          Authority accounts are reviewed before dashboard access is granted.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                <motion.button
                  type="button"
                  onClick={requestLocation}
                  whileTap={{ scale: 0.98 }}
                  className={`mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 transition ${
                    location
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                      : "border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15"
                  }`}
                >
                  <MapPin size={18} />
                  {location ? "✓ Location Enabled" : "Allow Location Access"}
                </motion.button>

                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Creating Account..." : isAuthority ? "Request Authority Access" : "Create Account"}
                  {!isSubmitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
                </motion.button>

                <div className="pt-2 text-center">
                  <NavLink
                    to="/login"
                    className="text-sm text-slate-400 transition hover:text-cyan-300"
                  >
                    Already have an account? <span className="text-cyan-300">Login</span>
                  </NavLink>
                </div>
              </motion.form>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
