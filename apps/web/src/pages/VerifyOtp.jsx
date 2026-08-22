import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Mail, Phone, RotateCcw, Info } from "lucide-react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/axios";
import { useAuth } from "../context/AuthContext";

const RESEND_SECONDS = 45;

export default function VerifyOtp() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();

  // Dev convenience: when the backend has no SMTP configured it returns the code
  // as `devOtp`; we pre-fill it so local testing needs no inbox.
  const devOtp = typeof state?.devOtp === "string" && /^\d{6}$/.test(state.devOtp) ? state.devOtp : "";
  const [digits, setDigits] = useState(devOtp ? devOtp.split("") : Array(6).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const inputsRef = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  // No signup context — bounce back rather than showing a dead-end page
  if (!state?.userId) return <Navigate to="/signup" replace />;

  const { userId, email, mobile } = state;

  const setDigit = (i, val) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData("text").trim();
    if (!/^\d{6}$/.test(text)) return;
    e.preventDefault();
    setDigits(text.split(""));
    inputsRef.current[5]?.focus();
  };

  const code = digits.join("");

  const verify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error("Enter the full 6-digit code");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/auth/verify-otp", { userId, otp: code });
      setUser(res.data.user);
      const role = res.data.user.role;
      if (role === "authority") {
        // Freshly verified authorities still need admin approval before they can
        // open the console — park them on the event view meanwhile.
        toast.success("Verified — your authority access is pending admin approval");
        navigate("/events", { replace: true });
      } else {
        toast.success("Account verified");
        navigate("/events", { replace: true });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Verification failed");
      setDigits(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const res = await api.post("/auth/resend-otp", { userId });
      if (res.data?.devOtp && /^\d{6}$/.test(res.data.devOtp)) {
        setDigits(res.data.devOtp.split(""));
        toast.success("New code generated (dev mode auto-filled)");
      } else {
        toast.success("New code sent");
        setDigits(Array(6).fill(""));
        inputsRef.current[0]?.focus();
      }
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't resend code");
    } finally {
      setResending(false);
    }
  };

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
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Verify it's you</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">Enter verification code</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">We sent a 6-digit code to your email.</p>

            <div className="mt-4 flex flex-col items-center gap-1.5 text-xs text-slate-500">
              {email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={13} className="text-cyan-400" /> {email}
                </span>
              )}
              {mobile && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={13} className="text-cyan-400" /> +91 {mobile}
                </span>
              )}
            </div>

            {devOtp && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                <Info size={14} />
                Dev mode: code auto-filled (email delivery not configured)
              </div>
            )}
          </div>

          <form onSubmit={verify} className="space-y-7">
            <div className="flex justify-between gap-2" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputsRef.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="h-14 w-12 rounded-2xl border border-white/10 bg-slate-950/60 text-center text-xl font-bold text-white outline-none transition focus:border-cyan-400/50 focus:bg-slate-950 sm:h-16 sm:w-14"
                />
              ))}
            </div>

            <motion.button
              type="submit"
              disabled={submitting || code.length !== 6}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Verifying..." : "Verify account"}
            </motion.button>

            <div className="flex items-center justify-center gap-1.5 text-sm text-slate-400">
              Didn't get a code?
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0 || resending}
                className="inline-flex items-center gap-1 font-semibold text-cyan-300 transition hover:text-cyan-200 disabled:cursor-not-allowed disabled:text-slate-600"
              >
                <RotateCcw size={13} className={resending ? "animate-spin" : ""} />
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
