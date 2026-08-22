import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ShieldCheck, Mail, ArrowRight, ArrowLeft, RotateCcw, Info } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import api from "../utils/axios";

const RESEND_SECONDS = 45;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email"); // "email" | "otp"
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [devMode, setDevMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [otpError, setOtpError] = useState("");
  const inputsRef = useRef([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { email: "" } });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "otp") inputsRef.current[0]?.focus();
  }, [step]);

  const applyDevOtp = (data) => {
    if (data?.devOtp && /^\d{6}$/.test(data.devOtp)) {
      setDigits(data.devOtp.split(""));
      setDevMode(true);
      return true;
    }
    return false;
  };

  const sendCode = async ({ email: enteredEmail }) => {
    setSending(true);
    try {
      const res = await api.post("/auth/forgot-password", { email: enteredEmail });
      setEmail(enteredEmail);
      setStep("otp");
      setCooldown(RESEND_SECONDS);
      if (applyDevOtp(res.data)) toast.success("Dev mode: reset code auto-filled");
      else toast.success("If that email is registered, a code is on its way");
    } catch (err) {
      toast.error(err.response?.data?.message || "Something went wrong, try again");
    } finally {
      setSending(false);
    }
  };

  const setDigit = (i, val) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    setOtpError("");
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

  const verifyCode = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setOtpError("Enter the full 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      await api.post("/auth/verify-reset-otp", { email, otp: code });
      navigate("/reset-password", { state: { email, otp: code } });
    } catch (err) {
      const message = err.response?.data?.message || "Invalid or expired code";
      setOtpError(message);
      toast.error(message);
      setDigits(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const res = await api.post("/auth/forgot-password", { email });
      if (applyDevOtp(res.data)) toast.success("Dev mode: new code auto-filled");
      else {
        toast.success("A new code has been sent");
        setDigits(Array(6).fill(""));
        inputsRef.current[0]?.focus();
      }
      setCooldown(RESEND_SECONDS);
      setOtpError("");
    } catch {
      toast.error("Couldn't resend code, try again shortly");
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
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10">
              <ShieldCheck size={30} className="text-cyan-300" />
            </div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Account recovery</p>
            {step === "email" ? (
              <>
                <h1 className="mt-3 text-3xl font-black tracking-tight">Forgot your password?</h1>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Enter the email you signed up with — we'll send a 6-digit code.
                </p>
              </>
            ) : (
              <>
                <h1 className="mt-3 text-3xl font-black tracking-tight">Enter verification code</h1>
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Mail size={13} className="text-cyan-400" /> {email}
                </div>
                {devMode && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                    <Info size={14} /> Dev mode: code auto-filled
                  </div>
                )}
              </>
            )}
          </div>

          <AnimatePresence mode="wait">
            {step === "email" ? (
              <motion.form
                key="email-form"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.3 }}
                onSubmit={handleSubmit(sendCode)}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-300">Email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      placeholder="you@example.com"
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3.5 pl-11 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950"
                      {...register("email", { required: "Email is required" })}
                    />
                  </div>
                  {errors.email && <p className="text-sm text-red-400">{errors.email.message}</p>}
                </div>

                <motion.button
                  type="submit"
                  disabled={sending}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending code…" : "Send reset code"}
                  {!sending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
                </motion.button>

                <div className="pt-1 text-center">
                  <NavLink to="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300">
                    <ArrowLeft size={14} /> Back to login
                  </NavLink>
                </div>
              </motion.form>
            ) : (
              <motion.form
                key="otp-form"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.3 }}
                onSubmit={verifyCode}
                className="space-y-6"
              >
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
                {otpError && <p className="text-sm text-red-400">{otpError}</p>}

                <motion.button
                  type="submit"
                  disabled={verifying || code.length !== 6}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifying ? "Verifying…" : "Verify & Continue"}
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

                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => setStep("email")}
                    className="inline-flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-cyan-300"
                  >
                    <ArrowLeft size={14} /> Use a different email
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
