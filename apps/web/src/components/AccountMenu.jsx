import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, ShieldCheck, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/** Routes that are their own front door — an account chip there is just noise. */
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

const ROLE_LABEL = {
  citizen: "Attendee",
  authority: "Authority",
  admin: "Administrator",
};

/**
 * Account chip and the only way out of a session.
 *
 * The console has no shared layout — every page paints its own header — so there
 * was previously nowhere at all to sign out: the backend exposed
 * `POST /auth/logout` and nothing ever called it. Mounting this next to the
 * routes rather than inside them means one control covers every authenticated
 * page, including the command center and map editor.
 */
export default function AccountMenu() {
  const { user, loading, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  /**
   * Which route the panel was opened on, rather than a plain boolean. Navigating
   * changes the pathname, so the panel closes on its own — derived instead of
   * reset from an effect, which would be a setState during render commit.
   */
  const [openAt, setOpenAt] = useState(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef(null);
  const open = openAt === pathname;

  // Close on outside click or Escape. Without this the panel stays open behind
  // whatever the person clicks next, which reads as a stuck overlay.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenAt(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenAt(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading || !user || PUBLIC_PATHS.has(pathname)) return null;

  const name = user.name || user.email || "Account";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapRef} className="fixed right-4 top-4 z-[60]">
      <button
        type="button"
        onClick={() => setOpenAt(open ? null : pathname)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-2 py-1.5 text-xs text-slate-200 shadow-lg backdrop-blur transition hover:border-cyan-400/30 hover:bg-slate-900/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-[11px] font-bold text-cyan-200">
          {initials || "?"}
        </span>
        <span className="hidden max-w-[9rem] truncate pr-0.5 text-left sm:block">
          <span className="block truncate font-semibold leading-tight">{name}</span>
          <span className="block truncate text-[10px] leading-tight text-slate-400">
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            {user.email ? (
              <p className="truncate text-[11px] text-slate-400">{user.email}</p>
            ) : null}
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
              {user.role === "citizen" ? (
                <User className="h-3 w-3" />
              ) : (
                <ShieldCheck className="h-3 w-3" />
              )}
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
            {user.role === "authority" && user.isVerifiedAuthority === false ? (
              <p className="mt-2 text-[11px] leading-4 text-amber-200/90">
                Awaiting admin verification. You can browse, but not publish events.
              </p>
            ) : null}
          </div>

          <div className="my-1 h-px bg-white/10" />

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
          >
            <LogOut className="h-4 w-4" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
