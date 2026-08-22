import { useRef, useState } from "react";
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
  IdCard,
  UploadCloud,
  FileCheck2,
  X,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { GoogleLogin } from "@react-oauth/google";
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

const MAX_ID_BYTES = 5 * 1024 * 1024; // 5 MB, mirrors the backend cap
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Signup() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [location, setLocation] = useState(null);
  const [idCardFile, setIdCardFile] = useState(null);
  const fileInputRef = useRef(null);

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
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        toast.success("Location access enabled");
      },
      () => toast.error("Location permission denied"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const onPickFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const okType = /^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(file.type);
    if (!okType) {
      toast.error("ID must be an image (PNG/JPG/WebP) or a PDF");
      return;
    }
    if (file.size > MAX_ID_BYTES) {
      toast.error("ID document is too large (max 5 MB)");
      return;
    }
    setIdCardFile(file);
  };

  const submitHandler = async (data) => {
    if (!location) {
      toast.error("Please allow location access before continuing");
      return;
    }
    if (data.role === "authority" && !idCardFile) {
      toast.error("Please upload a valid government / organization ID");
      return;
    }

    try {
      // Multipart, so the optional ID document can ride along. Flat lat/lng
      // because nested objects don't survive FormData.
      const fd = new FormData();
      fd.append("name", data.name);
      fd.append("mobile", data.mobile);
      fd.append("email", data.email);
      fd.append("age", String(data.age));
      fd.append("gender", data.gender);
      fd.append("emergencyContact", data.emergencyContact);
      fd.append("language", data.language);
      fd.append("password", data.password);
      fd.append("role", data.role);
      fd.append("latitude", String(location.latitude));
      fd.append("longitude", String(location.longitude));
      if (data.role === "authority") {
        if (data.organizationId) fd.append("organizationId", data.organizationId);
        fd.append("idCard", idCardFile);
      }

      const res = await api.post("/auth/signup", fd);
      toast.success(res.data.message || "Account created — verify to continue");
      // Signup no longer logs you in directly; verify the emailed code first.
      navigate("/verify-otp", {
        state: {
          userId: res.data.userId,
          email: res.data.email,
          mobile: data.mobile,
          role: res.data.role,
          devOtp: res.data.devOtp, // present only in dev when email isn't configured
        },
      });
    } catch (err) {
      toast.error(err.response?.data?.message || "Signup failed");
    }
  };

  const handleGoogleSuccess = async (cred) => {
    try {
      const res = await api.post("/auth/google", { credential: cred.credential });
      if (res.data.newUser) {
        // Existing-email check passed but no account yet — collect the rest.
        navigate("/google/complete", { state: res.data.profile });
      } else {
        setUser(res.data.user);
        navigate(res.data.user.role === "authority" ? "/authority/events" : "/events", {
          replace: true,
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Google sign-in failed");
    }
  };

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950";
  const fieldWrap = "space-y-2";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

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
                Create your CrowdShield account
              </div>
              <h1 className="max-w-md text-4xl font-black leading-tight tracking-tight">
                Join the next-generation
                <span className="block bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
                  crowd safety platform
                </span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
                Sign up for real-time crowd intelligence, alerts, and AI-driven evacuation guidance for high-risk events.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-4">
              {[
                ["Real-time insights", "Live density and bottleneck tracking"],
                ["Secure auth", "OTP-verified, hashed passwords, JWT cookies"],
                ["Location aware", "Geolocation powers incident response"],
                ["Authority ready", "ID-verified control-room access"],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{desc}</p>
                </div>
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
                      {isAuthority ? "Register as Control Room Authority" : "Create CrowdShield Account"}
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-slate-400">
                      {isAuthority
                        ? "Upload a valid government / organization ID — an admin reviews it before access is granted."
                        : "Fill in your details to get started."}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <form onSubmit={handleSubmit(submitHandler)} className="space-y-5">
                {/* Role selector */}
                <div className={fieldWrap}>
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
                </div>

                <motion.div variants={gridVariants} initial="hidden" animate="visible" className="grid gap-5 md:grid-cols-2">
                  <motion.div variants={itemVariants} className={fieldWrap}>
                    <label className="block text-sm font-medium text-slate-300">Name</label>
                    <div className="relative">
                      <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input placeholder="Full Name" className={`pl-11 ${inputClass}`} {...register("name", { required: "Name is required" })} />
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
                          pattern: { value: /^[0-9]{10}$/, message: "Invalid mobile number" },
                        })}
                      />
                    </div>
                    {errors.mobile && <p className="text-sm text-red-400">{errors.mobile.message}</p>}
                  </motion.div>

                  <motion.div variants={itemVariants} className={fieldWrap}>
                    <label className="block text-sm font-medium text-slate-300">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input type="email" placeholder="Email" className={`pl-11 ${inputClass}`} {...register("email", { required: "Email is required" })} />
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
                        {...register("age", { required: "Age is required", valueAsNumber: true, min: { value: 1, message: "Enter a valid age" } })}
                      />
                    </div>
                    {errors.age && <p className="text-sm text-red-400">{errors.age.message}</p>}
                  </motion.div>

                  <motion.div variants={itemVariants} className={fieldWrap}>
                    <label className="block text-sm font-medium text-slate-300">Gender</label>
                    <div className="relative">
                      <UsersRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <select className={`pl-11 ${inputClass} appearance-none`} {...register("gender", { required: "Gender is required" })}>
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
                    {errors.emergencyContact && <p className="text-sm text-red-400">{errors.emergencyContact.message}</p>}
                  </motion.div>

                  <motion.div variants={itemVariants} className={fieldWrap}>
                    <label className="block text-sm font-medium text-slate-300">Preferred Language</label>
                    <select className={inputClass} {...register("language", { required: "Preferred language required" })}>
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
                        {...register("password", { required: "Password required", minLength: { value: 6, message: "Minimum 6 characters" } })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {errors.password && <p className="text-sm text-red-400">{errors.password.message}</p>}
                  </motion.div>

                  {/* Authority-only: optional org label + required ID document upload */}
                  <AnimatePresence>
                    {isAuthority && (
                      <motion.div
                        key="authority-fields"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="space-y-4 overflow-hidden md:col-span-2"
                      >
                        <div className={fieldWrap}>
                          <label className="block text-sm font-medium text-slate-300">
                            Organization / Department <span className="text-slate-500">(optional)</span>
                          </label>
                          <div className="relative">
                            <Building2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input placeholder="e.g. Odisha Police, District Control Room" className={`pl-11 ${inputClass}`} {...register("organizationId")} />
                          </div>
                        </div>

                        <div className={fieldWrap}>
                          <label className="block text-sm font-medium text-slate-300">Government / Organization ID</label>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,application/pdf"
                            className="hidden"
                            onChange={onPickFile}
                          />
                          {idCardFile ? (
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3.5">
                              <span className="flex min-w-0 items-center gap-2 text-sm text-emerald-100">
                                <FileCheck2 size={18} className="shrink-0 text-emerald-300" />
                                <span className="truncate">{idCardFile.name}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setIdCardFile(null);
                                  if (fileInputRef.current) fileInputRef.current.value = "";
                                }}
                                className="shrink-0 text-emerald-200/70 transition hover:text-white"
                                aria-label="Remove file"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-cyan-400/30 bg-cyan-400/5 px-4 py-3.5 text-cyan-200 transition hover:bg-cyan-400/10"
                            >
                              <UploadCloud size={18} />
                              Upload ID (image or PDF, max 5 MB)
                            </button>
                          )}
                          <p className="flex items-center gap-1.5 text-xs leading-5 text-slate-500">
                            <IdCard size={13} /> Reviewed by an admin before dashboard access is granted.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                <button
                  type="button"
                  onClick={requestLocation}
                  className={`mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 transition ${
                    location
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                      : "border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15"
                  }`}
                >
                  <MapPin size={18} />
                  {location ? "✓ Location Enabled" : "Allow Location Access (required)"}
                </button>

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

                {googleClientId && (
                  <>
                    <div className="flex items-center gap-3 py-1">
                      <span className="h-px flex-1 bg-white/10" />
                      <span className="text-xs uppercase tracking-widest text-slate-500">or</span>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    <div className="flex justify-center">
                      <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => toast.error("Google sign-in failed")}
                        theme="filled_black"
                        shape="pill"
                        text="signup_with"
                      />
                    </div>
                  </>
                )}

                <div className="pt-2 text-center">
                  <NavLink to="/login" className="text-sm text-slate-400 transition hover:text-cyan-300">
                    Already have an account? <span className="text-cyan-300">Login</span>
                  </NavLink>
                </div>
              </form>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
