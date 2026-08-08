import { useState } from "react";
import { useForm } from "react-hook-form";
import { ShieldCheck, Eye, EyeOff, ArrowRight, LockKeyhole, Mail, Phone } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import api from "../utils/axios";

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const formVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

export default function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm({
    defaultValues: {
      identifier: "",
      password: "",
      rememberMe: false,
    },
  });

  const identifierValue = watch("identifier");
  const isPhoneLike = /^[0-9]+$/.test(identifierValue || "");

  const login = async (data) => {
    try {
      const res = await api.post("/auth/login", data);
      toast.success("Welcome back");
      navigate(res.data.user.role === "authority" ? "/authority/events" : "/events");
    } catch (err) {
      toast.error(err.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] px-5 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      {/* Ambient floating glows */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl"
        animate={{ y: [0, 22, 0], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-20 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl"
        animate={{ y: [0, -22, 0], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <div className="relative flex min-h-screen items-center justify-center py-10">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]"
        >
          <div className="relative hidden p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_42%)]" />
            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200"
              >
                <ShieldCheck className="h-4 w-4" />
                Secure access to CrowdHelp
              </motion.div>

              <h1 className="max-w-md text-4xl font-black leading-tight tracking-tight">
                Welcome back to the
                <span className="block bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent">
                  Crowd Safety Command Center
                </span>
              </h1>

              <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
                Sign in to monitor crowd density, view risk zones, and manage real-time evacuation guidance with AI-powered insights.
              </p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-4">
              {[
                ["Live Alerts", "Instant notifications for risk spikes"],
                ["Secure Login", "JWT + cookie session flow"],
                ["Risk Radar", "Track dangerous zones early"],
                ["Command Ready", "Authority-focused dashboard access"],
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
            <div className="mb-8 flex items-center justify-center lg:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
                <ShieldCheck size={30} className="text-cyan-300" />
              </div>
            </div>

            <div className="mx-auto w-full max-w-md">
              <div className="mb-8 text-center">
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">
                  Authorized Access
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  Login
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Enter your credentials to continue to the dashboard.
                </p>
              </div>

              <motion.form
                variants={formVariants}
                initial="hidden"
                animate="visible"
                onSubmit={handleSubmit(login)}
                className="space-y-5"
              >
                <motion.div variants={itemVariants}>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Email or Mobile Number
                  </label>
                  <div className="relative">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={isPhoneLike ? "phone" : "mail"}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={{ duration: 0.15 }}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {isPhoneLike ? <Phone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                      </motion.span>
                    </AnimatePresence>
                    <input
                      type="text"
                      autoComplete="username"
                      placeholder="Enter your email or mobile number"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-11 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950"
                      {...register("identifier", {
                        required: "Email or mobile number is required",
                      })}
                    />
                  </div>
                  {errors.identifier && (
                    <p className="mt-1.5 text-sm text-red-400">{errors.identifier.message}</p>
                  )}
                </motion.div>

                <motion.div variants={itemVariants}>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-300">Password</label>
                    <NavLink
                      to="/forgot-password"
                      className="text-xs font-medium text-cyan-300/80 transition hover:text-cyan-300"
                    >
                      Forgot password?
                    </NavLink>
                  </div>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter password"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-11 py-3.5 pr-12 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950"
                      {...register("password", {
                        required: "Password is required",
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 text-sm text-red-400">{errors.password.message}</p>
                  )}
                </motion.div>

                <motion.label
                  variants={itemVariants}
                  className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-slate-400"
                >
                  <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-slate-800 transition-colors has-[:checked]:bg-cyan-500">
                    <input type="checkbox" className="peer sr-only" {...register("rememberMe")} />
                    <motion.span
                      layout
                      transition={{ type: "spring", stiffness: 500, damping: 32 }}
                      className="inline-block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow peer-checked:translate-x-[18px]"
                    />
                  </span>
                  Keep me signed in for 30 days
                </motion.label>

                <motion.button
                  variants={itemVariants}
                  type="submit"
                  disabled={isSubmitting}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Logging in..." : "Login"}
                  {!isSubmitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
                </motion.button>

                <motion.div variants={itemVariants} className="pt-2 text-center">
                  <NavLink
                    to="/signup"
                    className="text-sm text-slate-400 transition hover:text-cyan-300"
                  >
                    Create new account
                  </NavLink>
                </motion.div>
              </motion.form>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
