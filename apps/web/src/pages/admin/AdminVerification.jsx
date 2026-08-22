import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  ShieldCheck,
  Mail,
  Phone,
  Building2,
  Check,
  X,
  UserCog,
  IdCard,
  FileText,
  Eye,
  Loader2,
} from "lucide-react";
import api from "../../utils/axios";

// baseURL is "/api" in dev (same-origin via the Vite proxy), so an <img>/<a>
// to this path carries the admin's httpOnly cookie automatically.
const API_BASE = api.defaults.baseURL || "/api";
const idCardUrl = (id) => `${API_BASE}/auth/admin/authority/${id}/id-card`;

export default function AdminVerification() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [preview, setPreview] = useState(null); // { id, mimeType, name }

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
      setBusyId(id);
      await api.patch(`/auth/admin/verify-authority/${id}`);
      toast.success("Authority account approved");
      setPending((prev) => prev.filter((u) => u._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not approve account");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    if (!window.confirm("Reject this authority request? The account and its uploaded ID will be removed.")) return;
    try {
      setBusyId(id);
      await api.delete(`/auth/admin/reject-authority/${id}`);
      toast.success("Authority request rejected");
      setPending((prev) => prev.filter((u) => u._id !== id));
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not reject account");
    } finally {
      setBusyId(null);
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
            Review each applicant's uploaded government / organization ID, then approve or reject before they can publish events.
          </p>
        </motion.div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
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
              {pending.map((u) => {
                const isImage = u.idCard?.mimeType?.startsWith("image/");
                return (
                  <motion.div
                    key={u._id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    {/* ID thumbnail / document chip */}
                    <button
                      type="button"
                      onClick={() => u.idCard && setPreview({ id: u._id, mimeType: u.idCard.mimeType, name: u.idCard.originalName })}
                      className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-950/60"
                      title={u.idCard ? "View ID document" : "No ID uploaded"}
                    >
                      {u.idCard ? (
                        isImage ? (
                          <>
                            <img src={idCardUrl(u._id)} alt="ID document" className="h-full w-full object-cover" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                              <Eye size={18} />
                            </span>
                          </>
                        ) : (
                          <FileText size={26} className="text-cyan-300" />
                        )
                      ) : (
                        <IdCard size={26} className="text-slate-600" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">{u.name}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span className="flex items-center gap-1"><Mail size={12} />{u.email}</span>
                        <span className="flex items-center gap-1"><Phone size={12} />{u.mobile}</span>
                        {u.organizationId && (
                          <span className="flex items-center gap-1"><Building2 size={12} />{u.organizationId}</span>
                        )}
                      </div>
                      <div className="mt-1.5">
                        {u.idCard ? (
                          <a
                            href={idCardUrl(u._id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                          >
                            <Eye size={12} /> View ID ({u.idCard.originalName || u.idCard.mimeType})
                          </a>
                        ) : (
                          <span className="text-xs text-amber-300/80">No ID document uploaded</span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => reject(u._id)}
                        disabled={busyId === u._id}
                        className="flex items-center gap-1.5 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/15 disabled:opacity-60"
                      >
                        <X size={15} /> Reject
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => approve(u._id)}
                        disabled={busyId === u._id}
                        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-semibold text-slate-950 transition disabled:opacity-60"
                      >
                        {busyId === u._id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        {busyId === u._id ? "Working..." : "Approve"}
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Full-size ID preview */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreview(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-slate-200">
                  <IdCard size={16} className="text-cyan-300" />
                  {preview.name || "ID document"}
                </span>
                <button onClick={() => setPreview(null)} className="text-slate-400 transition hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="max-h-[75vh] overflow-auto p-3">
                {preview.mimeType?.startsWith("image/") ? (
                  <img src={idCardUrl(preview.id)} alt="ID document" className="mx-auto max-h-[70vh] w-auto rounded-lg" />
                ) : (
                  <iframe title="ID document" src={idCardUrl(preview.id)} className="h-[70vh] w-full rounded-lg bg-white" />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
