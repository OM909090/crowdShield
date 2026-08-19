import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  Map,
  MapPin,
  KeyRound,
  Lock,
  RefreshCw,
  Zap,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  Globe,
} from "lucide-react";
import api from "../../utils/axios";

// Reuse the exact field styling from the LLM provider card so the two cards
// read as one cohesive settings surface.
const inputClass =
  "w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "mb-1.5 block text-sm font-medium text-slate-300";

const STATUS_META = {
  ok: {
    label: "Connected",
    cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    Icon: CheckCircle2,
  },
  error: {
    label: "Error",
    cls: "border-red-400/30 bg-red-500/10 text-red-300",
    Icon: AlertTriangle,
  },
  unconfigured: {
    label: "Not configured",
    cls: "border-slate-500/30 bg-slate-500/10 text-slate-400",
    Icon: MapPin,
  },
};

const formatWhen = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function GoogleMapsCard() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null); // masked shape from the server, or null

  // form fields
  const [apiKey, setApiKey] = useState(""); // a freshly typed key (never hydrated from server)
  const [enabled, setEnabled] = useState(false);
  const [routesBaseUrl, setRoutesBaseUrl] = useState("");
  const [placesBaseUrl, setPlacesBaseUrl] = useState("");

  // key-on-file handling (mirrors AiProvider's keyOnFile pattern)
  const [replacingKey, setReplacingKey] = useState(false);

  // ui
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // async button states
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const keyOnFile = Boolean(config?.hasKey);
  const showKeyInput = !keyOnFile || replacingKey;

  // Hydrate the visible fields from the stored masked config. All setState
  // happens after the await so we never trigger a cascade inside the effect.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get("/ai/maps");
        if (!active) return;
        const cfg = res.data?.config || null;
        setConfig(cfg);
        if (cfg) {
          setEnabled(Boolean(cfg.enabled));
          setRoutesBaseUrl(cfg.routesBaseUrl || "");
          setPlacesBaseUrl(cfg.placesBaseUrl || "");
        }
      } catch (err) {
        if (active) toast.error(err.response?.data?.message || "Failed to load Google Maps settings");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Lightweight refresh of just the stored-config metadata (status / lastTestedAt)
  // without disturbing what the user is currently editing.
  const refreshConfigMeta = useCallback(async () => {
    try {
      const res = await api.get("/ai/maps");
      setConfig(res.data?.config || null);
    } catch {
      /* keep last known metadata */
    }
  }, []);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.post("/ai/maps/test");
      const { ok, message } = res.data || {};
      if (ok) toast.success(message || "Google Maps reachable");
      else toast.error(message || "Google Maps test failed");
      await refreshConfigMeta();
    } catch (err) {
      toast.error(err.response?.data?.message || "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    // enabled always travels; the stored key is kept unless a new one is typed.
    const payload = { enabled };
    const typedKey = apiKey.trim();
    if (typedKey) payload.apiKey = typedKey;
    const routes = routesBaseUrl.trim();
    if (routes) payload.routesBaseUrl = routes;
    const places = placesBaseUrl.trim();
    if (places) payload.placesBaseUrl = places;

    setSaving(true);
    try {
      const res = await api.post("/ai/maps", payload);
      const cfg = res.data?.config || null;
      const warning = res.data?.warning;
      // Re-hydrate from the authoritative masked config.
      setConfig(cfg);
      if (cfg) {
        setEnabled(Boolean(cfg.enabled));
        setRoutesBaseUrl(cfg.routesBaseUrl || "");
        setPlacesBaseUrl(cfg.placesBaseUrl || "");
      }
      setApiKey("");
      setReplacingKey(false);
      // A warning means the save succeeded but something needs the user's eye
      // (e.g. enabled but the key hasn't been tested yet).
      if (warning) toast(warning);
      else toast.success("Google Maps saved");
    } catch (err) {
      // Enabling with no stored key comes back as a 422 with a helpful message.
      toast.error(err.response?.data?.message || "Could not save Google Maps");
    } finally {
      setSaving(false);
    }
  };

  const statusKey = config?.status && STATUS_META[config.status] ? config.status : "unconfigured";
  const status = STATUS_META[statusKey];
  const StatusIcon = status.Icon;
  const lastTested = formatWhen(config?.lastTestedAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 }}
      className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 sm:p-7"
    >
      {/* Card header — this is a distinct, optional integration below the LLM card */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
            <Map className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">Google Maps</h2>
            <p className="mt-1 max-w-md text-sm leading-6 text-slate-400">
              Optional. Bring your own Google Maps Platform key so the AI agent can use Google
              routing &amp; places for geography <span className="text-slate-300">outside</span> the
              venue.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
          Loading Google Maps settings...
        </div>
      ) : (
        <>
          {/* Status row */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${status.cls}`}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {status.label}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  config?.enabled
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-500/30 bg-slate-500/10 text-slate-400"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    config?.enabled ? "bg-emerald-300" : "bg-slate-400"
                  }`}
                />
                {config?.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            {lastTested && <p className="text-xs text-slate-500">Last tested {lastTested}</p>}
          </div>

          <div className="space-y-4">
            {/* API Key */}
            <div>
              <label htmlFor="gmaps-api-key" className={labelClass}>
                API Key
              </label>
              {showKeyInput ? (
                <>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="gmaps-api-key"
                      type="password"
                      autoComplete="new-password"
                      placeholder={keyOnFile ? "Enter a new key to replace the stored one" : "AIza..."}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className={`pl-11 ${inputClass}`}
                    />
                  </div>
                  {keyOnFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setReplacingKey(false);
                        setApiKey("");
                      }}
                      className="mt-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
                    >
                      Keep the stored key instead
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <Lock className="h-4 w-4 text-emerald-300" />
                    <span className="font-mono tracking-widest text-slate-400">••••••••</span>
                    key configured
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingKey(true);
                      setApiKey("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/15"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Replace key
                  </button>
                </div>
              )}
            </div>

            {/* Enable toggle */}
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <div className="min-w-0">
                <label
                  htmlFor="gmaps-enabled"
                  className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-200"
                >
                  <Globe className="h-4 w-4 text-cyan-300" />
                  Enable Google Maps
                </label>
                <p id="gmaps-enabled-help" className="mt-1.5 text-xs leading-5 text-slate-500">
                  When enabled, the AI agent can use Google routing/places for approach &amp; road
                  routing outside the venue. Disabled = the in-venue router is used exclusively.
                </p>
              </div>
              <label
                htmlFor="gmaps-enabled"
                className="relative inline-flex shrink-0 cursor-pointer items-center"
              >
                <input
                  id="gmaps-enabled"
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  aria-describedby="gmaps-enabled-help"
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-11 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-950 ${
                    enabled ? "bg-emerald-500/80" : "bg-slate-600/70"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      enabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </span>
              </label>
            </div>

            {/* Advanced (optional) */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                aria-expanded={advancedOpen}
                aria-controls="gmaps-advanced"
                className="flex w-full items-center justify-between px-4 py-3 text-sm text-slate-300 transition hover:text-white"
              >
                <span className="inline-flex items-center gap-2">
                  <Globe className="h-4 w-4 text-slate-400" />
                  Advanced <span className="text-slate-500">(optional)</span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${
                    advancedOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {advancedOpen && (
                <motion.div
                  id="gmaps-advanced"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 border-t border-white/10 px-4 py-4"
                >
                  {/* Routes base URL */}
                  <div>
                    <label htmlFor="gmaps-routes-url" className={labelClass}>
                      Routes base URL <span className="text-slate-500">(optional)</span>
                    </label>
                    <div className="relative">
                      <Globe className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="gmaps-routes-url"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://routes.googleapis.com"
                        value={routesBaseUrl}
                        onChange={(e) => setRoutesBaseUrl(e.target.value)}
                        className={`pl-11 ${inputClass}`}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Point this at a mock during development. Leave blank to use Google&apos;s
                      default endpoint.
                    </p>
                  </div>

                  {/* Places base URL */}
                  <div>
                    <label htmlFor="gmaps-places-url" className={labelClass}>
                      Places base URL <span className="text-slate-500">(optional)</span>
                    </label>
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="gmaps-places-url"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://places.googleapis.com"
                        value={placesBaseUrl}
                        onChange={(e) => setPlacesBaseUrl(e.target.value)}
                        className={`pl-11 ${inputClass}`}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <motion.button
              type="button"
              onClick={handleTest}
              disabled={testing || !keyOnFile}
              title={!keyOnFile ? "Save an API key before testing" : "Test the stored Google Maps key"}
              whileTap={{ scale: 0.98 }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {testing ? "Testing..." : "Test connection"}
            </motion.button>

            <motion.button
              type="button"
              onClick={handleSave}
              disabled={saving}
              whileHover={saving ? undefined : { scale: 1.01, y: -1 }}
              whileTap={saving ? undefined : { scale: 0.98 }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save"}
            </motion.button>
          </div>

          {/* Privacy / architecture note */}
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 text-xs leading-5 text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <span>
              Google Maps covers roads/approach <span className="text-slate-300">outside</span> the
              venue; inside the venue CrowdShield&apos;s own map is authoritative. Your key is stored
              encrypted and never displayed again.
            </span>
          </div>
        </>
      )}
    </motion.div>
  );
}
