import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { ShieldCheck, Mail, Phone, Building2, Check, UserCog } from "lucide-react";
import api from "../../utils/axios";

export default function AdminVerification() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState(null);

  // Fetched inside the effect (rather than via a `load()` helper called from it)
  // so no setState happens synchronously in the effect body — that pattern
  // caused cascading renders. Approvals prune the list locally, so nothing else
  // needs to refetch. `loading` starts true, so the first pass needn't set it.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get("/auth/admin/pending-authorities");
        if (alive) setPending(res.data.users || []);
      } catch (err) {
        if (alive) toast.error(err.response?.data?.message || "Failed to load pending authorities");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const approve = async (id) => {
    try {
      setApprovingId(id);
      await api.patch(`/auth/admin/verify-authority/${id}`);
      toast.success("Authority account verified");
      setPending((prev) => prev.filter((u) => u._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not verify account");
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_30%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />

      <div className="relative mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
            <UserCog className="h-4 w-4" />
            Admin Console
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Authority Verification</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Approve authority accounts before they're allowed to publish events to the public.
          </p>
        </motion.div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center"
          >
            <ShieldCheck className="mb-3 h-8 w-8 text-emerald-400" />
            <p className="text-slate-300">No pending authority accounts</p>
            <p className="mt-1 text-sm text-slate-500">New signups will show up here for review.</p>
          </motion.div>
        ) : (
          <motion.div layout className="space-y-3">
            <AnimatePresence>
              {pending.map((u) => (
                <motion.div
                  key={u._id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div>
                    <p className="font-semibold text-white">{u.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Mail size={12} />
                        {u.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone size={12} />
                        {u.mobile}
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 size={12} />
                        {u.organizationId}
                      </span>
                    </div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => approve(u._id)}
                    disabled={approvingId === u._id}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-semibold text-slate-950 transition disabled:opacity-60"
                  >
                    <Check size={15} />
                    {approvingId === u._id ? "Approving..." : "Approve"}
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
