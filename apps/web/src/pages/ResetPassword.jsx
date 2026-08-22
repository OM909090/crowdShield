import { useState } from "react";
import { LockKeyhole, Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { useAuth } from "../context/AuthContext";

export default function ResetPassword() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // No verified email/code in state — someone landed here directly, send them back to start over
  if (!state?.email || !state?.otp) return <Navigate to="/forgot-password" replace />;

  const { email, otp } = state;

  const submitHandler = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/auth/reset-password", { email, otp, newPassword });
      setUser(res.data.user);
      toast.success("Password reset — you're logged in");
      navigate("/", { replace: true });
    } catch (err) {
      const message = err.response?.data?.message || "Reset failed, please try again";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.16),_transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl sm:p-10"
        >
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
              <ShieldCheck size={30} className="text-cyan-300" />
            </div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Almost done</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">Set a new password</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">Choose something you haven't used before.</p>
          </div>

          <form onSubmit={submitHandler} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">New Password</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`pl-11 pr-12 ${inputClass}`}
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
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Confirm New Password</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`pl-11 ${inputClass}`}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <motion.button
              type="submit"
              disabled={submitting}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Resetting…" : "Reset password & continue"}
              {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
